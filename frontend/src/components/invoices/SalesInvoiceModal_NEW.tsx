import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import PaymentService from '../../services/paymentService';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import '../../pages/InvoicesPage.css';

// Interfaces
interface Payment {
  id: number;
  amount: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

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
  client_price_net?: string | number | null;
  calculated_client_price_net?: string | number | null;
  vat_rate?: string | number | null;
  route_from?: string;
  route_to?: string;
  loading_date?: string;
  unloading_date?: string;
  loading_date_from?: string;
  loading_date_to?: string;
  unloading_date_from?: string;
  unloading_date_to?: string;
  suggested_amount_net?: string | null;
}

interface InvoiceItem {
  description: string;
  amount_net: number;
  vat_amount: number;
  amount_total: number;
  vat_rate: number;
  visible?: boolean;
}

interface SalesInvoice {
  id: number;
  invoice_number: string;
  invoice_type: 'pre_invoice' | 'final' | 'credit' | 'proforma';
  invoice_type_display?: string;
  partner: Partner;
  partner_id?: number;
  related_order: Order | null;
  related_order_id?: number | null;
  related_orders?: Order[];
  credit_invoice?: number | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  paid_amount?: string;
  remaining_amount?: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  overdue_days?: number;
  notes: string;
  payment_history?: Payment[];
  invoice_items?: InvoiceItem[];
  display_options?: {
    show_order_type?: boolean;
    show_cargo_info?: boolean;
    show_cargo_weight?: boolean;
    show_cargo_ldm?: boolean;
    show_cargo_dimensions?: boolean;
    show_cargo_properties?: boolean;
    show_carriers?: boolean;
    show_carrier_name?: boolean;
    show_carrier_route?: boolean;
    show_carrier_dates?: boolean;
    show_prices?: boolean;
    show_my_price?: boolean;
    show_other_costs?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

interface SalesInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null; // null = create mode
  initialPartnerId?: string;
  initialOrderId?: string;
  onSave: () => void;
  onDelete?: (invoice: SalesInvoice) => void;
  onInvoiceUpdate?: (invoice: SalesInvoice) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, timeoutMs?: number) => void;
  invoiceSettings?: {
    last_invoice_number?: string | null;
    next_invoice_number?: string;
    default_display_options?: {
      show_order_type?: boolean;
      show_cargo_info?: boolean;
      show_cargo_weight?: boolean;
      show_cargo_ldm?: boolean;
      show_cargo_dimensions?: boolean;
      show_cargo_properties?: boolean;
      show_carriers?: boolean;
      show_carrier_name?: boolean;
      show_carrier_route?: boolean;
      show_carrier_dates?: boolean;
      show_prices?: boolean;
      show_my_price?: boolean;
      show_other_costs?: boolean;
    };
  } | null;
}

type ActiveTab = 'pagrindinis' | 'susije-uzsakymai' | 'finansai' | 'eilutes';

