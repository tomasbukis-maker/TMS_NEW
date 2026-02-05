import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import PaymentService from '../../services/paymentService';
import { formatMoney } from '../../utils/formatMoney';
import '../../pages/InvoicesPage.css';

// Interfaces
interface Partner {
  id: number;
  name: string;
  code?: string;
  vat_code?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  payment_term_days?: number;
}

interface Order {
  id: number;
  order_number: string;
  client?: Partner;
  client_name?: string;
  carriers?: Array<{
    id: number;
    partner?: {
      id: number;
      name: string;
    };
    price_net?: string | number;
  }>;
  other_costs?: Array<{ description?: string; amount?: number | string }>;
}

/** Vežėjo kaina + papildomos išlaidos užsakyme (bendra suma už užsakymą) */
function getOrderAmountWithOtherCosts(
  order: Order | undefined,
  partnerId?: number
): number {
  if (!order) return 0;
  let carrierAmount = 0;
  if (order.carriers && order.carriers.length > 0) {
    if (partnerId != null) {
      const carrier = order.carriers.find((c: any) =>
        c.partner && (c.partner.id === partnerId || c.partner === partnerId)
      );
      if (carrier && carrier.price_net) carrierAmount = parseFloat(String(carrier.price_net)) || 0;
      else {
        const cw = order.carriers.find((c: any) => c.price_net && Number(c.price_net) > 0);
        if (cw && cw.price_net) carrierAmount = parseFloat(String(cw.price_net)) || 0;
      }
    } else {
      const cw = order.carriers.find((c: any) => c.price_net && Number(c.price_net) > 0);
      if (cw && cw.price_net) carrierAmount = parseFloat(String(cw.price_net)) || 0;
    }
  }
  const other = (order.other_costs && Array.isArray(order.other_costs))
    ? order.other_costs.reduce((s, c) => s + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0)
    : 0;
  return carrierAmount + other;
}

interface ExpenseCategory {
  id: number;
  name: string;
}

interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
}

interface Payment {
  id: number;
  amount: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

interface PurchaseInvoice {
  id: number;
  invoice_number: string | null;
  received_invoice_number: string;
  partner: Partner;
  partner_id?: number;
  related_order: Order | null;
  related_order_id?: number | null;
  related_orders?: Array<{ id: number; order_number: string; order_date?: string; amount?: string }>;
  related_orders_amounts?: Array<{ order_id: number; amount: string }>;
  expense_category: ExpenseCategory | null;
  expense_category_id?: number | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  paid_amount?: string;
  remaining_amount?: string;
  issue_date: string;
  received_date: string | null;
  due_date: string;
  payment_date: string | null;
  invoice_file?: string | null;
  invoice_file_url?: string | null;
  overdue_days?: number;
  notes: string;
  payment_history?: Payment[];
  created_at?: string;
  updated_at?: string;
}

interface PurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: PurchaseInvoice | null; // null = create mode
  initialPartnerId?: string;
  initialOrderId?: string;
  initialAmountNet?: string;
  orderCarrierId?: string; // Optional: if creating from order carrier
  onSave: () => void;
  onDelete?: (invoice: PurchaseInvoice) => void;
  onInvoiceUpdate?: (invoice: PurchaseInvoice) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, timeoutMs?: number) => void;
}

type ActiveTab = 'pagrindinis' | 'susije-uzsakymai' | 'prisegti-failai';

