import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import StatusService from '../../services/statusService';
import AutocompleteTextarea from '../AutocompleteTextarea';
import AutocompleteField from '../AutocompleteField';
import RouteContactField from '../RouteContactField';
import CarrierModal from './CarrierModal';
import CargoItemModal from './CargoItemModal';
import PartnerEditModal from '../partners/PartnerEditModal';
import OrderEdit_Finance from './OrderEdit_Finance';
import SalesInvoiceModal_NEW from '../invoices/SalesInvoiceModal_NEW';
import PurchaseInvoiceModal_NEW from '../invoices/PurchaseInvoiceModal_NEW';
import { formatMoney } from '../../utils/formatMoney';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import AttachmentPreviewModal, { AttachmentPreview } from '../common/AttachmentPreviewModal';

// Paprastas modal naujam klientui kurti
const PartnerCreateModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (partner: any) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}> = ({ isOpen, onClose, onSave, showToast }) => {
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    vat_code: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('error', 'Įveskite firmos pavadinimą');
      return;
    }

    if (!formData.code.trim()) {
      showToast('error', 'Įveskite įmonės kodą');
      return;
    }

    try {
      const partnerData = {
        ...formData,
        vat_code: formData.vat_code.trim() || '',
        is_client: true,
        is_supplier: false,
        payment_term_days: 0,
        email_notify_due_soon: false,
        email_notify_unpaid: false,
        email_notify_overdue: false,
        email_notify_manager_invoices: false,
        notes: '',
        status: 'active'
      };

      const response = await api.post('/partners/partners/', partnerData);
      showToast('success', `Klientas "${response.data.name}" sukurtas`);
      onSave(response.data);
      onClose();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message || 'Nepavyko sukurti kliento';
      showToast('error', errorMsg);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div className="card" style={{
        width: '90%',
        maxWidth: '400px',
        padding: '20px'
      }}>
        <h3 style={{ marginTop: 0, color: '#495057' }}>➕ Sukurti naują klientą</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
              Firmos pavadinimas *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Įveskite firmos pavadinimą"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              autoFocus
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
              Įmonės kodas *
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Įveskite įmonės kodą"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
              PVM kodas (nebūtina)
            </label>
            <input
              type="text"
              value={formData.vat_code}
              onChange={(e) => setFormData(prev => ({ ...prev, vat_code: e.target.value }))}
              placeholder="LT123456789"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px'
          }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                onClose();
                setFormData({ name: '', code: '', vat_code: '' });
              }}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Atšaukti
            </button>
            <button
              type="submit"
              className="button"
              disabled={!formData.name.trim() || !formData.code.trim()}
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                opacity: (formData.name.trim() && formData.code.trim()) ? 1 : 0.6
              }}
            >
              Sukurti klientą
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Interfaces - kopijuojame iš OrdersPage.tsx
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
  vat_rate?: string;
  vat_rate_article?: string;
  email_notify_due_soon?: boolean;
  email_notify_unpaid?: boolean;
  email_notify_overdue?: boolean;
  code_valid?: boolean;
  vat_code_valid?: boolean;
  has_code_errors?: boolean;
  notes?: string;
}

interface User {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface OtherCost {
  description: string;
  amount: number | string;
  visible_on_invoice?: boolean;
}

interface PVMRate {
  id: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
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
  loading_stop?: number | null;
  unloading_stop?: number | null;
  loading_stop_info?: any;
  unloading_stop_info?: any;
}

interface RouteStop {
  id?: number;
  order?: number;
  stop_type: 'loading' | 'unloading';
  sequence_order: number;
  name: string;
  country: string;
  postal_code: string;
  city: string;
  address: string;
  date_from: string | null;
  date_to: string | null;
  notes: string;
}

export interface OrderCarrier {
  id?: number;
  order?: number | null;
  partner: Client;
  partner_id: number;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display: string;
  expedition_number?: string | null;
  sequence_order: number;
  price_net: string | null;
  vat_rate?: string | null;
  vat_rate_article?: string | null;
  price_with_vat: string | null;
  vat_amount: string | null;
  route_from: string;
  route_to: string;
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
  loading_date_from: string | null;
  loading_date_to: string | null;
  unloading_date_from: string | null;
  unloading_date_to: string | null;
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  status_display: string;
  invoice_issued: boolean;
  invoice_received: boolean;
  invoice_received_date?: string | null;
  payment_days?: number | null;
  due_date?: string | null;
  payment_status: 'not_paid' | 'partially_paid' | 'paid';
  payment_status_display: string;
  payment_date?: string | null;
  payment_terms?: string;
  has_custom_route?: boolean;
  has_custom_dates?: boolean;
  notes: string;
}

interface Order {
  id: number;
  order_number?: string | null;
  client_order_number?: string;
  client: Client;
  client_id: number;
  carrier: Client | null;
  carrier_id: number | null;
  order_type: string;
  order_type_display: string;
  manager: User | null;
  manager_id: number | null;
  status: string;
  status_display: string;
  price_net: string;
  client_price_net: string | null;
  my_price_net?: string | number | null;
  other_costs?: OtherCost[];
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
  client_payment_status: 'not_paid' | 'partially_paid' | 'paid';
  client_payment_status_display: string;
  route_from: string;
  route_to: string;
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  sender_route_from?: string;
  receiver_route_to?: string;
  order_date: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  loading_date_from: string | null;
  loading_date_to: string | null;
  unloading_date_from: string | null;
  unloading_date_to: string | null;
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
  cargo_items?: CargoItem[];
  carriers?: OrderCarrier[];
  route_stops?: RouteStop[];
}

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Order) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, timeoutMs?: number) => void;
  onOrderUpdate?: (updatedOrder: Order) => void;
}

type TabType = 'client' | 'cargo' | 'route' | 'carriers' | 'finance' | 'emails' | 'notes';

// Modal sustojimui kurti/redaguoti
const RouteStopModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  stop: RouteStop | null;
  onSave: (stop: RouteStop) => void;
  stopType: 'loading' | 'unloading';
}> = ({ isOpen, onClose, stop, onSave, stopType }) => {
  const [formData, setFormData] = useState<RouteStop>({
    stop_type: stopType,
    sequence_order: 0,
    name: '',
    country: '',
    postal_code: '',
    city: '',
    address: '',
    date_from: '',
    date_to: '',
    notes: ''
  });

  // Debug: stebėti formData pokyčius
  useEffect(() => {
  }, [formData]);

  useEffect(() => {
    // Užkrauti duomenis tik kai modalas atidaromas arba stop keičiasi
    if (!isOpen) return;
    
    if (stop) {
      // Konvertuoti datą į datetime-local formatą
      const formatForDateTimeLocal = (dateStr: string | null): string => {
        if (!dateStr) return '';
        // Jei yra laiko juosta (pvz., +02:00 arba Z), pašalinti ją
        if (dateStr.includes('+') || dateStr.endsWith('Z')) {
          // Pašalinti laiko juostą ir konvertuoti į datetime-local formatą
          const withoutTz = dateStr.split('+')[0].split('Z')[0];
          // Jei yra sekundės, pašalinti jas
          if (withoutTz.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
            return withoutTz.slice(0, 16);
          }
          return withoutTz.slice(0, 16);
        }
        // Jei jau yra T (datetime formatas be laiko juostos), naudoti jį
        if (dateStr.includes('T')) {
          // Jei yra sekundės, pašalinti jas
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            return dateStr.slice(0, 16);
          }
          return dateStr.slice(0, 16);
        }
        // Jei tik data (YYYY-MM-DD), pridėti laiką 00:00
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return `${dateStr}T00:00`;
        }
        // Jei kitoks formatas, bandyti konvertuoti
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
          }
        } catch (e) {
          // Ignoruoti klaidas
        }
        return dateStr;
      };

      const formattedDateFrom = formatForDateTimeLocal(stop.date_from);
      const formattedDateTo = formatForDateTimeLocal(stop.date_to);
      setFormData({
        ...stop,
        date_from: formattedDateFrom,
        date_to: formattedDateTo
      });
    } else {
      // Naujas sustojimas: numatyti data ir laikas 00:00, kad datetime-local nerodytų "--:--"
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const defaultDateTime = dateStr + 'T00:00';
      setFormData({
        stop_type: stopType,
        sequence_order: 0,
        name: '',
        country: '',
        postal_code: '',
        city: '',
        address: '',
        date_from: defaultDateTime,
        date_to: defaultDateTime,
        notes: ''
      });
    }
  }, [stop, stopType, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>{stop ? 'Redaguoti sustojimą' : (stopType === 'loading' ? 'Naujas pakrovimas' : 'Naujas iškrovimas')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="card-section">
            <RouteContactField 
              contactType={stopType === 'loading' ? 'sender' : 'receiver'} 
              value={formData.name} 
              onChange={v => setFormData({...formData, name: v})} 
              label={stopType === 'loading' ? 'Siuntėjas' : 'Gavėjas'} 
              onContactSelect={c => setFormData({
                ...formData, 
                name: c.name, 
                country: c.country || '', 
                city: c.city || '', 
                address: c.address || '',
                postal_code: c.postal_code || ''
              })} 
            />
            <div className="form-grid-2" style={{ marginTop: '10px' }}>
              <AutocompleteField fieldType={stopType === 'loading' ? 'route_from_country' : 'route_to_country'} value={formData.country} onChange={v => setFormData({...formData, country: v})} label="Šalis" />
              <AutocompleteField fieldType={stopType === 'loading' ? 'route_from_city' : 'route_to_city'} value={formData.city} onChange={v => setFormData({...formData, city: v})} label="Miestas" />
            </div>
            <div className="form-group" style={{ marginTop: '10px' }}>
              <label>Adresas</label>
              <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="form-control" />
            </div>
            <div className="form-grid-2" style={{ marginTop: '10px' }}>
              <div className="form-group"><label>Data nuo</label><input type="datetime-local" value={formData.date_from || ''} onChange={e => {
                setFormData({...formData, date_from: e.target.value});
              }} className="form-control" /></div>
              <div className="form-group"><label>Data iki</label><input type="datetime-local" value={formData.date_to || ''} onChange={e => {
                setFormData({...formData, date_to: e.target.value});
              }} className="form-control" /></div>
            </div>
            <div className="form-group" style={{ marginTop: '10px' }}>
              <label>Pastabos</label>
              <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="form-control" rows={2} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>Atšaukti</button>
          <button className="button button-primary" onClick={() => {
            // Patikrinti, ar date_to yra užpildytas
            if (!formData.date_to || formData.date_to.trim() === '') {
            }
            onSave(formData);
          }}>Išsaugoti</button>
        </div>
      </div>
    </div>
  );
};

