import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { formatMoney } from '../../utils/formatMoney';
import '../../pages/OrdersPage.css';
import { ExpeditionDocument } from '../../types/expedition';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';

// Interfaces
interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position?: string;
  notes?: string;
}

interface Client {
  id: number;
  name: string;
  code: string;
  vat_code?: string;
  address?: string;
  is_client?: boolean;
  is_supplier?: boolean;
  status?: string;
  status_display?: string;
  contact_person?: Contact | null;
  contacts?: Contact[];
  payment_term_days?: number;
  notes?: string;
}

interface User {
  id: number;
  username: string;
}

interface OtherCost {
  description: string;
  amount: number;
}

interface Order {
  id: number;
  order_number?: string | null;
  client: Client;
  client_id: number;
  carrier: Client | null;
  carrier_id: number | null;
  order_type: string;
  order_type_display: string;
  manager: User | null;
  manager_id: number | null;
  costs?: any[];
  status: string;
  status_display: string;
  price_net: string;
  client_price_net: string | null;
  my_price_net?: string | number | null;
  other_costs?: OtherCost[];
  transport_warehouse_cost?: string | number;
  other_costs_total?: string | number;
  calculated_client_price_net?: string | number;
  vat_rate: string;
  vat_rate_article?: string;
  price_with_vat: string;
  vat_amount: string;
  client_price_with_vat: string | null;
  client_vat_amount: string | null;
  carrier_price_with_vat: string | null;
  carrier_vat_amount: string | null;
  client_invoice_issued: boolean;
  client_invoice_received: boolean;
  route_from: string;
  route_to: string;
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  sender_route_from: string;
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  receiver_route_to: string;
  order_date: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  is_partial?: boolean;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  length_m?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
  is_palletized?: boolean;
  is_stackable?: boolean;
  vehicle_type?: string | null;
  vehicle_type_display?: string | null;
  requires_forklift?: boolean;
  requires_crane?: boolean;
  requires_special_equipment?: boolean;
  fragile?: boolean;
  hazardous?: boolean;
  temperature_controlled?: boolean;
  requires_permit?: boolean;
  notes: string;
  created_at: string;
  client_payment_status: 'not_paid' | 'partially_paid' | 'paid';
  client_payment_status_display: string;
  carriers?: OrderCarrier[];
  cargo_items?: CargoItem[];
  route_stops?: Array<{
    id?: number;
    stop_type: 'loading' | 'unloading';
    sequence_order: number;
    name?: string;
    country?: string;
    postal_code?: string;
    city?: string;
    address?: string;
    date_from?: string | null;
    date_to?: string | null;
    notes?: string;
  }>;
  first_sales_invoice?: {
    id: number;
    invoice_number: string;
    invoice_type: string;
    amount_total: string;
    issue_date: string | null;
  } | null;
  sales_invoices_count?: number;
  has_overdue_invoices?: boolean;
  payment_status_info?: {
    status: 'not_paid' | 'partially_paid' | 'paid' | 'overdue';
    message: string;
    has_invoices: boolean;
    invoice_issued?: boolean;
    payment_date?: string;
    overdue_days?: number;
  };
}

interface CargoItem {
  id?: number;
  order?: number;
  sequence_order: number;
  reference_number?: string | null;
  description?: string;
  units?: string | number | null;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  pallet_count?: string | number | null;
  package_count?: string | number | null;
  length_m?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
  is_palletized?: boolean;
  is_stackable?: boolean;
  vehicle_type?: string | null;
  requires_forklift?: boolean;
  requires_crane?: boolean;
  requires_special_equipment?: boolean;
  fragile?: boolean;
  hazardous?: boolean;
  temperature_controlled?: boolean;
  requires_permit?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface OrderCarrier {
  id?: number;
  order?: number;
  partner: Client;
  partner_id: number;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display: string;
  expedition_number?: string | null;
  sequence_order: number;
  price_net: string | null;
  price_with_vat: string | null;
  vat_amount: string | null;
  route_from: string;
  route_to: string;
  // Detali maršruto informacija
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  sender_name?: string;
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  receiver_name?: string;
  loading_date: string | null;
  unloading_date: string | null;
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  status_display: string;
  invoice_issued: boolean;
  invoice_received?: boolean;
  documents_status?: 'not_received' | 'waiting' | 'received';
  documents_status_display?: string;
  invoice_received_date?: string | null;
  payment_days?: number | null;
  due_date?: string | null;
  payment_status: 'not_paid' | 'partially_paid' | 'paid';
  payment_status_display: string;
  payment_date?: string | null;
  payment_status_info?: {
    status: 'not_paid' | 'partially_paid' | 'paid';
    message: string;
    payment_date?: string;
  };
  notes: string;
  documents?: ExpeditionDocument[];
}


interface ManualCarrierInvoice {
  carrier: OrderCarrier;
  document: ExpeditionDocument;
}

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (order: Order) => void;
  onOrderUpdate?: (order: Order) => void;
  showToast?: (type: 'success' | 'error' | 'info', message: string) => void;
  onShowRouteMap?: (order: Order) => void;
}