const PurchaseInvoiceModal_NEW: React.FC<PurchaseInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoice,
  initialPartnerId,
  initialOrderId,
  initialAmountNet,
  orderCarrierId,
  onSave,
  onDelete,
  onInvoiceUpdate,
  showToast
}) => {
  const { i18n } = useTranslation();
  
  // Determine if editing existing invoice or creating new
  const isEditMode = !!invoice;
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('pagrindinis');
  const [localInvoice, setLocalInvoice] = useState<PurchaseInvoice | null>(invoice);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form data for edit/create mode
  const [formData, setFormData] = useState({
    partner_id: '',
    related_orders: [] as Array<{ order_id: number; amount: string }>,
    order_carrier_id: orderCarrierId || '',
    expense_category_id: '',
    received_invoice_number: '',
    payment_status: 'unpaid' as 'unpaid' | 'paid' | 'overdue' | 'partially_paid',
    amount_net: '',
    vat_rate: '',
    issue_date: '',
    received_date: '',
    due_date: '',
    payment_date: '',
    invoice_file: null as File | null,
    notes: '',
  });
  
  // Additional state
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Partner | null>(null);
  const [expenseCategorySearch, setExpenseCategorySearch] = useState('');
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showExpenseCategoryDropdown, setShowExpenseCategoryDropdown] = useState(false);
  const [selectedExpenseCategoryName, setSelectedExpenseCategoryName] = useState('');
  const [invoiceNumberSearch, setInvoiceNumberSearch] = useState('');
  const [invoiceNumberSuggestions, setInvoiceNumberSuggestions] = useState<string[]>([]);
  const [showInvoiceNumberDropdown, setShowInvoiceNumberDropdown] = useState(false);
  
  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Pavedimu',
    notes: ''
  });
  const [selectedOffsetInvoices, setSelectedOffsetInvoices] = useState<Set<number>>(new Set());
  
  // Refs for tracking initial values to detect unsaved changes
  const initialFormDataRef = useRef<any>(null);
  const initialRelatedOrdersRef = useRef<Array<{ order_id: number; amount: string }>>([]);
  const isInitializingRef = useRef(false);
  const initialCaptureDoneRef = useRef(false);
  
  // Fetch expense categories
  const fetchExpenseCategories = useCallback(async () => {
    try {
      const response = await api.get('/invoices/expense-categories/');
      const results = response.data.results || response.data;
      setExpenseCategories(results);
    } catch (error) {
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const response = await api.get('/orders/orders/', { params: { page_size: 100 } });
      const results = response.data.results || response.data;
      setOrders(results);
    } catch (error) {
    }
  }, []);

  // Fetch PVM rates
  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
    }
  }, []);

  // Load full invoice data
  const loadFullInvoice = useCallback(async (invoiceId: number) => {
    try {
      setIsLoading(true);
      const response = await api.get(`/invoices/purchase/${invoiceId}/`);
      const loadedInvoice = response.data;
      setLocalInvoice(loadedInvoice);
      return loadedInvoice;
    } catch (error) {
      showToast('error', 'Nepavyko užkrauti sąskaitos duomenų');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('pagrindinis');
      setHasUnsavedChanges(false);
      isInitializingRef.current = false;
      initialCaptureDoneRef.current = false;
      return;
    }
    
    // Set initializing flag when modal opens
    isInitializingRef.current = true;
    initialCaptureDoneRef.current = false;
    
    // Load base data
    fetchExpenseCategories();
    fetchOrders();
    fetchPvmRates();
    
    if (!invoice) {
      // Create mode
      setLocalInvoice(null);
      initializeCreateForm();
    } else {
      // Edit mode - load invoice and initialize form
      setLocalInvoice(invoice);
      loadFullInvoice(invoice.id).then(async (loadedInvoice) => {
        // After loading, initialize form from invoice data
        if (loadedInvoice) {
          await initializeEditForm(loadedInvoice);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoice]);

  // Initialize edit form from invoice data
  const initializeEditForm = useCallback(async (invoiceData: PurchaseInvoice) => {
    // Get related orders
    let relatedOrders: Array<{ order_id: number; amount: string }> = [];
    if (invoiceData.related_orders && invoiceData.related_orders.length > 0) {
      const amountsDict: { [key: number]: string } = {};
      if (invoiceData.related_orders_amounts && Array.isArray(invoiceData.related_orders_amounts)) {
        invoiceData.related_orders_amounts.forEach((item: any) => {
          if (item.order_id) {
            amountsDict[item.order_id] = item.amount || '0.00';
          }
        });
      }
      
      // Užkrauti pilnus užsakymo duomenis su vežėjais ir nustatyti sumas
      const loadedRelatedOrders: Array<{ order_id: number; amount: string }> = [];
      for (const orderData of invoiceData.related_orders) {
        // Gauti orderId - gali būti objektas su id arba tiesiog skaičius
        const orderId: number = typeof orderData === 'object' && orderData !== null && 'id' in orderData
          ? (orderData as any).id
          : typeof orderData === 'number'
          ? orderData
          : 0;
        
        if (!orderId) continue;
        
        let orderAmount = amountsDict[orderId] || '';
        
        // Jei sumos nėra, bandyti gauti iš vežėjo sumos
        if (!orderAmount || orderAmount === '0.00' || orderAmount === '') {
          try {
            const orderResponse = await api.get(`/orders/orders/${orderId}/`);
            const fullOrder = orderResponse.data;
            
            // Atnaujinti užsakymų sąrašą
            setOrders(prev => {
              const existing = prev.find(o => o.id === orderId);
              if (existing) {
                return prev.map(o => o.id === orderId ? fullOrder : o);
              }
              return [...prev, fullOrder];
            });
            
            // Vežėjo suma + papildomos išlaidos užsakyme
            const partnerIdInt = invoiceData.partner_id != null
              ? (typeof invoiceData.partner_id === 'object' && invoiceData.partner_id !== null && 'id' in invoiceData.partner_id
                  ? (invoiceData.partner_id as any).id
                  : parseInt(String(invoiceData.partner_id), 10))
              : undefined;
            const amountWithOther = getOrderAmountWithOtherCosts(fullOrder, partnerIdInt);
            if (amountWithOther > 0) orderAmount = amountWithOther.toFixed(2);
          } catch (error) {
            // Ignoruoti klaidą, naudoti tuščią sumą
          }
        }
        
        loadedRelatedOrders.push({
          order_id: orderId,
          amount: orderAmount
        });
      }
      
      relatedOrders = loadedRelatedOrders;
    } else if (invoiceData.related_order_id || invoiceData.related_order?.id) {
      const orderId = invoiceData.related_order_id || invoiceData.related_order!.id;
      let orderAmount = '';
      if (invoiceData.related_orders_amounts && Array.isArray(invoiceData.related_orders_amounts)) {
        const amountItem = invoiceData.related_orders_amounts.find((item: any) => item.order_id === orderId);
        if (amountItem) {
          orderAmount = amountItem.amount || '';
        }
      }
      
      // Jei sumos nėra, gauti vežėjo suma + papildomos išlaidos
      if (!orderAmount || orderAmount === '0.00' || orderAmount === '') {
        try {
          const orderResponse = await api.get(`/orders/orders/${orderId}/`);
          const fullOrder = orderResponse.data;
          setOrders(prev => {
            const existing = prev.find(o => o.id === orderId);
            if (existing) return prev.map(o => o.id === orderId ? fullOrder : o);
            return [...prev, fullOrder];
          });
          const partnerIdInt = invoiceData.partner_id != null
            ? (typeof invoiceData.partner_id === 'object' && invoiceData.partner_id !== null && 'id' in invoiceData.partner_id
                ? (invoiceData.partner_id as any).id
                : parseInt(String(invoiceData.partner_id), 10))
            : undefined;
          const amountWithOther = getOrderAmountWithOtherCosts(fullOrder, partnerIdInt);
          if (amountWithOther > 0) orderAmount = amountWithOther.toFixed(2);
        } catch (error) {
          // Ignoruoti klaidą
        }
      }
      
      relatedOrders = [{ order_id: orderId, amount: orderAmount }];
    }
    
    const expenseCategoryId = invoiceData.expense_category_id?.toString() || invoiceData.expense_category?.id?.toString() || '';
    
    const newFormData = {
      partner_id: invoiceData.partner_id?.toString() || invoiceData.partner.id.toString(),
      related_orders: relatedOrders,
      order_carrier_id: orderCarrierId || '',
      expense_category_id: expenseCategoryId,
      received_invoice_number: invoiceData.received_invoice_number || '',
      payment_status: invoiceData.payment_status,
      amount_net: invoiceData.amount_net,
      vat_rate: invoiceData.vat_rate,
      issue_date: invoiceData.issue_date ? (invoiceData.issue_date.includes('T') ? invoiceData.issue_date.split('T')[0] : invoiceData.issue_date) : '',
      received_date: invoiceData.received_date ? (invoiceData.received_date.includes('T') ? invoiceData.received_date.split('T')[0] : invoiceData.received_date) : new Date().toISOString().split('T')[0],
      due_date: invoiceData.due_date ? (invoiceData.due_date.includes('T') ? invoiceData.due_date.split('T')[0] : invoiceData.due_date) : '',
      payment_date: invoiceData.payment_date || '',
      invoice_file: null as File | null,
      notes: invoiceData.notes || '',
    };
    
    setFormData(newFormData);
    
    const sName = invoiceData.partner?.name || '';
    setSelectedSupplierName(sName);
    setSupplierSearch(sName);
    setSelectedSupplier(invoiceData.partner);
    
    if (!sName && invoiceData.partner_id) {
      api.get(`/partners/partners/${invoiceData.partner_id}/`).then(res => {
        setSelectedSupplierName(res.data.name);
        setSupplierSearch(res.data.name);
        setSelectedSupplier(res.data);
      }).catch(() => {});
    }

    if (invoiceData.expense_category) {
      setSelectedExpenseCategoryName(invoiceData.expense_category.name);
      setExpenseCategorySearch(invoiceData.expense_category.name);
    } else if (expenseCategoryId) {
      api.get(`/invoices/expense-categories/${expenseCategoryId}/`).then(res => {
        setSelectedExpenseCategoryName(res.data.name);
        setExpenseCategorySearch(res.data.name);
      }).catch(() => {
        setSelectedExpenseCategoryName('');
        setExpenseCategorySearch('');
      });
    } else {
      setSelectedExpenseCategoryName('');
      setExpenseCategorySearch('');
    }
    
    // Store initial values for comparison
    initialFormDataRef.current = JSON.parse(JSON.stringify(newFormData));
    initialRelatedOrdersRef.current = [...relatedOrders];
    isInitializingRef.current = false;
    setHasUnsavedChanges(false);
  }, [orderCarrierId]);
  
  // Initialize create form
  const initializeCreateForm = useCallback(() => {
    const newFormData = {
      partner_id: initialPartnerId || '',
      related_orders: initialOrderId ? [{ order_id: parseInt(initialOrderId, 10), amount: initialAmountNet || '' }] : [],
      order_carrier_id: orderCarrierId || '',
      expense_category_id: '',
      received_invoice_number: '',
      payment_status: 'unpaid' as const,
      amount_net: initialAmountNet || '',
      vat_rate: '',
      issue_date: '',
      received_date: new Date().toISOString().split('T')[0],
      due_date: (() => {
        const issueDate = new Date();
        const due = new Date(issueDate);
        due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
        return due.toISOString().split('T')[0];
      })(),
      payment_date: '',
      invoice_file: null as File | null,
      notes: '',
    };
    
    setFormData(newFormData);
    setSelectedSupplierName('');
    setSupplierSearch('');
    setSelectedSupplier(null);
    setSelectedExpenseCategoryName('');
    setExpenseCategorySearch('');
    
    // Store initial values for comparison
    initialFormDataRef.current = JSON.parse(JSON.stringify(newFormData));
    initialRelatedOrdersRef.current = initialOrderId ? [{ order_id: parseInt(initialOrderId, 10), amount: initialAmountNet || '' }] : [];
    isInitializingRef.current = false;
    setHasUnsavedChanges(false);
    
    // Load partner if initialPartnerId provided
    if (initialPartnerId) {
      api.get(`/partners/partners/${initialPartnerId}/`).then(res => {
        setSelectedSupplierName(res.data.name);
        setSupplierSearch(res.data.name);
        setSelectedSupplier(res.data);
      }).catch(() => {});
    }
  }, [initialPartnerId, initialOrderId, initialAmountNet, orderCarrierId]);

  // Ensure expense category exists
  const ensureExpenseCategoryExists = async (categoryName: string): Promise<number | null> => {
    if (!categoryName || categoryName.trim() === '') return null;
    
    const existing = expenseCategories.find(cat => 
      cat.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
    );
    if (existing) {
      return existing.id;
    }
    
    try {
      const response = await api.post('/invoices/expense-categories/', {
        name: categoryName.trim(),
        description: ''
      });
      const newCategory = response.data;
      setExpenseCategories(prev => [...prev, newCategory]);
      return newCategory.id;
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 409) {
        try {
          const response = await api.get('/invoices/expense-categories/', {
            params: { search: categoryName.trim() }
          });
          const categories = response.data.results || response.data || [];
          const found = categories.find((cat: ExpenseCategory) => 
            cat.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
          );
          if (found) {
            setExpenseCategories(prev => {
              if (!prev.find(c => c.id === found.id)) {
                return [...prev, found];
              }
              return prev;
            });
            return found.id;
          }
        } catch (err) {
        }
      }
      return null;
    }
  };

  // Handle save (create or update)
  const handleSave = useCallback(async () => {
    if (!formData.partner_id) { 
      showToast('info', 'Pasirinkite tiekėją.'); 
      return; 
    }
    if (!formData.received_invoice_number) { 
      showToast('info', 'Įveskite tiekėjo sąskaitos numerį.'); 
      return; 
    }
    if (!formData.amount_net) { 
      showToast('info', 'Įveskite sumą be PVM.'); 
      return; 
    }
    if (!formData.vat_rate) { 
      showToast('info', 'Įveskite PVM tarifą.'); 
      return; 
    }
    if (!formData.issue_date) { 
      showToast('info', 'Pasirinkite tiekėjo sąskaitos išrašymo datą.'); 
      return; 
    }
    if (!formData.received_date) { 
      showToast('info', 'Pasirinkite gavimo datą.'); 
      return; 
    }
    if (!formData.due_date) { 
      showToast('info', 'Pasirinkite mokėjimo terminą.'); 
      return; 
    }
    
    let expenseCategoryId = formData.expense_category_id;
    if (!expenseCategoryId && expenseCategorySearch && expenseCategorySearch.trim()) {
      const categoryId = await ensureExpenseCategoryExists(expenseCategorySearch);
      if (categoryId) {
        expenseCategoryId = categoryId.toString();
        setFormData(prev => ({ ...prev, expense_category_id: expenseCategoryId }));
        setSelectedExpenseCategoryName(expenseCategorySearch);
      } else {
        showToast('error', 'Nepavyko sukurti arba rasti išlaidų kategoriją.'); 
        return;
      }
    }
    
    if (!expenseCategoryId) {
      showToast('info', 'Pasirinkite arba įveskite išlaidų kategoriją.'); 
      return;
    }
    
    try {
      setIsLoading(true);
      const formDataToSend = new FormData();
      formDataToSend.append('partner_id', formData.partner_id);
      formDataToSend.append('received_invoice_number', formData.received_invoice_number);
      // payment_status NESIUNČIAME - jis keičiamas TIK per mokėjimų valdymą
      formDataToSend.append('amount_net', formData.amount_net);
      formDataToSend.append('vat_rate', formData.vat_rate);
      formDataToSend.append('issue_date', formData.issue_date || '');
      formDataToSend.append('received_date', formData.received_date || '');
      formDataToSend.append('due_date', formData.due_date || '');
      formDataToSend.append('notes', formData.notes);
      formDataToSend.append('expense_category_id', expenseCategoryId);
      
      // Send related_order_ids and related_orders_amounts as JSON strings
      if (formData.related_orders && formData.related_orders.length > 0) {
        const orderIds = formData.related_orders
          .filter(ro => ro.order_id)
          .map(ro => ro.order_id);

        if (orderIds.length > 0) {
          formDataToSend.append('related_order_ids', JSON.stringify(orderIds));
        }

        // Send related_orders_amounts as JSON string
        const amounts = formData.related_orders
          .filter(ro => ro.order_id && ro.amount)
          .map(ro => ({
            order_id: ro.order_id,
            amount: ro.amount
          }));
        if (amounts.length > 0) {
          formDataToSend.append('related_orders_amounts', JSON.stringify(amounts));
        }
      }
      
      // payment_date NESIUNČIAME - jis nustatomas per mokėjimų valdymą
      
      if (formData.invoice_file) {
        formDataToSend.append('invoice_file', formData.invoice_file);
      }
      
      if (isEditMode && localInvoice) {
        // Update
        await api.put(`/invoices/purchase/${localInvoice.id}/`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        showToast('success', 'Pirkimo sąskaita sėkmingai atnaujinta.');
        
        // Atnaujinti localInvoice su naujausiais duomenimis
        try {
          const response = await api.get(`/invoices/purchase/${localInvoice.id}/`);
          const updatedInvoice = response.data;
          setLocalInvoice(updatedInvoice);
          onInvoiceUpdate?.(updatedInvoice);
          
          // Pranešti PaymentsPage apie atnaujinimą
          console.log('Dispatching purchaseInvoiceUpdated event for invoice:', localInvoice.id, 'status:', updatedInvoice.payment_status);
          window.dispatchEvent(new CustomEvent('purchaseInvoiceUpdated', { 
            detail: { invoiceId: localInvoice.id, invoice: updatedInvoice } 
          }));
        } catch (error) {
          // Ignoruoti klaidas, bet vis tiek iškviesti onSave
        }
      } else {
        // Create
        const createResponse = await api.post('/invoices/purchase/', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        showToast('success', 'Pirkimo sąskaita sėkmingai sukurta.');
        
        // Jei sukurtas naujas invoice, gauti jo duomenis
        if (createResponse.data?.id) {
          try {
            const response = await api.get(`/invoices/purchase/${createResponse.data.id}/`);
            const newInvoice = response.data;
            onInvoiceUpdate?.(newInvoice);
            
            // Pranešti PaymentsPage apie naują sąskaitą
            window.dispatchEvent(new CustomEvent('purchaseInvoiceUpdated', { 
              detail: { invoiceId: newInvoice.id, invoice: newInvoice } 
            }));
          } catch (error) {
            // Ignoruoti klaidas
          }
        }
      }
      
      onSave();
      onClose();
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error', `Klaida ${isEditMode ? 'atnaujinant' : 'kuriant'} sąskaitą: ` + (details ? JSON.stringify(details) : error.message));
    } finally {
      setIsLoading(false);
    }
  }, [formData, expenseCategorySearch, isEditMode, localInvoice, onSave, onClose, showToast, ensureExpenseCategoryExists]);

  // Search suppliers
  const searchSuppliers = useCallback(async (query: string) => {
    if (!query || query === selectedSupplierName) {
      setSuppliers([]);
      return;
    }
    
    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, is_supplier: true, page_size: 20, include_code_errors: 1 }
      });
      const results = response.data.results || response.data;
      setSuppliers(results.filter((p: Partner) => p.name.toLowerCase().includes(query.toLowerCase())));
    } catch (error) {
    }
  }, [selectedSupplierName]);

  useEffect(() => {
    if (supplierSearch && supplierSearch !== selectedSupplierName) {
      const timeoutId = setTimeout(() => searchSuppliers(supplierSearch), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuppliers([]);
    }
  }, [supplierSearch, selectedSupplierName, searchSuppliers]);

  // Auto-calculate due_date when received_date or issue_date changes
  useEffect(() => {
    if (formData.received_date && !formData.due_date) {
      const received = new Date(formData.received_date);
      const due = new Date(received);
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      setFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [formData.received_date, formData.due_date]);

  useEffect(() => {
    if (formData.issue_date && !formData.due_date) {
      const issue = new Date(formData.issue_date);
      const due = new Date(issue);
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      setFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [formData.issue_date, formData.due_date]);

  // Automatically recalculate amount_net from related_orders (only in create mode)
  useEffect(() => {
    if (isEditMode) return; // Don't auto-calculate in edit mode
    
    if (formData.related_orders.length === 0) {
      if (formData.amount_net && !initialAmountNet) {
        setFormData(prev => ({ ...prev, amount_net: '' }));
      }
      return;
    }
    
    const total = formData.related_orders.reduce((sum, ro) => {
      const amount = parseFloat(ro.amount) || 0;
      return sum + amount;
    }, 0);
    
    const newAmountNet = total > 0 ? total.toFixed(2) : '';
    if (formData.amount_net !== newAmountNet) {
      setFormData(prev => ({
        ...prev,
        amount_net: newAmountNet
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formData.related_orders), isEditMode]);

  // Update carrier amounts when partner_id changes and there are related orders
  useEffect(() => {
    const updateCarrierAmounts = async () => {
      if (!formData.partner_id || formData.related_orders.length === 0 || isEditMode) return;
      
      const partnerId = parseInt(formData.partner_id, 10);
      if (isNaN(partnerId)) return;
      
      try {
        const updatedRelatedOrders = [...formData.related_orders];
        let hasChanges = false;
        
        for (let i = 0; i < updatedRelatedOrders.length; i++) {
          const orderId = updatedRelatedOrders[i].order_id;
          if (!orderId) continue;
          
          let order = orders.find(o => o.id === orderId);
          
          if (!order || !order.carriers || order.carriers.length === 0) {
            try {
              const orderResponse = await api.get(`/orders/orders/${orderId}/`);
              const loadedOrder = orderResponse.data;
              
              if (!loadedOrder) continue;
              
              order = loadedOrder;
              
              const updatedOrders = [...orders];
              const existingIndex = updatedOrders.findIndex(o => o.id === orderId);
              if (existingIndex >= 0) {
                updatedOrders[existingIndex] = loadedOrder;
              } else {
                updatedOrders.push(loadedOrder);
              }
              setOrders(updatedOrders);
            } catch (error) {
              continue;
            }
          }
          
          if (order) {
            const amountWithOther = getOrderAmountWithOtherCosts(order, partnerId);
            if (amountWithOther > 0) {
              const newAmount = amountWithOther.toFixed(2);
              if (updatedRelatedOrders[i].amount !== newAmount) {
                updatedRelatedOrders[i].amount = newAmount;
                hasChanges = true;
              }
            }
          }
        }
        
        if (hasChanges) {
          const total = updatedRelatedOrders.reduce((sum, ro) => {
            const amount = parseFloat(ro.amount) || 0;
            return sum + amount;
          }, 0);
          
          setFormData(prev => ({
            ...prev,
            related_orders: updatedRelatedOrders,
            amount_net: total > 0 ? total.toFixed(2) : prev.amount_net
          }));
        }
      } catch (error) {
      }
    };
    
    if (formData.partner_id && formData.related_orders.length > 0 && !isEditMode) {
      updateCarrierAmounts();
    }
  }, [formData.partner_id, formData.related_orders.length, orders, isEditMode]);

  // Track form changes for unsaved changes warning
  useEffect(() => {
    if (isInitializingRef.current) {
      return;
    }
    
    // Pirmą kartą po init – nustatyti baseline iš dabartinio formData, kad nepraneštų „neišsaugota“ tik atidarius
    if (initialFormDataRef.current && !initialCaptureDoneRef.current) {
      initialFormDataRef.current = JSON.parse(JSON.stringify(formData));
      initialRelatedOrdersRef.current = [...(formData.related_orders || [])];
      initialCaptureDoneRef.current = true;
      setHasUnsavedChanges(false);
      return;
    }
    
    if (!initialFormDataRef.current) {
      return;
    }
    
    const formDataChanged = JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
    const relatedOrdersChanged = JSON.stringify(formData.related_orders) !== JSON.stringify(initialRelatedOrdersRef.current);
    
    if (formDataChanged || relatedOrdersChanged) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [formData]);

  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) {
        if (hasUnsavedChanges) {
          const confirmed = window.confirm('Yra neišsaugotų pakeitimų. Ar tikrai norite uždaryti?');
          if (!confirmed) return;
        }
        onClose();
      }
    }}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ 
        maxHeight: '95vh', 
        display: 'flex', 
        flexDirection: 'column',
        width: '1200px',
        height: '85vh'
      }}>
        {/* Header */}
        <div className="modal-header" style={{ 
          padding: '10px 14px', 
          borderBottom: '1px solid #dee2e6', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isEditMode && (
                <span style={{ 
                  padding: '4px 10px', 
                  backgroundColor: '#28a745', 
                  color: '#fff', 
                  borderRadius: '4px', 
                  fontSize: '11px', 
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>
                  ➕ Nauja pirkimo sąskaita
                </span>
              )}
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {isEditMode && localInvoice
                  ? `Pirkimo sąskaita #${localInvoice.received_invoice_number}`
                  : 'Nauja pirkimo sąskaita'}
              </h2>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {hasUnsavedChanges && (
              <span style={{ 
                fontSize: '10px', 
                color: '#856404', 
                padding: '3px 6px',
                backgroundColor: '#fff3cd',
                borderRadius: '3px'
              }}>
                ⚠️ Yra neišsaugotų pakeitimų
              </span>
            )}
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="modal-tabs">
          <button 
            className={`tab-btn ${activeTab === 'pagrindinis' ? 'active' : ''}`} 
            onClick={() => setActiveTab('pagrindinis')}
          >
            📋 Pagrindinis
          </button>
          <button 
            className={`tab-btn ${activeTab === 'susije-uzsakymai' ? 'active' : ''}`} 
            onClick={() => setActiveTab('susije-uzsakymai')}
          >
            📦 Susiję užsakymai
          </button>
          <button 
            className={`tab-btn ${activeTab === 'prisegti-failai' ? 'active' : ''}`} 
            onClick={() => setActiveTab('prisegti-failai')}
          >
            📎 Prisegti failai
          </button>
        </div>
        
        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              Kraunama...
            </div>
          )}
          
          {!isLoading && (
            <div style={{ padding: '10px' }}>
              {activeTab === 'pagrindinis' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Kairys stulpelis */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Lapelis: Pagrindinė informacija */}
                    <div style={{ 
                      border: '1px solid #dee2e6', 
                      borderRadius: '6px', 
                      padding: '12px', 
                      backgroundColor: '#f8f9fa',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        color: '#495057', 
                        marginBottom: '4px',
                        borderBottom: '1px solid #dee2e6',
                        paddingBottom: '6px'
                      }}>
                        📋 Pagrindinė informacija
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Gavimo data <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.received_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, received_date: e.target.value }))}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Tiekėjas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={supplierSearch}
                            onChange={(e) => {
                              setSupplierSearch(e.target.value);
                              setShowSupplierDropdown(true);
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#007bff';
                              if (supplierSearch && supplierSearch !== selectedSupplierName) {
                                setShowSupplierDropdown(true);
                              }
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#ced4da';
                              setTimeout(() => setShowSupplierDropdown(false), 200);
                            }}
                            placeholder="Ieškoti tiekėjo..."
                            required
                            style={{ 
                              width: '100%', 
                              padding: '6px 10px', 
                              fontSize: '13px', 
                              border: '1px solid #ced4da', 
                              borderRadius: '4px',
                              backgroundColor: '#ffffff',
                              transition: 'border-color 0.2s'
                            }}
                          />
                          {showSupplierDropdown && suppliers.length > 0 && (
                            <div style={{ 
                              position: 'absolute', 
                              top: '100%', 
                              left: 0, 
                              right: 0, 
                              backgroundColor: '#fff', 
                              border: '1px solid #ddd', 
                              borderRadius: '4px', 
                              maxHeight: '200px', 
                              overflowY: 'auto', 
                              zIndex: 1000, 
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
                            }}>
                              {suppliers.map((supplier) => (
                                <div
                                  key={supplier.id}
                                  onClick={() => {
                                    setFormData(prev => ({ ...prev, partner_id: supplier.id.toString() }));
                                    setSelectedSupplierName(supplier.name);
                                    setSupplierSearch(supplier.name);
                                    setSelectedSupplier(supplier);
                                    setShowSupplierDropdown(false);
                                  }}
                                  style={{ 
                                    padding: '8px 12px', 
                                    cursor: 'pointer', 
                                    borderBottom: '1px solid #eee',
                                    fontSize: '12px'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                >
                                  {supplier.name} {supplier.code && `(${supplier.code})`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Tiekėjo sąskaitos numeris <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.received_invoice_number}
                          onChange={(e) => setFormData(prev => ({ ...prev, received_invoice_number: e.target.value }))}
                          placeholder="Įveskite tiekėjo sąskaitos numerį"
                          required
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Sąskaitos data <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.issue_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Suma <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.amount_net}
                          onChange={(e) => setFormData(prev => ({ ...prev, amount_net: e.target.value }))}
                          required
                          placeholder="0.00"
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          PVM tarifas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={pvmRates.find(r => r.rate === formData.vat_rate)?.id || ''}
                          onChange={(e) => {
                            const selectedRate = pvmRates.find(r => r.id === parseInt(e.target.value));
                            if (selectedRate) {
                              setFormData(prev => ({ ...prev, vat_rate: selectedRate.rate }));
                            }
                          }}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        >
                          <option value="">-- Pasirinkite PVM tarifą --</option>
                          {pvmRates.map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.rate}%{rate.article ? ` - ${rate.article}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Mokėjimo terminas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                          required
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Dešinysis stulpelis */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Lapelis: Papildoma informacija */}
                    <div style={{ 
                      border: '1px solid #dee2e6', 
                      borderRadius: '6px', 
                      padding: '12px', 
                      backgroundColor: '#f8f9fa',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        color: '#495057', 
                        marginBottom: '4px',
                        borderBottom: '1px solid #dee2e6',
                        paddingBottom: '6px'
                      }}>
                        📝 Papildoma informacija
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Išlaidų kategorija <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={expenseCategorySearch}
                            onChange={(e) => {
                              setExpenseCategorySearch(e.target.value);
                              setShowExpenseCategoryDropdown(true);
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#007bff';
                              if (expenseCategorySearch && expenseCategorySearch !== selectedExpenseCategoryName) {
                                setShowExpenseCategoryDropdown(true);
                              }
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#ced4da';
                              setTimeout(() => setShowExpenseCategoryDropdown(false), 200);
                            }}
                            placeholder="Įveskite arba pasirinkite išlaidų kategoriją..."
                            required
                            style={{ 
                              width: '100%', 
                              padding: '6px 10px', 
                              fontSize: '13px', 
                              border: '1px solid #ced4da', 
                              borderRadius: '4px',
                              backgroundColor: '#ffffff',
                              transition: 'border-color 0.2s'
                            }}
                          />
                          {showExpenseCategoryDropdown && expenseCategories.length > 0 && (
                            <div style={{ 
                              position: 'absolute', 
                              top: '100%', 
                              left: 0, 
                              right: 0, 
                              backgroundColor: '#fff', 
                              border: '1px solid #ddd', 
                              borderRadius: '4px', 
                              maxHeight: '200px', 
                              overflowY: 'auto', 
                              zIndex: 1000, 
                              boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
                            }}>
                              {expenseCategories
                                .filter(cat => cat.name.toLowerCase().includes(expenseCategorySearch.toLowerCase()))
                                .map((category) => (
                                  <div
                                    key={category.id}
                                    onClick={() => {
                                      setFormData(prev => ({ ...prev, expense_category_id: category.id.toString() }));
                                      setSelectedExpenseCategoryName(category.name);
                                      setExpenseCategorySearch(category.name);
                                      setShowExpenseCategoryDropdown(false);
                                    }}
                                    style={{ 
                                      padding: '8px 12px', 
                                      cursor: 'pointer', 
                                      borderBottom: '1px solid #eee',
                                      fontSize: '12px'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                                  >
                                    {category.name}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Mokėjimo statusas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={isEditMode && localInvoice ? localInvoice.payment_status : formData.payment_status}
                          onChange={async (e) => {
                            const newStatus = e.target.value as 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
                            
                            if (!isEditMode || !localInvoice) {
                              // Create mode - tiesiog atnaujinti formData
                              setFormData(prev => ({ ...prev, payment_status: newStatus }));
                              return;
                            }
                            
                            // Edit mode - naudoti PaymentService
                            try {
                              setIsLoading(true);
                              const oldStatus = localInvoice.payment_status;
                              
                              if (newStatus === 'paid' && oldStatus !== 'paid') {
                                // Pažymėti kaip apmokėtą
                                // Naudoti esamą payment_date iš localInvoice arba formData, jei nėra - naudoti šiandienos datą
                                const paymentDate = localInvoice.payment_date 
                                  ? (localInvoice.payment_date.includes('T') ? localInvoice.payment_date.split('T')[0] : localInvoice.payment_date)
                                  : (formData.payment_date || new Date().toISOString().split('T')[0]);
                                const result = await PaymentService.markAsPaid(
                                  'purchase',
                                  localInvoice.id,
                                  paymentDate,
                                  'Pavedimu',
                                  'Pažymėta kaip apmokėta per modala'
                                );
                                
                                // Atnaujinti localInvoice su naujais duomenimis
                                const updatedInvoice = await api.get(`/invoices/purchase/${localInvoice.id}/`);
                                setLocalInvoice(updatedInvoice.data);
                                onInvoiceUpdate?.(updatedInvoice.data);
                                
                                showToast('success', 'Pirkimo sąskaita pažymėta kaip apmokėta');
                              } else if (oldStatus === 'paid' && newStatus !== 'paid') {
                                // Pažymėti kaip neapmokėtą
                                const result = await PaymentService.markAsUnpaid('purchase', localInvoice.id);
                                
                                // Atnaujinti localInvoice su naujais duomenimis
                                const updatedInvoice = await api.get(`/invoices/purchase/${localInvoice.id}/`);
                                setLocalInvoice(updatedInvoice.data);
                                onInvoiceUpdate?.(updatedInvoice.data);
                                
                                showToast('success', 'Pirkimo sąskaita pažymėta kaip neapmokėta');
                              } else {
                                // Kiti statusai (overdue, partially_paid) - tiesiog atnaujinti formData
                                setFormData(prev => ({ ...prev, payment_status: newStatus }));
                              }
                            } catch (error: any) {
                              showToast('error', error.response?.data?.error || 'Klaida keičiant mokėjimo statusą');
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          required
                          disabled={!isEditMode || !localInvoice}
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: isEditMode && localInvoice ? '#ffffff' : '#f8f9fa',
                            transition: 'border-color 0.2s',
                            cursor: isEditMode && localInvoice ? 'pointer' : 'not-allowed'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        >
                          <option value="unpaid">Neapmokėta</option>
                          <option value="paid">Apmokėta</option>
                          <option value="overdue">Vėluoja</option>
                          <option value="partially_paid">Dalinis apmokėjimas</option>
                        </select>
                        <div style={{ fontSize: '11px', color: '#6c757d', marginTop: '4px' }}>
                          {isEditMode && localInvoice 
                            ? 'Mokėjimo statusas keičiamas per PaymentService - visi pakeitimai matomi mokėjimų valdyme'
                            : 'Mokėjimo statusas bus nustatytas sukūrus sąskaitą'}
                        </div>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Apmokėjimo data
                        </label>
                        <input
                          type="date"
                          value={isEditMode && localInvoice && localInvoice.payment_date
                            ? (localInvoice.payment_date.includes('T') ? localInvoice.payment_date.split('T')[0] : localInvoice.payment_date)
                            : formData.payment_date || ''}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            if (isEditMode && localInvoice) {
                              // Edit mode - atnaujinti localInvoice ir siųsti per API
                              const updatePaymentDate = async () => {
                                try {
                                  setIsLoading(true);
                                  await api.patch(`/invoices/purchase/${localInvoice.id}/`, {
                                    payment_date: newDate || null
                                  });
                                  
                                  // Atnaujinti localInvoice su naujais duomenimis
                                  const updatedInvoice = await api.get(`/invoices/purchase/${localInvoice.id}/`);
                                  setLocalInvoice(updatedInvoice.data);
                                  onInvoiceUpdate?.(updatedInvoice.data);
                                  
                                  showToast('success', 'Apmokėjimo data atnaujinta');
                                } catch (error: any) {
                                  showToast('error', error.response?.data?.error || 'Klaida atnaujinant apmokėjimo datą');
                                } finally {
                                  setIsLoading(false);
                                }
                              };
                              updatePaymentDate();
                            } else {
                              // Create mode - tiesiog atnaujinti formData
                              setFormData(prev => ({ ...prev, payment_date: newDate }));
                            }
                          }}
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                      
                      {/* Mokėjimų istorija ir dalinio apmokėjimo forma */}
                      {isEditMode && localInvoice && (
                        <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                          <div style={{ 
                            border: '1px solid #dee2e6', 
                            borderRadius: '6px', 
                            padding: '12px', 
                            backgroundColor: '#f8f9fa'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#495057' }}>
                                Mokėjimų istorija
                              </h4>
                              <button
                                onClick={() => {
                                  setShowPaymentForm(!showPaymentForm);
                                  if (!showPaymentForm && localInvoice.remaining_amount) {
                                    setPaymentForm({
                                      amount: localInvoice.remaining_amount,
                                      payment_date: new Date().toISOString().split('T')[0],
                                      payment_method: 'Pavedimu',
                                      notes: ''
                                    });
                                  }
                                }}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: showPaymentForm ? '#6c757d' : '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                {showPaymentForm ? '✖️ Atšaukti' : '➕ Pridėti mokėjimą'}
                              </button>
                            </div>
                            
                            {/* Mokėjimo forma */}
                            {showPaymentForm && (
                              <div style={{ 
                                marginBottom: '15px', 
                                padding: '12px', 
                                backgroundColor: '#ffffff', 
                                borderRadius: '4px',
                                border: '1px solid #dee2e6'
                              }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                  <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                      Suma <span style={{ color: '#dc3545' }}>*</span>
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={paymentForm.amount}
                                      onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                                      placeholder="0.00"
                                      style={{ 
                                        width: '100%', 
                                        padding: '6px 10px', 
                                        fontSize: '13px', 
                                        border: '1px solid #ced4da', 
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff'
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                      Mokėjimo data <span style={{ color: '#dc3545' }}>*</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={paymentForm.payment_date}
                                      onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                                      style={{ 
                                        width: '100%', 
                                        padding: '6px 10px', 
                                        fontSize: '13px', 
                                        border: '1px solid #ced4da', 
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff'
                                      }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                  <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                      Mokėjimo būdas
                                    </label>
                                    <select
                                      value={paymentForm.payment_method}
                                      onChange={(e) => {
                                        setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }));
                                        if (e.target.value !== 'Sudengta') {
                                          setSelectedOffsetInvoices(new Set());
                                        }
                                      }}
                                      style={{ 
                                        width: '100%', 
                                        padding: '6px 10px', 
                                        fontSize: '13px', 
                                        border: '1px solid #ced4da', 
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff'
                                      }}
                                    >
                                      <option value="Pavedimu">Pavedimu</option>
                                      <option value="Grynieji">Grynieji</option>
                                      <option value="Kortelė">Kortelė</option>
                                      <option value="Sudengta">Sudengta</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                      Pastabos
                                    </label>
                                    <input
                                      type="text"
                                      value={paymentForm.notes}
                                      onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                                      placeholder="Neprivaloma"
                                      style={{ 
                                        width: '100%', 
                                        padding: '6px 10px', 
                                        fontSize: '13px', 
                                        border: '1px solid #ced4da', 
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff'
                                      }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Sudengimo sąskaitų pasirinkimas */}
                                {paymentForm.payment_method === 'Sudengta' && (
                                  <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#856404' }}>
                                      Pasirinkite išrašytas pardavimo sąskaitas sudengimui:
                                    </label>
                                    <div style={{ fontSize: '11px', color: '#856404', marginBottom: '8px' }}>
                                      Funkcionalumas bus pridėtas vėliau
                                    </div>
                                  </div>
                                )}
                                
                                <button
                                  onClick={async () => {
                                    try {
                                      const amount = parseFloat(paymentForm.amount);
                                      if (!amount || amount <= 0) {
                                        showToast('error', 'Įveskite teisingą sumą');
                                        return;
                                      }
                                      
                                      setIsLoading(true);
                                      
                                      const requestData: any = {
                                        invoice_type: 'purchase',
                                        invoice_id: localInvoice.id,
                                        amount: amount,
                                        payment_date: paymentForm.payment_date,
                                        payment_method: paymentForm.payment_method,
                                        notes: paymentForm.notes
                                      };
                                      
                                      if (paymentForm.payment_method === 'Sudengta' && selectedOffsetInvoices.size > 0) {
                                        requestData.offset_invoice_ids = Array.from(selectedOffsetInvoices);
                                      }
                                      
                                      await PaymentService.addPayment(requestData);
                                      
                                      // Atnaujinti sąskaitos duomenis
                                      const updatedInvoice = await api.get(`/invoices/purchase/${localInvoice.id}/`);
                                      setLocalInvoice(updatedInvoice.data);
                                      onInvoiceUpdate?.(updatedInvoice.data);
                                      
                                      // Išvalyti formą
                                      setPaymentForm({
                                        amount: localInvoice.remaining_amount || '',
                                        payment_date: new Date().toISOString().split('T')[0],
                                        payment_method: 'Pavedimu',
                                        notes: ''
                                      });
                                      setShowPaymentForm(false);
                                      setSelectedOffsetInvoices(new Set());
                                      
                                      showToast('success', 'Mokėjimas sėkmingai pridėtas');
                                    } catch (error: any) {
                                      showToast('error', error.response?.data?.error || 'Klaida pridedant mokėjimą');
                                    } finally {
                                      setIsLoading(false);
                                    }
                                  }}
                                  style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '600'
                                  }}
                                >
                                  💾 Išsaugoti mokėjimą
                                </button>
                              </div>
                            )}
                            
                            {/* Mokėjimų sąrašas */}
                            {localInvoice.payment_history && localInvoice.payment_history.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {localInvoice.payment_history.map((payment) => (
                                  <div
                                    key={payment.id}
                                    style={{
                                      padding: '10px',
                                      backgroundColor: '#ffffff',
                                      borderRadius: '4px',
                                      border: '1px solid #dee2e6',
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                                      gap: '10px',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Suma</div>
                                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                                        {formatMoney(payment.amount)}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Apmokėta</div>
                                      <div style={{ fontSize: '12px', color: '#495057' }}>
                                        {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('lt-LT') : '-'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Pakeista</div>
                                      <div style={{ fontSize: '12px', color: '#495057' }}>
                                        {payment.created_at ? new Date(payment.created_at).toLocaleDateString('lt-LT') : '-'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px' }}>Būdas</div>
                                      <div style={{ fontSize: '12px', color: '#495057' }}>
                                        {payment.payment_method || '-'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (!window.confirm('Ar tikrai norite pašalinti šį mokėjimą?')) {
                                          return;
                                        }
                                        try {
                                          setIsLoading(true);
                                          await PaymentService.deletePayment(payment.id);
                                          
                                          // Atnaujinti sąskaitos duomenis
                                          const updatedInvoice = await api.get(`/invoices/purchase/${localInvoice.id}/`);
                                          setLocalInvoice(updatedInvoice.data);
                                          onInvoiceUpdate?.(updatedInvoice.data);
                                          
                                          showToast('success', 'Mokėjimas sėkmingai pašalintas');
                                        } catch (error: any) {
                                          showToast('error', error.response?.data?.error || 'Klaida šalinant mokėjimą');
                                        } finally {
                                          setIsLoading(false);
                                        }
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        backgroundColor: '#dc3545',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                      }}
                                    >
                                      🗑️
                                    </button>
                                    {payment.notes && (
                                      <div style={{ gridColumn: '1 / -1', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e9ecef', fontSize: '11px', color: '#666' }}>
                                        {payment.notes}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                                Mokėjimų istorijos nėra
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Pastabos
                        </label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                          rows={4}
                          placeholder="Įveskite pastabas (nebūtina)"
                          style={{ 
                            width: '100%', 
                            padding: '6px 10px', 
                            fontSize: '13px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px', 
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            backgroundColor: '#ffffff',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = '#007bff'}
                          onBlur={(e) => e.currentTarget.style.borderColor = '#ced4da'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'susije-uzsakymai' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
                    Susiję užsakymai {formData.related_orders.length > 0 && `(${formData.related_orders.length})`}
                  </label>
                    
                    {/* Pridėtų užsakymų sąrašas */}
                    {formData.related_orders.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        {formData.related_orders.map((relatedOrder, index) => {
                          const order = orders.find(o => o.id === relatedOrder.order_id);
                          const clientName = order?.client?.name || order?.client_name || 'Nėra kliento';
                          
                          // Suma: išsaugota arba vežėjo + papildomos išlaidos užsakyme
                          const partnerId = formData.partner_id ? parseInt(formData.partner_id, 10) : undefined;
                          let displayAmount: string | number | null = null;
                          if (relatedOrder.amount && relatedOrder.amount !== '') {
                            displayAmount = relatedOrder.amount;
                          } else if (order) {
                            const amountWithOther = getOrderAmountWithOtherCosts(order, partnerId);
                            if (amountWithOther > 0) displayAmount = amountWithOther.toFixed(2);
                          }
                          
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'center',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                marginBottom: '8px',
                                backgroundColor: '#f9f9f9'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <select
                                  value={String(relatedOrder.order_id) || ''}
                                  onChange={async (e) => {
                                    const newOrderId = e.target.value ? parseInt(e.target.value, 10) : 0;
                                    const updated = [...formData.related_orders];
                                    updated[index].order_id = newOrderId;
                                    
                                    // Jei pasirinktas užsakymas, užkrauti pilnus užsakymo duomenis su vežėjais
                                    if (newOrderId) {
                                      try {
                                        const orderResponse = await api.get(`/orders/orders/${newOrderId}/`);
                                        const fullOrder = orderResponse.data;
                                        
                                        // Atnaujinti užsakymų sąrašą su pilnais duomenimis
                                        const updatedOrders = [...orders];
                                        const existingIndex = updatedOrders.findIndex(o => o.id === newOrderId);
                                        if (existingIndex >= 0) {
                                          updatedOrders[existingIndex] = fullOrder;
                                        } else {
                                          updatedOrders.push(fullOrder);
                                        }
                                        setOrders(updatedOrders);
                                        
                                        const partnerId = formData.partner_id ? parseInt(formData.partner_id, 10) : undefined;
                                        const amountWithOther = getOrderAmountWithOtherCosts(fullOrder, partnerId);
                                        if (amountWithOther > 0) {
                                          updated[index].amount = amountWithOther.toFixed(2);
                                        }
                                      } catch (error) {
                                      }
                                    }
                                    
                                    // Perskaičiuoti bendrą sumą iš visų susijusių užsakymų vežėjo sumų
                                    const total = updated.reduce((sum, ro) => {
                                      const amount = parseFloat(ro.amount) || 0;
                                      return sum + amount;
                                    }, 0);
                                    
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      related_orders: updated,
                                      amount_net: total > 0 ? total.toFixed(2) : ''
                                    }));
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    fontSize: '13px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    marginBottom: '6px'
                                  }}
                                >
                                  <option value="">Pasirinkite užsakymą</option>
                                  {orders.map((o) => (
                                    <option key={o.id} value={String(o.id)}>
                                      {o.order_number || `Užsakymas #${o.id}`} 
                                      {o.client?.name || o.client_name ? ` - ${o.client?.name || o.client_name}` : ''}
                                    </option>
                                  ))}
                                </select>
                                {order && (
                                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                    Klientas: {clientName}
                                  </div>
                                )}
                              </div>
                              <div style={{ width: '150px' }}>
                                <div
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    fontSize: '13px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    backgroundColor: '#f5f5f5',
                                    color: '#333',
                                    display: 'flex',
                                    alignItems: 'center',
                                    minHeight: '32px'
                                  }}
                                >
                                  {displayAmount ? formatMoney(displayAmount) : '-'}
                                </div>
                              </div>
                              <button
                                type="button"
                                title="Pašalinti šį užsakymą iš sąskaitos"
                                onClick={() => {
                                  const updated = formData.related_orders.filter((_, i) => i !== index);
                                  
                                  // Perskaičiuoti bendrą sumą iš visų likusių susijusių užsakymų vežėjo sumų
                                  const total = updated.reduce((sum, ro) => {
                                    const amount = parseFloat(ro.amount) || 0;
                                    return sum + amount;
                                  }, 0);
                                  
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    related_orders: updated,
                                    amount_net: total > 0 ? total.toFixed(2) : ''
                                  }));
                                }}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  flexShrink: 0
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Mygtukas pridėti užsakymą */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          related_orders: [...prev.related_orders, { order_id: 0 as any, amount: '' }]
                        }));
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>+</span>
                      Pridėti užsakymą
                    </button>
                    
                    {/* Pasirinktų užsakymų suma */}
                    {formData.related_orders.length > 0 && (
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f8f9fa', 
                        borderRadius: '4px', 
                        border: '1px solid #dee2e6',
                        marginTop: '16px'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                          Pasirinktų užsakymų suma:
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#007bff' }}>
                          {(() => {
                            const total = formData.related_orders.reduce((sum, ro) => {
                              let amountValue = 0;
                              if (ro.amount && ro.amount !== '') {
                                amountValue = parseFloat(String(ro.amount)) || 0;
                              } else if (ro.order_id) {
                                const order = orders.find(o => o.id === ro.order_id);
                                const partnerId = formData.partner_id ? parseInt(formData.partner_id, 10) : undefined;
                                amountValue = getOrderAmountWithOtherCosts(order, partnerId);
                              }
                              return sum + amountValue;
                            }, 0);
                            return formatMoney(total);
                          })()}
                        </div>
                      </div>
                    )}
                </div>
              )}
              
              {activeTab === 'prisegti-failai' && (
                <div style={{ maxWidth: '600px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>
                      Sąskaitos failas (PDF)
                    </label>
                    
                    {/* Esamas failas (jei yra) */}
                    {isEditMode && localInvoice && (localInvoice.invoice_file_url || localInvoice.invoice_file) && (
                      <div style={{ 
                        marginBottom: '16px',
                        padding: '12px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '20px' }}>📄</span>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '500' }}>
                                Esamas failas
                              </div>
                              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                {localInvoice.invoice_file?.split('/').pop() || 'Sąskaitos failas'}
                              </div>
                            </div>
                          </div>
                          <a 
                            href={localInvoice.invoice_file_url || `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://192.168.9.11:8000'}/${localInvoice.invoice_file}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                              color: '#007bff', 
                              textDecoration: 'none',
                              fontSize: '12px',
                              padding: '4px 8px',
                              border: '1px solid #007bff',
                              borderRadius: '4px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#007bff';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = '#007bff';
                            }}
                          >
                            Atidaryti
                          </a>
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                          Pasirinkus naują failą, jis pakeis esamą
                        </div>
                      </div>
                    )}
                    
                    {/* Naujas failas */}
                    {formData.invoice_file ? (
                      <div style={{ 
                        padding: '12px',
                        backgroundColor: '#e7f3ff',
                        borderRadius: '4px',
                        border: '1px solid #b3d9ff'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <span style={{ fontSize: '20px' }}>📎</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500' }}>
                                {formData.invoice_file.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                {(formData.invoice_file.size / 1024).toFixed(2)} KB
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, invoice_file: null }))}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            ✕ Pašalinti
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setFormData(prev => ({ ...prev, invoice_file: e.target.files![0] }));
                            }
                          }}
                          style={{ 
                            width: '100%', 
                            padding: '12px', 
                            fontSize: '13px', 
                            border: '2px dashed #ddd', 
                            borderRadius: '4px',
                            backgroundColor: '#fafafa',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#007bff';
                            e.currentTarget.style.backgroundColor = '#f0f8ff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#ddd';
                            e.currentTarget.style.backgroundColor = '#fafafa';
                          }}
                        />
                        <div style={{ 
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none',
                          textAlign: 'center',
                          color: '#666'
                        }}>
                          <div style={{ fontSize: '24px', marginBottom: '4px' }}>📎</div>
                          <div style={{ fontSize: '12px' }}>Spustelėkite arba įtempkite failą čia</div>
                          <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>PDF formatas</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="modal-footer" style={{ 
          padding: '10px 14px', 
          borderTop: '1px solid #dee2e6', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ fontSize: '11px', color: '#6c757d' }}>
            {hasUnsavedChanges && (
              <span>⚠️ Yra neišsaugotų pakeitimų</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isEditMode && onDelete && localInvoice && (
              <button
                className="button button-danger"
                onClick={() => {
                  if (window.confirm(`Ar tikrai norite ištrinti sąskaitą ${localInvoice.received_invoice_number}?`)) {
                    onDelete(localInvoice);
                    onClose();
                  }
                }}
                style={{ 
                  padding: '6px 14px', 
                  fontSize: '13px', 
                  fontWeight: '500',
                  backgroundColor: '#dc3545',
                  borderColor: '#dc3545'
                }}
              >
                🗑️ Trinti
              </button>
            )}
            <button 
              type="button"
              className="button button-secondary" 
              onClick={onClose}
              disabled={isLoading}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: '500' }}
            >
              Uždaryti
            </button>
            <button 
              type="button"
              className="button button-primary" 
              onClick={handleSave}
              disabled={isLoading}
              style={{ 
                padding: '6px 20px', 
                fontSize: '13px', 
                fontWeight: '600',
                backgroundColor: isLoading ? '#6c757d' : '#007bff',
                borderColor: isLoading ? '#6c757d' : '#007bff'
              }}
            >
              {isLoading ? '⏳ Išsaugoma...' : (isEditMode ? '💾 Išsaugoti' : '✅ Sukurti')}
            </button>
          </div>
        </div>
      </div>
      
      {/* CSS Styles */}
      <style>{`
        .modal-tabs { 
          gap: 4px; 
          display: flex;
          padding: 0 8px;
          background-color: #f8f9fa;
          border-bottom: 1px solid #dee2e6;
        }
        .tab-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          color: #666;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
          position: relative;
          white-space: nowrap;
        }
        .tab-btn:hover { 
          background-color: rgba(0,0,0,0.03);
          color: #333;
        }
        .tab-btn.active {
          color: #007bff;
          border-bottom: 2px solid #007bff;
          font-weight: 600;
          background-color: #fff;
        }
        .tab-btn.active:hover {
          background-color: #fff;
        }
      `}</style>
    </div>
  );
};

export default PurchaseInvoiceModal_NEW;