const OrderEditModal_NEW: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  onSave,
  showToast,
  onOrderUpdate
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('client');

  // Invoice states
  const [showSalesInvoiceModal, setShowSalesInvoiceModal] = useState(false);
  const [editingSalesInvoice, setEditingSalesInvoice] = useState<any>(null);
  const [showPurchaseInvoiceModal, setShowPurchaseInvoiceModal] = useState(false);
  const [currentPurchaseInvoice, setCurrentPurchaseInvoice] = useState<any>(null);
  const [editingPurchaseInvoice, setEditingPurchaseInvoice] = useState<any>(null); // For backward compatibility

  // Pre-fill props for new invoices
  const [initialInvoiceData, setInitialInvoiceData] = useState<{
    partnerId?: string;
    amountNet?: string;
    orderCarrierId?: string;
  }>({});

  const [financeRefreshTrigger, setFinanceRefreshTrigger] = useState(0);

  // Email states
  const [relatedEmails, setRelatedEmails] = useState<Array<{
    id: number;
    subject: string | null;
    sender_display?: string;
    sender?: string;
    sender_status?: 'trusted' | 'advertising' | 'default';
    date: string;
    status?: 'new' | 'linked' | 'ignored';
    status_display?: string;
    body_plain?: string;
    body_html?: string;
    snippet?: string;
    related_order_id?: number | null;
    matched_orders?: Array<{ id: number; order_number?: string }>;
    matches?: {
      orders?: string[];
      sales_invoices?: string[];
      purchase_invoices?: string[];
      expeditions?: string[];
    };
    attachments?: Array<{
      id: number;
      filename: string;
      file: string | null;
      download_url?: string | null;
      content_type: string | null;
      size: number;
    }>;
  }>>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [sentEmails, setSentEmails] = useState<Array<{
    id: number;
    email_type: string;
    subject: string;
    recipient_email: string;
    recipient_name?: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    body_text?: string;
    body_html?: string;
  }>>([]);
  const [sentEmailsLoading, setSentEmailsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<{
    type: 'received' | 'sent';
    email: any;
  } | null>(null);

  // Preview states
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewType, setHtmlPreviewType] = useState<'order' | 'carrier' | null>(null);
  const [htmlPreviewId, setHtmlPreviewId] = useState<number | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);

  // Status management
  const [allowedStatusTransitions, setAllowedStatusTransitions] = useState<string[]>([]);
  const [statusChanging, setStatusChanging] = useState(false);

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
        title: type === 'order' ? `Užsakymas #${formData.order_number || id}` : `Vežėjo sutartis #${id}`,
        htmlContent: htmlContent
      });
      
      setHtmlPreviewType(type);
      setHtmlPreviewId(id);
      setHtmlPreviewLang(lang);
    } catch (error: any) {
      const errorMsg = error.message || error.toString() || 'Nežinoma klaida';
      showToast('error', `Nepavyko atidaryti peržiūros: ${errorMsg}`);
    }
  };

  const fetchOrderDetails = async (id: number) => {
    try {
      const response = await api.get(`/orders/orders/${id}/`);
      const updatedOrder = response.data;
      
      // Atnaujinti orderCarriers, jei jie pasikeitė
      if (updatedOrder.carriers && Array.isArray(updatedOrder.carriers)) {
        setOrderCarriers(updatedOrder.carriers.map((c: any) => ({ ...c, partner_id: c.partner_id || c.partner?.id || 0 })));
      }
      
      // Atnaujinti formData su naujais duomenimis (pvz., client_invoice_issued)
      if (updatedOrder.client_invoice_issued !== undefined) {
        setFormData(prev => ({ ...prev, client_invoice_issued: updatedOrder.client_invoice_issued }));
      }
      
      // Atnaujinti selectedClient, jei pasikeitė
      if (updatedOrder.client && selectedClient && updatedOrder.client.id === selectedClient.id) {
        try {
          const clientResponse = await api.get(`/partners/partners/${updatedOrder.client.id}/`);
          setSelectedClient(clientResponse.data);
        } catch (err) {
          // Ignoruoti klaidą
        }
      }
      
      if (onOrderUpdate) onOrderUpdate(updatedOrder);
    } catch (error) {
    }
  };

  const handleOpenSalesInvoice = async (invoice?: any) => {
    if (invoice && invoice.id) {
      // Gauti pilną invoice objektą su visais duomenis iš backend
      try {
        const response = await api.get(`/invoices/sales/${invoice.id}/`);
        const fullInvoice = response.data;
        setEditingSalesInvoice(fullInvoice);
        setInitialInvoiceData({});
      } catch (error: any) {
        showToast('error', 'Klaida užkraunant sąskaitos duomenis: ' + (error.response?.data?.detail || error.message));
        return;
      }
    } else {
      setEditingSalesInvoice(null);
      setInitialInvoiceData({
        partnerId: formData.client_id,
        amountNet: formData.client_price_net
      });
    }
    setShowSalesInvoiceModal(true);
  };

  const handleOpenPurchaseInvoice = async (invoice?: any) => {
    if (invoice && invoice.id) {
      // Gauti pilną invoice objektą su visais duomenis iš backend
      try {
        const response = await api.get(`/invoices/purchase/${invoice.id}/`);
        const fullInvoice = response.data;
        setCurrentPurchaseInvoice(fullInvoice);
        setEditingPurchaseInvoice(fullInvoice); // For backward compatibility
        setInitialInvoiceData({});
      } catch (error: any) {
        showToast('error', 'Klaida užkraunant sąskaitos duomenis: ' + (error.response?.data?.detail || error.message));
        return;
      }
    } else {
      setCurrentPurchaseInvoice(null);
      setEditingPurchaseInvoice(null); // For backward compatibility
      setInitialInvoiceData({
        partnerId: invoice?.partner_id?.toString() || '',
        amountNet: invoice?.amount_net?.toString() || '',
        orderCarrierId: invoice?.order_carrier_id?.toString() || ''
      });
    }
    setShowPurchaseInvoiceModal(true);
  };
  
  // State'ai (identiški originalui)
  const [formData, setFormData] = useState({
    client_id: '',
    carrier_id: '',
    order_type: '',
    order_number: '',
    client_order_number: '',
    manager_id: '',
    status: 'new',
    price_net: '',
    client_price_net: '',
    my_price_net: '',
    other_costs: [] as OtherCost[],
    vat_rate: '21',
    vat_rate_article: '',
    client_invoice_issued: false,
    client_invoice_received: false,
    client_payment_status: 'not_paid' as 'not_paid' | 'partially_paid' | 'paid',
    route_from: '',
    route_to: '',
    route_from_country: '',
    route_from_postal_code: '',
    route_from_city: '',
    route_from_address: '',
    route_to_country: '',
    route_to_postal_code: '',
    route_to_city: '',
    route_to_address: '',
    sender_route_from: '',
    receiver_route_to: '',
    order_date: '',
    loading_date: '',
    unloading_date: '',
    loading_date_from: '',
    loading_date_to: '',
    unloading_date_from: '',
    unloading_date_to: '',
    is_partial: false,
    weight_kg: '',
    ldm: '',
    length_m: '',
    width_m: '',
    height_m: '',
    is_palletized: false,
    is_stackable: false,
    vehicle_type: '',
    requires_forklift: false,
    requires_crane: false,
    requires_special_equipment: false,
    fragile: false,
    hazardous: false,
    temperature_controlled: false,
    requires_permit: false,
    notes: '',
  });
  
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientUnpaidInvoices, setClientUnpaidInvoices] = useState<{
    count: number;
    total_amount: string;
    max_overdue_days: number;
  } | null>(null);
  const [orderCarriers, setOrderCarriers] = useState<OrderCarrier[]>([]);
  const [carrierUnpaidInvoices, setCarrierUnpaidInvoices] = useState<{
    [carrierId: number]: {
      count: number;
      total_amount: string;
      max_overdue_days: number;
    };
  }>({});
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeNotRequired, setRouteNotRequired] = useState<boolean>(false);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [allManagers, setAllManagers] = useState<User[]>([]);
  const [editingOtherCost, setEditingOtherCost] = useState<{ description: string; amount: string } | null>(null);
  const [editingOtherCostIndex, setEditingOtherCostIndex] = useState<number | null>(null);
  
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<OrderCarrier | null>(null);
  const [editingCarrierIndex, setEditingCarrierIndex] = useState<number | null>(null);
  const [carrierFormType, setCarrierFormType] = useState<'carrier' | 'warehouse'>('carrier');
  
  const [showCargoItemModal, setShowCargoItemModal] = useState(false);
  const [editingCargoItem, setEditingCargoItem] = useState<CargoItem | null>(null);
  const [editingCargoItemIndex, setEditingCargoItemIndex] = useState<number | null>(null);
  
  const [showStopModal, setShowStopModal] = useState(false);
  const [editingStop, setEditingStop] = useState<RouteStop | null>(null);
  const [editingStopIndex, setEditingStopIndex] = useState<number | null>(null);
  const [editingStopType, setEditingStopType] = useState<'loading' | 'unloading'>('loading');
  
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showPartnerEditModal, setShowPartnerEditModal] = useState(false);

  const [confirmState, setConfirmState] = useState<{ 
    open: boolean; 
    title?: string; 
    message?: string; 
    onConfirm?: () => void;
  }>({ open: false });
  
  const [emailNotifyDueSoon, setEmailNotifyDueSoon] = useState(false);
  const [emailNotifyUnpaid, setEmailNotifyUnpaid] = useState(false);
  const [emailNotifyOverdue, setEmailNotifyOverdue] = useState(false);
  
  const myPriceManuallyEdited = useRef(false);
  const routeFromSuggestions = useRef<string[]>([]);
  const routeToSuggestions = useRef<string[]>([]);
  const vehicleTypeSuggestions = useRef<string[]>([]);
  
  const isEditMode = !!order;

  // ========== FUNKCIJOS (identiškos originalui) ==========

  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {}
  }, []);

  const fetchAllManagers = useCallback(async () => {
    try {
      const response = await api.get('/auth/users/', { params: { page_size: 200 } });
      const managersData = response.data.results || response.data || [];
      setAllManagers(Array.isArray(managersData) ? managersData : []);
    } catch (error) {
      setAllManagers([]);
    }
  }, []);

  const fetchRouteSuggestions = useCallback(async () => {
    try {
      const citiesResponse = await api.get('/orders/cities/', { params: { page_size: 500 } });
      const cities = citiesResponse.data.results || citiesResponse.data || [];
      const cityNames = cities.map((city: any) => city.name).sort();
      routeFromSuggestions.current = cityNames;
      routeToSuggestions.current = cityNames;
      
      const vehicleTypesResponse = await api.get('/orders/vehicle-types/', { params: { page_size: 500 } });
      const vehicleTypes = vehicleTypesResponse.data.results || vehicleTypesResponse.data || [];
      const vehicleTypeNames = vehicleTypes.map((type: any) => type.name).sort();
      vehicleTypeSuggestions.current = vehicleTypeNames;
    } catch (error) {}
  }, []);

  const ensureCityExists = useCallback(async (cityName: string): Promise<void> => {
    if (!cityName || !cityName.trim()) return;
    try {
      const searchResponse = await api.get('/orders/cities/', { params: { search: cityName.trim() } });
      const existingCities = searchResponse.data.results || searchResponse.data || [];
      const exists = existingCities.some((city: any) => city.name.toLowerCase() === cityName.trim().toLowerCase());
      if (!exists) {
        await api.post('/orders/cities/', { name: cityName.trim() });
      }
    } catch (error) {}
  }, []);

  const handleClientSelect = useCallback(async (client: Client) => {
    setFormData(prev => ({ ...prev, client_id: client.id.toString() }));
    setClientSearch(client.name);
    setSelectedClientName(client.name);
    setClients([]);

    try {
      const response = await api.get(`/partners/partners/${client.id}/`);
      setSelectedClient(response.data);
      if (response.data.is_client) {
        setEmailNotifyDueSoon(response.data.email_notify_due_soon !== false);
        setEmailNotifyUnpaid(response.data.email_notify_unpaid !== false);
        setEmailNotifyOverdue(response.data.email_notify_overdue !== false);
        
        // Gauti neapmokėtų sąskaitų informaciją
        try {
          const unpaidResponse = await api.get(`/partners/partners/${client.id}/unpaid-invoices-info/`);
          setClientUnpaidInvoices(unpaidResponse.data);
        } catch (err) {
          setClientUnpaidInvoices(null);
        }
      } else {
        setEmailNotifyDueSoon(false);
        setEmailNotifyUnpaid(false);
        setEmailNotifyOverdue(false);
        setClientUnpaidInvoices(null);
      }
    } catch (error) {
      setSelectedClient(client);
      setEmailNotifyDueSoon(false);
      setClientUnpaidInvoices(null);
      setEmailNotifyUnpaid(false);
      setEmailNotifyOverdue(false);
    }
  }, []);

  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setClients([]);
      return;
    }
    try {
      const response = await api.get('/partners/partners/', { params: { search: query, page_size: 10, include_code_errors: 1 } });
      const clientsData = response.data.results || response.data || [];
      setClients(Array.isArray(clientsData) ? clientsData : []);
    } catch (error) {
      setClients([]);
    }
  }, []);

  const handlePartnerSave = useCallback(async (partner: any) => {
    setShowPartnerModal(false);
    const newClient = { ...partner };
    await handleClientSelect(newClient);
  }, [handleClientSelect]);

  const handlePartnerEditSave = useCallback(async (partner: any) => {
    setShowPartnerEditModal(false);
    // Atnaujinti pasirinktą klientą su naujais duomenimis
    try {
      const refreshedResponse = await api.get(`/partners/partners/${partner.id}/`);
      setSelectedClient(refreshedResponse.data);
      setClientSearch(refreshedResponse.data.name);
      setSelectedClientName(refreshedResponse.data.name);
      showToast('success', 'Kliento duomenys atnaujinti');
    } catch (error: any) {
      showToast('error', 'Nepavyko atnaujinti kliento duomenų');
    }
  }, [showToast]);

  // Užkrauti neapmokėtų sąskaitų informaciją, kai pasirinktas klientas
  useEffect(() => {
    const loadUnpaidInvoices = async () => {
      if (selectedClient && selectedClient.is_client && selectedClient.id) {
        try {
          const unpaidResponse = await api.get(`/partners/partners/${selectedClient.id}/unpaid-invoices-info/`);
          setClientUnpaidInvoices(unpaidResponse.data);
        } catch (err: any) {
          console.error('❌ Nepavyko gauti neapmokėtų sąskaitų informacijos:', err);
          setClientUnpaidInvoices(null);
        }
      } else {
        setClientUnpaidInvoices(null);
      }
    };
    
    loadUnpaidInvoices();
  }, [selectedClient]);

  // Užkrauti neapmokėtų sąskaitų informaciją kiekvienam vežėjui
  useEffect(() => {
    const loadCarrierUnpaidInvoices = async () => {
      const unpaidData: { [carrierId: number]: { count: number; total_amount: string; max_overdue_days: number } } = {};
      
      for (const carrier of orderCarriers) {
        const partnerId = carrier.partner?.id || carrier.partner_id;
        if (partnerId) {
          // Jei partner neturi pilnos informacijos, užkrauti ją
          let partner = carrier.partner;
          if (!partner || !partner.is_supplier) {
            try {
              const partnerResponse = await api.get(`/partners/partners/${partnerId}/`);
              partner = partnerResponse.data;
            } catch (err) {
              continue;
            }
          }
          
          // Tik jei partner yra tiekėjas (is_supplier)
          if (partner && partner.is_supplier) {
            try {
              const response = await api.get(`/partners/partners/${partnerId}/unpaid-purchase-invoices-info/`);
              unpaidData[partnerId] = response.data;
            } catch (err) {
              unpaidData[partnerId] = { count: 0, total_amount: '0.00', max_overdue_days: 0 };
            }
          }
        }
      }
      
      setCarrierUnpaidInvoices(unpaidData);
    };
    
    if (orderCarriers.length > 0) {
      loadCarrierUnpaidInvoices();
    } else {
      setCarrierUnpaidInvoices({});
    }
  }, [orderCarriers]);

  useEffect(() => {
    if (clientSearch && clientSearch !== selectedClientName) {
      const timeout = setTimeout(() => searchClients(clientSearch), 300);
      return () => clearTimeout(timeout);
    } else if (!clientSearch) {
      setClients([]);
    }
  }, [clientSearch, selectedClientName, searchClients]);

  useEffect(() => {
    if (orderCarriers.length > 0) {
      setOrderCarriers(prevCarriers =>
        prevCarriers.map(carrier => {
          if (!carrier.has_custom_dates) {
            return {
              ...carrier,
              loading_date_from: formData.loading_date_from || null,
              loading_date_to: formData.loading_date_to || null,
              unloading_date_from: formData.unloading_date_from || null,
              unloading_date_to: formData.unloading_date_to || null,
              loading_date: formData.loading_date_from ? `${formData.loading_date_from}T00:00` : null,
              unloading_date: formData.unloading_date_from ? `${formData.unloading_date_from}T00:00` : null
            };
          }
          return carrier;
        })
      );
    }
  }, [formData.loading_date_from, formData.loading_date_to, formData.unloading_date_from, formData.unloading_date_to]);

  const handleCheckClientOnline = useCallback(async () => {
    if (!selectedClient) {
      showToast('info', 'Pasirinkite klientą');
      return;
    }
    const vatCode = selectedClient.vat_code?.trim();
    if (!vatCode) {
      showToast('info', 'Klientas neturi PVM kodo');
      return;
    }
    try {
      const res = await api.get('/partners/partners/resolve_name/', { params: { vat_code: vatCode } });
      const data = res.data;
      if (data.valid && data.name) {
        await api.put(`/partners/partners/${selectedClient.id}/`, {
          name: data.name,
          address: data.address || selectedClient.address || '',
          code: selectedClient.code,
          vat_code: selectedClient.vat_code,
          payment_term_days: selectedClient.payment_term_days || 0,
          is_client: selectedClient.is_client || false,
          is_supplier: selectedClient.is_supplier || false,
          status: selectedClient.status || 'active',
          notes: selectedClient.notes || '',
        });
        const refreshedResponse = await api.get(`/partners/partners/${selectedClient.id}/`);
        setSelectedClient(refreshedResponse.data);
        setClientSearch(refreshedResponse.data.name);
        setSelectedClientName(refreshedResponse.data.name);
        showToast('success', 'Kliento duomenys sėkmingai patikslinti ir atnaujinti');
      } else {
        showToast('info', 'VIES nerado duomenų pagal šį PVM kodą');
      }
    } catch (error: any) {
      showToast('error', 'Nepavyko patikrinti internete: ' + (error.response?.data?.error || error.message));
    }
  }, [selectedClient, showToast]);

  const calculateMyPrice = useCallback((forceRecalculate = false) => {
    if (!isOpen) return;
    if (myPriceManuallyEdited.current && !forceRecalculate) return;
    const clientPrice = formData.client_price_net ? parseFloat(String(formData.client_price_net)) : 0;
    let transportCost = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
    const otherCosts = formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
    const calculatedMyPrice = clientPrice - transportCost - otherCosts;
    const validMyPrice = calculatedMyPrice >= 0 ? calculatedMyPrice : 0;
    setFormData(prev => {
      const currentMyPrice = prev.my_price_net ? parseFloat(prev.my_price_net) : 0;
      if (Math.abs(currentMyPrice - validMyPrice) > 0.01) {
        return { ...prev, my_price_net: validMyPrice.toFixed(2) };
      }
      return prev;
    });
  }, [isOpen, orderCarriers, formData.client_price_net, formData.other_costs]);

  const handleMyPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, my_price_net: value }));
    myPriceManuallyEdited.current = !!value;
  }, []);

  const handleClientPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Konvertuoti kablelį į tašką ir išvalyti neteisingus simbolius
    const cleanValue = rawValue.replace(',', '.').replace(/[^\d.-]/g, '');

    setFormData(prev => ({ ...prev, client_price_net: cleanValue }));
    myPriceManuallyEdited.current = false;
    setTimeout(() => calculateMyPrice(), 50);
  }, [calculateMyPrice]);

  const handleAddCarrier = useCallback((type: 'carrier' | 'warehouse') => {
    setCarrierFormType(type);
    setEditingCarrier(null);
    setEditingCarrierIndex(null);
    setShowCarrierModal(true);
  }, []);

  const handleEditCarrier = useCallback((carrier: OrderCarrier, index: number) => {
    setEditingCarrier({ ...carrier, sequence_order: carrier.sequence_order ?? index });
    setEditingCarrierIndex(index);
    setCarrierFormType(carrier.carrier_type);
    setShowCarrierModal(true);
  }, []);

  const handleSaveCarrier = useCallback(async (carrier: OrderCarrier): Promise<void> => {
    const updatedCarrier = {
      ...carrier,
      sequence_order: editingCarrierIndex !== null ? editingCarrierIndex : orderCarriers.length
    };
    let newCarriers = [...orderCarriers];
    if (editingCarrierIndex !== null) {
      newCarriers[editingCarrierIndex] = updatedCarrier;
    } else {
      newCarriers.push(updatedCarrier);
    }
    setOrderCarriers(newCarriers);
    setShowCarrierModal(false);
    setEditingCarrier(null);
    setEditingCarrierIndex(null);
    myPriceManuallyEdited.current = false;
    setTimeout(() => calculateMyPrice(true), 100);
  }, [editingCarrierIndex, orderCarriers, calculateMyPrice]);

  const handleDeleteCarrier = useCallback((index: number) => {
    setConfirmState({
      open: true,
      title: 'Patvirtinkite',
      message: 'Ar tikrai norite pašalinti šį vežėją/sandėlį?',
      onConfirm: () => {
        setOrderCarriers(orderCarriers.filter((_, i) => i !== index));
        setConfirmState({ open: false });
        myPriceManuallyEdited.current = false;
        setTimeout(() => calculateMyPrice(true), 100);
      }
    });
  }, [orderCarriers, calculateMyPrice]);

  const handleMoveCarrierUp = useCallback((index: number) => {
    if (index === 0) return;
    const newCarriers = [...orderCarriers];
    const temp = newCarriers[index];
    newCarriers[index] = newCarriers[index - 1];
    newCarriers[index - 1] = temp;
    // Atnaujiname sequence_order
    newCarriers.forEach((c, i) => c.sequence_order = i);
    setOrderCarriers(newCarriers);
  }, [orderCarriers]);

  const handleMoveCarrierDown = useCallback((index: number) => {
    if (index === orderCarriers.length - 1) return;
    const newCarriers = [...orderCarriers];
    const temp = newCarriers[index];
    newCarriers[index] = newCarriers[index + 1];
    newCarriers[index + 1] = temp;
    // Atnaujiname sequence_order
    newCarriers.forEach((c, i) => c.sequence_order = i);
    setOrderCarriers(newCarriers);
  }, [orderCarriers]);

  const handleAddCargoItem = useCallback(() => {
    setEditingCargoItem({ sequence_order: cargoItems.length, description: '' });
    setEditingCargoItemIndex(null);
    setShowCargoItemModal(true);
  }, [cargoItems.length]);

  const handleEditCargoItem = useCallback((item: CargoItem, index: number) => {
    setEditingCargoItem({ ...item });
    setEditingCargoItemIndex(index);
    setShowCargoItemModal(true);
  }, []);

  const handleSaveCargoItem = useCallback((cargoItem: CargoItem) => {
    // Papildome info laukus, kad UI iškart rodytų miestus
    const updatedItem = { ...cargoItem };
    if (cargoItem.loading_stop) {
      const stop = routeStops.find(s => s.id === cargoItem.loading_stop);
      if (stop) updatedItem.loading_stop_info = { city: stop.city, country: stop.country };
    } else {
      updatedItem.loading_stop_info = null;
    }
    
    if (cargoItem.unloading_stop) {
      const stop = routeStops.find(s => s.id === cargoItem.unloading_stop);
      if (stop) updatedItem.unloading_stop_info = { city: stop.city, country: stop.country };
    } else {
      updatedItem.unloading_stop_info = null;
    }

    let updated = [...cargoItems];
    if (editingCargoItemIndex !== null) {
      updated[editingCargoItemIndex] = { ...updatedItem, sequence_order: editingCargoItemIndex };
    } else {
      updated.push({ ...updatedItem, sequence_order: cargoItems.length });
    }
    setCargoItems(updated);
    setShowCargoItemModal(false);
    setEditingCargoItem(null);
    setEditingCargoItemIndex(null);
  }, [cargoItems, editingCargoItemIndex, routeStops]);

  const handleDeleteCargoItem = useCallback((index: number) => {
    setConfirmState({
      open: true,
      title: 'Patvirtinkite',
      message: 'Ar tikrai norite pašalinti šį krovinių aprašymą?',
      onConfirm: () => {
        setCargoItems(cargoItems.filter((_, i) => i !== index).map((item, i) => ({ ...item, sequence_order: i })));
        setConfirmState({ open: false });
      }
    });
  }, [cargoItems]);

  const handleAddStop = useCallback((type: 'loading' | 'unloading') => {
    setEditingStop(null);
    setEditingStopIndex(null);
    setEditingStopType(type); // Reikia pridėti šią būseną
    setShowStopModal(true);
  }, []);

  const handleMoveStopUp = useCallback((index: number) => {
    if (index === 0) return;
    const newStops = [...routeStops];
    const temp = newStops[index];
    newStops[index] = newStops[index - 1];
    newStops[index - 1] = temp;
    // Atnaujiname sequence_order
    newStops.forEach((s, i) => s.sequence_order = i);
    setRouteStops(newStops);
  }, [routeStops]);

  const handleMoveStopDown = useCallback((index: number) => {
    if (index === routeStops.length - 1) return;
    const newStops = [...routeStops];
    const temp = newStops[index];
    newStops[index] = newStops[index + 1];
    newStops[index + 1] = temp;
    // Atnaujiname sequence_order
    newStops.forEach((s, i) => s.sequence_order = i);
    setRouteStops(newStops);
  }, [routeStops]);

  const handleEditStop = useCallback((stop: RouteStop, index: number) => {
    setEditingStop(stop);
    setEditingStopIndex(index);
    setEditingStopType(stop.stop_type);
    setShowStopModal(true);
  }, []);

  const handleDeleteStop = useCallback((index: number) => {
    setConfirmState({
      open: true,
      title: 'Patvirtinkite',
      message: 'Ar tikrai norite pašalinti šį sustojimą?',
      onConfirm: () => {
        setRouteStops(routeStops.filter((_, i) => i !== index).map((stop, i) => ({ ...stop, sequence_order: i })));
        setConfirmState({ open: false });
      }
    });
  }, [routeStops]);

  const handleSaveStop = useCallback((stop: RouteStop) => {
    let updated = [...routeStops];
    // Jei sustojimas naujas (neturi ID), suteikiame laikiną neigiamą ID susiejimui
    const stopWithId = { ...stop };
    if (!stopWithId.id) {
      stopWithId.id = -Math.floor(Math.random() * 1000000);
    }

    if (editingStopIndex !== null) {
      // Patikrinti, ar date_to yra užpildytas
      updated[editingStopIndex] = { ...stopWithId, sequence_order: editingStopIndex };
    } else {
      updated.push({ ...stopWithId, sequence_order: routeStops.length });
    }
    setRouteStops(updated);
    setShowStopModal(false);
    setEditingStop(null);
    setEditingStopIndex(null);
  }, [routeStops, editingStopIndex]);

  const resetForm = useCallback((suggestedOrderNumber?: string) => {
    myPriceManuallyEdited.current = false;
    setSelectedClient(null);
    setClientSearch('');
    setSelectedClientName('');
    setClients([]);
    setFormData({
      client_id: '',
      carrier_id: '',
      order_type: '',
      order_number: suggestedOrderNumber ?? '',
      client_order_number: '',
      manager_id: user?.id ? user.id.toString() : '',
      status: 'new',
      price_net: '',
      client_price_net: '',
      my_price_net: '',
      other_costs: [],
      vat_rate: '21',
      vat_rate_article: '',
      client_invoice_issued: false,
      client_invoice_received: false,
      client_payment_status: 'not_paid',
      route_from: '',
      route_to: '',
      route_from_country: '',
      route_from_postal_code: '',
      route_from_city: '',
      route_from_address: '',
      route_to_country: '',
      route_to_postal_code: '',
      route_to_city: '',
      route_to_address: '',
      sender_route_from: '',
      receiver_route_to: '',
      order_date: new Date().toISOString().split('T')[0] + 'T00:00',
      loading_date: '',
      unloading_date: '',
      loading_date_from: '',
      loading_date_to: '',
      unloading_date_from: '',
      unloading_date_to: '',
      is_partial: false,
      weight_kg: '',
      ldm: '',
      length_m: '',
      width_m: '',
      height_m: '',
      is_palletized: false,
      is_stackable: false,
      vehicle_type: '',
      requires_forklift: false,
      requires_crane: false,
      requires_special_equipment: false,
      fragile: false,
      hazardous: false,
      temperature_controlled: false,
      requires_permit: false,
      notes: '',
    });
    setOrderCarriers([]);
    setCargoItems([]);
    setRouteStops([]);
    setRouteNotRequired(false);
    setEmailNotifyDueSoon(false);
    setEmailNotifyUnpaid(false);
    setEmailNotifyOverdue(false);
    setActiveTab('client');
  }, [user]);

  useEffect(() => {
    if (isOpen && order && isEditMode) {
      setFormData({
        client_id: String(order.client_id || order.client.id),
        carrier_id: order.carrier_id ? order.carrier_id.toString() : '',
        order_type: order.order_type,
        order_number: order.order_number || '',
        client_order_number: order.client_order_number || '',
        manager_id: (order.manager_id || order.manager?.id)?.toString() || '',
        status: order.status,
        price_net: order.price_net ? String(order.price_net) : '',
        client_price_net: order.client_price_net != null && order.client_price_net !== '' ? parseFloat(String(order.client_price_net)).toFixed(2) : '',
        my_price_net: order.my_price_net != null && order.my_price_net !== '' ? parseFloat(String(order.my_price_net)).toFixed(2) : '',
        other_costs: (order.other_costs || []).map((c: any) => ({
          description: c.description ?? '',
          amount: c.amount ?? '',
          visible_on_invoice: c.visible_on_invoice !== false,
        })),
        vat_rate: order.vat_rate,
        vat_rate_article: order.vat_rate_article || '',
        client_invoice_issued: order.client_invoice_issued,
        client_invoice_received: order.client_invoice_received,
        client_payment_status: order.client_payment_status || 'not_paid',
        route_from: order.route_from || '',
        route_to: order.route_to || '',
        route_from_country: order.route_from_country || '',
        route_from_postal_code: order.route_from_postal_code || '',
        route_from_city: order.route_from_city || '',
        route_from_address: order.route_from_address || '',
        route_to_country: order.route_to_country || '',
        route_to_postal_code: order.route_to_postal_code || '',
        route_to_city: order.route_to_city || '',
        route_to_address: order.route_to_address || '',
        sender_route_from: order.sender_route_from || '',
        receiver_route_to: order.receiver_route_to || '',
        order_date: order.order_date ? (order.order_date.includes('T') ? order.order_date.split('T')[0] + 'T00:00' : order.order_date) : (new Date().toISOString().split('T')[0] + 'T00:00'),
        loading_date: order.loading_date ? (order.loading_date.includes('T') ? order.loading_date.split('T')[0] + 'T00:00' : order.loading_date) : '',
        unloading_date: order.unloading_date ? (order.unloading_date.includes('T') ? order.unloading_date.split('T')[0] + 'T00:00' : order.unloading_date) : '',
        loading_date_from: order.loading_date_from ? (() => {
          const date = order.loading_date_from;
          if (date.includes('+') || date.endsWith('Z')) {
            return date.split('+')[0].split('Z')[0].slice(0, 16);
          }
          return date.includes('T') ? date.slice(0, 16) : date;
        })() : '',
        loading_date_to: order.loading_date_to ? (() => {
          const date = order.loading_date_to;
          if (date.includes('+') || date.endsWith('Z')) {
            return date.split('+')[0].split('Z')[0].slice(0, 16);
          }
          return date.includes('T') ? date.slice(0, 16) : date;
        })() : '',
        unloading_date_from: order.unloading_date_from ? (() => {
          const date = order.unloading_date_from;
          if (date.includes('+') || date.endsWith('Z')) {
            return date.split('+')[0].split('Z')[0].slice(0, 16);
          }
          return date.includes('T') ? date.slice(0, 16) : date;
        })() : '',
        unloading_date_to: order.unloading_date_to ? (() => {
          const date = order.unloading_date_to;
          if (date.includes('+') || date.endsWith('Z')) {
            return date.split('+')[0].split('Z')[0].slice(0, 16);
          }
          return date.includes('T') ? date.slice(0, 16) : date;
        })() : '',
        is_partial: order.is_partial || false,
        weight_kg: order.weight_kg ? String(order.weight_kg) : '',
        ldm: order.ldm ? String(order.ldm) : '',
        length_m: order.length_m ? String(order.length_m) : '',
        width_m: order.width_m ? String(order.width_m) : '',
        height_m: order.height_m ? String(order.height_m) : '',
        is_palletized: order.is_palletized || false,
        is_stackable: order.is_stackable || false,
        vehicle_type: order.vehicle_type || '',
        requires_forklift: order.requires_forklift || false,
        requires_crane: order.requires_crane || false,
        requires_special_equipment: order.requires_special_equipment || false,
        fragile: order.fragile || false,
        hazardous: order.hazardous || false,
        temperature_controlled: order.temperature_controlled || false,
        requires_permit: order.requires_permit || false,
        notes: order.notes || '',
      });
      
      const clientName = order.client?.name || '';
      setClientSearch(clientName);
      setSelectedClientName(clientName);

      const cId = order.client_id || order.client?.id;
      if (cId) {
        // Jei order.client jau turi detalią info, naudojame ją iškart (be laukimo)
        if (order.client && order.client.code) {
          setSelectedClient(order.client);
          setEmailNotifyDueSoon(order.client.email_notify_due_soon !== false);
          setEmailNotifyUnpaid(order.client.email_notify_unpaid !== false);
          setEmailNotifyOverdue(order.client.email_notify_overdue !== false);
          // Neapmokėtų sąskaitų informacija bus užkrauta per useEffect, kai selectedClient pasikeis
        }

        api.get(`/partners/partners/${cId}/`).then(res => {
          setSelectedClient(res.data);
          setEmailNotifyDueSoon(res.data.email_notify_due_soon !== false);
          setEmailNotifyUnpaid(res.data.email_notify_unpaid !== false);
          setEmailNotifyOverdue(res.data.email_notify_overdue !== false);
        }).catch(err => {
        });
      }
      
      if (order.carriers) setOrderCarriers(order.carriers.map(c => ({ ...c, partner_id: c.partner_id || c.partner?.id || 0 })));
      
      const orderCargoItems = order.cargo_items || [];
      if (orderCargoItems.length > 0) {
        setCargoItems(orderCargoItems.map(i => ({ ...i, sequence_order: i.sequence_order || 0 })));
      } else if (order.weight_kg || order.ldm) {
        // Atgalinis suderinamumas: jei nėra krovinių sąrašo, bet yra pagrindiniai duomenys
        setCargoItems([{
          sequence_order: 0,
          description: order.notes?.substring(0, 100) || 'Krovinys',
          weight_kg: order.weight_kg,
          ldm: order.ldm,
          length_m: order.length_m,
          width_m: order.width_m,
          height_m: order.height_m,
          is_palletized: order.is_palletized,
          is_stackable: order.is_stackable,
          vehicle_type: order.vehicle_type,
          requires_forklift: order.requires_forklift,
          requires_crane: order.requires_crane,
          requires_special_equipment: order.requires_special_equipment,
          fragile: order.fragile,
          hazardous: order.hazardous,
          temperature_controlled: order.temperature_controlled,
          requires_permit: order.requires_permit,
        }]);
      } else {
        setCargoItems([]);
      }

      const stops = [...(order.route_stops || [])].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
      let stopsToSet: RouteStop[];
      if (stops.length === 0 && (order.route_from_city || order.route_to_city)) {
        const initialStops: RouteStop[] = [];
        if (order.route_from_city || order.sender_route_from) {
          initialStops.push({
            stop_type: 'loading',
            sequence_order: 0,
            name: order.sender_route_from || '',
            country: order.route_from_country || '',
            postal_code: order.route_from_postal_code || '',
            city: order.route_from_city || '',
            address: order.route_from_address || '',
            date_from: order.loading_date_from,
            date_to: order.loading_date_to,
            notes: ''
          });
        }
        if (order.route_to_city || order.receiver_route_to) {
          initialStops.push({
            stop_type: 'unloading',
            sequence_order: initialStops.length,
            name: order.receiver_route_to || '',
            country: order.route_to_country || '',
            postal_code: order.route_to_postal_code || '',
            city: order.route_to_city || '',
            address: order.route_to_address || '',
            date_from: order.unloading_date_from,
            date_to: order.unloading_date_to,
            notes: ''
          });
        }
        stopsToSet = initialStops;
      } else {
        stopsToSet = stops;
      }
      setRouteStops(stopsToSet);
      setRouteNotRequired(stopsToSet.length === 0);
    } else if (isOpen) {
      // Naujas užsakymas: gauti siūlomą numerį (pirmas tarpas arba kitas) ir užpildyti formą
      (async () => {
        try {
          const res = await api.get<{ suggested_order_number?: string }>('/orders/orders/suggested_order_number/');
          const suggested = (res.data?.suggested_order_number || '').trim();
          resetForm(suggested || undefined);
        } catch {
          resetForm();
        }
      })();
    }
  }, [isOpen, order, isEditMode, resetForm]);

  useEffect(() => {
    if (isOpen) {
      fetchPvmRates();
      fetchAllManagers();
      fetchRouteSuggestions();
    }
  }, [isOpen, fetchPvmRates, fetchAllManagers, fetchRouteSuggestions]);

  useEffect(() => { calculateMyPrice(); }, [calculateMyPrice]);

  // Load allowed status transitions when order is loaded
  useEffect(() => {
    if (order?.id && formData.status) {
      const loadAllowedTransitions = async () => {
        try {
          const result = await StatusService.getAllowedTransitions('order', formData.status);
          setAllowedStatusTransitions(result.allowed_transitions || []);
        } catch (error) {
          console.error('Error loading allowed transitions:', error);
          setAllowedStatusTransitions([]);
        }
      };
      loadAllowedTransitions();
    }
  }, [order?.id, formData.status]);

  // Handle status change
  const handleStatusChange = async (newStatus: string) => {
    if (!order?.id) return;
    
    setStatusChanging(true);
    try {
      await StatusService.changeStatus({
        entity_type: 'order',
        entity_id: order.id,
        new_status: newStatus,
        reason: 'Statusas pakeistas per užsakymų modalo UI'
      });
      
      // Refresh order data
      const response = await api.get(`/orders/orders/${order.id}/`);
      const updatedOrder = response.data;
      
      // Update formData
      setFormData(prev => ({ ...prev, status: updatedOrder.status }));
      
      // Update allowed transitions
      const transitionsResult = await StatusService.getAllowedTransitions('order', updatedOrder.status);
      setAllowedStatusTransitions(transitionsResult.allowed_transitions || []);
      
      // Call onOrderUpdate if provided
      if (onOrderUpdate) {
        onOrderUpdate(updatedOrder);
      }
      
      showToast('success', 'Statusas sėkmingai pakeistas');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Klaida keičiant statusą';
      showToast('error', errorMsg);
    } finally {
      setStatusChanging(false);
    }
  };

  // Užkrauti laiškus, kai atidaromas emails tabas
  useEffect(() => {
    if (activeTab === 'emails' && isEditMode && order?.id && formData.order_number) {
      const loadEmails = async () => {
        setEmailsLoading(true);
        setSentEmailsLoading(true);
        try {
          // Gauti gautus laiškus
          const orderNumber = formData.order_number || order?.order_number;
          if (orderNumber) {
            const response = await api.get('/mail/messages/by-order/', {
              params: { number: orderNumber }
            });
            const messages = Array.isArray(response.data?.messages) ? response.data.messages : [];
            setRelatedEmails(messages);
          }
          
          // Gauti išsiųstus laiškus
          const sentResponse = await api.get('/mail/email-logs/', {
            params: { related_order_id: order.id, page_size: 100 }
          });
          const sentData = sentResponse.data;
          const emails = Array.isArray(sentData) ? sentData : (sentData.results || []);
          setSentEmails(emails);
        } catch (error: any) {
          // Nekelti klaidos, jei laiškų nėra
        } finally {
          setEmailsLoading(false);
          setSentEmailsLoading(false);
        }
      };
      loadEmails();
    }
  }, [activeTab, isEditMode, order?.id, formData.order_number]);

  // Atnaujinti finansų duomenis, kai atidaromas finansų tab'as
  useEffect(() => {
    if (activeTab === 'finance' && order?.id) {
      setFinanceRefreshTrigger(prev => prev + 1);
    }
  }, [activeTab, order?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 handleSave pradėta, isEditMode:', isEditMode);

    if (!formData.client_id) {
      console.log('❌ Ne pasirinktas klientas');
      return showToast('info', 'Pasirinkite klientą');
    }
    
    const firstLoading = routeStops.find(s => s.stop_type === 'loading');
    const lastUnloading = [...routeStops].reverse().find(s => s.stop_type === 'unloading');

    if (!routeNotRequired) {
      if (!firstLoading || !lastUnloading) {
        return showToast('info', 'Pridėkite bent vieną pakrovimo ir vieną iškrovimo tašką „Maršrutas“ skiltyje arba pažymėkite „Nereikalauti maršruto“');
      }
      if (!firstLoading.country || !lastUnloading.country) {
        return showToast('info', 'Užpildykite šalių laukus sustojimuose (pakrovimo ir iškrovimo taškuose)');
      }
    }

    // Validacijos pranešimai (neblokuojantys)
    const warnings: string[] = [];
    
    // Patikrinti datas (tik jei yra pakrovimo ir iškrovimo taškai)
    if (firstLoading && lastUnloading && firstLoading.date_from && lastUnloading.date_to) {
      const loadingDate = new Date(firstLoading.date_from);
      const unloadingDate = new Date(lastUnloading.date_to);
      if (loadingDate > unloadingDate) {
        warnings.push('Pakrovimo data vėlesnė nei iškrovimo data');
      }
    }
    
    // Patikrinti kainas
    const clientPrice = parseFloat(formData.client_price_net || '0') || 0;
    const transportCost = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
    if (clientPrice > 0 && transportCost > 0 && clientPrice < transportCost) {
      warnings.push('Kliento kaina mažesnė už transporto kainą');
    }
    
    // Patikrinti PVM tarifą
    const vatRate = parseFloat(formData.vat_rate || '21') || 0;
    if (vatRate < 0 || vatRate > 100) {
      warnings.push('PVM tarifas turi būti tarp 0% ir 100%');
    }
    
    // Rodyti įspėjimus (neblokuojantys)
    if (warnings.length > 0) {
      warnings.forEach(warning => {
        showToast('info', `⚠️ ${warning}`);
      });
    }

    const prepareDate = (dateStr: string | null | undefined) => {
      // Patikrinti, ar tai tuščias string'as arba null/undefined
      if (!dateStr || (typeof dateStr === 'string' && dateStr.trim() === '')) {
        return null;
      }
      
      // Jei tai nebaigtas datetime-local formatas (pvz., tik data arba data su valandomis be minučių)
      // Patikrinti, ar yra T, bet nėra pilno formato
      if (dateStr.includes('T')) {
        const parts = dateStr.split('T');
        if (parts.length === 2) {
          const datePart = parts[0];
          const timePart = parts[1];
          // Jei laiko dalis yra nebaigta (pvz., tik valandos be minučių)
          if (timePart && !timePart.includes(':')) {
            // Jei tik valandos, pridėti minučių
            if (timePart.match(/^\d{1,2}$/)) {
              const result = `${datePart}T${timePart.padStart(2, '0')}:00:00`;
              return result;
            }
          }
          // Jei laiko dalis yra nebaigta (pvz., tik valandos ir vienas skaitmuo)
          if (timePart && timePart.match(/^\d{1,2}:\d{0,1}$/)) {
            const timeParts = timePart.split(':');
            const hours = timeParts[0].padStart(2, '0');
            const minutes = (timeParts[1] || '00').padStart(2, '0');
            const result = `${datePart}T${hours}:${minutes}:00`;
            return result;
          }
        }
      }
      
      // Jei tai datetime-local formatas (YYYY-MM-DDTHH:mm), konvertuoti į ISO formatą
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        const result = `${dateStr}:00`;
        return result; // Pridėti sekundes
      }
      // Jei tai tik data (YYYY-MM-DD), pridėti laiką
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const result = `${dateStr}T00:00:00`;
        return result;
      }
      // Jei jau yra laiko juosta, pašalinti ją
      if (dateStr.includes('+') || dateStr.endsWith('Z')) {
        const withoutTz = dateStr.split('+')[0].split('Z')[0];
        if (withoutTz.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
          return withoutTz;
        }
        const result = withoutTz.slice(0, 19) || withoutTz;
        return result;
      }
      return dateStr;
    };

    const prepareDateTime = (dateStr: string | null | undefined) => {
      // Patikrinti, ar tai tuščias string'as arba null/undefined
      if (!dateStr || (typeof dateStr === 'string' && dateStr.trim() === '')) {
        return null;
      }
      
      const str = String(dateStr).trim();
      
      // Jei tai datetime-local formatas (YYYY-MM-DDTHH:mm), konvertuoti į ISO formatą
      if (str.includes('T') && str.length === 16) {
        return `${str}:00`; // YYYY-MM-DDTHH:mm -> YYYY-MM-DDTHH:mm:00
      }
      // Jei tai tik data (YYYY-MM-DD), pridėti laiką
      if (str.length === 10 && str.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return `${str}T00:00:00`;
      }
      // Jei jau yra pilnas formatas su sekundėmis, palikti kaip yra
      if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        return str;
      }
      // Jei formatas neteisingas, grąžinti null
      return null;
    };

    try {
      // Maršruto laukus užpildyti iš routeStops (pirmas pakrovimas / paskutinis iškrovimas), kad sąraše būtų rodomas maršrutas
      const firstLoadingStop = routeStops.find(s => s.stop_type === 'loading');
      const lastUnloadingStop = [...routeStops].reverse().find(s => s.stop_type === 'unloading');
      const routeFromParts = firstLoadingStop ? [firstLoadingStop.country, firstLoadingStop.postal_code, firstLoadingStop.city, firstLoadingStop.address].filter(Boolean).filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
      const routeToParts = lastUnloadingStop ? [lastUnloadingStop.country, lastUnloadingStop.postal_code, lastUnloadingStop.city, lastUnloadingStop.address].filter(Boolean).filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
      const route_from = firstLoadingStop ? (routeFromParts.join(', ') || (firstLoadingStop.city && firstLoadingStop.country ? `${firstLoadingStop.city}, ${firstLoadingStop.country}` : '')) : (formData.route_from || '');
      const route_to = lastUnloadingStop ? (routeToParts.join(', ') || (lastUnloadingStop.city && lastUnloadingStop.country ? `${lastUnloadingStop.city}, ${lastUnloadingStop.country}` : '')) : (formData.route_to || '');

      const dataToSend = {
        client_id: parseInt(formData.client_id),
        manager_id: formData.manager_id ? parseInt(formData.manager_id) : null,
        client_price_net: formData.client_price_net || '0',
        my_price_net: formData.my_price_net || '0',
        vat_rate: formData.vat_rate || '21',

        // Kiti esminiai laukai
        order_type: (formData.order_type || '').trim() || '',
        order_number: (formData.order_number || '').trim() || null,
        client_order_number: formData.client_order_number ?? '',
        order_date: formData.order_date ? (formData.order_date.includes('T') ? formData.order_date : `${formData.order_date}T00:00`) : null,
        route_from,
        route_to,
        route_from_country: firstLoadingStop?.country ?? formData.route_from_country ?? '',
        route_from_postal_code: firstLoadingStop?.postal_code ?? formData.route_from_postal_code ?? '',
        route_from_city: firstLoadingStop?.city ?? formData.route_from_city ?? '',
        route_from_address: firstLoadingStop?.address ?? formData.route_from_address ?? '',
        route_to_country: lastUnloadingStop?.country ?? formData.route_to_country ?? '',
        route_to_postal_code: lastUnloadingStop?.postal_code ?? formData.route_to_postal_code ?? '',
        route_to_city: lastUnloadingStop?.city ?? formData.route_to_city ?? '',
        route_to_address: lastUnloadingStop?.address ?? formData.route_to_address ?? '',
        sender_route_from: firstLoadingStop?.name ?? formData.sender_route_from ?? '',
        receiver_route_to: lastUnloadingStop?.name ?? formData.receiver_route_to ?? '',
        notes: formData.notes || '',
        vehicle_type: formData.vehicle_type || '',
        client_invoice_issued: formData.client_invoice_issued || false,
        client_invoice_received: formData.client_invoice_received || false,
        other_costs: (formData.other_costs || []).map((c: OtherCost) => ({
          description: String(c.description || '').trim() || 'Kitos išlaidos',
          amount: typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0,
          visible_on_invoice: c.visible_on_invoice !== false,
        })),
      };

      console.log('📤 Siunčiama API užklausa:', isEditMode ? 'PUT' : 'POST');
      console.log('🎯 URL:', isEditMode ? `/orders/orders/${order!.id}/` : '/orders/orders/');
      console.log('📋 dataToSend:', dataToSend);

      let res;
      try {
        res = isEditMode
          ? await api.put(`/orders/orders/${order!.id}/`, dataToSend)
          : await api.post('/orders/orders/', dataToSend);

        console.log('✅ API atsakymas:', res.data);
      } catch (err: any) {
        console.error('❌ API klaida:', err);
        console.error('Response data:', err.response?.data);
        return showToast('error', 'Klaida išsaugant pagrindinius užsakymo duomenis: ' + (JSON.stringify(err.response?.data) || err.message));
      }
      
      const orderId = res.data.id;

      // 1. Sync Route Stops (First, because cargo items depend on them)
      const stopIdMap: Record<number, number> = {}; // Mapping from old/temp ID to new DB ID
      try {
        if (isEditMode) {
          const existing = await api.get(`/orders/route-stops/?order=${orderId}`);
          const stopsToDelete = existing.data.results || existing.data || [];
          for (const s of stopsToDelete) await api.delete(`/orders/route-stops/${s.id}/`);
        }
        for (const s of routeStops) {
          const tempId = s.id as number;
          const preparedDateFrom = prepareDate(s.date_from);
          const preparedDateTo = prepareDate(s.date_to);
          const stopData: any = { 
            ...s, 
            order: orderId,
            date_from: preparedDateFrom,
            date_to: preparedDateTo
          };
          delete stopData.id;
          // Debug: patikrinti, kas siunčiama
          const stopRes = await api.post('/orders/route-stops/', stopData);
          if (tempId) stopIdMap[tempId] = stopRes.data.id;
        }
      } catch (err: any) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        return showToast('error', 'Klaida išsaugant maršruto sustojimus: ' + detail);
      }

      // 2. Sync Cargo (References new stop IDs)
      try {
        const currentCargo = await api.get(`/orders/cargo-items/?order=${orderId}`);
        const existingCargoInDb = currentCargo.data.results || currentCargo.data || [];
        const cargoIdsToKeep = cargoItems.map(i => i.id).filter(Boolean);

        // Delete cargo that are no longer in the list
        for (const i of existingCargoInDb) {
          if (!cargoIdsToKeep.includes(i.id)) {
            await api.delete(`/orders/cargo-items/${i.id}/`);
          }
        }

        for (const i of cargoItems) {
          const itemData = { 
            ...i, 
            order: orderId,
            loading_stop: i.loading_stop ? (stopIdMap[i.loading_stop] || i.loading_stop) : null,
            unloading_stop: i.unloading_stop ? (stopIdMap[i.unloading_stop] || i.unloading_stop) : null,
            units: i.units ? parseInt(String(i.units)) : null,
            weight_kg: i.weight_kg ? parseFloat(String(i.weight_kg)) : null,
            ldm: i.ldm ? parseFloat(String(i.ldm)) : null,
            pallet_count: i.pallet_count ? parseInt(String(i.pallet_count)) : null,
            package_count: i.package_count ? parseInt(String(i.package_count)) : null,
            length_m: i.length_m ? parseFloat(String(i.length_m)) : null,
            width_m: i.width_m ? parseFloat(String(i.width_m)) : null,
            height_m: i.height_m ? parseFloat(String(i.height_m)) : null,
          };
          
          const iid = itemData.id;
          delete (itemData as any).id;
          delete (itemData as any).loading_stop_info;
          delete (itemData as any).unloading_stop_info;
          
          if (iid) {
            await api.patch(`/orders/cargo-items/${iid}/`, itemData);
          } else {
            await api.post('/orders/cargo-items/', itemData);
          }
        }
      } catch (err: any) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        return showToast('error', 'Klaida išsaugant krovinių duomenis: ' + detail);
      }

      // 3. Sync Carriers
      try {
        const currentCarriers = await api.get(`/orders/carriers/?order=${orderId}`);
        const existingCarriersInDb = currentCarriers.data.results || currentCarriers.data || [];
        const carrierIdsToKeep = orderCarriers.map(c => c.id).filter(Boolean);
        
        // Delete carriers that are no longer in the list
        for (const c of existingCarriersInDb) {
          if (!carrierIdsToKeep.includes(c.id)) {
            await api.delete(`/orders/carriers/${c.id}/`);
          }
        }

        // Save (update or create) carriers
        for (const c of orderCarriers) {
          const formattedLoadingDate = prepareDateTime(c.loading_date);
          const formattedUnloadingDate = prepareDateTime(c.unloading_date);
          
          const carrierData = { 
            ...c, 
            order_id: orderId,
            partner_id: c.partner_id || c.partner?.id,
            price_net: c.price_net ? parseFloat(String(c.price_net)) : null,
            vat_rate: c.vat_rate !== undefined && c.vat_rate !== null ? parseFloat(String(c.vat_rate)) : null,
            // Formatuoti datetime laukus
            loading_date: formattedLoadingDate,
            unloading_date: formattedUnloadingDate,
            loading_date_from: prepareDate(c.loading_date_from),
            loading_date_to: prepareDate(c.loading_date_to),
            unloading_date_from: prepareDate(c.unloading_date_from),
            unloading_date_to: prepareDate(c.unloading_date_to),
          };
          
          const cid = carrierData.id;
          delete (carrierData as any).id;
          delete (carrierData as any).partner;
          delete (carrierData as any).price_with_vat;
          delete (carrierData as any).vat_amount;
          delete (carrierData as any).status_display;
          delete (carrierData as any).carrier_type_display;
          delete (carrierData as any).payment_status_display;
          delete (carrierData as any).payment_status_info;
          delete (carrierData as any).effective_route_from;
          delete (carrierData as any).effective_route_to;
          delete (carrierData as any).calculated_status;
          delete (carrierData as any).calculated_status_display;
          
          if (cid) {
            // Update existing
            await api.patch(`/orders/carriers/${cid}/`, carrierData);
          } else {
            // Create new
            await api.post('/orders/carriers/', carrierData);
          }
        }
      } catch (err: any) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        return showToast('error', 'Klaida išsaugant vežėjų duomenis: ' + detail);
      }

      // Ensure all cities from stops exist in suggestions
      for (const stop of routeStops) {
        if (stop.city) await ensureCityExists(stop.city);
      }

      const fullOrder = (await api.get(`/orders/orders/${orderId}/`)).data;
      
      // Update partner notification settings
      if (selectedClient?.is_client) {
        try {
          await api.patch(`/partners/partners/${selectedClient.id}/`, {
            email_notify_due_soon: emailNotifyDueSoon,
            email_notify_unpaid: emailNotifyUnpaid,
            email_notify_overdue: emailNotifyOverdue
          });
        } catch (e) {}
      }

      onSave(fullOrder);
      if (onOrderUpdate) onOrderUpdate(fullOrder);
      onClose();
      showToast('success', isEditMode ? 'Užsakymas atnaujintas' : 'Užsakymas sukurtas');
    } catch (error: any) {
      showToast('error', 'Netikėta klaida išsaugant užsakymą');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()} style={{ width: '1200px', height: '85vh', maxWidth: '1200px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
              {isEditMode ? `Užsakymas #${formData.order_number}` : 'Naujas užsakymas'}
            </h2>
            {isEditMode && order?.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', marginRight: '4px' }}>Būsena:</label>
                <select 
                  value={formData.status} 
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={statusChanging}
                  style={{ 
                    padding: '4px 8px', 
                    fontSize: '12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    backgroundColor: statusChanging ? '#f5f5f5' : 'white',
                    cursor: statusChanging ? 'not-allowed' : 'pointer',
                    minWidth: '140px'
                  }}
                >
                  <option value={formData.status}>
                    {formData.status === 'new' ? 'Naujas' :
                     formData.status === 'assigned' ? 'Priskirtas' :
                     formData.status === 'executing' ? 'Vykdomas' :
                     formData.status === 'waiting_for_docs' ? 'Laukiama Dokumentų' :
                     formData.status === 'waiting_for_payment' ? 'Laukiama Apmokėjimo' :
                     formData.status === 'finished' ? 'Baigtas' :
                     formData.status === 'closed' ? 'Uždarytas' :
                     formData.status === 'canceled' ? 'Atšauktas' :
                     formData.status}
                  </option>
                  {allowedStatusTransitions.map(status => (
                    <option key={status} value={status}>
                      {status === 'new' ? 'Naujas' :
                       status === 'assigned' ? 'Priskirtas' :
                       status === 'executing' ? 'Vykdomas' :
                       status === 'waiting_for_docs' ? 'Laukiama Dokumentų' :
                       status === 'waiting_for_payment' ? 'Laukiama Apmokėjimo' :
                       status === 'finished' ? 'Baigtas' :
                       status === 'closed' ? 'Uždarytas' :
                       status === 'canceled' ? 'Atšauktas' :
                       status}
                    </option>
                  ))}
                </select>
                {statusChanging && (
                  <span style={{ fontSize: '10px', color: '#666' }}>...</span>
                )}
              </div>
            )}

            {/* Veiksmų istorijos mygtukas */}
            {isEditMode && order?.id && (
              <button
                onClick={() => {
                  // Atidaryti veiksmų istoriją naujame lange/tab'e
                  const activityLogUrl = `/activity-logs?content_type=order&object_id=${order.id}`;
                  window.open(activityLogUrl, '_blank');
                }}
                className="button button-outline"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  marginLeft: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Peržiūrėti šio užsakymo veiksmų istoriją"
              >
                📋 Istorija
              </button>
            )}
          </div>
          <button onClick={onClose} className="button button-secondary">✕</button>
        </div>

        {/* Tabai */}
        <div className="modal-tabs" style={{ display: 'flex', padding: '0 10px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
          <button className={`tab-btn ${activeTab === 'client' ? 'active' : ''}`} onClick={() => setActiveTab('client')}>👤 Klientas</button>
          <button className={`tab-btn ${activeTab === 'cargo' ? 'active' : ''}`} onClick={() => setActiveTab('cargo')}>📦 Krovinys</button>
          <button className={`tab-btn ${activeTab === 'route' ? 'active' : ''}`} onClick={() => setActiveTab('route')}>📍 Maršrutas</button>
          <button className={`tab-btn ${activeTab === 'carriers' ? 'active' : ''}`} onClick={() => setActiveTab('carriers')}>🚚 Vežėjai</button>
          <button className={`tab-btn ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>💰 Finansai</button>
          <button className={`tab-btn ${activeTab === 'emails' ? 'active' : ''}`} onClick={() => setActiveTab('emails')}>📧 Susiję laiškai</button>
          <button className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>📝 Papildoma</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '15px' }}>
          <form id="order-form" onSubmit={handleSave}>
            {/* TAB: CLIENT */}
            {activeTab === 'client' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <div className="card-section" style={{ padding: '12px' }}>
                  <div style={{ marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                    <h4 className="section-title" style={{ margin: 0, border: 'none', padding: 0, fontSize: '14px' }}>Kliento informacija</h4>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                      {selectedClient?.vat_code && (
                        <button
                          type="button"
                          onClick={handleCheckClientOnline}
                          className="button button-secondary"
                          style={{ 
                            fontSize: '10px', 
                            padding: '4px 8px',
                            whiteSpace: 'nowrap'
                          }}
                          title="Tikrinti internete pagal PVM kodą (VIES)"
                        >
                          🔍 Patikslinti duomenis
                        </button>
                      )}
                      {isEditMode && order?.id && (
                        <button 
                          type="button" 
                          className="button button-secondary"
                          onClick={() => fetchHtmlPreview(order.id, 'order')}
                          style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          👁️ Peržiūrėti užsakymą
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '15px' }}>
                    <div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>Klientas *</label>
                        <div style={{ position: 'relative' }}>
                          <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Ieškoti..." className="form-control" style={{ padding: '6px 8px', fontSize: '12px' }} />
                          <button type="button" className="btn-add-inline" onClick={() => setShowPartnerModal(true)}>➕</button>
                          {clients.length > 0 && (
                            <div className="dropdown-menu-list">
                              {clients.map(c => (
                                <div key={c.id} className="dropdown-item" onClick={() => handleClientSelect(c)}>
                                  {c.name}
                                  {(c.has_code_errors || c.code_valid === false || c.vat_code_valid === false) && (
                                    <span style={{ fontSize: '10px', color: '#c0392b', fontWeight: 600, marginLeft: '4px' }} title="Trūksta rekvizitų (įm. arba PVM kodas neteisingas)">(Trūksta duomenų)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {selectedClient && (
                        <div className="info-box" style={{ 
                          marginTop: '8px', 
                          backgroundColor: '#f8f9fa', 
                          border: '1px solid #e9ecef', 
                          padding: '10px',
                          borderRadius: '6px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                          {/* Antraštė su pavadinimu ir statusu */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a202c' }}>
                              {selectedClient.name}
                            </div>
                            {clientUnpaidInvoices && (clientUnpaidInvoices.count > 0 || clientUnpaidInvoices.max_overdue_days > 0) && (
                              <div style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                padding: '3px 8px',
                                backgroundColor: clientUnpaidInvoices.max_overdue_days > 0 ? '#fff3cd' : (clientUnpaidInvoices.count > 0 ? '#e7f3ff' : '#f8f9fa'),
                                border: `1px solid ${clientUnpaidInvoices.max_overdue_days > 0 ? '#ffc107' : (clientUnpaidInvoices.count > 0 ? '#007bff' : '#dee2e6')}`,
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '500'
                              }}>
                                <span style={{ color: clientUnpaidInvoices.max_overdue_days > 0 ? '#856404' : (clientUnpaidInvoices.count > 0 ? '#004085' : '#6c757d') }}>
                                  📄 <strong>{clientUnpaidInvoices.count}</strong> neapmokėta sąskaita{clientUnpaidInvoices.count !== 1 ? 's' : ''}
                                </span>
                                <span style={{ color: '#666', fontSize: '9px' }}>|</span>
                                <span style={{ color: clientUnpaidInvoices.max_overdue_days > 0 ? '#856404' : (clientUnpaidInvoices.count > 0 ? '#004085' : '#6c757d') }}>
                                  💰 <strong>{formatMoney(clientUnpaidInvoices.total_amount)}</strong> bendra suma
                                </span>
                                {clientUnpaidInvoices.max_overdue_days > 0 && (
                                  <>
                                    <span style={{ color: '#666', fontSize: '9px' }}>|</span>
                                    <span style={{ color: '#dc3545', fontWeight: 'bold' }}>
                                      ⚠️ <strong>{clientUnpaidInvoices.max_overdue_days} d.</strong> didžiausias vėlavimas
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                            <div style={{ 
                              padding: '2px 8px', 
                              borderRadius: '10px', 
                              fontSize: '10px', 
                              fontWeight: '600',
                              backgroundColor: selectedClient.status === 'active' ? '#def7ec' : '#fde8e8',
                              color: selectedClient.status === 'active' ? '#03543f' : '#9b1c1c',
                              border: `1px solid ${selectedClient.status === 'active' ? '#bcf0da' : '#f8b4b4'}`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              {selectedClient.status_display || selectedClient.status || 'Aktyvus'}
                            </div>
                          </div>

                          {/* Įmonės duomenų tinklelis */}
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(2, 1fr)', 
                            gap: '8px',
                            backgroundColor: '#fff',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #edf2f7',
                            marginBottom: '10px'
                          }}>
                            <div>
                              <div style={{ fontSize: '10px', color: '#718096', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>Kodas</div>
                              <div style={{ fontSize: '12px', color: '#2d3748', fontWeight: '500' }}>{selectedClient.code || '-'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: '#718096', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>PVM kodas</div>
                              <div style={{ fontSize: '12px', color: '#2d3748', fontWeight: '500' }}>{selectedClient.vat_code || '-'}</div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                              <div style={{ fontSize: '10px', color: '#718096', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>📍 Buveinės adresas</div>
                              <div style={{ fontSize: '12px', color: '#2d3748', fontWeight: '500', lineHeight: '1.3' }}>{selectedClient.address || '-'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: '#718096', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>Mok. terminas</div>
                              <div style={{ fontSize: '12px', color: '#2d3748', fontWeight: '500' }}>{selectedClient.payment_term_days || 0} d.</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', color: '#718096', textTransform: 'uppercase', fontWeight: '600', marginBottom: '2px' }}>PVM tarifas</div>
                              <div style={{ fontSize: '12px', color: '#2d3748', fontWeight: '500' }}>{selectedClient.vat_rate || 21}%</div>
                            </div>
                          </div>
                          
                          {/* Kontaktinis asmuo */}
                          <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                            <div style={{ fontWeight: '600', fontSize: '10px', color: '#718096', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                👤 Kontaktinis asmuo
                              </div>
                              {selectedClient && selectedClient.id && (
                                <button
                                  type="button"
                                  onClick={() => setShowPartnerEditModal(true)}
                                  className="button button-secondary"
                                  style={{ 
                                    fontSize: '9px', 
                                    padding: '2px 6px',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title="Redaguoti kliento kontaktus"
                                >
                                  ✏️ Redaguoti
                                </button>
                              )}
                            </div>
                            {(selectedClient.contact_person || (selectedClient.contacts && selectedClient.contacts.length > 0)) ? (
                              (() => {
                                const contact = selectedClient.contact_person || (selectedClient.contacts && selectedClient.contacts.length > 0 ? selectedClient.contacts[0] : null);
                                if (!contact) return null;
                                return (
                                  <div style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #edf2f7' }}>
                                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '12px' }}>
                                      {contact.first_name} {contact.last_name}
                                    </div>
                                    {contact.position && (
                                      <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>{contact.position}</div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      {contact.phone && (
                                        <div style={{ fontSize: '11px', color: '#4a5568', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ color: '#718096' }}>📞</span> {contact.phone}
                                        </div>
                                      )}
                                      {contact.email && (
                                        <div style={{ fontSize: '11px', color: '#3182ce', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ color: '#718096' }}>✉️</span> {contact.email}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #edf2f7', fontSize: '11px', color: '#718096', textAlign: 'center' }}>
                                Kontaktinio asmens nėra. Spustelėkite "Redaguoti" norėdami pridėti.
                              </div>
                            )}
                          </div>

                          {selectedClient.notes && (
                            <div style={{ 
                              marginTop: '10px', 
                              padding: '8px 10px', 
                              backgroundColor: '#fffaf0', 
                              borderRadius: '4px', 
                              fontSize: '11px', 
                              border: '1px solid #fbd38d', 
                              color: '#744210',
                              lineHeight: '1.4'
                            }}>
                              <div style={{ fontWeight: '700', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9c4221' }}>
                                📝 Kliento pastaba:
                              </div>
                              {selectedClient.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '8px' }}>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>Užsakymo tipas</label>
                        <AutocompleteField 
                          fieldType="order_type" 
                          value={formData.order_type} 
                          onChange={v => setFormData({...formData, order_type: v})} 
                          label="" 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>
                          Užsakymo numeris
                          {!isEditMode && (
                            <span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal', marginLeft: '4px' }}>
                              (siūlomas numeris – galite pakeisti arba palikti tuščią)
                            </span>
                          )}
                        </label>
                        <input 
                          type="text" 
                          value={formData.order_number || ''} 
                          onChange={e => setFormData({...formData, order_number: e.target.value})} 
                          className="form-control" 
                          style={{ padding: '6px 8px', fontSize: '12px' }}
                          placeholder={isEditMode ? "PVZ: 2026-001" : "Siūlomas numeris – galite pakeisti"}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>Užsakovo užs. Nr.</label>
                        <input 
                          type="text" 
                          value={formData.client_order_number} 
                          onChange={e => setFormData({...formData, client_order_number: e.target.value})} 
                          className="form-control" 
                          style={{ padding: '6px 8px', fontSize: '12px' }}
                          placeholder="PVZ: PO-12345"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>Užsakymo data</label>
                        <input
                          type="date"
                          value={formData.order_date ? formData.order_date.split('T')[0] : ''}
                          onChange={e => setFormData({ ...formData, order_date: e.target.value ? `${e.target.value}T00:00` : '' })}
                          className="form-control"
                          style={{ padding: '6px 8px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', marginBottom: '3px' }}>Vadybininkas</label>
                        <select value={formData.manager_id} onChange={e => setFormData({...formData, manager_id: e.target.value})} className="form-control" style={{ padding: '6px 8px', fontSize: '12px' }}>
                          <option value="">Pasirinkite...</option>
                          {allManagers.map(m => {
                            const fullName = (m.first_name || m.last_name) 
                              ? `${m.first_name || ''} ${m.last_name || ''}`.trim()
                              : '';
                            const displayName = fullName 
                              ? `${fullName} (${m.username})`
                              : m.username;
                            return <option key={m.id} value={m.id}>{displayName}</option>;
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CARGO */}
            {activeTab === 'cargo' && (
              <div className="card-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <h4 className="section-title" style={{ marginBottom: 0 }}>Krovinių sąrašas</h4>
                  <button type="button" onClick={handleAddCargoItem} className="button button-secondary">+ Pridėti krovinį</button>
                </div>
                {cargoItems.length > 0 ? (
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Ref. Nr.</th>
                        <th>Aprašymas</th>
                        <th>Kiekis</th>
                        <th>Svoris</th>
                        <th>Matmenys</th>
                        <th>LDM</th>
                        <th>Vnt.</th>
                        <th>Savybės</th>
                        <th>Veiksmai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargoItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.reference_number || '-'}</td>
                          <td>
                            <div style={{ fontWeight: 'bold' }}>{item.description || 'Be aprašymo'}</div>
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                              {item.loading_stop_info ? `🛫 ${item.loading_stop_info.city}` : ''}
                              {item.loading_stop_info && item.unloading_stop_info ? ' → ' : ''}
                              {item.unloading_stop_info ? `🛬 ${item.unloading_stop_info.city}` : ''}
                            </div>
                          </td>
                          <td>
                            {item.pallet_count ? `${item.pallet_count} pal.` : ''}
                            {item.pallet_count && item.package_count ? ' / ' : ''}
                            {item.package_count ? `${item.package_count} pak.` : ''}
                            {!item.pallet_count && !item.package_count ? '-' : ''}
                          </td>
                          <td>{item.weight_kg ? `${item.weight_kg} kg` : '-'}</td>
                          <td>
                            {item.length_m || item.width_m || item.height_m 
                              ? `${item.length_m || 0}x${item.width_m || 0}x${item.height_m || 0}` 
                              : '-'}
                          </td>
                          <td>{item.ldm || '-'}</td>
                          <td>{item.units || '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {item.fragile && <span title="Trapus" style={{ cursor: 'help' }}>🏺</span>}
                              {item.hazardous && <span title="Pavojingas" style={{ cursor: 'help' }}>⚠️</span>}
                              {item.temperature_controlled && <span title="Termo" style={{ cursor: 'help' }}>❄️</span>}
                              {item.is_stackable && <span title="Stabeliuojamas" style={{ cursor: 'help' }}>📦</span>}
                              {!item.fragile && !item.hazardous && !item.temperature_controlled && !item.is_stackable && '-'}
                            </div>
                          </td>
                          <td>
                            <button type="button" onClick={() => handleEditCargoItem(item, idx)} className="btn-icon">✏️</button>
                            <button type="button" onClick={() => handleDeleteCargoItem(idx)} className="btn-icon">🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="empty-state">Krovinių nepridėta</div>}
              </div>
            )}

            {/* TAB: ROUTE */}
            {activeTab === 'route' && (
              <div className="card-section">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={routeNotRequired}
                    onChange={(e) => setRouteNotRequired(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>Nereikalauti maršruto</span>
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <h4 className="section-title" style={{ marginBottom: 0 }}>Maršruto sustojimai (Pakrovimai / Iškrovimai)</h4>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => handleAddStop('loading')} className="button button-secondary" style={{ backgroundColor: '#e6ffed', color: '#28a745', border: '1px solid #b7ebb5' }}>+ Pakrovimas</button>
                    <button type="button" onClick={() => handleAddStop('unloading')} className="button button-secondary" style={{ backgroundColor: '#fff0f0', color: '#dc3545', border: '1px solid #ffc1c1' }}>+ Iškrovimas</button>
                  </div>
                </div>

                {routeStops.length > 0 ? (
                  <div className="stops-list">
                    {routeStops.map((stop, idx) => {
                      // Validacijos patikrinimas - ar pakrovimo data vėlesnė nei iškrovimo
                      let dateWarning = null;
                      if (stop.stop_type === 'loading' && stop.date_from) {
                        const loadingDate = new Date(stop.date_from);
                        // Rasti pirmą iškrovimo sustojimą po šio pakrovimo
                        const nextUnloading = routeStops.slice(idx + 1).find(s => s.stop_type === 'unloading');
                        if (nextUnloading && nextUnloading.date_to) {
                          const unloadingDate = new Date(nextUnloading.date_to);
                          if (loadingDate > unloadingDate) {
                            dateWarning = '⚠️ Pakrovimo data vėlesnė nei iškrovimo data';
                          }
                        }
                      } else if (stop.stop_type === 'unloading' && stop.date_to) {
                        const unloadingDate = new Date(stop.date_to);
                        // Rasti paskutinį pakrovimo sustojimą prieš šį iškrovimą
                        const prevLoading = routeStops.slice(0, idx).reverse().find(s => s.stop_type === 'loading');
                        if (prevLoading && prevLoading.date_from) {
                          const loadingDate = new Date(prevLoading.date_from);
                          if (loadingDate > unloadingDate) {
                            dateWarning = '⚠️ Pakrovimo data vėlesnė nei iškrovimo data';
                          }
                        }
                      }
                      
                      return (
                        <div key={idx} className="stop-card" style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '12px', 
                          backgroundColor: stop.stop_type === 'loading' ? '#f0fff4' : '#fff5f5',
                          borderLeft: `4px solid ${dateWarning ? '#ffc107' : (stop.stop_type === 'loading' ? '#28a745' : '#dc3545')}`,
                          borderRadius: '6px',
                          marginBottom: '10px',
                          boxShadow: dateWarning ? '0 0 0 2px rgba(255, 193, 7, 0.3)' : 'none'
                        }}>
                          <div className="stop-info" style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: stop.stop_type === 'loading' ? '#28a745' : '#dc3545' }}>
                              {stop.stop_type === 'loading' ? '📥 PAKROVIMAS' : '📤 IŠKROVIMAS'} #{idx + 1}
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{stop.city || '?'}, {stop.country || '?'}</div>
                            <div style={{ fontSize: '12px', color: '#666' }}>{stop.address} {stop.name ? `(${stop.name})` : ''}</div>
                            <div style={{ fontSize: '12px', marginTop: '4px', color: dateWarning ? '#dc3545' : 'inherit', fontWeight: dateWarning ? 'bold' : 'normal' }}>
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
                            {dateWarning && (
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#dc3545', 
                                marginTop: '4px', 
                                padding: '4px 8px', 
                                backgroundColor: '#fff3cd', 
                                borderRadius: '4px',
                                border: '1px solid #ffc107'
                              }}>
                                {dateWarning}
                              </div>
                            )}
                          </div>
                          <div className="stop-actions" style={{ display: 'flex', gap: '5px' }}>
                            <button type="button" onClick={() => handleMoveStopUp(idx)} className="btn-icon" disabled={idx === 0} title="Perkelti aukštyn">↑</button>
                            <button type="button" onClick={() => handleMoveStopDown(idx)} className="btn-icon" disabled={idx === routeStops.length - 1} title="Perkelti žemyn">↓</button>
                            <button type="button" onClick={() => handleEditStop(stop, idx)} className="btn-icon">✏️</button>
                            <button type="button" onClick={() => handleDeleteStop(idx)} className="btn-icon">🗑️</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '2px dashed #dee2e6' }}>
                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>📍</div>
                    <div style={{ color: '#6c757d' }}>Maršruto sustojimų dar nepridėta. Naudokite viršuje esančius mygtukus.</div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: CARRIERS */}
            {activeTab === 'carriers' && (
              <div className="card-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <h4 className="section-title" style={{ marginBottom: 0 }}>Vežėjai ir Sandėliai</h4>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => handleAddCarrier('carrier')} className="button button-secondary">+ Vežėjas</button>
                    <button type="button" onClick={() => handleAddCarrier('warehouse')} className="button button-secondary">+ Sandėlys</button>
                  </div>
                </div>
                {orderCarriers.length > 0 ? (
                  <div className="carriers-list">
                    {orderCarriers.map((c, idx) => {
                      const unpaidInfo = c.partner?.id ? carrierUnpaidInvoices[c.partner.id] : null;
                      return (
                        <div key={idx} className="carrier-card">
                        <div className="carrier-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <strong>{c.partner?.name}</strong> ({c.carrier_type_display})
                            {unpaidInfo && (unpaidInfo.count > 0 || unpaidInfo.max_overdue_days > 0) && (
                              <div style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                padding: '4px 10px',
                                backgroundColor: unpaidInfo.max_overdue_days > 0 ? '#fff3cd' : (unpaidInfo.count > 0 ? '#e7f3ff' : '#f8f9fa'),
                                border: `1px solid ${unpaidInfo.max_overdue_days > 0 ? '#ffc107' : (unpaidInfo.count > 0 ? '#007bff' : '#dee2e6')}`,
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '500'
                              }}>
                                <span style={{ color: unpaidInfo.max_overdue_days > 0 ? '#856404' : (unpaidInfo.count > 0 ? '#004085' : '#6c757d') }}>
                                  📄 <strong>{unpaidInfo.count}</strong> neapmokėta sąskaita{unpaidInfo.count !== 1 ? 's' : ''}
                                </span>
                                <span style={{ color: '#666', fontSize: '9px' }}>|</span>
                                <span style={{ color: unpaidInfo.max_overdue_days > 0 ? '#856404' : (unpaidInfo.count > 0 ? '#004085' : '#6c757d') }}>
                                  💰 <strong>{formatMoney(unpaidInfo.total_amount)}</strong> bendra suma
                                </span>
                                {unpaidInfo.max_overdue_days > 0 && (
                                  <>
                                    <span style={{ color: '#666', fontSize: '9px' }}>|</span>
                                    <span style={{ color: '#dc3545', fontWeight: 'bold' }}>
                                      ⚠️ <strong>{unpaidInfo.max_overdue_days} d.</strong> didžiausias vėlavimas
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div>Kaina: {formatMoney(c.price_net)} | Maršrutas: {c.route_from} → {c.route_to}</div>
                        </div>
                        <div className="carrier-actions">
                          <button 
                            type="button" 
                            onClick={() => handleMoveCarrierUp(idx)} 
                            className="btn-icon" 
                            disabled={idx === 0}
                            title="Perkelti aukštyn"
                          >
                            ↑
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleMoveCarrierDown(idx)} 
                            className="btn-icon" 
                            disabled={idx === orderCarriers.length - 1}
                            title="Perkelti žemyn"
                          >
                            ↓
                          </button>
                          {c.id && (
                            <button 
                              type="button" 
                              onClick={() => fetchHtmlPreview(c.id!, 'carrier')} 
                              className="btn-icon" 
                              title="Peržiūrėti sutartį"
                            >
                              👁️
                            </button>
                          )}
                          <button type="button" onClick={() => handleEditCarrier(c, idx)} className="btn-icon">✏️</button>
                          <button type="button" onClick={() => handleDeleteCarrier(idx)} className="btn-icon">🗑️</button>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="empty-state">Vežėjų nepridėta. Pridėkite vežėją, kad matytumėte jį ir „Finansai“ skiltyje.</div>}
              </div>
            )}

            {/* TAB: FINANCE */}
            {activeTab === 'finance' && (
              <OrderEdit_Finance 
                orderId={order?.id}
                formData={formData}
                setFormData={setFormData}
                orderCarriers={orderCarriers}
                setOrderCarriers={setOrderCarriers}
                pvmRates={pvmRates}
                showToast={showToast}
                handleClientPriceChange={handleClientPriceChange}
                calculateMyPrice={calculateMyPrice}
                onOpenSalesInvoice={handleOpenSalesInvoice}
                onOpenPurchaseInvoice={handleOpenPurchaseInvoice}
                refreshTrigger={financeRefreshTrigger}
                onRefreshEmails={() => {
                  // Atnaujinti email'ų sąrašą po trinimo
                  if (order?.id && formData.order_number) {
                    const loadEmails = async () => {
                      try {
                        setEmailsLoading(true);
                        const orderNumber = formData.order_number || order?.order_number;
                        if (orderNumber) {
                          const response = await api.get('/mail/messages/by-order/', {
                            params: { number: orderNumber }
                          });
                          const messages = Array.isArray(response.data?.messages) ? response.data.messages : [];
                          setRelatedEmails(messages);
                        }
                      } catch (error) {
                      } finally {
                        setEmailsLoading(false);
                      }
                    };
                    loadEmails();
                  }
                }}
              />
            )}

            {/* TAB: EMAILS */}
            {activeTab === 'emails' && (
              <div className="card-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h4 className="section-title" style={{ marginBottom: 0 }}>📧 Susiję laiškai</h4>
                  {isEditMode && order?.id && formData.order_number && (
                    <button 
                      type="button" 
                      className="button button-secondary" 
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                      onClick={async () => {
                        setEmailsLoading(true);
                        setSentEmailsLoading(true);
                        try {
                          // Gauti gautus laiškus
                          const orderNumber = formData.order_number || order?.order_number;
                          if (orderNumber) {
                            const response = await api.get('/mail/messages/by-order/', {
                              params: { number: orderNumber }
                            });
                            const messages = Array.isArray(response.data?.messages) ? response.data.messages : [];
                            setRelatedEmails(messages);
                          }
                          
                          // Gauti išsiųstus laiškus
                          const sentResponse = await api.get('/mail/email-logs/', {
                            params: { related_order_id: order.id, page_size: 100 }
                          });
                          const sentData = sentResponse.data;
                          const emails = Array.isArray(sentData) ? sentData : (sentData.results || []);
                          setSentEmails(emails);
                        } catch (error: any) {
                          showToast('error', 'Nepavyko užkrauti laiškų');
                        } finally {
                          setEmailsLoading(false);
                          setSentEmailsLoading(false);
                        }
                      }}
                      disabled={emailsLoading || sentEmailsLoading}
                    >
                      {emailsLoading || sentEmailsLoading ? '🔄' : '🔄 Atnaujinti'}
                    </button>
                  )}
                </div>

                {!isEditMode || !order?.id ? (
                  <div className="empty-state" style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '40px' }}>
                    Išsaugokite užsakymą, kad galėtumėte matyti susijusius laiškus
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Gauti laiškai */}
                    <div>
                      <h5 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: '#495057' }}>
                        📥 Gauti laiškai
                      </h5>
                      {emailsLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>Kraunama...</div>
                      ) : relatedEmails.length > 0 ? (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                          {relatedEmails.map((email) => {
                            const isTrusted = email.sender_status === 'trusted';
                            const isNew = email.status === 'new';
                            // Skaičiuoti tik unikalius priedus (pagal filename)
                            const uniqueAttachments = email.attachments ? (() => {
                              const seen = new Set<string>();
                              return email.attachments.filter((att: any) => {
                                if (seen.has(att.filename)) return false;
                                seen.add(att.filename);
                                return true;
                              });
                            })() : [];
                            const hasAttachments = uniqueAttachments.length > 0;
                            // Nustatyti, kaip laiškas susietas su užsakymu
                            let linkType = '';
                            if (email.related_order_id) {
                              // Tiesioginis susiejimas - patikrinti, ar turime užsakymo numerį
                              const matchedOrder = email.matched_orders?.find((o: any) => o.id === email.related_order_id);
                              if (matchedOrder?.order_number) {
                                linkType = `Susietas per užsakymo numerį: ${matchedOrder.order_number}`;
                              } else if (email.matches?.orders && email.matches.orders.length > 0) {
                                linkType = `Susietas per užsakymo numerį: ${email.matches.orders[0]}`;
                              } else {
                                linkType = `Susietas tiesiogiai (ID: ${email.related_order_id})`;
                              }
                            } else if (email.matches?.orders && email.matches.orders.length > 0) {
                              linkType = `Susietas per užsakymo numerį: ${email.matches.orders[0]}`;
                            } else if (email.matched_orders && email.matched_orders.length > 0) {
                              const orderNumber = email.matched_orders[0].order_number;
                              if (orderNumber) {
                                linkType = `Susietas per užsakymo numerį: ${orderNumber}`;
                              } else {
                                linkType = `Susietas per užsakymo ID: ${email.matched_orders[0].id}`;
                              }
                            } else {
                              linkType = 'Susietas per tekstą';
                            }
                            
                            return (
                              <div 
                                key={email.id} 
                                style={{ 
                                  padding: '8px 10px', 
                                  marginBottom: '6px', 
                                  backgroundColor: isNew ? '#fff3cd' : '#fff', 
                                  border: `1px solid ${isNew ? '#ffc107' : '#dee2e6'}`, 
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  maxHeight: '60px',
                                  overflow: 'hidden'
                                }}
                                onClick={() => setSelectedEmail({ type: 'received', email })}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = isNew ? '#ffeaa7' : '#f8f9fa';
                                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = isNew ? '#fff3cd' : '#fff';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', height: '100%' }}>
                                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                      {isTrusted ? (
                                        <span style={{ fontSize: '10px', color: '#28a745' }} title="Patikimas siuntėjas">✅</span>
                                      ) : email.sender_status === 'advertising' ? (
                                        <span style={{ fontSize: '10px', color: '#ffc107' }} title="Reklaminis siuntėjas">📢</span>
                                      ) : (
                                        <span style={{ fontSize: '10px', color: '#6c757d' }} title="Nežinomas siuntėjas">❓</span>
                                      )}
                                      <div style={{ 
                                        fontSize: '11px', 
                                        fontWeight: '600', 
                                        color: '#212529',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        flex: 1
                                      }}>
                                        {email.subject || '(Be temos)'}
                                      </div>
                                      {isNew && (
                                        <span style={{ 
                                          fontSize: '9px', 
                                          padding: '1px 5px', 
                                          backgroundColor: '#ffc107', 
                                          color: '#856404',
                                          borderRadius: '10px',
                                          fontWeight: '600'
                                        }}>
                                          NAUJAS
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ 
                                      fontSize: '10px', 
                                      color: '#6c757d',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      flexWrap: 'wrap'
                                    }}>
                                      <span>{new Date(email.date).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                      {hasAttachments && (
                                        <span style={{ color: '#007bff' }}>📎 {uniqueAttachments.length}</span>
                                      )}
                                      <span style={{ fontSize: '9px', color: '#868e96' }}>{linkType}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state" style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '20px' }}>
                          Gautų laiškų nėra
                        </div>
                      )}
                    </div>

                    {/* Išsiųsti laiškai */}
                    <div>
                      <h5 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: '#495057' }}>
                        📤 Išsiųsti laiškai
                      </h5>
                      {sentEmailsLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>Kraunama...</div>
                      ) : sentEmails.length > 0 ? (
                        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                          {sentEmails.map((email) => {
                            const isSent = email.status === 'sent';
                            const isFailed = email.status === 'failed';
                            
                            return (
                              <div 
                                key={email.id} 
                                style={{ 
                                  padding: '8px 10px', 
                                  marginBottom: '6px', 
                                  backgroundColor: isFailed ? '#fff5f5' : '#fff', 
                                  border: `1px solid ${isFailed ? '#dc3545' : '#dee2e6'}`, 
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  maxHeight: '60px',
                                  overflow: 'hidden'
                                }}
                                onClick={() => setSelectedEmail({ type: 'sent', email })}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = isFailed ? '#ffeaea' : '#f8f9fa';
                                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = isFailed ? '#fff5f5' : '#fff';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', height: '100%' }}>
                                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                      <div style={{ 
                                        fontSize: '11px', 
                                        fontWeight: '600', 
                                        color: '#212529',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        flex: 1
                                      }}>
                                        {email.subject}
                                      </div>
                                      <span style={{ 
                                        padding: '2px 6px', 
                                        borderRadius: '10px', 
                                        fontSize: '9px',
                                        backgroundColor: isSent ? '#d4edda' : isFailed ? '#f8d7da' : '#fff3cd',
                                        color: isSent ? '#155724' : isFailed ? '#721c24' : '#856404',
                                        fontWeight: '600'
                                      }}>
                                        {isSent ? '✅' : isFailed ? '❌' : '⏳'}
                                      </span>
                                    </div>
                                    <div style={{ 
                                      fontSize: '10px', 
                                      color: '#6c757d',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      flexWrap: 'wrap'
                                    }}>
                                      <span>{new Date(email.sent_at || email.created_at).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                        → {email.recipient_name || email.recipient_email}
                                      </span>
                                      {email.email_type && (
                                        <span style={{ fontSize: '9px', color: '#868e96' }}>
                                          {email.email_type === 'order' ? '📋' : 
                                           email.email_type === 'invoice' ? '🧾' : 
                                           email.email_type === 'reminder' ? '⏰' : 
                                           email.email_type === 'expedition' ? '🚚' : 
                                           '📧'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state" style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '20px' }}>
                          Išsiųstų laiškų nėra
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: NOTES */}
            {activeTab === 'notes' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                <div className="card-section">
                  <h4 className="section-title">Pastabos</h4>
                  <AutocompleteTextarea 
                    fieldType="order_notes"
                    value={formData.notes} 
                    onChange={v => setFormData({...formData, notes: v})} 
                    placeholder="Bendros pastabos..." 
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid #dee2e6', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} className="button button-secondary">Atšaukti</button>
          <button type="submit" form="order-form" className="button button-primary" style={{ padding: '10px 25px' }}>
            {isEditMode ? 'Išsaugoti pakeitimus' : 'Sukurti užsakymą'}
          </button>
        </div>
      </div>

      {/* Papildomi modalai - dabar jie turi stopPropagation */}
      <div onClick={e => e.stopPropagation()}>
      {showCarrierModal && (
        <CarrierModal 
          isOpen={showCarrierModal} 
          onClose={() => setShowCarrierModal(false)} 
          carrier={editingCarrier} 
          onSave={handleSaveCarrier} 
          carrierType={carrierFormType} 
          showToast={showToast}
        />
      )}
        {showCargoItemModal && (
          <CargoItemModal 
            isOpen={showCargoItemModal} 
            onClose={() => setShowCargoItemModal(false)} 
            cargoItem={editingCargoItem} 
            onSave={handleSaveCargoItem}
            routeStops={routeStops}
          />
        )}
        {showPartnerModal && (
          <PartnerCreateModal 
            isOpen={showPartnerModal} 
            onClose={() => setShowPartnerModal(false)} 
            onSave={handlePartnerSave} 
            showToast={showToast} 
          />
        )}
        {showPartnerEditModal && selectedClient && (
          <PartnerEditModal
            isOpen={showPartnerEditModal}
            partner={{
              ...selectedClient,
              vat_code: selectedClient.vat_code || '',
              code: selectedClient.code || '',
              address: selectedClient.address || '',
              payment_term_days: selectedClient.payment_term_days || 0,
              notes: selectedClient.notes || ''
            } as any}
            onClose={() => setShowPartnerEditModal(false)}
            onSave={handlePartnerEditSave}
            onPartnerUpdate={(updatedPartner) => {
              setSelectedClient(updatedPartner as any);
              setClientSearch(updatedPartner.name);
              setSelectedClientName(updatedPartner.name);
            }}
            showToast={showToast}
          />
        )}
        {showStopModal && (
          <RouteStopModal
            isOpen={showStopModal}
            onClose={() => setShowStopModal(false)}
            stop={editingStop}
            onSave={handleSaveStop}
            stopType={editingStopType}
          />
        )}
        {showSalesInvoiceModal && (
          <SalesInvoiceModal_NEW
            isOpen={showSalesInvoiceModal}
            onClose={() => {
              setShowSalesInvoiceModal(false);
              setEditingSalesInvoice(null);
            }}
            invoice={editingSalesInvoice}
            initialPartnerId={initialInvoiceData.partnerId || formData.client_id}
            initialOrderId={order?.id?.toString()}
            onSave={() => {
              setShowSalesInvoiceModal(false);
              setEditingSalesInvoice(null);
              setFinanceRefreshTrigger(prev => prev + 1);
              // Trigger order data refresh
              if (order?.id) {
                fetchOrderDetails(order.id);
              }
            }}
            onInvoiceUpdate={(updatedInvoice) => {
              setEditingSalesInvoice(updatedInvoice);
              setFinanceRefreshTrigger(prev => prev + 1);
              if (order?.id) {
                fetchOrderDetails(order.id);
              }
            }}
            showToast={showToast}
            invoiceSettings={null}
          />
        )}
        {showPurchaseInvoiceModal && (
          <PurchaseInvoiceModal_NEW
            invoice={currentPurchaseInvoice}
            isOpen={showPurchaseInvoiceModal}
            onClose={() => {
              setShowPurchaseInvoiceModal(false);
              setCurrentPurchaseInvoice(null);
            }}
            initialOrderId={order?.id?.toString()}
            initialPartnerId={initialInvoiceData.partnerId}
            initialAmountNet={initialInvoiceData.amountNet}
            orderCarrierId={initialInvoiceData.orderCarrierId}
            onSave={() => {
              setShowPurchaseInvoiceModal(false);
              setCurrentPurchaseInvoice(null);
              setFinanceRefreshTrigger(prev => prev + 1);
              if (order?.id) {
                fetchOrderDetails(order.id);
                // Atnaujinti email'ų sąrašą, kad atsirastų indikatorius apie susietą sąskaitą
                // Iškviesti email'ų užkrovimą iš naujo
                const loadEmails = async () => {
                  try {
                    setEmailsLoading(true);
                    const response = await api.get(`/mail/messages/by_order/`, {
                      params: { order_id: order.id, order_number: order.order_number }
                    });
                    const messages = response.data?.results || response.data || [];
                    if (Array.isArray(messages)) {
                      setRelatedEmails(messages);
                    }
                  } catch (error) {
                  } finally {
                    setEmailsLoading(false);
                  }
                };
                loadEmails();
              }
            }}
            onDelete={(invoice) => {
              // Handle delete if needed
              setShowPurchaseInvoiceModal(false);
              setCurrentPurchaseInvoice(null);
              setFinanceRefreshTrigger(prev => prev + 1);
              if (order?.id) {
                fetchOrderDetails(order.id);
              }
            }}
            showToast={showToast}
          />
        )}
        {confirmState.open && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="modal-content" style={{ maxWidth: '400px', padding: '20px' }}>
              <h3>{confirmState.title}</h3>
              <p>{confirmState.message}</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button className="button button-secondary" onClick={() => setConfirmState({ open: false })}>Ne</button>
                <button className="button" onClick={confirmState.onConfirm}>Taip</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {htmlPreview && (
        <HTMLPreviewModal
          preview={htmlPreview}
          onClose={() => setHtmlPreview(null)}
          onLanguageChange={(lang) => {
            if (htmlPreviewId && htmlPreviewType) {
              fetchHtmlPreview(htmlPreviewId, htmlPreviewType, lang);
            }
          }}
          currentLang={htmlPreviewLang}
          onDownloadPDF={async () => {
            if (!htmlPreviewId || !htmlPreviewType) return;
            try {
              const endpoint = htmlPreviewType === 'order' 
                ? `/orders/orders/${htmlPreviewId}/pdf/` 
                : `/orders/carriers/${htmlPreviewId}/pdf/`;
              const response = await api.get(endpoint, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob'
              });
              
              const url = window.URL.createObjectURL(new Blob([response.data]));
              const link = document.createElement('a');
              link.href = url;
              const filename = htmlPreviewType === 'order' 
                ? `uzsakymas_${htmlPreviewId}.pdf` 
                : `sutartis_${htmlPreviewId}.pdf`;
              link.setAttribute('download', filename);
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
            } catch (error) {
              showToast('error', 'Nepavyko atsisiųsti PDF');
            }
          }}
          onSendEmail={async () => {
            const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              try {
                (iframe.contentWindow as any).sendEmail?.();
              } catch (e) {
                showToast('error', 'Nepavyko atidaryti siuntimo langelio');
              }
            }
          }}
        />
      )}

      {attachmentPreview && (
        <AttachmentPreviewModal
          attachment={attachmentPreview}
          onClose={() => setAttachmentPreview(null)}
          mailMessageId={selectedEmail?.email?.id}
          relatedOrderNumber={order?.order_number || formData.order_number}
          onInvoiceCreated={() => {
            // Atnaujinti duomenis po sąskaitos sukūrimo
            if (order?.id) {
              fetchOrderDetails(order.id);
              setFinanceRefreshTrigger(prev => prev + 1);
              // Atnaujinti email'ų sąrašą
              if (activeTab === 'emails' && formData.order_number) {
                const loadEmails = async () => {
                  try {
                    setEmailsLoading(true);
                    const orderNumber = formData.order_number || order?.order_number;
                    if (orderNumber) {
                      const response = await api.get('/mail/messages/by-order/', {
                        params: { number: orderNumber }
                      });
                      const messages = Array.isArray(response.data?.messages) ? response.data.messages : [];
                      setRelatedEmails(messages);
                    }
                  } catch (error) {
                  } finally {
                    setEmailsLoading(false);
                  }
                };
                loadEmails();
              }
            }
          }}
        />
      )}

      {/* Email Preview Modal */}
      {selectedEmail && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
          onClick={() => setSelectedEmail(null)}
        >
          <div 
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              padding: '15px 20px', 
              borderBottom: '1px solid #dee2e6', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {selectedEmail.type === 'received' ? '📥 Gautas laiškas' : '📤 Išsiųstas laiškas'}
              </h3>
              <button 
                type="button"
                onClick={() => setSelectedEmail(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6c757d',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
              {selectedEmail.type === 'received' ? (
                <>
                  <div style={{ marginBottom: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <div><span style={{ color: '#6c757d' }}><strong>Tema:</strong></span> <span style={{ color: '#212529', fontWeight: '600' }}>{selectedEmail.email.subject || '(Be temos)'}</span></div>
                    <div><span style={{ color: '#6c757d' }}><strong>Nuo:</strong></span> <span style={{ color: '#212529' }}>{selectedEmail.email.sender_display || selectedEmail.email.sender || 'Nenurodyta'}</span></div>
                    <div><span style={{ color: '#6c757d' }}><strong>Data:</strong></span> <span style={{ color: '#212529' }}>{new Date(selectedEmail.email.date).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                  </div>
                  {selectedEmail.email.attachments && selectedEmail.email.attachments.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}><strong>Priedai:</strong></div>
                      <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap',
                        gap: '4px'
                      }}>
                        {(() => {
                          // Filtruoti dublikatus - rodyti tik unikalius failų pavadinimus
                          const seenFilenames = new Set<string>();
                          return selectedEmail.email.attachments
                            .filter((att: any) => {
                              // Jei failo pavadinimas jau buvo matytas, praleisti
                              if (seenFilenames.has(att.filename)) {
                                return false; // Praleisti dublikatą
                              }
                              seenFilenames.add(att.filename);
                              return true;
                            })
                            .map((att: any) => {
                              const url = att.download_url || att.file;
                              const hasInvoice = att.has_purchase_invoice || att.purchase_invoice_info;
                              const invoiceInfo = att.purchase_invoice_info;
                          
                          return (
                            <div key={att.id} style={{ position: 'relative', display: 'inline-flex' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (url) {
                                    const downloadUrl = att.download_url || `/mail/attachments/${att.id}/download/`;
                                    setAttachmentPreview({
                                      filename: att.filename,
                                      url: downloadUrl,
                                      id: att.id, // Pridėti attachment ID
                                    });
                                  }
                                }}
                                disabled={!url}
                                style={{ 
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  backgroundColor: hasInvoice ? '#d4edda' : (url ? '#e7f3ff' : '#f8f9fa'),
                                  border: `1px solid ${hasInvoice ? '#28a745' : (url ? '#b3d9ff' : '#dee2e6')}`,
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  color: hasInvoice ? '#155724' : (url ? '#004085' : '#868e96'),
                                  cursor: url ? 'pointer' : 'not-allowed',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s',
                                  position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                  if (url) {
                                    e.currentTarget.style.backgroundColor = hasInvoice ? '#c3e6cb' : '#cfe2ff';
                                    e.currentTarget.style.borderColor = hasInvoice ? '#1e7e34' : '#86b7fe';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (url) {
                                    e.currentTarget.style.backgroundColor = hasInvoice ? '#d4edda' : '#e7f3ff';
                                    e.currentTarget.style.borderColor = hasInvoice ? '#28a745' : '#b3d9ff';
                                  }
                                }}
                                title={
                                  hasInvoice && invoiceInfo
                                    ? `✅ Jau suvesta kaip gauta sąskaita: ${invoiceInfo.received_invoice_number} (${invoiceInfo.partner_name || 'Nenurodyta'})`
                                    : (url ? `${att.filename} (${(att.size / 1024).toFixed(2)} KB)` : 'Failas nerastas')
                                }
                              >
                                {hasInvoice && <span style={{ fontSize: '10px' }}>✅</span>}
                                📎 {att.filename}
                              </button>
                            </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                  {(selectedEmail.email.body_html || selectedEmail.email.body_plain || selectedEmail.email.snippet) && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid #dee2e6', paddingTop: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '6px' }}><strong>Turinys:</strong></div>
                      {selectedEmail.email.body_html ? (
                        <div 
                          style={{
                            backgroundColor: '#f8f9fa',
                            padding: '10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            maxHeight: '400px',
                            overflowY: 'auto'
                          }}
                          dangerouslySetInnerHTML={{ 
                            __html: (() => {
                              let cleaned = selectedEmail.email.body_html;
                              cleaned = cleaned.replace(/<html[^>]*>[\s\S]*?<\/html>/gi, '');
                              cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
                              cleaned = cleaned.replace(/<body[^>]*>/gi, '');
                              cleaned = cleaned.replace(/<\/body>/gi, '');
                              cleaned = cleaned.replace(/<\/html>/gi, '');
                              cleaned = cleaned.replace(/<meta[^>]*viewport[^>]*>/gi, '');
                              return cleaned;
                            })()
                          }} 
                        />
                      ) : selectedEmail.email.body_plain ? (
                        <pre style={{
                          backgroundColor: '#f8f9fa',
                          padding: '10px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          lineHeight: '1.5',
                          maxHeight: '400px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          margin: 0
                        }}>
                          {selectedEmail.email.body_plain}
                        </pre>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#6c757d', fontStyle: 'italic' }}>
                          {selectedEmail.email.snippet || 'Turinys nerastas'}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                    <div><span style={{ color: '#6c757d' }}><strong>Tema:</strong></span> <span style={{ color: '#212529', fontWeight: '600' }}>{selectedEmail.email.subject}</span></div>
                    <div><span style={{ color: '#6c757d' }}><strong>Kam:</strong></span> <span style={{ color: '#212529' }}>{selectedEmail.email.recipient_name || selectedEmail.email.recipient_email}</span></div>
                    <div><span style={{ color: '#6c757d' }}><strong>Data:</strong></span> <span style={{ color: '#212529' }}>{new Date(selectedEmail.email.sent_at || selectedEmail.email.created_at).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                    <div>
                      <span style={{ 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontSize: '11px',
                        backgroundColor: selectedEmail.email.status === 'sent' ? '#d4edda' : selectedEmail.email.status === 'failed' ? '#f8d7da' : '#fff3cd',
                        color: selectedEmail.email.status === 'sent' ? '#155724' : selectedEmail.email.status === 'failed' ? '#721c24' : '#856404'
                      }}>
                        {selectedEmail.email.status === 'sent' ? '✅ Išsiųsta' : selectedEmail.email.status === 'failed' ? '❌ Klaida' : '⏳ Laukiama'}
                      </span>
                    </div>
                  </div>
                  {(selectedEmail.email.body_html || selectedEmail.email.body_text) && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid #dee2e6', paddingTop: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '6px' }}><strong>Turinys:</strong></div>
                      {selectedEmail.email.body_html ? (
                        <div 
                          style={{
                            backgroundColor: '#f8f9fa',
                            padding: '10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            maxHeight: '400px',
                            overflowY: 'auto'
                          }}
                          dangerouslySetInnerHTML={{ 
                            __html: (() => {
                              let cleaned = selectedEmail.email.body_html;
                              cleaned = cleaned.replace(/<html[^>]*>[\s\S]*?<\/html>/gi, '');
                              cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
                              cleaned = cleaned.replace(/<body[^>]*>/gi, '');
                              cleaned = cleaned.replace(/<\/body>/gi, '');
                              cleaned = cleaned.replace(/<\/html>/gi, '');
                              cleaned = cleaned.replace(/<meta[^>]*viewport[^>]*>/gi, '');
                              return cleaned;
                            })()
                          }} 
                        />
                      ) : (
                        <pre style={{
                          backgroundColor: '#f8f9fa',
                          padding: '10px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          lineHeight: '1.5',
                          maxHeight: '400px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          margin: 0
                        }}>
                          {selectedEmail.email.body_text}
                        </pre>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSS stiliai (tik šiam komponentui) */}
      <style>{`
        .modal-tabs { gap: 5px; }
        .tab-btn {
          padding: 10px 20px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
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
        .card-section {
          background: #fff;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 15px;
        }
        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: #495057;
          text-transform: uppercase;
          margin-bottom: 15px;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
        }
        .form-grid, .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .info-box {
          background: #f1f8ff;
          border: 1px solid #c8e1ff;
          padding: 10px;
          border-radius: 6px;
          font-size: 12px;
          margin-top: 10px;
        }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .info-row span { font-weight: 600; color: #555; }
        .profit-display {
          margin-top: 20px;
          padding: 15px;
          background: #e6ffed;
          border: 1px solid #b7ebb5;
          border-radius: 8px;
          text-align: center;
        }
        .profit-value { font-size: 20px; font-weight: 700; color: #28a745; margin-top: 5px; }
        .mini-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .mini-table th { text-align: left; padding: 8px; border-bottom: 2px solid #eee; }
        .mini-table td { padding: 8px; border-bottom: 1px solid #eee; }
        .btn-icon { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; }
        .carrier-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background: #f8f9fa;
          border: 1px solid #eee;
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .cost-item {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          border-bottom: 1px solid #eee;
          font-size: 13px;
        }
        .btn-add-inline {
          position: absolute;
          right: 5px;
          top: 5px;
          background: none;
          border: none;
          cursor: pointer;
        }
        .dropdown-menu-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #ddd;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 100;
          max-height: 200px;
          overflow-y: auto;
        }
        .dropdown-item { padding: 8px 12px; cursor: pointer; }
        .dropdown-item:hover { background: #f0f7ff; }
      `}</style>
    </div>
  );
};

export default OrderEditModal_NEW;