const SalesInvoiceModal_NEW: React.FC<SalesInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoice,
  initialPartnerId,
  initialOrderId,
  onSave,
  onDelete,
  onInvoiceUpdate,
  showToast,
  invoiceSettings
}) => {
  const { i18n } = useTranslation();
  
  // Determine if editing existing invoice or creating new
  const isEditMode = !!invoice;
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('pagrindinis');
  const [localInvoice, setLocalInvoice] = useState<SalesInvoice | null>(invoice);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Form data for edit/create mode
  const [formData, setFormData] = useState({
    invoice_number: '',
    partner_id: '',
    related_order_id: '',
    invoice_type: 'final' as 'pre_invoice' | 'final' | 'credit' | 'proforma',
    payment_status: 'unpaid' as 'unpaid' | 'paid' | 'overdue' | 'partially_paid',
    amount_net: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: (() => {
      const issueDate = new Date();
      const due = new Date(issueDate);
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      return due.toISOString().split('T')[0];
    })(),
    payment_date: '',
    notes: '',
    display_options: {
      show_order_type: true,
      show_cargo_info: true,
      show_cargo_weight: true,
      show_cargo_ldm: true,
      show_cargo_dimensions: true,
      show_cargo_properties: true,
      show_carriers: true,
      show_carrier_name: true,
      show_carrier_route: true,
      show_carrier_dates: true,
      show_prices: true,
      show_my_price: true,
      show_other_costs: true,
    } as {
      show_order_type: boolean;
      show_cargo_info: boolean;
      show_cargo_weight: boolean;
      show_cargo_ldm: boolean;
      show_cargo_dimensions: boolean;
      show_cargo_properties: boolean;
      show_carriers: boolean;
      show_carrier_name: boolean;
      show_carrier_route: boolean;
      show_carrier_dates: boolean;
      show_prices: boolean;
      show_my_price: boolean;
      show_other_costs: boolean;
    },
  });
  
  // Additional state
  const [partners, setPartners] = useState<Partner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [selectedAdditionalOrderIds, setSelectedAdditionalOrderIds] = useState<number[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [selectedPartnerName, setSelectedPartnerName] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [availableGapNumber, setAvailableGapNumber] = useState<string | null>(null);
  const [showGapSuggestion, setShowGapSuggestion] = useState(false);
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');
  
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
  const initialAdditionalOrderIdsRef = useRef<number[]>([]);
  const isInitializingRef = useRef(false);
  
  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('pagrindinis');
      setHasUnsavedChanges(false);
      isInitializingRef.current = false;
      return;
    }
    
    // Set initializing flag when modal opens
    isInitializingRef.current = true;
    
    if (!invoice) {
      // Create mode
      setLocalInvoice(null);
      initializeCreateForm();
    } else {
      // Edit mode - load invoice and initialize form
      setLocalInvoice(invoice);
      loadFullInvoice(invoice.id).then((loadedInvoice) => {
        // After loading, initialize form from invoice data
        if (loadedInvoice) {
          initializeEditForm(loadedInvoice);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoice]);
  
  // Load full invoice data
  const loadFullInvoice = useCallback(async (invoiceId: number) => {
    try {
      setIsLoading(true);
      const response = await api.get(`/invoices/sales/${invoiceId}/`);
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
  
  // Fetch available orders
  const fetchAvailableOrders = useCallback(async (partnerId: number, invoiceId?: number) => {
    if (!partnerId) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const params: any = {
        partner_id: partnerId,
      };
      // Siųsti invoice_id tik jei jis nurodytas (redagavimo režimas)
      if (invoiceId !== undefined && invoiceId !== null) {
        params.invoice_id = invoiceId;
      }
      const response = await api.get('/orders/orders/available-for-invoice/', {
        params,
      });
      const results = response.data?.results || [];
      
      // Ensure selected orders are included (only for edit mode)
      // Use invoice prop instead of localInvoice to avoid stale closures
      if (invoiceId && invoice && invoice.related_orders) {
        const primaryOrderId = invoice.related_order_id ?? invoice.related_order?.id ?? null;
        const additionalIds = invoice.related_orders
          .map((o: any) => o.id)
          .filter((id: number) => (primaryOrderId ? id !== primaryOrderId : true));
        
        const existingOrderIds = new Set(results.map((o: any) => o.id));
        const missingIds = additionalIds.filter(id => !existingOrderIds.has(id));
        
        if (missingIds.length > 0) {
          try {
            const missingOrdersResponse = await api.get('/orders/orders/', {
              params: {
                id__in: missingIds.join(','),
                page_size: 100,
              },
            });
            const missingOrders = missingOrdersResponse.data?.results || missingOrdersResponse.data || [];
            
            missingOrders.forEach((order: any) => {
              if (!existingOrderIds.has(order.id)) {
                results.push({
                  id: order.id,
                  order_number: order.order_number || `Užsakymas #${order.id}`,
                  client_price_net: order.client_price_net ? String(order.client_price_net) : null,
                  calculated_client_price_net: order.calculated_client_price_net ? String(order.calculated_client_price_net) : null,
                  suggested_amount_net: order.client_price_net ? String(order.client_price_net) : (order.calculated_client_price_net ? String(order.calculated_client_price_net) : null),
                  vat_rate: order.vat_rate ? String(order.vat_rate) : null,
                  route_from: order.route_from || null,
                  route_to: order.route_to || null,
                  loading_date: order.loading_date ? (order.loading_date.includes('T') ? order.loading_date.split('T')[0] : order.loading_date.split(' ')[0]) : null,
                  unloading_date: order.unloading_date ? (order.unloading_date.includes('T') ? order.unloading_date.split('T')[0] : order.unloading_date.split(' ')[0]) : null,
                });
              }
            });
          } catch (error) {
            // Ignore errors
          }
        }
      }
      
      setOrders(results);
    } catch (error) {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);
  
  // Load invoice_items when Eilutės tab is opened
  useEffect(() => {
    if (activeTab === 'eilutes' && isEditMode && localInvoice?.id && (!localInvoice.invoice_items || localInvoice.invoice_items.length === 0)) {
      loadFullInvoice(localInvoice.id);
    }
  }, [activeTab, isEditMode, localInvoice?.id, localInvoice?.invoice_items, loadFullInvoice]);
  
  // Initialize edit form from invoice data
  const initializeEditForm = useCallback((invoiceData: SalesInvoice) => {
    setFormData({
      invoice_number: invoiceData.invoice_number || '',
      partner_id: invoiceData.partner_id?.toString() || invoiceData.partner.id.toString(),
      related_order_id: invoiceData.related_order_id?.toString() || invoiceData.related_order?.id.toString() || '',
      invoice_type: invoiceData.invoice_type,
      payment_status: invoiceData.payment_status,
      amount_net: invoiceData.amount_net,
      issue_date: invoiceData.issue_date ? (invoiceData.issue_date.includes('T') ? invoiceData.issue_date.split('T')[0] : invoiceData.issue_date.split(' ')[0]) : '',
      due_date: invoiceData.due_date ? (invoiceData.due_date.includes('T') ? invoiceData.due_date.split('T')[0] : invoiceData.due_date.split(' ')[0]) : '',
      payment_date: invoiceData.payment_date ? (invoiceData.payment_date.includes('T') ? invoiceData.payment_date.split('T')[0] : invoiceData.payment_date.split(' ')[0]) : '',
      notes: invoiceData.notes || '',
      display_options: invoiceData.display_options ? {
        show_order_type: invoiceData.display_options.show_order_type ?? true,
        show_cargo_info: invoiceData.display_options.show_cargo_info ?? true,
        show_cargo_weight: invoiceData.display_options.show_cargo_weight ?? true,
        show_cargo_ldm: invoiceData.display_options.show_cargo_ldm ?? true,
        show_cargo_dimensions: invoiceData.display_options.show_cargo_dimensions ?? true,
        show_cargo_properties: invoiceData.display_options.show_cargo_properties ?? true,
        show_carriers: invoiceData.display_options.show_carriers ?? true,
        show_carrier_name: invoiceData.display_options.show_carrier_name ?? true,
        show_carrier_route: invoiceData.display_options.show_carrier_route ?? true,
        show_carrier_dates: invoiceData.display_options.show_carrier_dates ?? true,
        show_prices: invoiceData.display_options.show_prices ?? true,
        show_my_price: invoiceData.display_options.show_my_price ?? true,
        show_other_costs: invoiceData.display_options.show_other_costs ?? true,
      } : {
        show_order_type: true,
        show_cargo_info: true,
        show_cargo_weight: true,
        show_cargo_ldm: true,
        show_cargo_dimensions: true,
        show_cargo_properties: true,
        show_carriers: true,
        show_carrier_name: true,
        show_carrier_route: true,
        show_carrier_dates: true,
        show_prices: true,
        show_my_price: true,
        show_other_costs: true,
      },
    });
    
    setSelectedPartnerName(invoiceData.partner.name);
    setPartnerSearch(invoiceData.partner.name);
    setSelectedPartner(invoiceData.partner);
    const primaryOrderId = invoiceData.related_order_id ?? invoiceData.related_order?.id ?? null;
    const additionalIds = invoiceData.related_orders
      ? invoiceData.related_orders
          .map((o: any) => o.id)
          .filter((id: number) => (primaryOrderId ? id !== primaryOrderId : true))
      : [];
    setSelectedAdditionalOrderIds(additionalIds);
    
    const partnerId = invoiceData.partner_id ?? invoiceData.partner?.id;
    if (partnerId) {
      fetchAvailableOrders(Number(partnerId), invoiceData.id);
    } else {
      setOrders([]);
    }
    
    // Store initial values for comparison
    initialFormDataRef.current = JSON.parse(JSON.stringify({
      invoice_number: invoiceData.invoice_number || '',
      partner_id: invoiceData.partner_id?.toString() || invoiceData.partner.id.toString(),
      related_order_id: invoiceData.related_order_id?.toString() || invoiceData.related_order?.id.toString() || '',
      invoice_type: invoiceData.invoice_type,
      payment_status: invoiceData.payment_status,
      amount_net: invoiceData.amount_net,
      issue_date: invoiceData.issue_date ? (invoiceData.issue_date.includes('T') ? invoiceData.issue_date.split('T')[0] : invoiceData.issue_date.split(' ')[0]) : '',
      due_date: invoiceData.due_date ? (invoiceData.due_date.includes('T') ? invoiceData.due_date.split('T')[0] : invoiceData.due_date.split(' ')[0]) : '',
      payment_date: invoiceData.payment_date ? (invoiceData.payment_date.includes('T') ? invoiceData.payment_date.split('T')[0] : invoiceData.payment_date.split(' ')[0]) : '',
      notes: invoiceData.notes || '',
      display_options: invoiceData.display_options || {
        show_order_type: true,
        show_cargo_info: true,
        show_cargo_weight: true,
        show_cargo_ldm: true,
        show_cargo_dimensions: true,
        show_cargo_properties: true,
        show_carriers: true,
        show_carrier_name: true,
        show_carrier_route: true,
        show_carrier_dates: true,
        show_prices: true,
        show_my_price: true,
        show_other_costs: true,
      },
    }));
    initialAdditionalOrderIdsRef.current = [...additionalIds];
    isInitializingRef.current = false;
    setHasUnsavedChanges(false);
  }, [fetchAvailableOrders]);
  
  // Initialize create form
  const initializeCreateForm = useCallback(() => {
    const defaultDisplayOptions = invoiceSettings?.default_display_options || {};
    setFormData({
      invoice_number: '',
      partner_id: initialPartnerId || '',
      related_order_id: initialOrderId || '',
      invoice_type: 'final',
      payment_status: 'unpaid',
      amount_net: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: (() => {
        const issueDate = new Date();
        const due = new Date(issueDate);
        due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
        return due.toISOString().split('T')[0];
      })(),
      payment_date: '',
      notes: '',
      display_options: {
        show_order_type: defaultDisplayOptions.show_order_type ?? false,
        show_cargo_info: defaultDisplayOptions.show_cargo_info ?? false,
        show_cargo_weight: defaultDisplayOptions.show_cargo_weight ?? false,
        show_cargo_ldm: defaultDisplayOptions.show_cargo_ldm ?? false,
        show_cargo_dimensions: defaultDisplayOptions.show_cargo_dimensions ?? false,
        show_cargo_properties: defaultDisplayOptions.show_cargo_properties ?? false,
        show_carriers: defaultDisplayOptions.show_carriers ?? false,
        show_carrier_name: defaultDisplayOptions.show_carrier_name ?? false,
        show_carrier_route: defaultDisplayOptions.show_carrier_route ?? false,
        show_carrier_dates: defaultDisplayOptions.show_carrier_dates ?? false,
        show_prices: defaultDisplayOptions.show_prices ?? false,
        show_my_price: defaultDisplayOptions.show_my_price ?? false,
        show_other_costs: defaultDisplayOptions.show_other_costs ?? false,
      },
    });
    setSelectedPartnerName('');
    setPartnerSearch('');
    setSelectedPartner(null);
    setSelectedAdditionalOrderIds([]);
    setOrders([]);
    setAmountManuallyEdited(false);
    
    // Store initial values for comparison
    const initialFormData = {
      invoice_number: '',
      partner_id: initialPartnerId || '',
      related_order_id: initialOrderId || '',
      invoice_type: 'final',
      payment_status: 'unpaid',
      amount_net: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: (() => {
        const issueDate = new Date();
        const due = new Date(issueDate);
        due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
        return due.toISOString().split('T')[0];
      })(),
      payment_date: '',
      notes: '',
      display_options: {
        show_order_type: defaultDisplayOptions.show_order_type ?? false,
        show_cargo_info: defaultDisplayOptions.show_cargo_info ?? false,
        show_cargo_weight: defaultDisplayOptions.show_cargo_weight ?? false,
        show_cargo_ldm: defaultDisplayOptions.show_cargo_ldm ?? false,
        show_cargo_dimensions: defaultDisplayOptions.show_cargo_dimensions ?? false,
        show_cargo_properties: defaultDisplayOptions.show_cargo_properties ?? false,
        show_carriers: defaultDisplayOptions.show_carriers ?? false,
        show_carrier_name: defaultDisplayOptions.show_carrier_name ?? false,
        show_carrier_route: defaultDisplayOptions.show_carrier_route ?? false,
        show_carrier_dates: defaultDisplayOptions.show_carrier_dates ?? false,
        show_prices: defaultDisplayOptions.show_prices ?? false,
        show_my_price: defaultDisplayOptions.show_my_price ?? false,
        show_other_costs: defaultDisplayOptions.show_other_costs ?? false,
      },
    };
    initialFormDataRef.current = JSON.parse(JSON.stringify(initialFormData));
    initialAdditionalOrderIdsRef.current = [];
    isInitializingRef.current = false;
    setHasUnsavedChanges(false);
    
    // Fetch gap number
    fetchGapNumber();
    
    // Load partner if initialPartnerId provided
    if (initialPartnerId) {
      api.get(`/partners/partners/${initialPartnerId}/`).then(res => {
        setSelectedPartnerName(res.data.name);
        setPartnerSearch(res.data.name);
        setSelectedPartner(res.data);
        fetchAvailableOrders(Number(initialPartnerId));
      }).catch(() => {});
    }
  }, [initialPartnerId, initialOrderId, invoiceSettings, fetchAvailableOrders]);
  
  // Fetch gap number
  const fetchGapNumber = useCallback(async () => {
    try {
      const response = await api.get('/invoices/sales/get_first_gap_number/');
      if (response.data.has_gap && response.data.gap_number) {
        setAvailableGapNumber(response.data.gap_number);
        setShowGapSuggestion(true);
      } else {
        setAvailableGapNumber(null);
        setShowGapSuggestion(false);
      }
    } catch (error) {
      setAvailableGapNumber(null);
      setShowGapSuggestion(false);
    }
  }, []);
  
  
  // Calculate selected orders total
  const primaryOrderIdNumber = useMemo(() => {
    if (!formData.related_order_id) return null;
    const parsed = parseInt(formData.related_order_id, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [formData.related_order_id]);
  
  const selectedOrderTotal = useMemo(() => {
    const ids: number[] = [];
    if (primaryOrderIdNumber) ids.push(primaryOrderIdNumber);
    selectedAdditionalOrderIds.forEach((id) => {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    });
    if (ids.length === 0) {
      return 0;
    }
    return ids.reduce((total, id) => {
      const order = orders.find((o) => o.id === id);
      if (!order) {
        return total;
      }
      const candidate =
        order.suggested_amount_net ??
        order.client_price_net ??
        order.calculated_client_price_net;
      if (candidate === null || candidate === undefined || candidate === '') {
        return total;
      }
      const parsed = parseFloat(String(candidate));
      if (Number.isNaN(parsed)) {
        return total;
      }
      return total + parsed;
    }, 0);
  }, [primaryOrderIdNumber, selectedAdditionalOrderIds, orders]);
  
  // Auto-calculate amount_net
  useEffect(() => {
    if (amountManuallyEdited) {
      return;
    }
    const hasSelectedOrders = Boolean(primaryOrderIdNumber) || selectedAdditionalOrderIds.length > 0;
    if (!hasSelectedOrders) {
      return;
    }
    const recalculated = selectedOrderTotal;
    if (!Number.isNaN(recalculated) && recalculated >= 0) {
      setFormData((prev) => ({
        ...prev,
        amount_net: recalculated.toFixed(2),
      }));
    }
  }, [amountManuallyEdited, primaryOrderIdNumber, selectedAdditionalOrderIds, selectedOrderTotal]);

  // Track form changes for unsaved changes warning
  useEffect(() => {
    if (!isOpen) {
      initialFormDataRef.current = null;
      initialAdditionalOrderIdsRef.current = [];
      isInitializingRef.current = false;
      setHasUnsavedChanges(false);
      return;
    }
    
    // Ignore changes during initialization
    if (isInitializingRef.current) {
      return;
    }
    
    // After initialization, compare current values with initial values
    if (initialFormDataRef.current) {
      const formDataChanged = JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
      const additionalOrdersChanged = JSON.stringify([...selectedAdditionalOrderIds].sort()) !== JSON.stringify([...initialAdditionalOrderIdsRef.current].sort());
      
      if (formDataChanged || additionalOrdersChanged) {
        setHasUnsavedChanges(true);
      } else {
        setHasUnsavedChanges(false);
      }
    }
  }, [formData, selectedAdditionalOrderIds, isOpen]);
  
  // Search partners
  const searchPartners = useCallback(async (query: string) => {
    if (!query || query === selectedPartnerName) {
      setPartners([]);
      return;
    }
    
    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, is_client: true, page_size: 20 }
      });
      const results = response.data.results || response.data;
      setPartners(results.filter((p: Partner) => p.name.toLowerCase().includes(query.toLowerCase())));
    } catch (error) {
      // Ignore errors
    }
  }, [selectedPartnerName]);
  
  useEffect(() => {
    if (partnerSearch && partnerSearch !== selectedPartnerName) {
      const timeoutId = setTimeout(() => searchPartners(partnerSearch), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setPartners([]);
    }
  }, [partnerSearch, selectedPartnerName, searchPartners]);
  
  // Handle partner select
  const handlePartnerSelect = (partner: Partner) => {
    setFormData({ ...formData, partner_id: partner.id.toString() });
    setSelectedPartnerName(partner.name);
    setPartnerSearch(partner.name);
    setSelectedPartner(partner);
    setShowPartnerDropdown(false);
    setPartners([]);
    setSelectedAdditionalOrderIds([]);
    setOrders([]);
    setAmountManuallyEdited(false);
    // When creating a new invoice, don't pass invoiceId
    // Use invoice?.id (from props) instead of localInvoice?.id to avoid stale closures
    const invoiceId = isEditMode && invoice?.id ? invoice.id : undefined;
    fetchAvailableOrders(partner.id, invoiceId);
    
    // Calculate due date
    const paymentDays = partner.payment_term_days || 30;
    const issueDate = new Date(formData.issue_date);
    const dueDate = new Date(issueDate);
    dueDate.setTime(dueDate.getTime() + (paymentDays * 24 * 60 * 60 * 1000));
    setFormData(prev => ({
      ...prev,
      due_date: dueDate.toISOString().split('T')[0],
    }));
  };
  
  // Handle save (create or update)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!formData.partner_id) { 
      showToast('info', 'Pasirinkite klientą.'); 
      return; 
    }
    if (!formData.issue_date) { 
      showToast('info', 'Pasirinkite išrašymo datą.'); 
      return; 
    }
    if (!formData.due_date) { 
      showToast('info', 'Pasirinkite mokėjimo terminą.'); 
      return; 
    }
    if (!formData.amount_net) { 
      showToast('info', 'Įveskite sumą.'); 
      return; 
    }
    
    const amountNetToSend = parseFloat(formData.amount_net);
    
    try {
      setIsLoading(true);
      const data: any = {
        partner_id: parseInt(formData.partner_id),
        invoice_type: formData.invoice_type,
        // payment_status NESIUNČIAME - jis keičiamas TIK per mokėjimų valdymą
        amount_net: amountNetToSend,
        issue_date: formData.issue_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes,
        related_order_id: formData.related_order_id ? parseInt(formData.related_order_id) : null,
        additional_order_ids: selectedAdditionalOrderIds,
        // payment_date NESIUNČIAME - jis nustatomas per mokėjimų valdymą
        display_options: formData.display_options,
      };
      
      if (formData.invoice_number) {
        data.invoice_number = formData.invoice_number.toUpperCase();
      }
      
      if (!isEditMode) {
        // Create mode
        await api.post('/invoices/sales/', data);
        showToast('success', 'Pardavimo sąskaita sėkmingai sukurta.');
        setHasUnsavedChanges(false);
        onSave();
        onClose();
      } else if (isEditMode && invoice?.id) {
        // Edit mode
        data.invoice_number = formData.invoice_number || invoice.invoice_number;
        await api.put(`/invoices/sales/${invoice.id}/`, data);
        showToast('success', 'Pardavimo sąskaita sėkmingai atnaujinta.');
        const updatedInvoice = await loadFullInvoice(invoice.id);
        if (updatedInvoice) {
          initializeEditForm(updatedInvoice);
          setLocalInvoice(updatedInvoice);
          onInvoiceUpdate?.(updatedInvoice);
        }
        setHasUnsavedChanges(false);
        onSave();
      }
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error', 'Klaida: ' + (details ? JSON.stringify(details) : error.message));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle cancel
  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('Yra neišsaugotų pakeitimų. Ar tikrai norite uždaryti?');
      if (!confirmed) return;
    }
    
    onClose();
  };
  
  // Format currency
  const formatCurrency = (value: string | number | undefined | null, fallback = '0.00 €') => {
    if (value === undefined || value === null || value === '') return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(2)} €` : fallback;
  };
  
  // Format date
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Nenurodyta';
    try {
      let cleanDate = dateStr.trim();
      const dateMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{2,})/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        let day = parseInt(dateMatch[3]);
        
        if (day > 31) {
          const dayStr = dateMatch[3];
          const firstTwo = parseInt(dayStr.substring(0, 2));
          if (firstTwo <= 31 && firstTwo > 0) {
            day = firstTwo;
          } else {
            const lastTwo = parseInt(dayStr.substring(dayStr.length - 2));
            if (lastTwo <= 31 && lastTwo > 0) {
              day = lastTwo;
            } else {
              day = firstTwo > 0 ? firstTwo : 1;
            }
          }
        }
        
        if (day < 1 || day > 31) {
          day = 1;
        }
        
        cleanDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
      
      const date = new Date(cleanDate);
      if (Number.isNaN(date.getTime())) {
        const dateParts = cleanDate.split(/[-/]/);
        if (dateParts.length === 3) {
          const year = dateParts[0];
          const month = dateParts[1].padStart(2, '0');
          const day = dateParts[2].padStart(2, '0');
          const newDate = new Date(`${year}-${month}-${day}`);
          if (!Number.isNaN(newDate.getTime())) {
            return newDate.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
          }
        }
        return cleanDate;
      }
      
      const hasTime = dateStr.includes('T') || /\d{2}:\d{2}/.test(dateStr);
      const dateFormatted = date
        .toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\//g, '.');
      if (hasTime) {
        const timeFormatted = date.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
        if (timeFormatted !== '00:00') {
          return `${dateFormatted} ${timeFormatted}`;
        }
      }
      return dateFormatted;
    } catch (e) {
      return dateStr;
    }
  };
  
  
  // Handle item visibility change
  const handleItemVisibilityChange = async (index: number, visible: boolean) => {
    if (!localInvoice?.id || !localInvoice.invoice_items) return;
    
    try {
      const updatedItems = [...localInvoice.invoice_items];
      updatedItems[index] = { ...updatedItems[index], visible };
      const visibleItemsIndexes = updatedItems.map((it, i) => i).filter((i) => updatedItems[i].visible !== false);
      await api.patch(`/invoices/sales/${localInvoice.id}/`, {
        visible_items_indexes: visibleItemsIndexes
      });
      const response = await api.get(`/invoices/sales/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      showToast('success', 'Eilutės rodymo statusas atnaujintas');
      onInvoiceUpdate?.(updatedInvoice);
      onSave(); // Trigger parent refresh
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant eilutės rodymo statusą');
    }
  };

  // Handle display option change (show_order_type)
  const handleDisplayOptionChange = async (option: 'show_order_type', value: boolean) => {
    if (!localInvoice?.id) return;
    
    try {
      const updatedOptions = {
        ...localInvoice.display_options,
        [option]: value
      };
      await api.patch(`/invoices/sales/${localInvoice.id}/`, {
        display_options: updatedOptions
      });
      const response = await api.get(`/invoices/sales/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      showToast('success', 'Rodymo pasirinkimas atnaujintas');
      onInvoiceUpdate?.(updatedInvoice);
      onSave(); // Trigger parent refresh
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant rodymo pasirinkimą');
    }
  };
  
  // Handle HTML preview
  const handlePreviewHTML = async (lang: string = 'lt') => {
    if (!localInvoice?.id) return;
    
    try {
      const res = await api.get(`/invoices/sales/${localInvoice.id}/preview/`, { 
        params: { lang },
        responseType: 'text' 
      });
      
      if (typeof res.data === 'string') {
        setHtmlPreview({
          title: `Pardavimo sąskaita ${localInvoice.invoice_number || localInvoice.id}`,
          htmlContent: res.data
        });
        setHtmlPreviewLang(lang);
      } else {
        showToast('error', 'Nepavyko atidaryti sąskaitos HTML: Neteisingas atsakymo formatas');
      }
    } catch (e: any) {
      let errorMessage = 'Nežinoma klaida';
      if (e.response?.data) {
        if (typeof e.response.data === 'string') {
          errorMessage = e.response.data;
        } else if (e.response.data.detail) {
          errorMessage = e.response.data.detail;
        } else if (e.response.data.error) {
          errorMessage = e.response.data.error;
        }
      } else if (e.message) {
        errorMessage = e.message;
      }
      showToast('error', 'Nepavyko atidaryti sąskaitos HTML: ' + errorMessage);
    }
  };
  
  // Handle PDF download
  const handleDownloadPDF = async () => {
    if (!localInvoice?.id) return;
    
    try {
      const res = await api.get(`/invoices/sales/${localInvoice.id}/pdf/`, { 
        params: { lang: i18n.language },
        responseType: 'blob' 
      });
      
      if (res.data instanceof Blob) {
        if (res.data.type === 'application/pdf' || res.data.size > 0) {
          const blob = new Blob([res.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${localInvoice.invoice_number}.pdf`;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 100);
          showToast('success', 'PDF sėkmingai atsisiųstas');
        } else {
          const text = await res.data.text();
          showToast('error', 'Nepavyko parsisiųsti PDF: ' + (text || 'Nežinoma klaida'));
        }
      } else {
        showToast('error', 'Nepavyko parsisiųsti PDF: Neteisingas atsakymo formatas');
      }
    } catch (e: any) {
      let errorMessage = 'Nežinoma klaida';
      if (e.response?.data) {
        if (e.response.data instanceof Blob) {
          try {
            const text = await e.response.data.text();
            errorMessage = text || 'Neteisingas atsakymo formatas';
          } catch {
            errorMessage = 'Neteisingas atsakymo formatas';
          }
        } else if (typeof e.response.data === 'string') {
          errorMessage = e.response.data;
        } else if (e.response.data.detail) {
          errorMessage = e.response.data.detail;
        } else if (e.response.data.message) {
          errorMessage = e.response.data.message;
        }
      } else if (e.message) {
        errorMessage = e.message;
      }
      showToast('error', 'Nepavyko parsisiųsti PDF: ' + errorMessage);
    }
  };
  
  // Handle delete
  const handleDelete = () => {
    if (!localInvoice || !onDelete) return;
    
    const confirmed = window.confirm(`Ar tikrai norite ištrinti sąskaitą ${localInvoice.invoice_number}?`);
    if (!confirmed) return;
    
    onDelete(localInvoice);
    onClose();
  };
  
  if (!isOpen) return null;
  
  // Summary chips for edit mode
  const summaryChips: Array<{ label: string; value: string; tone?: 'danger' | 'success' | 'warning' }> = (isEditMode && localInvoice) ? (() => {
    const chips: Array<{ label: string; value: string; tone?: 'danger' | 'success' | 'warning' }> = [];
    chips.push({ label: 'Tipas', value: localInvoice.invoice_type_display || localInvoice.invoice_type });
    if (localInvoice.payment_status_display || localInvoice.payment_status) {
      const tone = localInvoice.payment_status === 'paid'
        ? 'success'
        : localInvoice.payment_status === 'overdue'
          ? 'danger'
          : localInvoice.payment_status === 'partially_paid'
            ? 'warning'
            : undefined;
      chips.push({
        label: 'Statusas',
        value: localInvoice.payment_status_display || localInvoice.payment_status,
        tone,
      });
    }
    if (localInvoice.due_date) {
      chips.push({ label: 'Terminas', value: formatDate(localInvoice.due_date) });
    }
    if (localInvoice.payment_date) {
      chips.push({ label: 'Apmokėta', value: formatDate(localInvoice.payment_date) });
    }
    return chips;
  })() : [];
  
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
                  ➕ Nauja pardavimo sąskaita
                </span>
              )}
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {isEditMode && localInvoice
                  ? `Pardavimo sąskaita #${localInvoice.invoice_number}`
                  : 'Nauja pardavimo sąskaita'}
              </h2>
            </div>
            {isEditMode && summaryChips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {summaryChips.map((chip) => {
                  const baseStyle: React.CSSProperties = {
                    padding: '3px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    background: '#eef2f6',
                    color: '#1f2a37',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  };
                  if (chip.tone === 'success') {
                    baseStyle.background = '#d4edda';
                    baseStyle.color = '#155724';
                  } else if (chip.tone === 'danger') {
                    baseStyle.background = '#f8d7da';
                    baseStyle.color = '#721c24';
                  } else if (chip.tone === 'warning') {
                    baseStyle.background = '#fff3cd';
                    baseStyle.color = '#856404';
                  }
                  return (
                    <span key={chip.label} style={baseStyle}>
                      <strong>{chip.label}:</strong>
                      <span>{chip.value}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isEditMode && localInvoice && (
              <>
                <button 
                  className="button button-primary" 
                  onClick={() => handlePreviewHTML(i18n.language)}
                  style={{ 
                    fontSize: '12px', 
                    padding: '6px 12px', 
                    fontWeight: '500',
                    backgroundColor: '#17a2b8',
                    borderColor: '#17a2b8'
                  }}
                >
                  📄 HTML
                </button>
                <button 
                  className="button button-primary" 
                  onClick={handleDownloadPDF}
                  style={{ 
                    fontSize: '12px', 
                    padding: '6px 12px', 
                    fontWeight: '500',
                    backgroundColor: '#dc3545',
                    borderColor: '#dc3545'
                  }}
                >
                  📥 PDF
                </button>
              </>
            )}
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
            <button className="modal-close" onClick={handleCancel}>×</button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="modal-tabs" style={{ display: 'flex', padding: '0 8px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
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
            className={`tab-btn ${activeTab === 'finansai' ? 'active' : ''}`} 
            onClick={() => setActiveTab('finansai')}
          >
            💰 Finansai
          </button>
          {isEditMode && localInvoice && localInvoice.invoice_items && Array.isArray(localInvoice.invoice_items) && localInvoice.invoice_items.length > 0 && (
            <button 
              className={`tab-btn ${activeTab === 'eilutes' ? 'active' : ''}`} 
              onClick={() => setActiveTab('eilutes')}
            >
              📄 Eilutės
            </button>
          )}
        </div>
        
        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              Kraunama...
            </div>
          )}
          
          {!isLoading && (
            <>
              {/* TAB: Pagrindinis */}
              {activeTab === 'pagrindinis' && (
                <form id="invoice-form" onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* FORM FIELDS - Always shown for both create and edit */}
                          {/* Sąskaitos numeris, Klientas, Pasirinkto kliento informacija ir Pastabos viename rėmelyje */}
                          <div className="form-field" style={{ gridColumn: 'span 2', border: '1px solid #dee2e6', borderRadius: '6px', padding: '12px', backgroundColor: '#f8f9fa' }}>
                            {/* Sąskaitos numeris */}
                            <div className="form-field">
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                Sąskaitos numeris
                              </label>
                                {!isEditMode && showGapSuggestion && availableGapNumber && (
                                  <div style={{
                                    marginBottom: '6px',
                                    padding: '8px',
                                    backgroundColor: '#fff3cd',
                                    border: '1px solid #ffc107',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                  }}>
                                    <div style={{ marginBottom: '6px', fontWeight: '600', color: '#856404' }}>
                                      ⚠️ Yra tuščias numeris: <strong>{availableGapNumber}</strong>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFormData({ ...formData, invoice_number: availableGapNumber });
                                          setShowGapSuggestion(false);
                                        }}
                                        style={{
                                          padding: '4px 10px',
                                          backgroundColor: '#28a745',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          fontWeight: '600'
                                        }}
                                      >
                                        ✅ Naudoti {availableGapNumber}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowGapSuggestion(false);
                                        }}
                                        style={{
                                          padding: '4px 10px',
                                          backgroundColor: '#6c757d',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          fontWeight: '600'
                                        }}
                                      >
                                        Generuoti naują
                                      </button>
                                    </div>
                                  </div>
                                )}
                                <input
                                  type="text"
                                  value={formData.invoice_number}
                                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value.toUpperCase() })}
                                  placeholder={(invoiceSettings as any)?.next_invoice_number || 'Sugeneruos automatiškai'}
                                  style={{ 
                                    padding: '6px 10px', 
                                    borderRadius: '4px', 
                                    border: '1px solid #ced4da', 
                                    fontSize: '13px', 
                                    width: '100%',
                                    backgroundColor: '#ffffff'
                                  }}
                                />
                                <small style={{ color: '#6c757d', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                                  {isEditMode && !!localInvoice?.invoice_number 
                                    ? '⚠️ Redaguojate sąskaitos numerį. Būkite atsargūs!' 
                                    : 'Jei paliksite tuščią, numeris bus sugeneruotas automatiškai'}
                                </small>
                            </div>

                            {/* Klientas */}
                            <div className="form-field" style={{ marginTop: '10px' }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                Klientas <span style={{ color: '#dc3545' }}>*</span>
                              </label>
                              <div style={{ position: 'relative' }}>
                                <input
                                  type="text"
                                  value={partnerSearch}
                                  onChange={(e) => {
                                    setPartnerSearch(e.target.value);
                                    setShowPartnerDropdown(true);
                                  }}
                                  onFocus={() => {
                                    if (partnerSearch && partnerSearch !== selectedPartnerName) {
                                      setShowPartnerDropdown(true);
                                    }
                                  }}
                                  onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 200)}
                                  placeholder="Ieškoti kliento..."
                                  required
                                  style={{ 
                                    padding: '6px 10px', 
                                    borderRadius: '4px', 
                                    border: '1px solid #ced4da', 
                                    fontSize: '13px', 
                                    width: '100%',
                                    backgroundColor: '#ffffff'
                                  }}
                                />
                                {showPartnerDropdown && partners.length > 0 && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ddd', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '180px', overflowY: 'auto' }}>
                                    {partners.map((partner) => (
                                      <div
                                        key={partner.id}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handlePartnerSelect(partner);
                                        }}
                                        style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f7ff'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
                                      >
                                        {partner.name} ({partner.code})
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Pasirinkto kliento informacija */}
                            {selectedPartner && (
                              <div style={{ 
                                marginTop: '10px',
                                padding: '10px', 
                                backgroundColor: '#ffffff',
                                borderRadius: '4px',
                                border: '1px solid #dee2e6'
                              }}>
                                <div style={{ 
                                  fontSize: '12px', 
                                  fontWeight: '600', 
                                  color: '#495057', 
                                  marginBottom: '6px',
                                  borderBottom: '1px solid #dee2e6',
                                  paddingBottom: '4px'
                                }}>
                                  📋 Pasirinkto kliento informacija
                                </div>
                                <div style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: '1fr 1fr', 
                                  gap: '6px', 
                                  fontSize: '12px',
                                  lineHeight: '1.6'
                                }}>
                                  <div>
                                    <strong>Pavadinimas:</strong> {selectedPartner.name}
                                  </div>
                                  {selectedPartner.code && (
                                    <div>
                                      <strong>Kodas:</strong> {selectedPartner.code}
                                    </div>
                                  )}
                                  {selectedPartner.vat_code && (
                                    <div>
                                      <strong>PVM kodas:</strong> {selectedPartner.vat_code}
                                    </div>
                                  )}
                                  {(selectedPartner.address || selectedPartner.city || selectedPartner.postal_code) && (
                                    <div style={{ gridColumn: 'span 2' }}>
                                      <strong>Adresas:</strong> {
                                        [
                                          selectedPartner.address,
                                          selectedPartner.postal_code,
                                          selectedPartner.city
                                        ].filter(Boolean).join(', ')
                                      }
                                    </div>
                                  )}
                                  {selectedPartner.phone && (
                                    <div>
                                      <strong>Telefonas:</strong> {selectedPartner.phone}
                                    </div>
                                  )}
                                  {selectedPartner.email && (
                                    <div>
                                      <strong>El. paštas:</strong> {selectedPartner.email}
                                    </div>
                                  )}
                                  {selectedPartner.payment_term_days && (
                                    <div>
                                      <strong>Mokėjimo terminas:</strong> {selectedPartner.payment_term_days} d.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Pastabos */}
                            <div className="form-field" style={{ marginTop: '10px' }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                                Pastabos
                              </label>
                              <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={3}
                                placeholder="Įveskite pastabas (nebūtina)"
                                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '12px', width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                              />
                            </div>
                          </div>
                  </form>
                )}
              
              {/* TAB: Susiję užsakymai */}
              {activeTab === 'susije-uzsakymai' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  {formData.partner_id && (
                    <>
                      {/* Pasirinktų užsakymų suma */}
                      {(primaryOrderIdNumber || selectedAdditionalOrderIds.length > 0) && (
                        <div className="form-field">
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                            Pasirinktų užsakymų suma
                          </label>
                          <div style={{ 
                            padding: '8px', 
                            background: 'linear-gradient(135deg, #e7f3ff 0%, #d0e7ff 100%)', 
                            borderRadius: '4px', 
                            border: '1px solid #007bff', 
                            fontSize: '16px', 
                            fontWeight: 700, 
                            color: '#0056b3', 
                            textAlign: 'center',
                            boxShadow: '0 1px 3px rgba(0,123,255,0.2)'
                          }}>
                            {selectedOrderTotal.toFixed(2)} €
                          </div>
                        </div>
                      )}

                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Susijęs užsakymas
                        </label>
                        <select
                          value={formData.related_order_id}
                          disabled={!formData.partner_id || orders.length === 0}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData((prev) => ({ ...prev, related_order_id: value }));
                            setAmountManuallyEdited(false);
                            if (value) {
                              const numericId = parseInt(value, 10);
                              if (!Number.isNaN(numericId)) {
                                setSelectedAdditionalOrderIds(prev => prev.filter(id => id !== numericId));
                              }
                            }
                          }}
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: (!formData.partner_id || orders.length === 0) ? '#e9ecef' : '#ffffff'
                          }}
                        >
                          <option value="">Nėra</option>
                          {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {order.order_number || `Užsakymas #${order.id}`}
                            </option>
                          ))}
                        </select>
                        {!formData.partner_id && (
                          <small style={{ color: '#6c757d', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                            Pasirinkite klientą, kad matytumėte užsakymus
                          </small>
                        )}
                      </div>

                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Papildomi užsakymai
                        </label>
                        {ordersLoading ? (
                          <div style={{ fontSize: '12px', color: '#666', padding: '8px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                            ⏳ Kraunama...
                          </div>
                        ) : (
                          <>
                            {(() => {
                              const ordersToShow = orders.filter(order => order.id !== (primaryOrderIdNumber ?? 0));
                              const selectedButNotInOrders = selectedAdditionalOrderIds.filter(
                                id => id !== (primaryOrderIdNumber ?? 0) && !ordersToShow.some(o => o.id === id)
                              );
                              
                              const allOrdersToShow = [
                                ...ordersToShow,
                                ...selectedButNotInOrders.map(id => ({
                                  id,
                                  order_number: `Užsakymas #${id}`,
                                  client_price_net: null,
                                  calculated_client_price_net: null,
                                  suggested_amount_net: null,
                                  vat_rate: null,
                                  route_from: null,
                                  route_to: null,
                                  loading_date: null,
                                  unloading_date: null,
                                }))
                              ];
                              
                              if (allOrdersToShow.length === 0) {
                                return (
                                  <div style={{ 
                                    fontSize: '12px', 
                                    color: '#6c757d', 
                                    padding: '8px', 
                                    textAlign: 'center', 
                                    backgroundColor: '#f8f9fa', 
                                    borderRadius: '4px',
                                    border: '1px dashed #dee2e6'
                                  }}>
                                    ℹ️ Nėra galimų užsakymų
                                  </div>
                                );
                              }
                              
                              return (
                                <div style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  gap: '4px', 
                                  border: '1px solid #dee2e6', 
                                  borderRadius: '4px', 
                                  padding: '8px', 
                                  background: '#ffffff'
                                }}>
                                  {allOrdersToShow.map(order => {
                                    const amountCandidate = order.suggested_amount_net ?? order.client_price_net ?? order.calculated_client_price_net;
                                    const amountLabel = amountCandidate !== null && amountCandidate !== undefined && amountCandidate !== ''
                                      ? `${parseFloat(String(amountCandidate)).toFixed(2)} €`
                                      : 'Suma nenustatyta';
                                    const isSelected = selectedAdditionalOrderIds.includes(order.id);
                                    return (
                                      <label 
                                        key={order.id} 
                                        style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '6px', 
                                          fontSize: '12px',
                                          padding: '6px',
                                          borderRadius: '3px',
                                          backgroundColor: isSelected ? '#e7f3ff' : 'transparent',
                                          border: isSelected ? '1px solid #007bff' : '1px solid transparent',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                          }
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            setAmountManuallyEdited(false);
                                            setSelectedAdditionalOrderIds(prev => {
                                              return prev.includes(order.id)
                                                ? prev.filter(id => id !== order.id)
                                                : [...prev, order.id];
                                            });
                                          }}
                                          style={{ 
                                            width: '16px', 
                                            height: '16px', 
                                            cursor: 'pointer',
                                            accentColor: '#007bff'
                                          }}
                                        />
                                        <span style={{ flex: 1 }}>
                                          <strong style={{ color: isSelected ? '#007bff' : '#495057' }}>
                                            {order.order_number || `Užsakymas #${order.id}`}
                                          </strong>
                                          <span style={{ marginLeft: '6px', color: '#6c757d', fontSize: '11px' }}>
                                            ({amountLabel})
                                          </span>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {!formData.partner_id && (
                    <div className="form-field">
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                        Susijęs užsakymas
                      </label>
                      <select
                        value={formData.related_order_id}
                        disabled={true}
                        style={{ 
                          padding: '6px 10px', 
                          borderRadius: '4px', 
                          border: '1px solid #ced4da', 
                          fontSize: '13px', 
                          width: '100%',
                          backgroundColor: '#e9ecef'
                        }}
                      >
                        <option value="">Nėra</option>
                      </select>
                      <small style={{ color: '#6c757d', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                        Pasirinkite klientą, kad matytumėte užsakymus
                      </small>
                    </div>
                  )}
                </div>
              )}
              
              {/* TAB: Finansai */}
              {activeTab === 'finansai' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <div className="form-field" style={{ border: '1px solid #dee2e6', borderRadius: '6px', padding: '12px', backgroundColor: '#f8f9fa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Sąskaitos tipas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <select
                          value={formData.invoice_type}
                          onChange={(e) => setFormData({ ...formData, invoice_type: e.target.value as any })}
                          required
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: '#ffffff'
                          }}
                        >
                          <option value="pre_invoice">Pro forma sąskaita</option>
                          <option value="final">Galutinė sąskaita</option>
                          <option value="credit">Kreditinė sąskaita</option>
                          <option value="proforma">Proforma</option>
                        </select>
                      </div>

                      <div className="form-field">
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
                                  'sales',
                                  localInvoice.id,
                                  paymentDate,
                                  'Pavedimu',
                                  'Pažymėta kaip apmokėta per modala'
                                );
                                
                                // Atnaujinti localInvoice su naujais duomenimis
                                const updatedInvoice = await api.get(`/invoices/sales/${localInvoice.id}/`);
                                setLocalInvoice(updatedInvoice.data);
                                onInvoiceUpdate?.(updatedInvoice.data);
                                
                                showToast('success', 'Pardavimo sąskaita pažymėta kaip apmokėta');
                              } else if (oldStatus === 'paid' && newStatus !== 'paid') {
                                // Pažymėti kaip neapmokėtą
                                const result = await PaymentService.markAsUnpaid('sales', localInvoice.id);
                                
                                // Atnaujinti localInvoice su naujais duomenimis
                                const updatedInvoice = await api.get(`/invoices/sales/${localInvoice.id}/`);
                                setLocalInvoice(updatedInvoice.data);
                                onInvoiceUpdate?.(updatedInvoice.data);
                                
                                showToast('success', 'Pardavimo sąskaita pažymėta kaip neapmokėta');
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
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: isEditMode && localInvoice ? '#ffffff' : '#f8f9fa',
                            cursor: isEditMode && localInvoice ? 'pointer' : 'not-allowed'
                          }}
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

                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Suma be PVM <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.amount_net}
                          onChange={(e) => {
                            setAmountManuallyEdited(true);
                            setFormData({ ...formData, amount_net: e.target.value });
                          }}
                          required
                          placeholder="0.00"
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: '#ffffff'
                          }}
                        />
                      </div>

                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Išrašymo data <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.issue_date}
                          onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                          required
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: '#ffffff'
                          }}
                        />
                      </div>

                      <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                          Mokėjimo terminas <span style={{ color: '#dc3545' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                          required
                          style={{ 
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: '#ffffff'
                          }}
                        />
                      </div>

                      <div className="form-field">
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
                                  await api.patch(`/invoices/sales/${localInvoice.id}/`, {
                                    payment_date: newDate || null
                                  });
                                  
                                  // Atnaujinti localInvoice su naujais duomenimis
                                  const updatedInvoice = await api.get(`/invoices/sales/${localInvoice.id}/`);
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
                            padding: '6px 10px', 
                            borderRadius: '4px', 
                            border: '1px solid #ced4da', 
                            fontSize: '13px', 
                            width: '100%',
                            backgroundColor: '#ffffff'
                          }}
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
                                      Pasirinkite gautas pirkimo sąskaitas sudengimui:
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
                                        invoice_type: 'sales',
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
                                      const updatedInvoice = await api.get(`/invoices/sales/${localInvoice.id}/`);
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
                                        {Number(payment.amount).toFixed(2)} €
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
                                          const updatedInvoice = await api.get(`/invoices/sales/${localInvoice.id}/`);
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
                    </div>
                  </div>
                </div>
              )}
              
              {/* TAB: Eilutės */}
              {activeTab === 'eilutes' && isEditMode && localInvoice && localInvoice.invoice_items && Array.isArray(localInvoice.invoice_items) && localInvoice.invoice_items.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <div style={{ border: '1px solid #dee2e6', borderRadius: '6px', padding: '10px', backgroundColor: '#ffffff' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#495057' }}>Sąskaitos eilutės</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #dee2e6', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #dee2e6', backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #dee2e6', fontSize: '12px', width: '40px' }}>✓</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #dee2e6', fontSize: '12px' }}>Nr.</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #dee2e6', fontSize: '12px' }}>Prekės - paslaugos pavadinimas</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>Be PVM</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>PVM</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6', fontSize: '12px' }}>Su PVM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {localInvoice.invoice_items.map((item: InvoiceItem, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                              <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #dee2e6' }}>
                                <input
                                  type="checkbox"
                                  checked={item.visible !== false}
                                  onChange={(e) => handleItemVisibilityChange(idx, e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #dee2e6' }}>{idx + 1}</td>
                              <td style={{ padding: '6px 8px', border: '1px solid #dee2e6', whiteSpace: 'pre-wrap', fontSize: '11px', lineHeight: '1.4' }}>
                                {item.description.split('\n').map((line, i) => (
                                  <div key={i}>{line}</div>
                                ))}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{Number(item.amount_net || 0).toFixed(2)} €</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6' }}>{Number(item.vat_amount || 0).toFixed(2)} €</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #dee2e6', fontWeight: 'bold' }}>{Number(item.amount_total || 0).toFixed(2)} €</td>
                            </tr>
                          ))}
                          {/* Bendros sumos eilutė */}
                          <tr style={{ borderTop: '2px solid #dee2e6', backgroundColor: '#f8f9fa', fontWeight: 600 }}>
                            <td colSpan={3} style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                              <strong>Iš viso:</strong>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                              {(() => {
                                const totalNet = localInvoice.invoice_items.reduce((sum: number, item: InvoiceItem) => {
                                  return sum + (Number(item.amount_net) || 0);
                                }, 0);
                                return totalNet.toFixed(2) + ' €';
                              })()}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                              {(() => {
                                const totalVat = localInvoice.invoice_items.reduce((sum: number, item: InvoiceItem) => {
                                  return sum + (Number(item.vat_amount) || 0);
                                }, 0);
                                return totalVat.toFixed(2) + ' €';
                              })()}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #dee2e6' }}>
                              {(() => {
                                const totalWithVat = localInvoice.invoice_items.reduce((sum: number, item: InvoiceItem) => {
                                  return sum + (Number(item.amount_total) || 0);
                                }, 0);
                                return totalWithVat.toFixed(2) + ' €';
                              })()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Sąskaitos eilutės rodymo pasirinkimai */}
                    <div style={{ marginTop: '12px', border: '1px solid #dee2e6', borderRadius: '6px', padding: '12px', backgroundColor: '#f8f9fa' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
                        Sąskaitos eilutės rodymo pasirinkimai
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Užsakymo tipas */}
                        <div style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.display_options.show_order_type}
                              onChange={(e) => setFormData({
                                ...formData,
                                display_options: {
                                  ...formData.display_options,
                                  show_order_type: e.target.checked,
                                }
                              })}
                              style={{ marginRight: '8px', marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div>
                              <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '12px' }}>Užsakymo tipas</div>
                              <div style={{ fontSize: '11px', color: '#6c757d' }}>Rodyti užsakymo tipą sąskaitos eilutėse</div>
                            </div>
                          </label>
                        </div>
                        
                        {/* Krovinių informacija */}
                        <div style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.display_options.show_cargo_info}
                              onChange={(e) => {
                                const value = e.target.checked;
                                setFormData({
                                  ...formData,
                                  display_options: {
                                    ...formData.display_options,
                                    show_cargo_info: value,
                                    show_cargo_weight: value,
                                    show_cargo_ldm: value,
                                    show_cargo_dimensions: value,
                                    show_cargo_properties: value
                                  }
                                });
                              }}
                              style={{ marginRight: '8px', marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div>
                              <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '12px' }}>Krovinių informacija</div>
                              <div style={{ fontSize: '11px', color: '#6c757d' }}>Svoris, matmenys, savybės</div>
                            </div>
                          </label>
                        </div>
                        
                        {/* Vežėjai */}
                        <div style={{ padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.display_options.show_carriers}
                              onChange={(e) => {
                                const value = e.target.checked;
                                setFormData({
                                  ...formData,
                                  display_options: {
                                    ...formData.display_options,
                                    show_carriers: value,
                                    show_carrier_name: value,
                                    show_carrier_route: value,
                                    show_carrier_dates: value
                                  }
                                });
                              }}
                              style={{ marginRight: '8px', marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div>
                              <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '12px', color: '#856404' }}>Vežėjai</div>
                              <div style={{ fontSize: '11px', color: '#856404' }}>⚠️ NESIŪLOMA rodyti klientams!</div>
                            </div>
                          </label>
                        </div>
                        
                        {/* Papildomos išlaidos */}
                        <div style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={formData.display_options.show_other_costs}
                              onChange={(e) => setFormData({
                                ...formData,
                                display_options: {
                                  ...formData.display_options,
                                  show_other_costs: e.target.checked,
                                }
                              })}
                              style={{ marginRight: '8px', marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div>
                              <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '12px' }}>Papildomos išlaidos</div>
                              <div style={{ fontSize: '11px', color: '#6c757d' }}>Muitinė, draudimas ir kt.</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
            </>
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
                onClick={handleDelete}
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
              onClick={handleCancel}
              disabled={isLoading}
              style={{ padding: '6px 14px', fontSize: '13px', fontWeight: '500' }}
            >
              Atšaukti
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
      
      {/* HTML Preview Modal */}
      {htmlPreview && (
        <HTMLPreviewModal
          preview={htmlPreview}
          onClose={() => setHtmlPreview(null)}
          onLanguageChange={handlePreviewHTML}
          currentLang={htmlPreviewLang}
          onDownloadPDF={htmlPreview && localInvoice ? async () => {
            try {
              const response = await api.get(`/invoices/sales/${localInvoice.id}/pdf/`, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob',
              });
              
              const blob = new Blob([response.data], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `saskaita-${localInvoice.invoice_number || localInvoice.id}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
              showToast('success', 'PDF sėkmingai atsisiųstas');
            } catch (error: any) {
              showToast('error', 'Nepavyko atsisiųsti PDF');
            }
          } : undefined}
          onSendEmail={htmlPreview && localInvoice ? async () => {
            const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              try {
                (iframe.contentWindow as any).sendEmail?.();
              } catch (e) {
                showToast('error', 'Nepavyko atidaryti email modalo');
              }
            }
          } : undefined}
        />
      )}
      
      {/* CSS Styles */}
      <style>{`
        .modal-tabs { gap: 4px; }
        .tab-btn {
          padding: 6px 12px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 12px;
          color: #666;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .tab-btn:hover { background-color: rgba(0,0,0,0.05); }
        .tab-btn.active {
          color: #007bff;
          border-bottom: 2px solid #007bff;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default SalesInvoiceModal_NEW;
