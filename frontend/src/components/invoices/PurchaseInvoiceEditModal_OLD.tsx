// TODO: Šis failas yra pasenęs ir bus ištrintas. Dabar naudojamas PurchaseInvoiceModal_NEW.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import '../../pages/InvoicesPage.css';

interface Partner {
  id: number;
  name: string;
  code?: string;
}

interface Order {
  id: number;
  order_number: string;
  vat_rate?: string | number | null;
  created_at?: string;
  order_date?: string;
  client?: {
    id: number;
    name: string;
  };
  client_name?: string;
  amount_total?: string | number;
  total_amount?: string | number;
  price_with_vat?: string | number;
  price_net?: string | number;
  carriers?: Array<{
    id: number;
    partner?: {
      id: number;
      name: string;
    };
    price_net?: string | number;
  }>;
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
  related_order_ids?: number[];
  expense_category: ExpenseCategory | null;
  expense_category_id?: number | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  issue_date: string;
  received_date: string | null;
  due_date: string;
  payment_date: string | null;
  invoice_file?: string | null;
  invoice_file_url?: string | null;
  overdue_days?: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface PurchaseInvoiceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingInvoice: PurchaseInvoice | null;
  onSave: () => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  orderCarrierId?: string; // Optional: if creating from order carrier
  initialPartnerId?: string; // Optional: initial partner ID
  initialOrderId?: string; // Optional: initial order ID
  initialAmountNet?: string; // Optional: initial amount
}