const STATUS_COLORS: { [key: string]: string } = {
  new: 'badge-info',
  assigned: 'badge-warning',
  executing: 'badge-primary',
  waiting_for_docs: 'badge-warning',
  finished: 'badge-success',
  canceled: 'badge-danger',
};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getStatusColor = (status: string) => {
  return STATUS_COLORS[status] || 'badge-secondary';
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatDateLite = (value?: string | null) => {
  if (!value) {
    return '—';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('lt-LT');
  } catch (error) {
    return value;
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formatAmountLite = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(numeric)) return String(value);
  return formatMoney(numeric);
};

const normalizeCarrierData = (carrier: OrderCarrier): OrderCarrier => ({
  ...carrier,
  invoice_issued: carrier.invoice_issued ?? false,
});

const normalizeOrderData = (order: Order): Order => ({
  ...order,
  carriers: order.carriers ? order.carriers.map(normalizeCarrierData) : [],
});

const OrderDetailsModal = ({
  order,
  isOpen,
  onClose,
  onEdit,
  onOrderUpdate,
  showToast = () => {},
  onShowRouteMap,
}: OrderDetailsModalProps) => {
  const { i18n } = useTranslation();
  const [localOrder, setLocalOrder] = useState<Order | null>(order ? normalizeOrderData(order) : null);
  const [selectedOrderInvoices, setSelectedOrderInvoices] = useState<Array<{ id: number; invoice_number: string; issue_date: string | null; amount_total: string }>>([]);
  const [allPurchaseInvoices, setAllPurchaseInvoices] = useState<Array<{ id: number; invoice_number: string | null; received_invoice_number: string; issue_date: string | null; amount_total: string; partner: { id: number; name: string } }>>([]);
  const [carrierPurchaseInvoices, setCarrierPurchaseInvoices] = useState<{ [carrierId: number]: Array<{ id: number; invoice_number: string | null; received_invoice_number: string; issue_date: string | null; amount_total: string }> }>({});
  const [confirmState, setConfirmState] = useState<{ 
    open: boolean; 
    title?: string; 
    message?: string; 
    onConfirm?: () => void;
  }>({ open: false });
  const [availableGapNumber, setAvailableGapNumber] = useState<string | null>(null);
  const [showGapSuggestion, setShowGapSuggestion] = useState(false);
  const [pendingInvoiceCreation, setPendingInvoiceCreation] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewCarrierId, setHtmlPreviewCarrierId] = useState<number | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');
  const manualCarrierInvoices: ManualCarrierInvoice[] = useMemo(() => {
    if (!localOrder?.carriers) {
      return [];
    }
    return localOrder.carriers.flatMap((carrier) => {
      const docs = carrier.documents?.filter((doc) => doc.document_type === 'invoice') || [];
      return docs.map((document) => ({ carrier, document }));
    });
  }, [localOrder?.carriers]);
  const totalIncomingInvoicesCount = (allPurchaseInvoices?.length || 0) + manualCarrierInvoices.length;
  
  // Use ref to track which order ID was last loaded to prevent unnecessary re-fetches
  const lastLoadedOrderIdRef = useRef<number | null>(null);
  const isLoadingRef = useRef<boolean>(false);

  // Update localOrder when order prop changes (only if order.id actually changed)
  useEffect(() => {
    if (order && order.id) {
      // Only update if order.id actually changed
      if (order.id !== localOrder?.id) {
        setLocalOrder(normalizeOrderData(order));
        // Reset last loaded ID when order changes
        lastLoadedOrderIdRef.current = null;
      }
    } else if (!order) {
      // If order is null, clear localOrder
      setLocalOrder(null);
      lastLoadedOrderIdRef.current = null;
    }
  }, [order?.id, order, localOrder?.id]); // include order to ensure updated structure when props change

  // Load full order data when modal opens (to ensure we have all fields including other_costs)
  useEffect(() => {
    // Only load if modal is open, we have an order, and we haven't already loaded this order
    if (isOpen && order && order.id && order.id !== lastLoadedOrderIdRef.current && !isLoadingRef.current) {
      isLoadingRef.current = true;
      lastLoadedOrderIdRef.current = order.id;
      
      // Užkrauti pilnus užsakymo duomenis iš API, kad gautume visus laukus (pvz., other_costs)
      const fetchFullOrder = async () => {
        try {
          const orderResponse = await api.get(`/orders/orders/${order.id}/`);
          console.log('Full order response:', orderResponse.data);
          console.log('Route stops from backend:', orderResponse.data.route_stops);
          const fullOrderData = normalizeOrderData(orderResponse.data);
          console.log('Normalized order data:', fullOrderData);
          console.log('Normalized route stops:', fullOrderData.route_stops);
          
          // Atnaujinti localOrder su pilnais duomenimis
          setLocalOrder(fullOrderData);
          
          if (onOrderUpdate) {
            onOrderUpdate(fullOrderData);
          }
          
          // Užkrauti papildomus duomenis su teisingais order.id
          fetchOrderInvoices(order.id, fullOrderData.carriers || []);
        } catch (error) {
          // Silent fail - naudoti esamą localOrder
        } finally {
          isLoadingRef.current = false;
        }
      };
      fetchFullOrder();
    }
    
    // Reset when modal closes
    if (!isOpen) {
      lastLoadedOrderIdRef.current = null;
      isLoadingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?.id, onOrderUpdate]); // Use order.id instead of localOrder?.id to prevent circular updates

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
      // Silent fail - jei klaida, tiesiog nerodome pasiūlymo
      setAvailableGapNumber(null);
      setShowGapSuggestion(false);
    }
  }, []);

  const fetchOrderInvoices = async (orderId: number, carriers: any[] = []) => {
    try {
      // Get sales invoices
      const response = await api.get('/invoices/sales/', { params: { related_order: orderId, page_size: 100 } });
      const results = response.data.results || response.data;
      const filtered = (results || []).filter((inv: any) => inv.related_order && (inv.related_order.id === orderId || inv.related_order === orderId));
      setSelectedOrderInvoices(filtered.map((inv: any) => ({ id: inv.id, invoice_number: inv.invoice_number, issue_date: inv.issue_date, amount_total: String(inv.amount_total) })));
      
      // Get purchase invoices for each carrier (use provided carriers or fallback to localOrder)
      const carriersToUse = carriers.length > 0 ? carriers : (localOrder?.carriers || []);
      const invoicesMap: { [carrierId: number]: Array<{ id: number; invoice_number: string | null; received_invoice_number: string; issue_date: string | null; amount_total: string }> } = {};
      
      // Užkrauti visas pirkimo sąskaitas, kurios susijusios su šiuo užsakymu (per related_order arba related_orders)
      try {
        const purchaseResponse = await api.get('/invoices/purchase/', {
          params: {
            page_size: 1000 // Užkrauti daug, kad būtų visos susijusios sąskaitos
          }
        });
        const allPurchaseInvoices = purchaseResponse.data.results || purchaseResponse.data || [];
        
        // Filtruoti sąskaitas, kurios susijusios su šiuo užsakymu
        const orderRelatedInvoices = allPurchaseInvoices.filter((inv: any) => {
          // Tikrinti ar sąskaita susijusi su šiuo užsakymu (per related_order arba related_orders)
          const isRelatedToOrder = 
            (inv.related_order && (inv.related_order.id === orderId || inv.related_order === orderId)) ||
            (inv.related_orders && Array.isArray(inv.related_orders) && inv.related_orders.some((ro: any) => ro.id === orderId));
          
          return isRelatedToOrder;
        });
        
        // Išsaugoti visas susijusias pirkimo sąskaitas
        setAllPurchaseInvoices(orderRelatedInvoices.map((inv: any) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          received_invoice_number: inv.received_invoice_number,
          issue_date: inv.issue_date,
          amount_total: String(inv.amount_total),
          partner: inv.partner || { id: 0, name: 'Nėra tiekėjo' }
        })));
        
        // Grupuoti sąskaitas pagal carrier'ius
        for (const carrier of carriersToUse) {
          if (carrier.id && carrier.partner) {
            const carrierInvoices = orderRelatedInvoices.filter((inv: any) => 
              inv.partner && (inv.partner.id === carrier.partner.id || inv.partner === carrier.partner.id)
            );
            invoicesMap[carrier.id] = carrierInvoices.map((inv: any) => ({ 
              id: inv.id, 
              invoice_number: inv.invoice_number,
              received_invoice_number: inv.received_invoice_number,
              issue_date: inv.issue_date, 
              amount_total: String(inv.amount_total) 
            }));
          }
        }
      } catch (e) {
        // Jei nepavyko užkrauti, palikti tuščius masyvus
        setAllPurchaseInvoices([]);
        for (const carrier of carriersToUse) {
          if (carrier.id) {
            invoicesMap[carrier.id] = [];
          }
        }
      }
      setCarrierPurchaseInvoices(invoicesMap);
    } catch (e) {
      setSelectedOrderInvoices([]);
      setAllPurchaseInvoices([]);
      setCarrierPurchaseInvoices({});
    }
  };

  const fetchHtmlPreview = async (id: number, type: 'order' | 'carrier', lang: string = 'lt') => {
    try {
      const token = localStorage.getItem('token');
      const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
      let baseUrl = apiBaseUrl.replace('/api', '');
      
      if (!baseUrl || baseUrl === '') {
        baseUrl = window.location.hostname === 'localhost' 
          ? 'http://localhost:8000' 
          : window.location.origin;
      }
      
      const endpoint = type === 'order' ? `orders/orders/${id}/preview/` : `orders/carriers/${id}/preview/`;
      const url = `${baseUrl}/api/${endpoint}?lang=${lang}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/html',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      
      const htmlContent = await response.text();
      
      if (!htmlContent || htmlContent.trim().length === 0) {
        throw new Error('Gautas tuščias atsakymas');
      }
      
      setHtmlPreview({
        title: type === 'order' ? `Užsakymas ${localOrder?.order_number || id}` : `Vežėjo sutartis ${id}`,
        htmlContent: htmlContent
      });
      
      if (type === 'carrier') setHtmlPreviewCarrierId(id);
      else setHtmlPreviewCarrierId(null);
      
      setHtmlPreviewLang(lang);
    } catch (error: any) {
      const errorMsg = error.message || error.toString() || 'Nežinoma klaida';
      showToast('error', `Nepavyko atidaryti peržiūros: ${errorMsg}`);
    }
  };

  const handleRefreshOrder = async () => {
    if (!localOrder) return;
    try {
      const orderResponse = await api.get(`/orders/orders/${localOrder.id}/`);
      const updatedOrder = normalizeOrderData(orderResponse.data);
      setLocalOrder(updatedOrder);
      if (onOrderUpdate) {
        onOrderUpdate(updatedOrder);
      }
    } catch (error) {
      // Silent fail
    }
  };

  if (!isOpen || !localOrder) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
              {localOrder.order_number || `Užsakymas #${localOrder.id}`}
            </h2>
            <div style={{ marginTop: '3px', fontSize: '12px', color: '#666' }}>
              Užsakymo data: {localOrder.order_date ? new Date(localOrder.order_date).toLocaleDateString('lt-LT') : '-'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="button button-secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const token = localStorage.getItem('token');
                  // Gauti backend URL - naudoti api service baseURL
                  // api service naudoja REACT_APP_API_URL arba '/api' (santykinis)
                  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
                  let baseUrl = apiBaseUrl.replace('/api', '');
                  
                  // Jei baseUrl yra tuščias (santykinis URL), naudoti absoliutų URL
                  if (!baseUrl || baseUrl === '') {
                    // Development: localhost:8000, Production: window.location.origin
                    baseUrl = window.location.hostname === 'localhost' 
                      ? 'http://localhost:8000' 
                      : window.location.origin;
                  }
                  
                  const url = `${baseUrl}/api/orders/orders/${localOrder.id}/preview/`;
                  console.log('Opening preview URL:', url); // Debug
                  
                  const response = await fetch(url, {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Accept': 'text/html',
                    },
                    credentials: 'include',
                  });
                  
                  if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                  }
                  
                  const htmlContent = await response.text();
                  
                  if (!htmlContent || htmlContent.trim().length === 0) {
                    throw new Error('Gautas tuščias atsakymas');
                  }
                  
                  setHtmlPreview({
                    title: `Užsakymo sutartis ${localOrder.order_number || localOrder.id}`,
                    htmlContent: htmlContent
                  });
                  
                  // Pašalinti "Siųsti el. paštu" ir "Atsisiųsti PDF" mygtukus iš HTML
                  // Jie bus modalo header'yje
                  setTimeout(() => {
                    const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
                    if (iframe && iframe.contentDocument) {
                      const sendEmailBtn = iframe.contentDocument.querySelector('button[onclick*="sendEmail"]');
                      const downloadPdfBtn = iframe.contentDocument.querySelector('button[onclick*="downloadPDF"]');
                      if (sendEmailBtn) sendEmailBtn.remove();
                      if (downloadPdfBtn) downloadPdfBtn.remove();
                    }
                  }, 100);
                } catch (error: any) {
                  const errorMsg = error.message || error.toString() || 'Nežinoma klaida';
                  showToast('error', `Nepavyko atidaryti peržiūros: ${errorMsg}`);
                }
              }}
            >
              👁️ Peržiūrėti sutartį
            </button>
            <button
              className="button button-secondary"
              style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#28a745', color: 'white', border: 'none' }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const response = await api.get(`/orders/orders/${localOrder.id}/pdf/`, {
                    params: { lang: i18n.language },
                    responseType: 'blob',
                  });
                  
                  const blob = new Blob([response.data], { type: 'application/pdf' });
                  const blobUrl = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = blobUrl;
                  link.download = `uzsakymas-${localOrder.order_number || localOrder.id}.pdf`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(blobUrl);
                  showToast('success', 'PDF sėkmingai atsisiųstas');
                } catch (error: any) {
                  showToast('error', 'Nepavyko atsisiųsti PDF');
                }
              }}
            >
              📄 PDF
            </button>
            {onEdit && (
              <button 
                className="button button-secondary" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(localOrder);
                }}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                ✏️ Redaguoti
              </button>
            )}
            <button
              className="button button-secondary"
              onClick={onClose}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              ✕ Uždaryti
            </button>
          </div>
        </div>
        
        <div style={{ padding: '15px 20px', overflowY: 'auto', flex: 1 }}>
          {/* Visi lapeliai Grid layout su 3 stulpeliais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Lapelis 1: Klientas */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>👤 Klientas</h4>
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                <div><strong>{localOrder.client.name}</strong></div>
                <div style={{ fontSize: '12px', color: '#6c757d' }}>Kodas: {localOrder.client.code}</div>
              </div>
              
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                  <strong>Kaina be PVM:</strong> <span style={{ color: '#28a745', fontWeight: '600' }}>
                    {(() => {
                      const price = localOrder.client_price_net || localOrder.calculated_client_price_net;
                      if (price) {
                        return formatMoney(price);
                      }
                      const transportCost = (localOrder.carriers || []).reduce((sum: number, c: OrderCarrier) => 
                        sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
                      const myPrice = localOrder.my_price_net ? parseFloat(String(localOrder.my_price_net)) : 0;
                      const otherCosts = (localOrder.other_costs || []).reduce((sum: number, c: OtherCost) => 
                        sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
                      const total = transportCost + myPrice + otherCosts;
                      return total > 0 ? formatMoney(total) : <span style={{ color: '#999' }}>Nenustatyta</span>;
                    })()}
                  </span>
                </div>
                {(() => {
                  const priceNet = localOrder.client_price_net || localOrder.calculated_client_price_net || 
                    (() => {
                      const transportCost = (localOrder.carriers || []).reduce((sum: number, c: OrderCarrier) => 
                        sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
                      const myPrice = localOrder.my_price_net ? parseFloat(String(localOrder.my_price_net)) : 0;
                      const otherCosts = (localOrder.other_costs || []).reduce((sum: number, c: OtherCost) => 
                        sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
                      return transportCost + myPrice + otherCosts;
                    })();
                  if (priceNet && parseFloat(String(priceNet)) > 0) {
                    const priceNetNum = parseFloat(String(priceNet));
                    const vatRate = parseFloat(localOrder.vat_rate || '21');
                    const vatAmount = priceNetNum * (vatRate / 100);
                    const priceWithVat = priceNetNum + vatAmount;
                    return (
                      <>
                        <div style={{ fontSize: '12px', marginBottom: '4px', color: '#6c757d' }}>
                          <strong>PVM ({vatRate}%):</strong> {formatMoney(vatAmount)}
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <strong style={{ fontSize: '13px' }}>Su PVM:</strong> <span style={{ color: '#007bff', fontWeight: '600', fontSize: '13px' }}>{formatMoney(priceWithVat)}</span>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>


              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#495057' }}>Statusas:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  {/* Sąskaita */}
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '2px', color: '#6c757d', fontSize: '11px' }}>Sąskaita:</div>
                    <div style={{ 
                      padding: '6px 8px', 
                      borderRadius: '4px', 
                      backgroundColor: ((localOrder.payment_status_info?.invoice_issued ?? localOrder.client_invoice_issued) || !!localOrder.first_sales_invoice) ? '#d4edda' : '#f8f9fa',
                      color: ((localOrder.payment_status_info?.invoice_issued ?? localOrder.client_invoice_issued) || !!localOrder.first_sales_invoice) ? '#155724' : '#6c757d',
                      fontWeight: ((localOrder.payment_status_info?.invoice_issued ?? localOrder.client_invoice_issued) || !!localOrder.first_sales_invoice) ? '600' : 'normal'
                    }}>
                      {((localOrder.payment_status_info?.invoice_issued ?? localOrder.client_invoice_issued) || !!localOrder.first_sales_invoice) ? 'Išrašyta' : 'Neišrašyta'}
                    </div>
                  </div>
                  
                  {/* Užsakymas */}
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '2px', color: '#6c757d', fontSize: '11px' }}>Užsakymas:</div>
                    {(() => {
                      const statusInfo = localOrder.payment_status_info;
                      const status = statusInfo?.status || localOrder.client_payment_status || 'not_paid';
                      const message = statusInfo?.message || localOrder.client_payment_status_display || 'Neapmokėta';
                      
                      let bgColor = '#f8f9fa';
                      let textColor = '#6c757d';
                      
                      if (status === 'paid') {
                        bgColor = '#d4edda';
                        textColor = '#155724';
                      } else if (status === 'overdue') {
                        bgColor = '#f8d7da';
                        textColor = '#721c24';
                      } else if (status === 'partially_paid') {
                        bgColor = '#fff3cd';
                        textColor = '#856404';
                      } else {
                        bgColor = '#f8f9fa';
                        textColor = '#6c757d';
                      }
                      
                      return (
                        <div style={{ 
                          padding: '6px 8px', 
                          borderRadius: '4px', 
                          backgroundColor: bgColor,
                          color: textColor,
                          fontWeight: '600'
                        }}>
                          {message}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Lapelis 2: Informacija */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>ℹ️ Informacija</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
                <div><strong>Tipas:</strong> {localOrder.order_type_display}</div>
                <div><strong>Būsena:</strong> <span className={`badge ${getStatusColor(localOrder.status)}`} style={{ fontSize: '11px', padding: '2px 6px' }}>{localOrder.status_display}</span></div>
                <div><strong>Vadybininkas:</strong> {localOrder.manager ? localOrder.manager.username : '-'}</div>
                <div><strong>PVM:</strong> {localOrder.vat_rate}%</div>
                {/* Maršrutų sekcija */}
                <div style={{ gridColumn: '1 / -1', marginTop: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Maršrutas iš */}
                    {(localOrder.route_from_country || localOrder.route_from) && (
                      <div style={{
                        border: '1px solid #e3f2fd',
                        borderRadius: '6px',
                        padding: '8px',
                        backgroundColor: '#f8f9ff',
                        fontSize: '11px'
                      }}>
                        <div style={{ fontWeight: '600', color: '#1976d2', marginBottom: '4px', fontSize: '12px' }}>
                          📍 Maršrutas iš
                        </div>
                        {localOrder.sender_route_from && (
                          <div style={{
                            color: '#007bff',
                            fontWeight: '600',
                            marginBottom: '4px',
                            padding: '2px 0'
                          }}>
                            👤 {localOrder.sender_route_from}
                          </div>
                        )}
                        <div style={{ color: '#495057', lineHeight: '1.3' }}>
                          {localOrder.route_from_country && (
                            <div>
                              {[
                                localOrder.route_from_country,
                                localOrder.route_from_postal_code,
                                localOrder.route_from_city,
                                localOrder.route_from_address
                              ].filter(Boolean).join(', ')}
                            </div>
                          )}
                          {!localOrder.route_from_country && localOrder.route_from && (
                            <div>{localOrder.route_from}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Maršrutas į */}
                    {(localOrder.route_to_country || localOrder.route_to) && (
                      <div style={{
                        border: '1px solid #e8f5e8',
                        borderRadius: '6px',
                        padding: '8px',
                        backgroundColor: '#f9fff9',
                        fontSize: '11px'
                      }}>
                        <div style={{ fontWeight: '600', color: '#388e3c', marginBottom: '4px', fontSize: '12px' }}>
                          📍 Maršrutas į
                        </div>
                        {localOrder.receiver_route_to && (
                          <div style={{
                            color: '#28a745',
                            fontWeight: '600',
                            marginBottom: '4px',
                            padding: '2px 0'
                          }}>
                            📦 {localOrder.receiver_route_to}
                          </div>
                        )}
                        <div style={{ color: '#495057', lineHeight: '1.3' }}>
                          {localOrder.route_to_country && (
                            <div>
                              {[
                                localOrder.route_to_country,
                                localOrder.route_to_postal_code,
                                localOrder.route_to_city,
                                localOrder.route_to_address
                              ].filter(Boolean).join(', ')}
                            </div>
                          )}
                          {!localOrder.route_to_country && localOrder.route_to && (
                            <div>{localOrder.route_to}</div>
                          )}
                        </div>
                        {onShowRouteMap && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowRouteMap(localOrder);
                            }}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              backgroundColor: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginTop: '6px',
                              width: '100%',
                              justifyContent: 'center'
                            }}
                            title="Atidaryti žemėlapį su maršrutu"
                          >
                            🗺️ Žemėlapis
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Route Stops */}
                {localOrder.route_stops && localOrder.route_stops.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                    <div style={{ 
                      border: '1px solid #dee2e6', 
                      borderRadius: '6px', 
                      padding: '12px', 
                      backgroundColor: '#f8f9fa'
                    }}>
                      <div style={{ fontWeight: '600', color: '#495057', marginBottom: '12px', fontSize: '14px' }}>
                        🗺️ MARŠRUTAS
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {localOrder.route_stops
                          .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                          .map((stop, idx) => (
                            <div key={stop.id || idx} style={{
                              border: '1px solid #e0e0e0',
                              borderRadius: '4px',
                              padding: '10px',
                              backgroundColor: '#fff'
                            }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: stop.stop_type === 'loading' ? '#1976d2' : '#388e3c', marginBottom: '6px' }}>
                                {stop.stop_type === 'loading' ? '📥 PAKROVIMAS' : '📤 IŠKROVIMAS'} #{idx + 1}
                              </div>
                              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                                {stop.city || '?'}, {stop.country || '?'}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                                {stop.address} {stop.name ? `(${stop.name})` : ''}
                              </div>
                              {(stop.date_from || stop.date_to) && (
                                <div style={{ fontSize: '12px', marginTop: '4px', color: '#6c757d' }}>
                                  📅 {(() => {
                                    const formatDateForDisplay = (dateStr: string | null | undefined): string => {
                                      if (!dateStr) return '?';
                                      
                                      // Jei tai Date objektas, konvertuoti į string
                                      let dateString = dateStr;
                                      if (typeof dateStr === 'object' && dateStr !== null) {
                                        dateString = (dateStr as any).toString();
                                      } else {
                                        dateString = String(dateStr);
                                      }
                                      
                                      // Bandyti konvertuoti per Date objektą (geriausias būdas tvarkyti laiko juostas)
                                      try {
                                        const date = new Date(dateString);
                                        if (!isNaN(date.getTime())) {
                                          // Gauti vietinį laiką
                                          const year = date.getFullYear();
                                          const month = String(date.getMonth() + 1).padStart(2, '0');
                                          const day = String(date.getDate()).padStart(2, '0');
                                          const hours = String(date.getHours()).padStart(2, '0');
                                          const minutes = String(date.getMinutes()).padStart(2, '0');
                                          
                                          const formattedDate = `${year}.${month}.${day}`;
                                          const timeStr = `${hours}:${minutes}`;
                                          
                                          // VISADA rodyti laiką, jei jis yra
                                          return `${formattedDate} / ${timeStr}`;
                                        }
                                      } catch (e) {
                                        // Jei Date konvertavimas nepavyko, bandyti parse string
                                      }
                                      
                                      // Fallback: parse string formatą
                                      let cleanDate = dateString;
                                      if (cleanDate.includes('+')) {
                                        cleanDate = cleanDate.split('+')[0];
                                      }
                                      if (cleanDate.endsWith('Z')) {
                                        cleanDate = cleanDate.slice(0, -1);
                                      }
                                      
                                      // Jei yra T (datetime formatas)
                                      if (cleanDate.includes('T')) {
                                        const [datePart, timePart] = cleanDate.split('T');
                                        if (timePart) {
                                          // Pašalinti sekundes, jei yra
                                          const timeOnly = timePart.split(':').slice(0, 2).join(':');
                                          const formattedDate = datePart.replace(/-/g, '.');
                                          // VISADA rodyti laiką, jei jis yra
                                          return `${formattedDate} / ${timeOnly}`;
                                        }
                                        return datePart.replace(/-/g, '.');
                                      }
                                      
                                      return cleanDate.replace(/-/g, '.');
                                    };
                                    const dateFromStr = formatDateForDisplay(stop.date_from);
                                    const dateToStr = stop.date_to && stop.date_to !== stop.date_from ? ` - ${formatDateForDisplay(stop.date_to)}` : '';
                                    return dateFromStr + dateToStr;
                                  })()}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
                {(localOrder.loading_date || localOrder.unloading_date) && (
                  <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#6c757d' }}>
                    {localOrder.loading_date && <span>Pakrovimas: {(() => {
                      const date = new Date(localOrder.loading_date);
                      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
                      const timeStr = date.toTimeString().split(' ')[0].slice(0, 5);
                      return `${dateStr} / ${timeStr}`;
                    })()}</span>}
                    {localOrder.loading_date && localOrder.unloading_date && <span> • </span>}
                    {localOrder.unloading_date && <span>Iškrovimas: {(() => {
                      const date = new Date(localOrder.unloading_date);
                      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
                      const timeStr = date.toTimeString().split(' ')[0].slice(0, 5);
                      return `${dateStr} / ${timeStr}`;
                    })()}</span>}
                  </div>
                )}
                {localOrder.price_net && (
                  <div style={{ gridColumn: '1 / -1', fontSize: '12px', marginTop: '4px' }}>
                    <strong>Bazinė kaina be PVM:</strong> {formatMoney(localOrder.price_net)}
                  </div>
                )}
              </div>
            </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Lapelis 3: Krovinių aprašymai */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>📦 Krovinių aprašymai</h4>
              {localOrder.cargo_items && localOrder.cargo_items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {localOrder.cargo_items.map((item: CargoItem, index: number) => (
                  <div
                    key={item.id || index}
                    style={{
                      border: '1px solid #e9ecef',
                      borderRadius: '4px',
                      padding: '8px',
                      backgroundColor: '#f8f9fa'
                    }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: '4px', color: '#495057' }}>
                      {item.sequence_order !== undefined ? `${item.sequence_order + 1}. ` : ''}{item.description || 'Krovinys'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px', fontSize: '11px', color: '#6c757d' }}>
                      {item.reference_number && <div><strong>REF:</strong> {item.reference_number}</div>}
                      {item.units !== null && item.units !== undefined && <div><strong>Vnt:</strong> {item.units}</div>}
                      {item.pallet_count !== null && item.pallet_count !== undefined && <div><strong>Paletės:</strong> {item.pallet_count}</div>}
                      {item.package_count !== null && item.package_count !== undefined && <div><strong>Pakuotės:</strong> {item.package_count}</div>}
                      {item.weight_kg && <div><strong>Svoris:</strong> {item.weight_kg} kg</div>}
                      {item.ldm && <div><strong>LDM:</strong> {item.ldm}</div>}
                      {(item.length_m || item.width_m || item.height_m) && (
                        <div><strong>Matmenys:</strong> {[item.length_m, item.width_m, item.height_m].filter(Boolean).join(' × ')} m</div>
                      )}
                      {item.vehicle_type && <div><strong>Mašinos tipas:</strong> {item.vehicle_type}</div>}
                    </div>
                    {item.notes && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#6c757d', fontStyle: 'italic' }}>
                        <strong>Pastabos:</strong> {item.notes}
                      </div>
                    )}
                    {(item.is_palletized || item.is_stackable || item.requires_forklift || item.requires_crane || item.fragile || item.hazardous || item.temperature_controlled || item.requires_permit) && (
                      <div style={{ marginTop: '4px', fontSize: '11px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {item.is_palletized && <span style={{ padding: '2px 6px', backgroundColor: '#d1ecf1', borderRadius: '3px', fontSize: '10px' }}>Paletizuotas</span>}
                        {item.is_stackable && <span style={{ padding: '2px 6px', backgroundColor: '#d1ecf1', borderRadius: '3px', fontSize: '10px' }}>Kraunamas</span>}
                        {item.requires_forklift && <span style={{ padding: '2px 6px', backgroundColor: '#fff3cd', borderRadius: '3px', fontSize: '10px' }}>🔧 Keltuvas</span>}
                        {item.requires_crane && <span style={{ padding: '2px 6px', backgroundColor: '#fff3cd', borderRadius: '3px', fontSize: '10px' }}>🏗️ Kranas</span>}
                        {item.fragile && <span style={{ padding: '2px 6px', backgroundColor: '#f8d7da', borderRadius: '3px', fontSize: '10px' }}>⚠️ Trapus</span>}
                        {item.hazardous && <span style={{ padding: '2px 6px', backgroundColor: '#f8d7da', borderRadius: '3px', fontSize: '10px' }}>☠️ Pavojingas</span>}
                        {item.temperature_controlled && <span style={{ padding: '2px 6px', backgroundColor: '#d1ecf1', borderRadius: '3px', fontSize: '10px' }}>🌡️ Temperatūra</span>}
                        {item.requires_permit && <span style={{ padding: '2px 6px', backgroundColor: '#fff3cd', borderRadius: '3px', fontSize: '10px' }}>📋 Leidimas</span>}
                      </div>
                    )}
                  </div>
                ))}
                </div>
              ) : (
                <div style={{ padding: '12px', textAlign: 'center', color: '#999', backgroundColor: '#fafafa', borderRadius: '4px', fontSize: '12px' }}>
                  Nėra pridėtų krovinių aprašymų
                </div>
              )}
            </div>

            {/* Lapelis 5: Vežėjai ir sandėliai */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>🚚 Vežėjai ir sandėliai</h4>
              {localOrder.carriers && localOrder.carriers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {localOrder.carriers.map((carrier, index) => (
                  <div 
                    key={carrier.id || index}
                    style={{ 
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      padding: '10px',
                      backgroundColor: '#fff',
                      maxWidth: '100%',
                      width: '100%'
                    }}
                  >
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '4px', color: carrier.carrier_type === 'carrier' ? '#007bff' : '#ffc107' }}>
                        {carrier.sequence_order + 1}. {carrier.carrier_type_display}: {carrier.partner.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6c757d' }}>
                        {carrier.partner.code}
                      </div>
                      {carrier.carrier_type === 'carrier' && (
                        <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600, marginTop: '4px' }}>
                          Ekspedicijos numeris: {carrier.expedition_number || 'Bus sugeneruotas'}
                        </div>
                      )}
                      {carrier.id && (
                        <button
                          className="button button-secondary"
                          style={{ 
                            padding: '4px 8px', 
                            fontSize: '11px', 
                            marginTop: '6px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchHtmlPreview(carrier.id!, 'carrier', i18n.language);
                          }}
                        >
                          👁️ Peržiūrėti vežėjo sutartį
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', marginBottom: '8px' }}>
                      {(carrier.route_from_country || carrier.route_to_country || carrier.route_from || carrier.route_to) && (
                        <div style={{ gridColumn: '1 / -1', color: '#6c757d', marginBottom: '4px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '4px' }}>
                            {/* Maršrutas iš */}
                            <div style={{
                              border: '1px solid #e3f2fd',
                              borderRadius: '4px',
                              padding: '6px',
                              backgroundColor: '#f8f9ff',
                              fontSize: '10px'
                            }}>
                              <div style={{ fontWeight: '600', color: '#1976d2', marginBottom: '3px', fontSize: '11px' }}>
                                📍 Maršrutas iš
                              </div>
                              {carrier.sender_name && (
                                <div style={{
                                  color: '#007bff',
                                  fontWeight: '600',
                                  marginBottom: '2px'
                                }}>
                                  👤 {carrier.sender_name}
                                </div>
                              )}
                              <div style={{ color: '#495057' }}>
                                {carrier.route_from_country && (
                                  <div>
                                    {[
                                      carrier.route_from_country,
                                      carrier.route_from_postal_code,
                                      carrier.route_from_city,
                                      carrier.route_from_address
                                    ].filter(Boolean).join(', ')}
                                  </div>
                                )}
                                {!carrier.route_from_country && carrier.route_from && (
                                  <div>{carrier.route_from}</div>
                                )}
                              </div>
                            </div>

                            {/* Maršrutas į */}
                            <div style={{
                              border: '1px solid #e8f5e8',
                              borderRadius: '4px',
                              padding: '6px',
                              backgroundColor: '#f9fff9',
                              fontSize: '10px'
                            }}>
                              <div style={{ fontWeight: '600', color: '#388e3c', marginBottom: '3px', fontSize: '11px' }}>
                                📍 Maršrutas į
                              </div>
                              {carrier.receiver_name && (
                                <div style={{
                                  color: '#28a745',
                                  fontWeight: '600',
                                  marginBottom: '2px'
                                }}>
                                  📦 {carrier.receiver_name}
                                </div>
                              )}
                              <div style={{ color: '#495057' }}>
                                {carrier.route_to_country && (
                                  <div>
                                    {[
                                      carrier.route_to_country,
                                      carrier.route_to_postal_code,
                                      carrier.route_to_city,
                                      carrier.route_to_address
                                    ].filter(Boolean).join(', ')}
                                  </div>
                                )}
                                {!carrier.route_to_country && carrier.route_to && (
                                  <div>{carrier.route_to}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {carrier.loading_date && (
                        <div style={{ color: '#6c757d' }}>
                          <strong>Pakrovimas:</strong> {(() => {
                            const date = new Date(carrier.loading_date);
                            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
                            const timeStr = date.toTimeString().split(' ')[0].slice(0, 5);
                            return `${dateStr} / ${timeStr}`;
                          })()}
                        </div>
                      )}
                      {carrier.unloading_date && (
                        <div style={{ color: '#6c757d' }}>
                          <strong>Iškrovimas:</strong> {(() => {
                            const date = new Date(carrier.unloading_date);
                            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '.');
                            const timeStr = date.toTimeString().split(' ')[0].slice(0, 5);
                            return `${dateStr} / ${timeStr}`;
                          })()}
                        </div>
                      )}
                      {carrier.status_display && (
                        <div>
                          <strong>Būklė:</strong> <span style={{ 
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            backgroundColor: carrier.status === 'completed' ? '#d4edda' :
                              carrier.status === 'in_progress' ? '#d1ecf1' :
                              carrier.status === 'cancelled' ? '#f8d7da' : '#e2e3e5',
                            color: carrier.status === 'completed' ? '#155724' :
                              carrier.status === 'in_progress' ? '#0c5460' :
                              carrier.status === 'cancelled' ? '#721c24' : '#383d41'
                          }}>
                            {carrier.status_display}
                          </span>
                        </div>
                      )}
                      {carrier.price_net && (
                        <div style={{ gridColumn: '1 / -1', fontSize: '11px', marginTop: '4px' }}>
                          <strong>Kaina be PVM:</strong> <span style={{ color: '#28a745', fontWeight: '600' }}>
                            {formatMoney(carrier.price_net)}
                            {carrier.price_with_vat && (
                              <span style={{ marginLeft: '8px', color: '#007bff' }}>
                                (su PVM: {formatMoney(carrier.price_with_vat)})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Statuso sekcija */}
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: '6px', color: '#495057' }}>Statusas:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                        {/* Sąskaita */}
                        <div>
                          <div style={{ fontWeight: '600', marginBottom: '2px', color: '#6c757d', fontSize: '10px' }}>Sąskaita:</div>
                          {(() => {
                            const invoiceDocs = (carrier.documents || []).filter(
                              (doc) => doc.document_type === 'invoice'
                            );
                            const hasInvoice = invoiceDocs.length > 0;
                            return (
                              <div style={{ 
                            padding: '4px 6px', 
                            borderRadius: '4px', 
                                backgroundColor: hasInvoice ? '#d4edda' : '#f8f9fa',
                                color: hasInvoice ? '#155724' : '#6c757d',
                                fontWeight: hasInvoice ? '600' : 'normal',
                            display: 'inline-block',
                            marginRight: '8px'
                          }}>
                                {hasInvoice ? 'Gauta' : 'Negauta'}
                              </div>
                            );
                          })()}
                          {/* Apmokėjimo statusas */}
                          {(() => {
                            const statusInfo = carrier.payment_status_info;
                            const status = statusInfo?.status || carrier.payment_status || 'not_paid';
                            const message = statusInfo?.message || carrier.payment_status_display || 'Neapmokėtas';
                            
                            let bgColor = '#f8f9fa';
                            let textColor = '#6c757d';
                            
                            if (status === 'paid') {
                              bgColor = '#d4edda';
                              textColor = '#155724';
                            } else if (status === 'partially_paid') {
                              bgColor = '#fff3cd';
                              textColor = '#856404';
                            } else {
                              bgColor = '#f8f9fa';
                              textColor = '#6c757d';
                            }
                            
                            return (
                              <div style={{ 
                                padding: '4px 6px', 
                                borderRadius: '4px', 
                                backgroundColor: bgColor,
                                color: textColor,
                                fontWeight: '600',
                                display: 'inline-block'
                              }}>
                                {message}
                              </div>
                            );
                          })()}
                          {/* Jei dokumentai ir sąskaita gauta, rodomas mygtukas apmokėjimui */}
                          {(() => {
                            const invoiceDocs = (carrier.documents || []).filter(
                              (doc) => doc.document_type === 'invoice'
                            );
                            const hasInvoice = invoiceDocs.length > 0;
                            return hasInvoice && carrier.payment_status !== 'paid' && carrier.id;
                          })() && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setConfirmState({
                                  open: true,
                                  title: 'Patvirtinkite',
                                  message: 'Pažymėti, kad sąskaita apmokėta?',
                                  onConfirm: async () => {
                                    try {
                                      const today = new Date().toISOString().split('T')[0];
                                      await api.patch(`/orders/carriers/${carrier.id}/`, {
                                        payment_status: 'paid',
                                        payment_date: today
                                      });
                                      showToast('success', 'Apmokėjimas pažymėtas');
                                      await handleRefreshOrder();
                                    } catch (error: any) {
                                      showToast('error', error.response?.data?.error || 'Klaida atnaujinant apmokėjimo statusą');
                                    } finally {
                                      setConfirmState({ open: false });
                                    }
                                  }
                                });
                              }}
                              style={{
                                marginLeft: '8px',
                                padding: '4px 8px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: '600'
                              }}
                            >
                              Pažymėti apmokėta
                            </button>
                          )}
                        </div>
                        
                        {/* Dokumentai */}
                      </div>
                    </div>
                    
                    {carrier.documents && carrier.documents.length > 0 && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#495057' }}>Pridėti dokumentai</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {carrier.documents.map((doc) => {
                            const amountValue = doc.amount !== undefined && doc.amount !== null && doc.amount !== ''
                              ? Number.parseFloat(String(doc.amount))
                              : null;
                            const issueDateDisplay = doc.issue_date ? new Date(doc.issue_date).toLocaleDateString('lt-LT') : null;
                            const receivedDateDisplay = doc.received_date ? new Date(doc.received_date).toLocaleDateString('lt-LT') : null;
                            const createdAtDisplay = doc.created_at ? new Date(doc.created_at).toLocaleString('lt-LT') : null;
                            const typeDisplay = doc.document_type_display || doc.document_type.toUpperCase();
                            const numberLabel =
                              doc.document_type === 'invoice'
                                ? 'Sąskaitos Nr.'
                                : doc.document_type === 'cmr'
                                ? 'CMR Nr.'
                                : 'Dokumento Nr.';
                            const numberValue =
                              doc.document_type === 'invoice'
                                ? doc.invoice_number
                                : doc.document_type === 'cmr'
                                ? doc.cmr_number
                                : doc.invoice_number || doc.cmr_number;

                            return (
                              <div
                                key={doc.id}
                                style={{
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #dee2e6',
                                  borderRadius: '4px',
                                  padding: '6px 8px',
                                  fontSize: '11px',
                                  color: '#495057',
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{typeDisplay}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', color: '#6c757d' }}>
                                  {numberValue && (
                                    <span>
                                      {numberLabel}:{' '}
                                      <strong style={{ color: '#495057' }}>{numberValue}</strong>
                                    </span>
                                  )}
                                  {amountValue !== null && !Number.isNaN(amountValue) && (
                                    <span>
                                      Suma:{' '}
                                      <strong style={{ color: '#28a745' }}>{formatMoney(amountValue)}</strong>
                                    </span>
                                  )}
                                  {issueDateDisplay && (
                                    <span>Išrašyta: <strong style={{ color: '#495057' }}>{issueDateDisplay}</strong></span>
                                  )}
                                  {receivedDateDisplay && (
                                    <span>Gauta: <strong style={{ color: '#495057' }}>{receivedDateDisplay}</strong></span>
                                  )}
                                  {createdAtDisplay && (
                                    <span>Įvesta: <strong style={{ color: '#495057' }}>{createdAtDisplay}</strong></span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {carrier.notes && (
                      <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '11px', color: '#495057' }}>
                        <strong>Pastabos:</strong> {carrier.notes}
                      </div>
                    )}
                    
                    {/* Sąskaitų sekcija */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                      {(() => {
                        const carrierId = carrier.id;
                        const systemInvoices = carrierId ? (carrierPurchaseInvoices[carrierId] || []) : [];
                        const hasSystemInvoices = Array.isArray(systemInvoices) && systemInvoices.length > 0;
                        const manualInvoiceDocs = (carrier.documents || []).filter((doc) => doc.document_type === 'invoice');
                        const hasManualInvoices = manualInvoiceDocs.length > 0;
                        const hasInvoices = hasSystemInvoices || hasManualInvoices;
                        
                        if (hasInvoices) {
                          if (hasSystemInvoices) {
                            return (
                              <div style={{
                                padding: '4px 8px',
                                backgroundColor: '#d4edda',
                                color: '#155724',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                textAlign: 'center'
                              }}>
                                ✓ Sąskaita jau pridėta sistemoje
                              </div>
                            );
                          }
                          return (
                            <div style={{
                              padding: '4px 8px',
                              backgroundColor: '#fff3cd',
                              color: '#856404',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              textAlign: 'center'
                            }}>
                              📝 Registruotas gautos sąskaitos dokumentas
                            </div>
                          );
                        } else if (carrier.id && carrier.partner) {
                          // Jei nėra sąskaitos - rodyti mygtuką "Sukurti gautą sąskaitą vežėjo"
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `/invoices?create_purchase=true&order_carrier_id=${carrier.id}&order_id=${localOrder.id}&partner_id=${carrier.partner.id}&amount_net=${carrier.price_net || 0}`;
                              }}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '600'
                              }}
                            >
                              📄 Sukurti gautą sąskaitą vežėjo
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                ))}
                </div>
              ) : (
                <div style={{ padding: '12px', textAlign: 'center', color: '#999', backgroundColor: '#fafafa', borderRadius: '4px', fontSize: '12px' }}>
                  Nėra pridėtų vežėjų arba sandėlių
                </div>
              )}
            </div>
            </div>

            {/* Lapelis 6: Išlaidos */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              padding: '10px',
              backgroundColor: '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: '0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>💰 Išlaidos</h4>
                <button
                  className="button button-primary"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    // TODO: Atidaryti išlaidų pridėjimo modalą
                    alert('Išlaidų pridėjimo modalas bus įgyvendintas');
                  }}
                >
                  + Pridėti išlaidą
                </button>
              </div>
              {localOrder.costs && localOrder.costs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {localOrder.costs.map((cost: any, index: number) => (
                    <div
                      key={cost.id || index}
                      style={{
                        border: '1px solid #e9ecef',
                        borderRadius: '4px',
                        padding: '8px',
                        backgroundColor: '#f8f9fa',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontWeight: '600', color: '#dc3545' }}>
                          {index + 1}. {cost.cost_type_display}: {(cost.partner as any)?.name || 'Partneris nenurodytas'}
                        </div>
                        <div style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: cost.payment_status === 'paid' ? '#d4edda' : cost.payment_status === 'partially_paid' ? '#fff3cd' : '#f8d7da',
                          color: cost.payment_status === 'paid' ? '#155724' : cost.payment_status === 'partially_paid' ? '#856404' : '#721c24'
                        }}>
                          {cost.payment_status_display || cost.status_display}
                        </div>
                      </div>
                      <div style={{ color: '#6c757d', fontSize: '11px', marginBottom: '2px' }}>
                        {(cost.partner as any)?.code || ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <div>
                          <span style={{ fontWeight: '500' }}>Suma: {formatMoney(cost.amount_with_vat || cost.amount_net || '0.00')}</span>
                          {cost.expedition_number && (
                            <div style={{ fontSize: '10px', color: '#17a2b8', fontWeight: 600, marginTop: '2px' }}>
                              Išlaidų numeris: {cost.expedition_number}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: cost.is_overdue ? '#dc3545' : '#6c757d' }}>
                            {cost.payment_status_display || 'Neapmokėta'}
                          </div>
                          {cost.due_date && (
                            <div style={{ fontSize: '10px', color: cost.is_overdue ? '#dc3545' : '#6c757d' }}>
                              Iki: {new Date(cost.due_date).toLocaleDateString('lt-LT')}
                              {cost.days_overdue > 0 && (
                                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>
                                  {' '}(+{cost.days_overdue}d)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {cost.description && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#6c757d' }}>
                          <strong>Aprašymas:</strong> {cost.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#6c757d', fontStyle: 'italic', padding: '8px' }}>
                  Nėra pridėtų išlaidų
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Lapelis 3: Sąskaitos */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>📄 Sąskaitos</h4>
              
              {/* Išrašytos sąskaitos kortelė */}
              <div style={{ 
                marginBottom: '10px',
                padding: '8px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '4px', 
                border: '1px solid #dee2e6'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#495057' }}>
                  Išrašytos sąskaitos {selectedOrderInvoices && selectedOrderInvoices.length > 0 && `(${selectedOrderInvoices.length})`}
                </div>
                {selectedOrderInvoices && selectedOrderInvoices.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedOrderInvoices.map((inv) => (
                      <button
                        key={inv.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/invoices?sales_id=${inv.id}`;
                        }}
                        style={{
                          padding: '6px 8px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'flex',
                          justifyContent: 'space-between',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
                      >
                        <span>📄 {inv.invoice_number}</span>
                        <span style={{ opacity: 0.9 }}>{formatMoney(inv.amount_total)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#6c757d', fontStyle: 'italic' }}>
                    Nėra išrašytų sąskaitų
                  </div>
                )}
                {!localOrder.first_sales_invoice && !pendingInvoiceCreation && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await fetchGapNumber();
                      setPendingInvoiceCreation(true);
                    }}
                    style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      width: '100%',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
                  >
                    📄 Sukurti sąskaitą
                  </button>
                )}
                {!localOrder.first_sales_invoice && pendingInvoiceCreation && showGapSuggestion && availableGapNumber && (
                  <div style={{
                    marginTop: '8px',
                    marginBottom: '8px',
                    padding: '10px',
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffeaa7',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    <div style={{ marginBottom: '6px', fontWeight: '500', color: '#856404' }}>
                      ⚠️ Yra tuščias numeris: <strong>{availableGapNumber}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const response = await api.post('/invoices/sales/generate_from_order/', {
                              order_id: localOrder.id,
                              invoice_type: 'final',
                              invoice_number: availableGapNumber
                            });
                            
                            showToast('success', `Pardavimo sąskaita sukurta: ${response.data.invoice_number}`);
                            
                            await handleRefreshOrder();
                            
                            setPendingInvoiceCreation(false);
                            setShowGapSuggestion(false);
                            setAvailableGapNumber(null);
                            
                            window.location.href = '/invoices';
                          } catch (error: any) {
                            const details = error.response?.data;
                            showToast('error', 'Klaida kuriant pardavimo sąskaitą: ' + (details?.error || details ? JSON.stringify(details) : error.message));
                            setPendingInvoiceCreation(false);
                            setShowGapSuggestion(false);
                          }
                        }}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}
                      >
                        Naudoti {availableGapNumber}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const response = await api.post('/invoices/sales/generate_from_order/', {
                              order_id: localOrder.id,
                              invoice_type: 'final'
                            });
                            
                            showToast('success', `Pardavimo sąskaita sukurta: ${response.data.invoice_number}`);
                            
                            await handleRefreshOrder();
                            
                            setPendingInvoiceCreation(false);
                            setShowGapSuggestion(false);
                            setAvailableGapNumber(null);
                            
                            window.location.href = '/invoices';
                          } catch (error: any) {
                            const details = error.response?.data;
                            showToast('error', 'Klaida kuriant pardavimo sąskaitą: ' + (details?.error || details ? JSON.stringify(details) : error.message));
                            setPendingInvoiceCreation(false);
                            setShowGapSuggestion(false);
                          }
                        }}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}
                      >
                        Generuoti naują
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingInvoiceCreation(false);
                          setShowGapSuggestion(false);
                        }}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}
                      >
                        Atšaukti
                      </button>
                    </div>
                  </div>
                )}
                {!localOrder.first_sales_invoice && pendingInvoiceCreation && !showGapSuggestion && (
                  <div style={{
                    marginTop: '8px',
                    marginBottom: '8px',
                    padding: '10px',
                    backgroundColor: '#e7f3ff',
                    border: '1px solid #b3d9ff',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    <div style={{ marginBottom: '6px', fontWeight: '500', color: '#004085' }}>
                      ℹ️ Tarpų nėra, generuojama nauja sąskaita...
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await api.post('/invoices/sales/generate_from_order/', {
                            order_id: localOrder.id,
                            invoice_type: 'final'
                          });
                          
                          showToast('success', `Pardavimo sąskaita sukurta: ${response.data.invoice_number}`);
                          
                          await handleRefreshOrder();
                          
                          setPendingInvoiceCreation(false);
                          
                          window.location.href = '/invoices';
                        } catch (error: any) {
                          const details = error.response?.data;
                          showToast('error', 'Klaida kuriant pardavimo sąskaitą: ' + (details?.error || details ? JSON.stringify(details) : error.message));
                          setPendingInvoiceCreation(false);
                        }
                      }}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '500',
                        marginRight: '8px'
                      }}
                    >
                      Generuoti sąskaitą
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingInvoiceCreation(false);
                      }}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}
                    >
                      Atšaukti
                    </button>
                  </div>
                )}
              </div>

              {/* Gautos sąskaitos kortelė */}
              <div style={{ 
                padding: '8px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '4px', 
                border: '1px solid #dee2e6'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#495057' }}>
                  Gautos sąskaitos {totalIncomingInvoicesCount > 0 && `(${totalIncomingInvoicesCount})`}
                </div>
                {totalIncomingInvoicesCount > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {allPurchaseInvoices && allPurchaseInvoices.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {allPurchaseInvoices.map((inv) => (
                          <button
                            key={inv.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Sąskaitos detalių modalas pašalintas - galima pridėti kitą logiką, jei reikia
                            }}
                            style={{
                              padding: '6px 8px',
                              backgroundColor: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                              <span>📄 {inv.received_invoice_number}</span>
                              <span style={{ fontSize: '10px', opacity: 0.9 }}>{inv.partner.name}</span>
                            </div>
                            <span style={{ opacity: 0.9 }}>{formatMoney(inv.amount_total)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {manualCarrierInvoices.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#856404' }}>
                          Registruoti dokumentai (be sistemos sąskaitos)
                        </div>
                        {manualCarrierInvoices.map(({ carrier, document }) => {
                          const amountValue = document.amount !== undefined && document.amount !== null && document.amount !== ''
                            ? Number.parseFloat(String(document.amount))
                            : null;
                          const issueDateDisplay = document.issue_date ? new Date(document.issue_date).toLocaleDateString('lt-LT') : null;
                          const receivedDateDisplay = document.received_date ? new Date(document.received_date).toLocaleDateString('lt-LT') : null;

                          return (
                            <div
                              key={`manual-invoice-${document.id}`}
                              style={{
                                padding: '6px 8px',
                                backgroundColor: '#fff3cd',
                                color: '#856404',
                                border: '1px solid #ffeeba',
                                borderRadius: '4px',
                                fontSize: '11px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📝 {document.invoice_number || 'Be numerio'}</span>
                                {amountValue !== null && !Number.isNaN(amountValue) && (
                                  <span style={{ fontWeight: 600 }}>{formatMoney(amountValue)}</span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', opacity: 0.9 }}>
                                {carrier?.partner?.name || 'Nežinomas vežėjas'}
                              </div>
                              <div style={{ fontSize: '10px', opacity: 0.8, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {issueDateDisplay && <span>Išrašyta: {issueDateDisplay}</span>}
                                {receivedDateDisplay && <span>Gauta: {receivedDateDisplay}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#6c757d', fontStyle: 'italic' }}>
                    Nėra gautų sąskaitų
                  </div>
                )}
              </div>
            </div>

            {/* Papildomos išlaidos */}
            <div style={{ 
              border: '1px solid #dee2e6', 
              borderRadius: '4px', 
              padding: '10px', 
              backgroundColor: '#fff'
            }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>💼 Papildomos išlaidos</h4>
              {localOrder.other_costs && Array.isArray(localOrder.other_costs) && localOrder.other_costs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  {localOrder.other_costs.map((cost: OtherCost, index: number) => (
                    <div key={index} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      backgroundColor: '#fff',
                      borderRadius: '3px',
                      border: '1px solid #dee2e6'
                    }}>
                      <span style={{ color: '#495057', fontWeight: '500' }}>{cost.description || 'Išlaida'}</span>
                      <span style={{ fontWeight: '600', color: '#007bff' }}>
                        {formatMoney(typeof cost.amount === 'number' ? cost.amount : cost.amount || 0)}
                      </span>
                    </div>
                  ))}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    marginTop: '4px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '3px',
                    fontWeight: '600',
                    fontSize: '13px',
                    border: '1px solid #dee2e6'
                  }}>
                    <span style={{ color: '#495057' }}>Iš viso:</span>
                    <span style={{ color: '#007bff' }}>
                      {(() => {
                        const total = localOrder.other_costs!.reduce((sum: number, c: OtherCost) => 
                          sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
                        return formatMoney(total);
                      })()}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: '#999',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '12px',
                  border: '1px dashed #dee2e6'
                }}>
                  Nėra papildomų išlaidų
                </div>
              )}
            </div>
            </div>

          </div>
        </div>
      </div>
      
      {/* Confirm Dialog */}
      {confirmState.open && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>{confirmState.title || 'Patvirtinkite'}</h3>
            <p style={{ margin: '0 0 20px 0' }}>{confirmState.message || 'Ar tikrai norite tęsti?'}</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="button button-secondary" onClick={() => setConfirmState({ open: false })}>
                Atšaukti
              </button>
              <button className="button" onClick={() => {
                if (confirmState.onConfirm) {
                  confirmState.onConfirm();
                }
                setConfirmState({ open: false });
              }}>
                Patvirtinti
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* HTML Preview Modal */}
      <HTMLPreviewModal
        preview={htmlPreview}
        onClose={() => {
          setHtmlPreview(null);
          setHtmlPreviewCarrierId(null);
        }}
        onLanguageChange={async (lang) => {
          if (htmlPreviewCarrierId) {
            await fetchHtmlPreview(htmlPreviewCarrierId, 'carrier', lang);
          } else if (localOrder) {
            await fetchHtmlPreview(localOrder.id, 'order', lang);
          }
        }}
        currentLang={htmlPreviewLang}
        onDownloadPDF={htmlPreview && (localOrder || htmlPreviewCarrierId) ? async () => {
          // Jei yra carrier ID, naudoti carrier endpoint'ą
          if (htmlPreviewCarrierId) {
            try {
              const response = await api.get(`/orders/carriers/${htmlPreviewCarrierId}/pdf/`, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob',
              });
              
              const blob = new Blob([response.data], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `vezimo-sutartis-${htmlPreviewCarrierId}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
              showToast('success', 'PDF sėkmingai atsisiųstas');
            } catch (error: any) {
              showToast('error', 'Nepavyko atsisiųsti PDF');
            }
          } else if (localOrder) {
            try {
              const response = await api.get(`/orders/orders/${localOrder.id}/pdf/`, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob',
              });
              
              const blob = new Blob([response.data], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `uzsakymas-${localOrder.order_number || localOrder.id}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
              showToast('success', 'PDF sėkmingai atsisiųstas');
            } catch (error: any) {
              showToast('error', 'Nepavyko atsisiųsti PDF');
            }
          }
        } : undefined}
        onSendEmail={htmlPreview && (localOrder || htmlPreviewCarrierId) ? async () => {
          // Atidaryti email modalą - naudoti tą patį, kaip HTML template'e
          const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            try {
              // Iškviesti sendEmail funkciją iš iframe
              (iframe.contentWindow as any).sendEmail?.();
            } catch (e) {
              showToast('error', 'Nepavyko atidaryti email modalo');
            }
          }
        } : undefined}
      />
    </div>
  );
};

export default OrderDetailsModal;