const PurchaseInvoiceEditModal: React.FC<PurchaseInvoiceEditModalProps> = ({
  isOpen,
  onClose,
  editingInvoice,
  onSave,
  showToast,
  orderCarrierId,
  initialPartnerId,
  initialOrderId,
  initialAmountNet
}) => {
  const [formData, setFormData] = useState({
    partner_id: '',
    related_orders: [] as Array<{ order_id: number; amount: string }>, // Užsakymai su jų sumomis
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

  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [expenseCategorySearch, setExpenseCategorySearch] = useState('');
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showExpenseCategoryDropdown, setShowExpenseCategoryDropdown] = useState(false);
  const [selectedExpenseCategoryName, setSelectedExpenseCategoryName] = useState('');
  const [invoiceNumberSearch, setInvoiceNumberSearch] = useState('');
  const [invoiceNumberSuggestions, setInvoiceNumberSuggestions] = useState<string[]>([]);
  const [showInvoiceNumberDropdown, setShowInvoiceNumberDropdown] = useState(false);

  const fetchExpenseCategories = useCallback(async () => {
    try {
      const response = await api.get('/invoices/expense-categories/');
      const results = response.data.results || response.data;
      setExpenseCategories(results);
    } catch (error) {
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await api.get('/orders/orders/', { params: { page_size: 50 } });
      const results = response.data.results || response.data;
      setOrders(results);
    } catch (error) {
    }
  }, []);

  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
    }
  }, []);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchExpenseCategories();
      fetchOrders();
      fetchPvmRates();
      if (editingInvoice) {
        // Gauti related_orders - arba iš related_orders masyvo, arba iš seno related_order
        let relatedOrders: Array<{ order_id: number; amount: string }> = [];
        if (editingInvoice.related_orders && editingInvoice.related_orders.length > 0) {
          // Jei yra related_orders masyvas, konvertuoti į naują formatą su sumomis
          // Gauti sumas iš related_orders_amounts pagal order_id
          const amountsDict: { [key: number]: string } = {};
          if (editingInvoice.related_orders_amounts) {
            editingInvoice.related_orders_amounts.forEach((item: any) => {
              amountsDict[item.order_id] = item.amount || '0.00';
            });
          }

          relatedOrders = editingInvoice.related_orders.map((o: any) => ({
            order_id: o.id,
            amount: amountsDict[o.id] || o.amount || '' // Pirmiau iš related_orders_amounts, paskui iš order.amount
          }));
        } else if (editingInvoice.related_order_id || editingInvoice.related_order?.id) {
          // Jei yra tik vienas related_order, pridėti jį
          const orderId = editingInvoice.related_order_id || editingInvoice.related_order!.id;

          // Gauti sumą iš related_orders_amounts, jei yra
          // NEnaudoti editingInvoice.amount_net kaip order amount - tai yra total invoice amount!
          let orderAmount = '';
          if (editingInvoice.related_orders_amounts) {
            const amountItem = editingInvoice.related_orders_amounts.find((item: any) => item.order_id === orderId);
            if (amountItem) {
              orderAmount = amountItem.amount || '';
            }
          }

          relatedOrders = [{
            order_id: orderId,
            amount: orderAmount
          }];
        }
        
        const expenseCategoryId = editingInvoice.expense_category_id?.toString() || editingInvoice.expense_category?.id?.toString() || '';
        
        setFormData({
          partner_id: editingInvoice.partner_id?.toString() || editingInvoice.partner?.id?.toString() || '',
          related_orders: relatedOrders,
          order_carrier_id: '',
          expense_category_id: expenseCategoryId,
          received_invoice_number: editingInvoice.received_invoice_number || '',
          payment_status: editingInvoice.payment_status,
          amount_net: editingInvoice.amount_net ? String(editingInvoice.amount_net) : '',
          vat_rate: editingInvoice.vat_rate ? String(editingInvoice.vat_rate) : '',
          issue_date: editingInvoice.issue_date ? (editingInvoice.issue_date.includes('T') ? editingInvoice.issue_date.split('T')[0] : editingInvoice.issue_date) : '',
          received_date: editingInvoice.received_date ? (editingInvoice.received_date.includes('T') ? editingInvoice.received_date.split('T')[0] : editingInvoice.received_date) : new Date().toISOString().split('T')[0],
          due_date: editingInvoice.due_date ? (editingInvoice.due_date.includes('T') ? editingInvoice.due_date.split('T')[0] : editingInvoice.due_date) : '',
          payment_date: editingInvoice.payment_date || '',
          invoice_file: null,
          notes: editingInvoice.notes,
        });
        
        const sName = editingInvoice.partner?.name || '';
        setSelectedSupplierName(sName);
        setSupplierSearch(sName);
        
        // Jei neturime pavadinimo, bet turime ID, pabandyti užkrauti
        const pId = editingInvoice.partner_id || editingInvoice.partner?.id;
        if (!sName && pId) {
          api.get(`/partners/partners/${pId}/`).then(res => {
            setSelectedSupplierName(res.data.name);
            setSupplierSearch(res.data.name);
          }).catch(() => {});
        }

        // Nustatyti expense category pavadinimą, jei yra
        if (editingInvoice.expense_category) {
          const categoryName = editingInvoice.expense_category.name;
          setSelectedExpenseCategoryName(categoryName);
          setExpenseCategorySearch(categoryName);
        } else if (expenseCategoryId) {
          // Jei turime expense_category_id, bet neturime expense_category objekto, pabandyti užkrauti
          api.get(`/invoices/expense-categories/${expenseCategoryId}/`).then(res => {
            const categoryName = res.data.name;
            setSelectedExpenseCategoryName(categoryName);
            setExpenseCategorySearch(categoryName);
          }).catch(() => {
            // Jei nepavyko užkrauti, palikti tuščią
            setSelectedExpenseCategoryName('');
            setExpenseCategorySearch('');
          });
        } else {
          // Jei nėra nei expense_category, nei expense_category_id, išvalyti
          setSelectedExpenseCategoryName('');
          setExpenseCategorySearch('');
        }

        // NEPATIKRINTI amount_net iš vežėjo duomenų redagavimo metu
        // Sąskaitos amount_net turi būti naudojama kaip yra
      } else {
        setFormData({
          partner_id: initialPartnerId || '',
          related_orders: initialOrderId ? [{ order_id: parseInt(initialOrderId, 10), amount: initialAmountNet || '' }] : [],
          order_carrier_id: orderCarrierId || '',
          expense_category_id: '',
          received_invoice_number: '',
          payment_status: 'unpaid',
          amount_net: initialAmountNet || '',
          vat_rate: '',
          issue_date: '',
          received_date: '',
          due_date: '',
          payment_date: '',
          invoice_file: null,
          notes: '',
        });
        // Jei initialPartnerId pateiktas, užkrauti tiekėjo vardą
        if (initialPartnerId) {
          api.get(`/partners/partners/${initialPartnerId}/`).then(response => {
            setSelectedSupplierName(response.data.name);
            setSupplierSearch(response.data.name);
          }).catch(() => {
            // Ignoruoti klaidas
          });
        } else {
          setSelectedSupplierName('');
          setSupplierSearch('');
        }
        
        setSelectedExpenseCategoryName('');
        setExpenseCategorySearch('');
      }
    }
  }, [isOpen, editingInvoice, orderCarrierId, initialPartnerId, initialOrderId, initialAmountNet, fetchExpenseCategories, fetchOrders, fetchPvmRates]);

  // Funkcija tikrinti ir atnaujinti amount_net iš vežėjo duomenų
  const checkAndUpdateCarrierAmount = React.useCallback(async (invoice: PurchaseInvoice, relatedOrders: Array<{ order_id: number; amount: string }>) => {
    try {
      // Tikrinti ar sąskaita turi susijusių užsakymų
      if (relatedOrders.length === 0) return;

      // Gauti pirmo užsakymo duomenis
      const firstOrderId = relatedOrders[0].order_id;
      const orderResponse = await api.get(`/orders/orders/${firstOrderId}/`);
      const order = orderResponse.data;

      // Tikrinti ar užsakymas turi vežėjų
      if (order.carriers && order.carriers.length > 0) {
        // Rasti pirmą vežėją su price_net
        const carrierWithPrice = order.carriers.find((c: any) => c.price_net && c.price_net > 0);
        if (carrierWithPrice) {
          const carrierPriceNet = carrierWithPrice.price_net;

          // Atnaujinti formos amount_net lauką
          setFormData(prev => ({
            ...prev,
            amount_net: String(carrierPriceNet)
          }));
        }
      }
    } catch (error) {
    }
  }, []);

  // Atnaujinti vežėjo sumas, kai keičiasi partner_id ir yra susiję užsakymai
  useEffect(() => {
    const updateCarrierAmounts = async () => {
      if (!formData.partner_id || formData.related_orders.length === 0) return;
      
      const partnerId = parseInt(formData.partner_id, 10);
      if (isNaN(partnerId)) return;
      
      try {
        const updatedRelatedOrders = [...formData.related_orders];
        let hasChanges = false;
        
        for (let i = 0; i < updatedRelatedOrders.length; i++) {
          const orderId = updatedRelatedOrders[i].order_id;
          if (!orderId) continue;
          
          // Rasti užsakymą sąraše
          let order = orders.find(o => o.id === orderId);
          
          // Jei užsakymas neturi carriers duomenų, užkrauti pilnus duomenis
          if (!order || !order.carriers || order.carriers.length === 0) {
            try {
              const orderResponse = await api.get(`/orders/orders/${orderId}/`);
              const loadedOrder = orderResponse.data;
              
              if (!loadedOrder) {
                continue;
              }
              
              order = loadedOrder;
              
              // Atnaujinti užsakymų sąrašą
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
          
          // Rasti vežėją su pasirinktu tiekėju
          if (order && order.carriers && order.carriers.length > 0) {
            const carrier = order.carriers.find((c: any) => 
              c.partner && (c.partner.id === partnerId || c.partner === partnerId)
            );
            if (carrier && carrier.price_net) {
              const carrierPriceNet = typeof carrier.price_net === 'number' 
                ? carrier.price_net.toFixed(2) 
                : String(carrier.price_net);
              
              if (updatedRelatedOrders[i].amount !== carrierPriceNet) {
                updatedRelatedOrders[i].amount = carrierPriceNet;
                hasChanges = true;
              }
            }
          }
        }
        
        if (hasChanges) {
          // Perskaičiuoti bendrą sumą iš visų susijusių užsakymų vežėjo sumų
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
    
    // Atnaujinti tik jei partner_id yra nustatytas ir yra susiję užsakymai
    if (formData.partner_id && formData.related_orders.length > 0) {
      updateCarrierAmounts();
    }
  }, [formData.partner_id, formData.related_orders.length, orders]);

  // Automatiškai perskaičiuoti "Suma be PVM" iš visų susijusių užsakymų vežėjo sumų
  useEffect(() => {
    // Perskaičiuoti tik jei nėra redaguojama sąskaita (redagavimo metu amount_net turi būti read-only)
    if (editingInvoice) return;
    
    // Perskaičiuoti tik jei yra susiję užsakymai
    if (formData.related_orders.length === 0) {
      // Jei nėra susijusių užsakymų, išvalyti amount_net
      if (formData.amount_net) {
        setFormData(prev => ({ ...prev, amount_net: '' }));
      }
      return;
    }
    
    // Suskaičiuoti bendrą sumą iš visų susijusių užsakymų vežėjo sumų
    const total = formData.related_orders.reduce((sum, ro) => {
      const amount = parseFloat(ro.amount) || 0;
      return sum + amount;
    }, 0);
    
    // Atnaujinti amount_net tik jei suma pasikeitė
    const newAmountNet = total > 0 ? total.toFixed(2) : '';
    if (formData.amount_net !== newAmountNet) {
      setFormData(prev => ({
        ...prev,
        amount_net: newAmountNet
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formData.related_orders), editingInvoice]);

  // Automatiškai užpildyti duomenis iš OrderCarrier, jei orderCarrierId pateiktas, bet nėra initialPartnerId
  useEffect(() => {
    if (isOpen && !editingInvoice && orderCarrierId && !initialPartnerId) {
      const loadOrderCarrierData = async () => {
        try {
          const carrierResponse = await api.get(`/orders/carriers/${orderCarrierId}/`);
          const carrier = carrierResponse.data;
          
          if (carrier.partner && carrier.order) {
            setFormData(prev => ({
              ...prev,
              partner_id: carrier.partner?.id?.toString() || '',
              related_orders: carrier.order ? [{ order_id: carrier.order, amount: carrier.price_net ? String(carrier.price_net) : '' }] : prev.related_orders,
              amount_net: carrier.price_net ? String(carrier.price_net) : prev.amount_net,
              issue_date: carrier.loading_date ? (carrier.loading_date.includes('T') ? carrier.loading_date.split('T')[0] : carrier.loading_date) : prev.issue_date,
            }));
            
            // Užkrauti tiekėjo vardą
            setSelectedSupplierName(carrier.partner?.name || '');
            setSupplierSearch(carrier.partner?.name || '');
          }
        } catch (error) {
        }
      };
      
      loadOrderCarrierData();
    }
  }, [isOpen, editingInvoice, orderCarrierId, initialPartnerId]);

  // Automatiškai užpildyti tiekėjo vardą, jei initialPartnerId pateiktas
  useEffect(() => {
    if (isOpen && !editingInvoice && initialPartnerId && !selectedSupplierName) {
      const loadPartnerName = async () => {
        try {
          const partnerResponse = await api.get(`/partners/partners/${initialPartnerId}/`);
          setSelectedSupplierName(partnerResponse.data.name);
          setSupplierSearch(partnerResponse.data.name);
        } catch (error) {
        }
      };
      
      loadPartnerName();
    }
  }, [isOpen, editingInvoice, initialPartnerId, selectedSupplierName]);

  const searchSuppliers = useCallback(async (query: string) => {
    if (!query || query === selectedSupplierName) {
      setSuppliers([]);
      return;
    }
    
    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, is_supplier: true, page_size: 20 }
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

  // Fetch used expense categories from purchase invoices
  const fetchUsedExpenseCategories = useCallback(async () => {
    try {
      const response = await api.get('/invoices/purchase/', {
        params: { page_size: 200 }
      });
      const invoices = response.data.results || response.data || [];
      // Extract expense categories that have been used
      const usedCategories = invoices
        .map((inv: PurchaseInvoice) => inv.expense_category)
        .filter((cat: ExpenseCategory | null) => cat && cat.name)
        .map((cat: ExpenseCategory) => cat.name);
      // Create a map of category names to count
      const categoryCounts: { [key: string]: number } = {};
      usedCategories.forEach((name: string) => {
        categoryCounts[name] = (categoryCounts[name] || 0) + 1;
      });
      // Sort by usage count (most used first)
      const sortedUsedCategories = Object.keys(categoryCounts)
        .sort((a, b) => categoryCounts[b] - categoryCounts[a])
        .slice(0, 20); // Top 20 most used
      
      // Add used categories to the list if they don't exist
      const allCategories = [...expenseCategories];
      sortedUsedCategories.forEach((catName) => {
        if (!allCategories.find(c => c.name.toLowerCase() === catName.toLowerCase())) {
          allCategories.push({ id: 0, name: catName }); // Temporary ID for new categories
        }
      });
      
      return { allCategories, sortedUsedCategories };
    } catch (error) {
      return { allCategories: expenseCategories, sortedUsedCategories: [] };
    }
  }, [expenseCategories]);

  // Filter expense categories based on search, prioritizing recently used ones
  useEffect(() => {
    if (expenseCategorySearch && expenseCategorySearch !== selectedExpenseCategoryName) {
      fetchUsedExpenseCategories().then(({ allCategories, sortedUsedCategories }) => {
        const searchLower = expenseCategorySearch.toLowerCase();
        const filtered = allCategories
          .filter(cat => cat.name.toLowerCase().includes(searchLower))
          .sort((a, b) => {
            // Prioritize recently used categories
            const aUsed = sortedUsedCategories.includes(a.name);
            const bUsed = sortedUsedCategories.includes(b.name);
            if (aUsed && !bUsed) return -1;
            if (!aUsed && bUsed) return 1;
            return a.name.localeCompare(b.name);
          });
        setFilteredExpenseCategories(filtered);
        setShowExpenseCategoryDropdown(true);
      });
    } else {
      // If no search, show recently used categories first
      fetchUsedExpenseCategories().then(({ allCategories, sortedUsedCategories }) => {
        const sorted = allCategories.sort((a, b) => {
          const aUsed = sortedUsedCategories.includes(a.name);
          const bUsed = sortedUsedCategories.includes(b.name);
          if (aUsed && !bUsed) return -1;
          if (!aUsed && bUsed) return 1;
          return a.name.localeCompare(b.name);
        });
        setFilteredExpenseCategories(sorted.slice(0, 10)); // Show top 10
        setShowExpenseCategoryDropdown(false);
      });
    }
  }, [expenseCategorySearch, selectedExpenseCategoryName, expenseCategories, fetchUsedExpenseCategories]);

  // Fetch invoice numbers for a supplier
  const fetchInvoiceNumbersForSupplier = useCallback(async (partnerId: string) => {
    if (!partnerId) {
      setInvoiceNumberSuggestions([]);
      return;
    }
    
    try {
      const response = await api.get('/invoices/purchase/', {
        params: { partner_id: partnerId, page_size: 100 }
      });
      const invoices = response.data.results || response.data || [];
      // Extract unique invoice numbers
      const uniqueNumbers = Array.from(new Set(
        invoices
          .map((inv: PurchaseInvoice) => inv.received_invoice_number)
          .filter((num: string | null) => num && num.trim() !== '')
      )) as string[];
      setInvoiceNumberSuggestions(uniqueNumbers);
    } catch (error) {
      setInvoiceNumberSuggestions([]);
    }
  }, []);

  // Load invoice numbers when supplier is selected
  useEffect(() => {
    if (formData.partner_id) {
      fetchInvoiceNumbersForSupplier(formData.partner_id);
    } else {
      setInvoiceNumberSuggestions([]);
    }
  }, [formData.partner_id, fetchInvoiceNumbersForSupplier]);

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

  const handleSupplierSelect = async (supplier: Partner) => {
    const partnerId = supplier.id.toString();
    setFormData(prev => ({ ...prev, partner_id: partnerId }));
    setSelectedSupplierName(supplier.name);
    setSupplierSearch(supplier.name);
    setShowSupplierDropdown(false);
    setSuppliers([]);
    
    // Atnaujinti vežėjo sumas visiems susijusiems užsakymams
    if (formData.related_orders && formData.related_orders.length > 0) {
      try {
        const updatedRelatedOrders = [...formData.related_orders];
        let firstCarrierFound = false;
        
        for (let i = 0; i < updatedRelatedOrders.length; i++) {
          const orderId = updatedRelatedOrders[i].order_id;
          if (!orderId) continue;
          
          try {
            // Užkrauti pilnus užsakymo duomenis su vežėjais
            const orderResponse = await api.get(`/orders/orders/${orderId}/`);
            const order = orderResponse.data;
            
            // Atnaujinti užsakymų sąrašą su pilnais duomenimis
            const updatedOrders = [...orders];
            const existingIndex = updatedOrders.findIndex(o => o.id === orderId);
            if (existingIndex >= 0) {
              updatedOrders[existingIndex] = order;
            } else {
              updatedOrders.push(order);
            }
            setOrders(updatedOrders);
            
            // Rasti vežėją su pasirinktu tiekėju
            if (order.carriers && order.carriers.length > 0) {
              const carrier = order.carriers.find((c: any) => 
                c.partner && (c.partner.id === supplier.id || c.partner === supplier.id)
              );
              if (carrier && carrier.price_net) {
                const carrierPriceNet = typeof carrier.price_net === 'number' 
                  ? carrier.price_net.toFixed(2) 
                  : String(carrier.price_net);
                updatedRelatedOrders[i].amount = carrierPriceNet;
                
                // Naudoti pirmą vežėją automatiniam užpildymui (vat_rate, issue_date)
                if (!firstCarrierFound) {
                  firstCarrierFound = true;
                  setFormData(prev => ({
                    ...prev,
                    vat_rate: order.vat_rate ? String(order.vat_rate) : prev.vat_rate,
                    issue_date: carrier.loading_date ? (carrier.loading_date.includes('T') ? carrier.loading_date.split('T')[0] : carrier.loading_date) : prev.issue_date,
                  }));
                }
              }
            }
          } catch (error) {
          }
        }
        
        // Perskaičiuoti bendrą sumą iš visų susijusių užsakymų vežėjo sumų
        const total = updatedRelatedOrders.reduce((sum, ro) => {
          const amount = parseFloat(ro.amount) || 0;
          return sum + amount;
        }, 0);
        
        // Atnaujinti susijusius užsakymus su vežėjo sumomis ir amount_net
        setFormData(prev => ({
          ...prev,
          related_orders: updatedRelatedOrders,
          amount_net: total > 0 ? total.toFixed(2) : prev.amount_net
        }));
      } catch (error) {
      }
    }
    
    const receivedDate = new Date(formData.received_date || new Date());
    const dueDate = new Date(receivedDate);
    // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
    dueDate.setTime(dueDate.getTime() + (30 * 24 * 60 * 60 * 1000));
    setFormData(prev => ({
      ...prev,
      due_date: dueDate.toISOString().split('T')[0],
    }));
  };

  const handleExpenseCategorySelect = (category: ExpenseCategory) => {
    setFormData({ ...formData, expense_category_id: category.id.toString() });
    setSelectedExpenseCategoryName(category.name);
    setExpenseCategorySearch(category.name);
    setShowExpenseCategoryDropdown(false);
    setFilteredExpenseCategories([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partner_id) { showToast('info', 'Pasirinkite tiekėją.'); return; }
    if (!formData.received_invoice_number) { showToast('info', 'Įveskite tiekėjo sąskaitos numerį.'); return; }
    if (!formData.amount_net) { showToast('info', 'Įveskite sumą be PVM.'); return; }
    if (!formData.vat_rate) { showToast('info', 'Įveskite PVM tarifą.'); return; }
    if (!formData.issue_date) { showToast('info', 'Pasirinkite tiekėjo sąskaitos išrašymo datą.'); return; }
    if (!formData.received_date) { showToast('info', 'Pasirinkite gavimo datą.'); return; }
    if (!formData.due_date) { showToast('info', 'Pasirinkite mokėjimo terminą.'); return; }
    
    let expenseCategoryId = formData.expense_category_id;
    if (!expenseCategoryId && expenseCategorySearch && expenseCategorySearch.trim()) {
      const categoryId = await ensureExpenseCategoryExists(expenseCategorySearch);
      if (categoryId) {
        expenseCategoryId = categoryId.toString();
        setFormData(prev => ({ ...prev, expense_category_id: expenseCategoryId }));
        setSelectedExpenseCategoryName(expenseCategorySearch);
      } else {
        showToast('error', 'Nepavyko sukurti arba rasti išlaidų kategoriją.'); return;
      }
    }
    
    if (!expenseCategoryId) {
      showToast('info', 'Pasirinkite arba įveskite išlaidų kategoriją.'); return;
    }
    
    try {
      if (formData.order_carrier_id) {
        await api.post('/invoices/purchase/generate_from_order_carrier/', {
          order_carrier_id: parseInt(formData.order_carrier_id),
          expense_category_id: parseInt(expenseCategoryId),
          received_invoice_number: formData.received_invoice_number,
          issue_date: formData.issue_date || '',
          received_date: formData.received_date || '',
          due_date: formData.due_date || '',
        });
        showToast('success', 'Pirkimo sąskaita sukurta ir vežėjo sąskaitos statusas atnaujintas.');
        onSave();
        onClose();
        return;
      }
      
      const formDataToSend = new FormData();
      formDataToSend.append('partner_id', formData.partner_id);
      formDataToSend.append('received_invoice_number', formData.received_invoice_number);
      formDataToSend.append('payment_status', formData.payment_status);
      formDataToSend.append('amount_net', formData.amount_net);
      formDataToSend.append('vat_rate', formData.vat_rate);
      formDataToSend.append('issue_date', formData.issue_date || '');
      formDataToSend.append('received_date', formData.received_date || '');
      formDataToSend.append('due_date', formData.due_date || '');
      formDataToSend.append('notes', formData.notes);
      formDataToSend.append('expense_category_id', expenseCategoryId);
      
      // Siųsti related_order_ids masyvą (iš related_orders)
      if (formData.related_orders && formData.related_orders.length > 0) {
        formData.related_orders.forEach((ro) => {
          if (ro.order_id) {
            formDataToSend.append('related_order_ids', ro.order_id.toString());
          }
        });
        
        // Siųsti related_orders_amounts kaip JSON string
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
      
      if (formData.payment_date) {
        const paymentDate = formData.payment_date.includes('T') ? formData.payment_date.split('T')[0] : (formData.payment_date.includes(' ') ? formData.payment_date.split(' ')[0] : formData.payment_date);
        formDataToSend.append('payment_date', paymentDate);
      } else {
        formDataToSend.append('payment_date', '');
      }
      
      if (formData.invoice_file) {
        formDataToSend.append('invoice_file', formData.invoice_file);
      }
      
      await api.post('/invoices/purchase/', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('success', 'Pirkimo sąskaita sėkmingai sukurta.');
      onSave();
      onClose();
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error', 'Klaida kuriant sąskaitą: ' + (details ? JSON.stringify(details) : error.message));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;
    if (!formData.partner_id) { showToast('info', 'Pasirinkite tiekėją.'); return; }
    if (!formData.received_invoice_number) { showToast('info', 'Įveskite tiekėjo sąskaitos numerį.'); return; }
    if (!formData.amount_net) { showToast('info', 'Įveskite sumą be PVM.'); return; }
    if (!formData.vat_rate) { showToast('info', 'Įveskite PVM tarifą.'); return; }
    if (!formData.issue_date) { showToast('info', 'Pasirinkite tiekėjo sąskaitos išrašymo datą.'); return; }
    if (!formData.received_date) { showToast('info', 'Pasirinkite gavimo datą.'); return; }
    if (!formData.due_date) { showToast('info', 'Pasirinkite mokėjimo terminą.'); return; }
    
    let expenseCategoryId = formData.expense_category_id;
    if (!expenseCategoryId && expenseCategorySearch && expenseCategorySearch.trim()) {
      const categoryId = await ensureExpenseCategoryExists(expenseCategorySearch);
      if (categoryId) {
        expenseCategoryId = categoryId.toString();
        setFormData(prev => ({ ...prev, expense_category_id: expenseCategoryId }));
        setSelectedExpenseCategoryName(expenseCategorySearch);
      } else {
        showToast('error', 'Nepavyko sukurti arba rasti išlaidų kategoriją.'); return;
      }
    }
    
    if (!expenseCategoryId) {
      showToast('info', 'Pasirinkite arba įveskite išlaidų kategoriją.'); return;
    }
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('partner_id', formData.partner_id);
      formDataToSend.append('received_invoice_number', formData.received_invoice_number);
      formDataToSend.append('payment_status', formData.payment_status);
      formDataToSend.append('amount_net', formData.amount_net);
      formDataToSend.append('vat_rate', formData.vat_rate);
      formDataToSend.append('issue_date', formData.issue_date || '');
      formDataToSend.append('received_date', formData.received_date || '');
      formDataToSend.append('due_date', formData.due_date || '');
      formDataToSend.append('notes', formData.notes);
      formDataToSend.append('expense_category_id', expenseCategoryId);
      
      // Siųsti related_order_ids masyvą (iš related_orders)
      if (formData.related_orders && formData.related_orders.length > 0) {
        formData.related_orders.forEach((ro) => {
          if (ro.order_id) {
            formDataToSend.append('related_order_ids', ro.order_id.toString());
          }
        });
        
        // Siųsti related_orders_amounts kaip JSON string
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
      
      if (formData.payment_date) {
        const paymentDate = formData.payment_date.includes('T') ? formData.payment_date.split('T')[0] : (formData.payment_date.includes(' ') ? formData.payment_date.split(' ')[0] : formData.payment_date);
        formDataToSend.append('payment_date', paymentDate);
      } else {
        formDataToSend.append('payment_date', '');
      }
      
      if (formData.invoice_file) {
        formDataToSend.append('invoice_file', formData.invoice_file);
      }
      
      await api.put(`/invoices/purchase/${editingInvoice.id}/`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('success', 'Pirkimo sąskaita sėkmingai atnaujinta.');
      onSave();
      onClose();
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error', 'Klaida atnaujinant sąskaitą: ' + (details ? JSON.stringify(details) : error.message));
    }
  };

  // Auto-calculate due_date when received_date or issue_date changes
  useEffect(() => {
    if (formData.received_date && !formData.due_date) {
      const received = new Date(formData.received_date);
      const due = new Date(received);
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      setFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [formData.received_date, formData.due_date]);

  useEffect(() => {
    if (formData.issue_date && !formData.due_date) {
      const issue = new Date(formData.issue_date);
      const due = new Date(issue);
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      setFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [formData.issue_date, formData.due_date]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingInvoice ? 'Redaguoti pirkimo sąskaitą' : 'Nauja pirkimo sąskaita'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={editingInvoice ? handleUpdate : handleCreate}>
          <div className="form-grid">
            <div className="form-field">
              <label>Tiekėjas *</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  onFocus={() => {
                    if (supplierSearch && supplierSearch !== selectedSupplierName) {
                      setShowSupplierDropdown(true);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                  placeholder="Ieškoti tiekėjo..."
                  required
                />
                {showSupplierDropdown && suppliers.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {suppliers.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="autocomplete-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSupplierSelect(supplier);
                        }}
                      >
                        {supplier.name} ({supplier.code})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="form-field">
              <label>Susiję užsakymai {formData.related_orders.length > 0 && `(${formData.related_orders.length})`}</label>
              
              {/* Pridėtų užsakymų sąrašas */}
              {formData.related_orders.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  {formData.related_orders.map((relatedOrder, index) => {
                    const order = orders.find(o => o.id === relatedOrder.order_id);
                    const clientName = order?.client?.name || order?.client_name || 'Nėra kliento';
                    
                    // Rasti vežėjo sumą: jei yra pasirinktas tiekėjas, rasti vežėją su tuo tiekėju
                    let carrierAmount: string | number | null = null;
                    if (order && formData.partner_id) {
                      const partnerId = parseInt(formData.partner_id, 10);
                      if (order.carriers && order.carriers.length > 0) {
                        const carrier = order.carriers.find((c: any) => 
                          c.partner && (c.partner.id === partnerId || c.partner === partnerId)
                        );
                        if (carrier && carrier.price_net) {
                          carrierAmount = carrier.price_net;
                        }
                      }
                    }
                    
                    // Jei nerasta vežėjo sumos, naudoti išsaugotą sumą arba bandyti gauti iš užsakymo vežėjų
                    const displayAmount = carrierAmount !== null 
                      ? carrierAmount 
                      : (relatedOrder.amount || (order?.carriers && order.carriers.length > 0 
                          ? order.carriers.find((c: any) => c.price_net && c.price_net > 0)?.price_net 
                          : null));
                    
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
                                  
                                  // Rasti vežėjo sumą: jei yra pasirinktas tiekėjas, rasti vežėją su tuo tiekėju
                                  let carrierPriceNet: string | number | null = null;
                                  if (formData.partner_id && fullOrder.carriers && fullOrder.carriers.length > 0) {
                                    const partnerId = parseInt(formData.partner_id, 10);
                                    const carrier = fullOrder.carriers.find((c: any) => 
                                      c.partner && (c.partner.id === partnerId || c.partner === partnerId)
                                    );
                                    if (carrier && carrier.price_net) {
                                      carrierPriceNet = carrier.price_net;
                                    } else {
                                      // Jei nerasta su tiekėju, rasti pirmą vežėją su price_net
                                      const carrierWithPrice = fullOrder.carriers.find((c: any) => c.price_net && c.price_net > 0);
                                      if (carrierWithPrice) {
                                        carrierPriceNet = carrierWithPrice.price_net;
                                      }
                                    }
                                  } else if (fullOrder.carriers && fullOrder.carriers.length > 0) {
                                    // Jei nėra pasirinkto tiekėjo, rasti pirmą vežėją su price_net
                                    const carrierWithPrice = fullOrder.carriers.find((c: any) => c.price_net && c.price_net > 0);
                                    if (carrierWithPrice) {
                                      carrierPriceNet = carrierWithPrice.price_net;
                                    }
                                  }
                                  
                                  if (carrierPriceNet !== null) {
                                    updated[index].amount = typeof carrierPriceNet === 'number' 
                                      ? carrierPriceNet.toFixed(2) 
                                      : String(carrierPriceNet);
                                  }
                                } catch (error) {
                                }
                              }
                              
                              // Perskaičiuoti bendrą sumą iš visų susijusių užsakymų vežėjo sumų
                              const total = updated.reduce((sum, ro) => {
                                const amount = parseFloat(ro.amount) || 0;
                                return sum + amount;
                              }, 0);
                              
                              setFormData({ 
                                ...formData, 
                                related_orders: updated,
                                amount_net: total > 0 ? total.toFixed(2) : ''
                              });
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
                            {displayAmount ? `${parseFloat(String(displayAmount)).toFixed(2)} EUR` : '-'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.related_orders.filter((_, i) => i !== index);
                            
                            // Perskaičiuoti bendrą sumą iš visų likusių susijusių užsakymų vežėjo sumų
                            const total = updated.reduce((sum, ro) => {
                              const amount = parseFloat(ro.amount) || 0;
                              return sum + amount;
                            }, 0);
                            
                            setFormData({ 
                              ...formData, 
                              related_orders: updated,
                              amount_net: total > 0 ? total.toFixed(2) : ''
                            });
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
                  setFormData({
                    ...formData,
                    related_orders: [...formData.related_orders, { order_id: 0 as any, amount: '' }]
                  });
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
            </div>
            
            <div className="form-field">
              <label>Tiekėjo sąskaitos numeris *</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={formData.received_invoice_number}
                  onChange={(e) => {
                    setFormData({ ...formData, received_invoice_number: e.target.value });
                    setInvoiceNumberSearch(e.target.value);
                    setShowInvoiceNumberDropdown(true);
                  }}
                  onFocus={() => {
                    if (formData.partner_id && invoiceNumberSuggestions.length > 0) {
                      setShowInvoiceNumberDropdown(true);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowInvoiceNumberDropdown(false), 200)}
                  required
                  placeholder="Įveskite tiekėjo sąskaitos numerį"
                />
                {showInvoiceNumberDropdown && invoiceNumberSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {invoiceNumberSuggestions
                      .filter(num => num.toLowerCase().includes(invoiceNumberSearch.toLowerCase()))
                      .map((invoiceNum, idx) => (
                        <div
                          key={idx}
                          className="autocomplete-item"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormData({ ...formData, received_invoice_number: invoiceNum });
                            setInvoiceNumberSearch(invoiceNum);
                            setShowInvoiceNumberDropdown(false);
                          }}
                        >
                          {invoiceNum}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="form-field">
              <label>Išlaidų kategorija *</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={expenseCategorySearch}
                  onChange={(e) => {
                    setExpenseCategorySearch(e.target.value);
                    setShowExpenseCategoryDropdown(true);
                  }}
                  onFocus={() => {
                    if (expenseCategorySearch && expenseCategorySearch !== selectedExpenseCategoryName) {
                      setShowExpenseCategoryDropdown(true);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowExpenseCategoryDropdown(false), 200)}
                  placeholder="Įveskite arba pasirinkite išlaidų kategoriją..."
                  required
                  style={{ width: '100%' }}
                />
                {showExpenseCategoryDropdown && filteredExpenseCategories.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {filteredExpenseCategories.map((category) => (
                      <div
                        key={category.id}
                        className="autocomplete-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleExpenseCategorySelect(category);
                        }}
                      >
                        {category.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!formData.expense_category_id && (
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#dc3545' }}>
                  Privaloma pasirinkti išlaidų kategoriją
                </div>
              )}
            </div>
            
            <div className="form-field">
              <label>Mokėjimo statusas *</label>
              <select
                value={formData.payment_status}
                onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                required
              >
                <option value="unpaid">Neapmokėta</option>
                <option value="paid">Apmokėta</option>
                <option value="overdue">Vėluoja</option>
                <option value="partially_paid">Dalinis apmokėjimas</option>
              </select>
            </div>
            
            <div className="form-field">
              <label>Suma be PVM *</label>
              {editingInvoice ? (
                <div
                  style={{
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#f5f5f5',
                    color: '#333',
                    minHeight: '38px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {formData.amount_net ? `${parseFloat(formData.amount_net).toFixed(2)} EUR` : '-'}
                </div>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount_net}
                  onChange={(e) => setFormData({ ...formData, amount_net: e.target.value })}
                  required
                />
              )}
            </div>
            
            <div className="form-field">
              <label>PVM tarifas (%) *</label>
              <select
                value={(() => {
                  if (!formData.vat_rate) return '';
                  // Normalizuoti abi reikšmes palyginimui (pašalinti .00 jei yra)
                  const normalizedVatRate = parseFloat(String(formData.vat_rate)).toString();
                  const matchedRate = pvmRates.find(r => {
                    const normalizedRate = parseFloat(String(r.rate)).toString();
                    return normalizedRate === normalizedVatRate;
                  });
                  return matchedRate?.id || '';
                })()}
                onChange={(e) => {
                  const selectedRate = pvmRates.find(r => r.id === parseInt(e.target.value));
                  if (selectedRate) {
                    setFormData({
                      ...formData,
                      vat_rate: selectedRate.rate,
                    });
                  } else if (e.target.value === '') {
                    // Jei pasirinkta tuščia reikšmė, nustatyti tuščią
                    setFormData({
                      ...formData,
                      vat_rate: '',
                    });
                  }
                }}
                required
                style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                <option value="">-- Pasirinkite PVM tarifą --</option>
                {pvmRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.rate}%{rate.article ? ` - ${rate.article}` : ''}
                  </option>
                ))}
              </select>
              {pvmRates.length === 0 && (
                <small style={{ color: '#dc3545', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                  PVM tarifų nėra. Prašome pridėti nustatymuose.
                </small>
              )}
            </div>
            
            <div className="form-field">
              <label>Tiekėjo sąskaitos išrašymo data *</label>
              <input
                type="date"
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                required
              />
            </div>
            
            <div className="form-field">
              <label>Gavimo data *</label>
              <input
                type="date"
                value={formData.received_date}
                onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
                required
              />
            </div>
            
            <div className="form-field">
              <label>Mokėjimo terminas *</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                required
              />
            </div>
            
            <div className="form-field">
              <label>Apmokėjimo data</label>
              <input
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              />
            </div>
            
            <div className="form-field full-width">
              <label>Sąskaitos failas (PDF)</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFormData({ ...formData, invoice_file: e.target.files[0] });
                  }
                }}
              />
              {editingInvoice && (editingInvoice.invoice_file_url || editingInvoice.invoice_file) && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  <a 
                    href={editingInvoice.invoice_file_url || `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://192.168.9.11:8000'}/${editingInvoice.invoice_file}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    📄 Peržiūrėti esamą failą
                  </a>
                </div>
              )}
            </div>
            
            <div className="form-field full-width">
              <label>Pastabos</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingInvoice ? 'Išsaugoti' : 'Sukurti'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Atšaukti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseInvoiceEditModal;

