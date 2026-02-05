import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AutocompleteTextarea from '../AutocompleteTextarea';
import AutocompleteField from '../AutocompleteField';
import RouteContactField from '../RouteContactField';
import CarrierModal from './CarrierModal';
import CargoItemModal from './CargoItemModal';
import PartnerEditModal from '../partners/PartnerEditModal';
import { formatMoney } from '../../utils/formatMoney';


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
  email_notify_due_soon?: boolean;
  email_notify_unpaid?: boolean;
  email_notify_overdue?: boolean;
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
  amount: number;
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
}

interface OrderCarrier {
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
  // Detali maršruto informacija
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  sender_name?: string; // Siuntėjo pavadinimas
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  receiver_name?: string; // Gavėjo pavadinimas
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
  payment_status_info?: {
    status: 'not_paid' | 'partially_paid' | 'paid';
    message: string;
    payment_date?: string;
  };
  // Vėliavėlės (ar turi custom duomenis)
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

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Order) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, timeoutMs?: number) => void;
  onOrderUpdate?: (updatedOrder: Order) => void; // Callback kai užsakymas atnaujinamas
}

const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  onSave,
  showToast,
  onOrderUpdate
}) => {
  const { user } = useAuth();
  
  // State'ai - visi iš OrdersPage.tsx
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
  const [orderCarriers, setOrderCarriers] = useState<OrderCarrier[]>([]);
  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [allManagers, setAllManagers] = useState<User[]>([]);
  const [editingOtherCost, setEditingOtherCost] = useState<{ description: string; amount: string } | null>(null);
  const [editingOtherCostIndex, setEditingOtherCostIndex] = useState<number | null>(null);
  
  // Carrier modal state'ai
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<OrderCarrier | null>(null);
  const [editingCarrierIndex, setEditingCarrierIndex] = useState<number | null>(null);
  const [carrierFormType, setCarrierFormType] = useState<'carrier' | 'warehouse'>('carrier');
  
  // Cargo item modal state'ai
  const [showCargoItemModal, setShowCargoItemModal] = useState(false);
  const [editingCargoItem, setEditingCargoItem] = useState<CargoItem | null>(null);
  const [editingCargoItemIndex, setEditingCargoItemIndex] = useState<number | null>(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);


  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{ 
    open: boolean; 
    title?: string; 
    message?: string; 
    onConfirm?: () => void;
  }>({ open: false });
  
  // Email notification options for invoices
  const [emailNotifyDueSoon, setEmailNotifyDueSoon] = useState(false);
  const [emailNotifyUnpaid, setEmailNotifyUnpaid] = useState(false);
  const [emailNotifyOverdue, setEmailNotifyOverdue] = useState(false);
  
  // Refs
  const myPriceManuallyEdited = useRef(false);
  const routeFromSuggestions = useRef<string[]>([]);
  const routeToSuggestions = useRef<string[]>([]);
  const vehicleTypeSuggestions = useRef<string[]>([]);
  
  // Is editing mode
  const isEditMode = !!order;
  
  // ========== ETAPAS 2: PAGRINDINĖS FUNKCIJOS ==========
  
  // Fetch funkcijos
  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
      // Ignoruoti klaidas
    }
  }, []);

  const fetchAllManagers = useCallback(async () => {
    try {
      const response = await api.get('/auth/users/', {
        params: { page_size: 200 }
      });
      const managersData = response.data.results || response.data || [];
      setAllManagers(Array.isArray(managersData) ? managersData : []);
    } catch (error) {
      setAllManagers([]);
    }
  }, []);

  const fetchRouteSuggestions = useCallback(async () => {
    try {
      const citiesResponse = await api.get('/orders/cities/', {
        params: { page_size: 500 }
      });
      const cities = citiesResponse.data.results || citiesResponse.data || [];
      const cityNames = cities.map((city: any) => city.name).sort();
      
      routeFromSuggestions.current = cityNames;
      routeToSuggestions.current = cityNames;
      
      const vehicleTypesResponse = await api.get('/orders/vehicle-types/', {
        params: { page_size: 500 }
      });
      const vehicleTypes = vehicleTypesResponse.data.results || vehicleTypesResponse.data || [];
      const vehicleTypeNames = vehicleTypes.map((type: any) => type.name).sort();
      
      vehicleTypeSuggestions.current = vehicleTypeNames;
    } catch (error) {
      // Ignoruoti klaidas
    }
  }, []);

  const ensureCityExists = useCallback(async (cityName: string): Promise<void> => {
    if (!cityName || !cityName.trim()) return;
    
    try {
      const searchResponse = await api.get('/orders/cities/', {
        params: { search: cityName.trim() }
      });
      const existingCities = searchResponse.data.results || searchResponse.data || [];
      const exists = existingCities.some((city: any) => city.name.toLowerCase() === cityName.trim().toLowerCase());
      
      if (!exists) {
        await api.post('/orders/cities/', { name: cityName.trim() });
      }
    } catch (error: any) {
      // Ignoruoti klaidas
    }
  }, []);


  const fetchOrderCarriers = useCallback(async (orderId: number): Promise<OrderCarrier[]> => {
    try {
      const response = await api.get(`/orders/carriers/?order=${orderId}`);
      return response.data.results || response.data || [];
    } catch (error) {
      return [];
    }
  }, []);

  // Client selection
  const handleClientSelect = useCallback(async (client: Client) => {
    setFormData(prev => ({ ...prev, client_id: client.id.toString() }));
    setClientSearch(client.name);
    setSelectedClientName(client.name);
    setClients([]);

    try {
      const response = await api.get(`/partners/partners/${client.id}/`);
      setSelectedClient(response.data);
      // Užkrauti email notification nustatymus
      if (response.data.is_client) {
        setEmailNotifyDueSoon(response.data.email_notify_due_soon !== false);
        setEmailNotifyUnpaid(response.data.email_notify_unpaid !== false);
        setEmailNotifyOverdue(response.data.email_notify_overdue !== false);
      } else {
        setEmailNotifyDueSoon(false);
        setEmailNotifyUnpaid(false);
        setEmailNotifyOverdue(false);
      }
    } catch (error) {
      setSelectedClient(client);
      setEmailNotifyDueSoon(false);
      setEmailNotifyUnpaid(false);
      setEmailNotifyOverdue(false);
    }
  }, []);

  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setClients([]);
      return;
    }

    setClients([]);

    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, page_size: 10, include_code_errors: 1 }
      });
      const clientsData = response.data.results || response.data || [];
      setClients(Array.isArray(clientsData) ? clientsData : []);
    } catch (error) {
      setClients([]);
    }
  }, []);

  const handlePartnerSave = useCallback(async (partner: any) => {
    // Po sėkmingo klientų sukūrimo, automatiškai pasirinkti jį
    setShowPartnerModal(false);

    // Pasirinkti ką tik sukurtą klientą
    const newClient = {
      id: partner.id,
      name: partner.name,
      code: partner.code,
      vat_code: partner.vat_code,
      address: partner.address,
      is_client: partner.is_client,
      is_supplier: partner.is_supplier,
      status: partner.status,
      status_display: partner.status_display,
      contact_person: partner.contact_person,
      contacts: partner.contacts,
      contacts_count: partner.contacts_count,
      payment_term_days: partner.payment_term_days,
      email_notify_due_soon: partner.email_notify_due_soon,
      email_notify_unpaid: partner.email_notify_unpaid,
      email_notify_overdue: partner.email_notify_overdue,
      email_notify_manager_invoices: partner.email_notify_manager_invoices,
      notes: partner.notes
    };

    await handleClientSelect(newClient);
  }, [handleClientSelect]);

  // Client search effect
  useEffect(() => {
    if (clientSearch && clientSearch !== selectedClientName) {
      const timeout = setTimeout(() => searchClients(clientSearch), 300);
      return () => clearTimeout(timeout);
    } else if (!clientSearch) {
      setClients([]);
    }
  }, [clientSearch, selectedClientName, searchClients]);

  // Automatiškai sinchronizuoti vežėjų datas su užsakymo datomis
  useEffect(() => {
    if (orderCarriers.length > 0) {
      setOrderCarriers(prevCarriers =>
        prevCarriers.map(carrier => {
          // Naudojame has_custom_dates vėliavėlę iš API
          // Jei vežėjas neturi custom datų - sinchronizuojame su užsakymo datomis
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

  // Calculate my price
  const calculateMyPrice = useCallback((forceRecalculate = false) => {
    if (!isOpen) return;
    
    if (myPriceManuallyEdited.current && !forceRecalculate) return;
    
    const clientPrice = formData.client_price_net ? parseFloat(formData.client_price_net) : 0;
    let transportCost = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
    if (editingCarrier && editingCarrierIndex !== null && editingCarrier.price_net) {
      const carrierPrice = parseFloat(String(editingCarrier.price_net));
      if (editingCarrierIndex >= 0 && editingCarrierIndex < orderCarriers.length) {
        const oldPrice = orderCarriers[editingCarrierIndex].price_net ? parseFloat(String(orderCarriers[editingCarrierIndex].price_net)) : 0;
        transportCost = transportCost - oldPrice + carrierPrice;
      } else {
        transportCost = transportCost + carrierPrice;
      }
    }
    
    const otherCosts = formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
    const calculatedMyPrice = clientPrice - transportCost - otherCosts;
    // Užtikrinti, kad my_price_net nebus neigiamas (backend validacija)
    const validMyPrice = calculatedMyPrice >= 0 ? calculatedMyPrice : 0;
    
    setFormData(prev => {
      const currentMyPrice = prev.my_price_net ? parseFloat(prev.my_price_net) : 0;
      if (Math.abs(currentMyPrice - validMyPrice) > 0.01) {
        return { ...prev, my_price_net: validMyPrice.toFixed(2) };
      }
      return prev;
    });
  }, [isOpen, orderCarriers, formData.client_price_net, formData.other_costs, editingCarrier, editingCarrierIndex]);

  const handleMyPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, my_price_net: value }));
    if (value) {
      myPriceManuallyEdited.current = true;
    } else {
      myPriceManuallyEdited.current = false;
    }
  }, []);

  const handleClientPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, client_price_net: value }));
    myPriceManuallyEdited.current = false;
    setTimeout(() => calculateMyPrice(), 50);
  }, [calculateMyPrice]);

  // Carrier handlers
  const handleAddCarrier = useCallback((type: 'carrier' | 'warehouse') => {
    setCarrierFormType(type);
    setEditingCarrier(null);
    setEditingCarrierIndex(null);
    setShowCarrierModal(true);
  }, []);

  const handleEditCarrier = useCallback((carrier: OrderCarrier, index: number) => {
    setEditingCarrier({
      ...carrier,
      id: carrier.id,
      partner_id: carrier.partner_id || carrier.partner?.id || 0,
      price_net: carrier.price_net ? (typeof carrier.price_net === 'string' ? carrier.price_net : String(carrier.price_net)) : null,
      route_from: carrier.route_from || '',
      route_to: carrier.route_to || '',
      // Detali maršruto informacija
      route_from_country: carrier.route_from_country || '',
      route_from_postal_code: carrier.route_from_postal_code || '',
      route_from_city: carrier.route_from_city || '',
      route_from_address: carrier.route_from_address || '',
      sender_name: carrier.sender_name || '',
      route_to_country: carrier.route_to_country || '',
      route_to_postal_code: carrier.route_to_postal_code || '',
      route_to_city: carrier.route_to_city || '',
      route_to_address: carrier.route_to_address || '',
      receiver_name: carrier.receiver_name || '',
      loading_date: carrier.loading_date || null,
      unloading_date: carrier.unloading_date || null,
      loading_date_from: carrier.loading_date_from || null,
      loading_date_to: carrier.loading_date_to || null,
      unloading_date_from: carrier.unloading_date_from || null,
      unloading_date_to: carrier.unloading_date_to || null,
      status: carrier.status || 'new',
      status_display: carrier.status_display || 'Naujas',
      payment_status: carrier.payment_status || 'not_paid',
      payment_status_display: carrier.payment_status_display || 'Neapmokėta',
      payment_date: carrier.payment_date || null,
      invoice_issued: carrier.invoice_issued || false,
      invoice_received: carrier.invoice_received || false,
      invoice_received_date: carrier.invoice_received_date || null,
      payment_days: carrier.payment_days || null,
      due_date: carrier.due_date || null,
      notes: carrier.notes || '',
      sequence_order: carrier.sequence_order || index
    });
    setEditingCarrierIndex(index);
    setCarrierFormType(carrier.carrier_type);
    setShowCarrierModal(true);
  }, []);

  const handleSaveCarrier = useCallback(async (carrier: OrderCarrier): Promise<void> => {
    const updatedCarrier: OrderCarrier = {
      ...carrier,
      invoice_received: carrier.invoice_received !== undefined ? carrier.invoice_received : false,
      sequence_order: editingCarrierIndex !== null && editingCarrierIndex >= 0 ? editingCarrierIndex : orderCarriers.length
    };
    
    let newCarriers: OrderCarrier[];
    if (editingCarrierIndex !== null && editingCarrierIndex >= 0 && editingCarrierIndex < orderCarriers.length) {
      newCarriers = [...orderCarriers];
      newCarriers[editingCarrierIndex] = updatedCarrier;
    } else {
      newCarriers = [...orderCarriers, updatedCarrier];
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

  // Cargo item handlers
  const handleAddCargoItem = useCallback(() => {
    setEditingCargoItem({
      sequence_order: cargoItems.length,
      description: '',
      weight_kg: null,
      ldm: null,
      length_m: null,
      width_m: null,
      height_m: null,
      is_palletized: false,
      is_stackable: false,
      vehicle_type: null,
      requires_forklift: false,
      requires_crane: false,
      requires_special_equipment: false,
      fragile: false,
      hazardous: false,
      temperature_controlled: false,
      requires_permit: false,
    });
    setEditingCargoItemIndex(null);
    setShowCargoItemModal(true);
  }, [cargoItems.length]);

  const handleEditCargoItem = useCallback((item: CargoItem, index: number) => {
    setEditingCargoItem({ ...item });
    setEditingCargoItemIndex(index);
    setShowCargoItemModal(true);
  }, []);

  const handleSaveCargoItem = useCallback((cargoItem: CargoItem) => {
    if (editingCargoItemIndex !== null && editingCargoItemIndex >= 0 && editingCargoItemIndex < cargoItems.length) {
      const updated = [...cargoItems];
      updated[editingCargoItemIndex] = {
        ...cargoItem,
        sequence_order: editingCargoItemIndex
      };
      setCargoItems(updated);
    } else {
      setCargoItems([...cargoItems, {
        ...cargoItem,
        sequence_order: cargoItems.length
      }]);
    }
    
    setShowCargoItemModal(false);
    setEditingCargoItem(null);
    setEditingCargoItemIndex(null);
  }, [cargoItems, editingCargoItemIndex]);

  const handleDeleteCargoItem = useCallback((index: number) => {
    setConfirmState({
      open: true,
      title: 'Patvirtinkite',
      message: 'Ar tikrai norite pašalinti šį krovinių aprašymą?',
      onConfirm: () => {
        const updated = cargoItems.filter((_, i) => i !== index).map((item, i) => ({
          ...item,
          sequence_order: i
        }));
        setCargoItems(updated);
        setConfirmState({ open: false });
      }
    });
  }, [cargoItems]);

  // Reset form
  const resetForm = useCallback(() => {
    myPriceManuallyEdited.current = false;
    setSelectedClient(null);
    setClientSearch('');
    setSelectedClientName('');
    setClients([]);
    setFormData({
      client_id: '',
      carrier_id: '',
      order_type: '',
      order_number: '',
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
    setEditingOtherCost(null);
    setEditingOtherCostIndex(null);
    setOrderCarriers([]);
    setCargoItems([]);
    setEmailNotifyDueSoon(false);
    setEmailNotifyUnpaid(false);
    setEmailNotifyOverdue(false);
  }, [user]);

  // Load order data when editing
  useEffect(() => {
    if (isOpen && order && isEditMode) {
      // Load order data into form
      setFormData({
        client_id: String(order.client_id || order.client.id),
        carrier_id: order.carrier_id ? order.carrier_id.toString() : '',
        order_type: order.order_type,
        order_number: order.order_number || '',
      client_order_number: order.client_order_number || '',
        manager_id: (order.manager_id || order.manager?.id)?.toString() || '',
        status: order.status,
        price_net: order.price_net ? String(order.price_net) : '',
        client_price_net: order.client_price_net || '',
        my_price_net: order.my_price_net ? String(order.my_price_net) : '',
        other_costs: order.other_costs || [],
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
        loading_date_from: order.loading_date_from ? (order.loading_date_from.includes('T') ? order.loading_date_from.slice(0, 16) : order.loading_date_from) : '',
        loading_date_to: order.loading_date_to ? (order.loading_date_to.includes('T') ? order.loading_date_to.slice(0, 16) : order.loading_date_to) : '',
        unloading_date_from: order.unloading_date_from ? (order.unloading_date_from.includes('T') ? order.unloading_date_from.slice(0, 16) : order.unloading_date_from) : '',
        unloading_date_to: order.unloading_date_to ? (order.unloading_date_to.includes('T') ? order.unloading_date_to.slice(0, 16) : order.unloading_date_to) : '',
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

      if (order.client_id) {
        api.get(`/partners/partners/${order.client_id}/`)
          .then(response => {
            setSelectedClient(response.data);
            // Užkrauti email notification nustatymus
            if (response.data.is_client) {
              setEmailNotifyDueSoon(response.data.email_notify_due_soon !== false);
              setEmailNotifyUnpaid(response.data.email_notify_unpaid !== false);
              setEmailNotifyOverdue(response.data.email_notify_overdue !== false);
            } else {
              setEmailNotifyDueSoon(false);
              setEmailNotifyUnpaid(false);
              setEmailNotifyOverdue(false);
            }
          })
          .catch(() => {
            if (order.client) {
              setSelectedClient(order.client as Client);
              if (order.client.is_client) {
                setEmailNotifyDueSoon((order.client as any).email_notify_due_soon !== false);
                setEmailNotifyUnpaid((order.client as any).email_notify_unpaid !== false);
                setEmailNotifyOverdue((order.client as any).email_notify_overdue !== false);
              } else {
                setEmailNotifyDueSoon(false);
                setEmailNotifyUnpaid(false);
                setEmailNotifyOverdue(false);
              }
            }
          });
      } else if (order.client) {
        setSelectedClient(order.client as Client);
        if (order.client.is_client) {
          setEmailNotifyDueSoon((order.client as any).email_notify_due_soon !== false);
          setEmailNotifyUnpaid((order.client as any).email_notify_unpaid !== false);
          setEmailNotifyOverdue((order.client as any).email_notify_overdue !== false);
        } else {
          setEmailNotifyDueSoon(false);
          setEmailNotifyUnpaid(false);
          setEmailNotifyOverdue(false);
        }
      }
      
      // Load carriers
      if (order.carriers && order.carriers.length > 0) {
        setOrderCarriers(order.carriers.map(c => ({
          ...c,
          id: c.id,
          partner_id: c.partner_id || c.partner?.id || 0,
          price_net: c.price_net ? (typeof c.price_net === 'string' ? c.price_net : String(c.price_net)) : null,
          route_from: c.route_from || '',
          route_to: c.route_to || '',
          // Detali maršruto informacija
          route_from_country: c.route_from_country || '',
          route_from_postal_code: c.route_from_postal_code || '',
          route_from_city: c.route_from_city || '',
          route_from_address: c.route_from_address || '',
          sender_name: c.sender_name || '',
          route_to_country: c.route_to_country || '',
          route_to_postal_code: c.route_to_postal_code || '',
          route_to_city: c.route_to_city || '',
          route_to_address: c.route_to_address || '',
          receiver_name: c.receiver_name || '',
          loading_date: c.loading_date || null,
          unloading_date: c.unloading_date || null,
          loading_date_from: c.loading_date_from ? (c.loading_date_from.includes('T') ? c.loading_date_from.slice(0, 16) : c.loading_date_from) : null,
          loading_date_to: c.loading_date_to ? (c.loading_date_to.includes('T') ? c.loading_date_to.slice(0, 16) : c.loading_date_to) : null,
          unloading_date_from: c.unloading_date_from ? (c.unloading_date_from.includes('T') ? c.unloading_date_from.slice(0, 16) : c.unloading_date_from) : null,
          unloading_date_to: c.unloading_date_to ? (c.unloading_date_to.includes('T') ? c.unloading_date_to.slice(0, 16) : c.unloading_date_to) : null,
          status: c.status || 'new',
          status_display: c.status_display || 'Naujas',
              payment_status: c.payment_status || 'not_paid',
              payment_status_display: c.payment_status_display || 'Neapmokėta',
          invoice_issued: c.invoice_issued || false,
          invoice_received: c.invoice_received || false,
          payment_terms: c.payment_terms || '',
          notes: c.notes || ''
        })));
      } else {
        fetchOrderCarriers(order.id).then(carriers => {
          if (carriers.length > 0) {
            setOrderCarriers(carriers.map(c => ({
              ...c,
              id: c.id,
              partner_id: c.partner_id || c.partner?.id || 0,
              price_net: c.price_net ? (typeof c.price_net === 'string' ? c.price_net : String(c.price_net)) : null,
              route_from: c.route_from || '',
              route_to: c.route_to || '',
              // Detali maršruto informacija
              route_from_country: c.route_from_country || '',
              route_from_postal_code: c.route_from_postal_code || '',
              route_from_city: c.route_from_city || '',
              route_from_address: c.route_from_address || '',
              sender_name: c.sender_name || '',
              route_to_country: c.route_to_country || '',
              route_to_postal_code: c.route_to_postal_code || '',
              route_to_city: c.route_to_city || '',
              route_to_address: c.route_to_address || '',
              receiver_name: c.receiver_name || '',
              loading_date: c.loading_date || null,
              unloading_date: c.unloading_date || null,
              loading_date_from: c.loading_date_from ? (c.loading_date_from.includes('T') ? c.loading_date_from.split('T')[0] : c.loading_date_from) : null,
              loading_date_to: c.loading_date_to ? (c.loading_date_to.includes('T') ? c.loading_date_to.split('T')[0] : c.loading_date_to) : null,
              unloading_date_from: c.unloading_date_from ? (c.unloading_date_from.includes('T') ? c.unloading_date_from.split('T')[0] : c.unloading_date_from) : null,
              unloading_date_to: c.unloading_date_to ? (c.unloading_date_to.includes('T') ? c.unloading_date_to.split('T')[0] : c.unloading_date_to) : null,
              status: c.status || 'new',
              status_display: c.status_display || 'Naujas',
              payment_status: c.payment_status || 'not_paid',
              payment_status_display: c.payment_status_display || 'Neapmokėta',
              invoice_issued: c.invoice_issued || false,
              invoice_received: c.invoice_received || false,
              payment_terms: c.payment_terms || '',
              notes: c.notes || ''
            })));

            // Sinchronizuoti vežėjų datas su užsakymo datomis
            // Tik tuos vežėjus kurie neturi savo unikalių datų
            setOrderCarriers(prevCarriers =>
              prevCarriers.map(carrier => {
                // Naudojame has_custom_dates vėliavėlę iš API
                if (!carrier.has_custom_dates) {
                  return {
                    ...carrier,
                    loading_date_from: order.loading_date_from || null,
                    loading_date_to: order.loading_date_to || null,
                    unloading_date_from: order.unloading_date_from || null,
                    unloading_date_to: order.unloading_date_to || null,
                    loading_date: order.loading_date_from ? `${order.loading_date_from}T00:00` : null,
                    unloading_date: order.unloading_date_from ? `${order.unloading_date_from}T00:00` : null
                  };
                }
                return carrier;
              })
            );
          }
        });
      }

      // Load cargo items
      if (order.cargo_items && order.cargo_items.length > 0) {
        setCargoItems(order.cargo_items.map((item: CargoItem) => ({
          ...item,
          sequence_order: item.sequence_order || 0
        })));
      } else {
        api.get(`/orders/cargo-items/?order=${order.id}`)
          .then(cargoResponse => {
            const cargoList = cargoResponse.data.results || cargoResponse.data || [];
            if (cargoList.length > 0) {
              setCargoItems(cargoList.map((item: CargoItem) => ({
                ...item,
                sequence_order: item.sequence_order || 0
              })));
            }
          })
          .catch(() => {
            setCargoItems([]);
          });
      }
    } else if (isOpen && !isEditMode) {
      // Reset for new order
      resetForm();
    }
  }, [isOpen, order, isEditMode, resetForm, fetchOrderCarriers]);

  // Load initial data
  useEffect(() => {
    if (isOpen) {
      fetchPvmRates();
      fetchAllManagers();
      fetchRouteSuggestions();
    }
  }, [isOpen, fetchPvmRates, fetchAllManagers, fetchRouteSuggestions]);


  // Calculate my price effect
  useEffect(() => {
    calculateMyPrice();
  }, [calculateMyPrice]);

  // ========== ETAPAS 3: FORM SUBMIT FUNKCIJOS ==========
  
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validacija
    if (!formData.client_id) {
      showToast('info', 'Pasirinkite klientą');
      return;
    }
    
    if (!formData.route_from_country || !formData.route_to_country) {
      showToast('info', 'Užpildykite šalų laukus (privalomi)');
      return;
    }
    
    try {
      const orderDataToSend = {
        client_id: parseInt(formData.client_id),
        order_type: formData.order_type,
        client_order_number: formData.client_order_number || '',
        manager_id: formData.manager_id ? parseInt(formData.manager_id) : null,
        status: formData.status,
        price_net: (() => {
          const transportCost = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
          const myPrice = formData.my_price_net ? parseFloat(formData.my_price_net) : 0;
          const otherCosts = formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
          return (transportCost + myPrice + otherCosts) || 0;
        })(),
        client_price_net: formData.client_price_net ? parseFloat(formData.client_price_net) : null,
        my_price_net: (() => {
          if (!formData.my_price_net || formData.my_price_net.trim() === '') {
            return null;
          }
          const parsed = parseFloat(formData.my_price_net);
          // Jei NaN arba neigiamas, grąžinti null
          if (isNaN(parsed) || parsed < 0) {
            return null;
          }
          return parsed;
        })(),
        other_costs: formData.other_costs.length > 0 ? formData.other_costs.map(cost => ({
          description: cost.description,
          amount: parseFloat(String(cost.amount))
        })) : [],
        vat_rate: parseFloat(formData.vat_rate),
        vat_rate_article: formData.vat_rate_article || '',
        client_invoice_issued: formData.client_invoice_issued,
        client_invoice_received: formData.client_invoice_received,
        client_payment_status: formData.client_payment_status,
        route_from: formData.route_from || '',
        route_to: formData.route_to || '',
        route_from_country: formData.route_from_country || '',
        route_from_postal_code: formData.route_from_postal_code || '',
        route_from_city: formData.route_from_city || '',
        route_from_address: formData.route_from_address || '',
        route_to_country: formData.route_to_country || '',
        route_to_postal_code: formData.route_to_postal_code || '',
        route_to_city: formData.route_to_city || '',
        route_to_address: formData.route_to_address || '',
        sender_route_from: formData.sender_route_from || '',
        receiver_route_to: formData.receiver_route_to || '',
        order_date: formData.order_date || null,
        loading_date: formData.loading_date || null,
        unloading_date: formData.unloading_date || null,
        loading_date_from: formData.loading_date_from || null,
        loading_date_to: formData.loading_date_to || null,
        unloading_date_from: formData.unloading_date_from || null,
        unloading_date_to: formData.unloading_date_to || null,
        is_partial: formData.is_partial,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        ldm: formData.ldm ? parseFloat(formData.ldm) : null,
        length_m: formData.length_m ? parseFloat(formData.length_m) : null,
        width_m: formData.width_m ? parseFloat(formData.width_m) : null,
        height_m: formData.height_m ? parseFloat(formData.height_m) : null,
        is_palletized: formData.is_palletized,
        is_stackable: formData.is_stackable,
        vehicle_type: formData.vehicle_type || null,
        requires_forklift: formData.requires_forklift,
        requires_crane: formData.requires_crane,
        requires_special_equipment: formData.requires_special_equipment,
        fragile: formData.fragile,
        hazardous: formData.hazardous,
        temperature_controlled: formData.temperature_controlled,
        requires_permit: formData.requires_permit,
        notes: formData.notes || ''
      };
      
      const response = await api.post('/orders/orders/', orderDataToSend);
      const newOrderId = response.data.id;

      // Sukurti vežėjus/sandėlius
      if (orderCarriers.length > 0) {
        for (const carrier of orderCarriers) {
          try {
            const partnerId = carrier.partner_id || carrier.partner?.id;
            if (!partnerId) {
              showToast('info', 'Klaida: vežėjas/sandėlys neturi partnerio ID. Praleidžiamas.');
              continue;
            }
            
            const carrierData = {
              order_id: newOrderId,
              partner_id: partnerId,
              carrier_type: carrier.carrier_type || 'carrier',
              expedition_number: carrier.expedition_number && carrier.expedition_number.trim() !== '' ? carrier.expedition_number.trim() : null,
              sequence_order: carrier.sequence_order || 0,
              price_net: carrier.price_net ? parseFloat(String(carrier.price_net)) : null,
              vat_rate: carrier.vat_rate !== null && carrier.vat_rate !== undefined && carrier.vat_rate !== '' ? String(carrier.vat_rate) : null,
              vat_rate_article: carrier.vat_rate_article && carrier.vat_rate_article.trim() !== '' ? carrier.vat_rate_article.trim() : '',
              route_from: carrier.route_from || '',
              route_to: carrier.route_to || '',
              // Detali maršruto informacija
              route_from_country: carrier.route_from_country || '',
              route_from_postal_code: carrier.route_from_postal_code || '',
              route_from_city: carrier.route_from_city || '',
              route_from_address: carrier.route_from_address || '',
              sender_name: carrier.sender_name || '',
              route_to_country: carrier.route_to_country || '',
              route_to_postal_code: carrier.route_to_postal_code || '',
              route_to_city: carrier.route_to_city || '',
              route_to_address: carrier.route_to_address || '',
              receiver_name: carrier.receiver_name || '',
              loading_date: carrier.loading_date || null,
              unloading_date: carrier.unloading_date || null,
              loading_date_from: carrier.loading_date_from || null,
              loading_date_to: carrier.loading_date_to || null,
              unloading_date_from: carrier.unloading_date_from || null,
              unloading_date_to: carrier.unloading_date_to || null,
              status: carrier.status || 'new',
              invoice_issued: carrier.invoice_issued || false,
              invoice_received: carrier.invoice_received || false,
              payment_status: carrier.payment_status || 'not_paid',
              payment_terms: carrier.payment_terms || '',
              notes: carrier.notes || ''
            };
            await api.post('/orders/carriers/', carrierData);
          } catch (error: any) {
            const errorMsg = error.response?.data?.expedition_number?.[0] ||
                           error.response?.data?.detail || 
                           (typeof error.response?.data === 'object' ? JSON.stringify(error.response?.data) : error.response?.data) ||
                           error.message;
            showToast('error', `Klaida kuriant vežėją/sandėlį: ${errorMsg}`);
            // Neištrinti užsakymo - tiesiog parodyti klaidą ir leisti vartotojui ištaisyti
            throw error;
          }
        }
      }

      // Sukurti krovinių aprašymus
      if (cargoItems.length > 0) {
        for (const cargoItem of cargoItems) {
          try {
            const cargoData = {
              order: newOrderId,
              sequence_order: cargoItem.sequence_order || 0,
              reference_number: cargoItem.reference_number || null,
              description: cargoItem.description || '',
              units: cargoItem.units ? parseInt(String(cargoItem.units)) : null,
              weight_kg: cargoItem.weight_kg ? parseFloat(String(cargoItem.weight_kg)) : null,
              ldm: cargoItem.ldm ? parseFloat(String(cargoItem.ldm)) : null,
              pallet_count: cargoItem.pallet_count ? parseInt(String(cargoItem.pallet_count)) : null,
              package_count: cargoItem.package_count ? parseInt(String(cargoItem.package_count)) : null,
              length_m: cargoItem.length_m ? parseFloat(String(cargoItem.length_m)) : null,
              width_m: cargoItem.width_m ? parseFloat(String(cargoItem.width_m)) : null,
              height_m: cargoItem.height_m ? parseFloat(String(cargoItem.height_m)) : null,
              is_palletized: cargoItem.is_palletized || false,
              is_stackable: cargoItem.is_stackable || false,
              vehicle_type: cargoItem.vehicle_type || null,
              requires_forklift: cargoItem.requires_forklift || false,
              requires_crane: cargoItem.requires_crane || false,
              requires_special_equipment: cargoItem.requires_special_equipment || false,
              fragile: cargoItem.fragile || false,
              hazardous: cargoItem.hazardous || false,
              temperature_controlled: cargoItem.temperature_controlled || false,
              requires_permit: cargoItem.requires_permit || false,
              notes: cargoItem.notes || '',
            };
            await api.post('/orders/cargo-items/', cargoData);
          } catch (error: any) {
            const errorMsg = error.response?.data?.detail || 
                           (typeof error.response?.data === 'object' ? JSON.stringify(error.response?.data) : error.response?.data) ||
                           error.message;
            showToast('error', `Klaida kuriant krovinių aprašymą: ${errorMsg}`);
            throw error;
          }
        }
      }
      
      // Užtikrinti, kad miestai egzistuoja
      if (formData.route_from_city) {
        await ensureCityExists(formData.route_from_city);
      }
      if (formData.route_to_city) {
        await ensureCityExists(formData.route_to_city);
      }
      
      // Užkrauti pilną užsakymą su visais duomenimis
      const fullOrderResponse = await api.get(`/orders/orders/${newOrderId}/`);
      const fullOrder = fullOrderResponse.data;
      
      // Atnaujinti kliento email notification nustatymus, jei pažymėta
      if (selectedClient && selectedClient.is_client && (emailNotifyDueSoon || emailNotifyUnpaid || emailNotifyOverdue)) {
        try {
          const updateData: any = {};
          if (emailNotifyDueSoon !== undefined) updateData.email_notify_due_soon = emailNotifyDueSoon;
          if (emailNotifyUnpaid !== undefined) updateData.email_notify_unpaid = emailNotifyUnpaid;
          if (emailNotifyOverdue !== undefined) updateData.email_notify_overdue = emailNotifyOverdue;
          
          await api.patch(`/partners/partners/${selectedClient.id}/`, updateData);
        } catch (error: any) {
          console.error('Klaida atnaujinant kliento email notification nustatymus:', error);
        }
      }
      
      resetForm();
      fetchRouteSuggestions();
      showToast('success', 'Užsakymas sėkmingai sukurtas');
      onSave(fullOrder);
      onClose();
    } catch (error: any) {
      let errorMessage = 'Klaida kuriant užsakymą';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (typeof error.response.data === 'object') {
          const validationErrors = Object.entries(error.response.data)
            .map(([key, value]: [string, any]) => {
              if (Array.isArray(value)) {
                return `${key}: ${value.join(', ')}`;
              }
              return `${key}: ${value}`;
            })
            .join('\n');
          errorMessage = `Validacijos klaidos:\n${validationErrors}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast('error', errorMessage);
    }
  };

  const handleUpdateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    try {
      const orderData = {
        client_id: parseInt(formData.client_id),
        order_type: formData.order_type,
        order_number: formData.order_number || null,
        client_order_number: formData.client_order_number || '',
        manager_id: formData.manager_id ? parseInt(formData.manager_id) : null,
        status: formData.status,
        price_net: (() => {
          const transportCost = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
          const myPrice = formData.my_price_net ? parseFloat(formData.my_price_net) : 0;
          const otherCosts = formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
          return (transportCost + myPrice + otherCosts) || 0;
        })(),
        client_price_net: formData.client_price_net ? parseFloat(formData.client_price_net) : null,
        my_price_net: (() => {
          if (!formData.my_price_net || formData.my_price_net.trim() === '') {
            return null;
          }
          const parsed = parseFloat(formData.my_price_net);
          // Jei NaN arba neigiamas, grąžinti null
          if (isNaN(parsed) || parsed < 0) {
            return null;
          }
          return parsed;
        })(),
        other_costs: formData.other_costs.length > 0 ? formData.other_costs.map(cost => ({
          description: cost.description,
          amount: parseFloat(String(cost.amount))
        })) : [],
        vat_rate: parseFloat(formData.vat_rate),
        vat_rate_article: formData.vat_rate_article || '',
        client_invoice_issued: formData.client_invoice_issued,
        client_invoice_received: formData.client_invoice_received,
        client_payment_status: formData.client_payment_status,
        route_from: formData.route_from || '',
        route_to: formData.route_to || '',
        route_from_country: formData.route_from_country || '',
        route_from_postal_code: formData.route_from_postal_code || '',
        route_from_city: formData.route_from_city || '',
        route_from_address: formData.route_from_address || '',
        route_to_country: formData.route_to_country || '',
        route_to_postal_code: formData.route_to_postal_code || '',
        route_to_city: formData.route_to_city || '',
        route_to_address: formData.route_to_address || '',
        sender_route_from: formData.sender_route_from || '',
        receiver_route_to: formData.receiver_route_to || '',
        order_date: formData.order_date || null,
        loading_date: formData.loading_date || null,
        unloading_date: formData.unloading_date || null,
        loading_date_from: formData.loading_date_from || null,
        loading_date_to: formData.loading_date_to || null,
        unloading_date_from: formData.unloading_date_from || null,
        unloading_date_to: formData.unloading_date_to || null,
        is_partial: formData.is_partial,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        ldm: formData.ldm ? parseFloat(formData.ldm) : null,
        length_m: formData.length_m ? parseFloat(formData.length_m) : null,
        width_m: formData.width_m ? parseFloat(formData.width_m) : null,
        height_m: formData.height_m ? parseFloat(formData.height_m) : null,
        is_palletized: formData.is_palletized,
        is_stackable: formData.is_stackable,
        vehicle_type: formData.vehicle_type || null,
        requires_forklift: formData.requires_forklift,
        requires_crane: formData.requires_crane,
        requires_special_equipment: formData.requires_special_equipment,
        fragile: formData.fragile,
        hazardous: formData.hazardous,
        temperature_controlled: formData.temperature_controlled,
        requires_permit: formData.requires_permit,
        notes: formData.notes || ''
      };
      
      await api.put(`/orders/orders/${order.id}/`, orderData);

      // Gauname esamus vežėjus/sandėlius
      const existingCarriersResponse = await api.get(`/orders/carriers/?order=${order.id}`);
      const existingCarriers = existingCarriersResponse.data.results || existingCarriersResponse.data || [];
      
      // Ištriname visus esamus vežėjus/sandėlius
      for (const carrier of existingCarriers) {
        await api.delete(`/orders/carriers/${carrier.id}/`);
      }
      
      // Sukuriame naujus vežėjus/sandėlius
      if (orderCarriers.length > 0) {
        for (const carrier of orderCarriers) {
          try {
            const partnerId = carrier.partner_id || carrier.partner?.id;
            if (!partnerId) {
              showToast('info', 'Klaida: vežėjas/sandėlys neturi partnerio ID. Praleidžiamas.');
              continue;
            }
            
            const carrierData = {
              order_id: order.id,
              partner_id: partnerId,
              carrier_type: carrier.carrier_type || 'carrier',
              expedition_number: carrier.expedition_number && carrier.expedition_number.trim() !== '' ? carrier.expedition_number.trim() : null,
              sequence_order: carrier.sequence_order || 0,
              price_net: carrier.price_net ? parseFloat(String(carrier.price_net)) : null,
              vat_rate: carrier.vat_rate !== null && carrier.vat_rate !== undefined && carrier.vat_rate !== '' ? String(carrier.vat_rate) : null,
              vat_rate_article: carrier.vat_rate_article && carrier.vat_rate_article.trim() !== '' ? carrier.vat_rate_article.trim() : '',
              route_from: carrier.route_from || '',
              route_to: carrier.route_to || '',
              // Detali maršruto informacija
              route_from_country: carrier.route_from_country || '',
              route_from_postal_code: carrier.route_from_postal_code || '',
              route_from_city: carrier.route_from_city || '',
              route_from_address: carrier.route_from_address || '',
              sender_name: carrier.sender_name || '',
              route_to_country: carrier.route_to_country || '',
              route_to_postal_code: carrier.route_to_postal_code || '',
              route_to_city: carrier.route_to_city || '',
              route_to_address: carrier.route_to_address || '',
              receiver_name: carrier.receiver_name || '',
              loading_date: carrier.loading_date || null,
              unloading_date: carrier.unloading_date || null,
              loading_date_from: carrier.loading_date_from || null,
              loading_date_to: carrier.loading_date_to || null,
              unloading_date_from: carrier.unloading_date_from || null,
              unloading_date_to: carrier.unloading_date_to || null,
              status: carrier.status || 'new',
              invoice_issued: carrier.invoice_issued || false,
              invoice_received: carrier.invoice_received || false,
              invoice_received_date: carrier.invoice_received_date || null,
              payment_days: carrier.payment_days || null,
              due_date: carrier.due_date || null,
              payment_status: carrier.payment_status || 'not_paid',
              payment_date: carrier.payment_date || null,
              payment_terms: carrier.payment_terms || '',
              notes: carrier.notes || ''
            };
            await api.post('/orders/carriers/', carrierData);
          } catch (error: any) {
            const errorMsg = error.response?.data?.detail || 
                           (typeof error.response?.data === 'object' ? JSON.stringify(error.response?.data) : error.response?.data) ||
                           error.message;
            showToast('error', `Klaida kuriant vežėją/sandėlį: ${errorMsg}`);
            throw error;
          }
        }
      }

      // Gauname esamus krovinių aprašymus
      const existingCargoResponse = await api.get(`/orders/cargo-items/?order=${order.id}`);
      const existingCargoItems = existingCargoResponse.data.results || existingCargoResponse.data || [];
      
      // Ištriname visus esamus krovinių aprašymus
      for (const cargoItem of existingCargoItems) {
        try {
          await api.delete(`/orders/cargo-items/${cargoItem.id}/`);
        } catch (error: any) {
          // Ignoruoti klaidas
        }
      }
      
      // Sukuriame naujus krovinių aprašymus
      if (cargoItems.length > 0) {
        for (const cargoItem of cargoItems) {
          try {
            const cargoData = {
              order: order.id,
              sequence_order: cargoItem.sequence_order || 0,
              reference_number: cargoItem.reference_number || null,
              description: cargoItem.description || '',
              units: cargoItem.units ? parseInt(String(cargoItem.units)) : null,
              weight_kg: cargoItem.weight_kg ? parseFloat(String(cargoItem.weight_kg)) : null,
              ldm: cargoItem.ldm ? parseFloat(String(cargoItem.ldm)) : null,
              pallet_count: cargoItem.pallet_count ? parseInt(String(cargoItem.pallet_count)) : null,
              package_count: cargoItem.package_count ? parseInt(String(cargoItem.package_count)) : null,
              length_m: cargoItem.length_m ? parseFloat(String(cargoItem.length_m)) : null,
              width_m: cargoItem.width_m ? parseFloat(String(cargoItem.width_m)) : null,
              height_m: cargoItem.height_m ? parseFloat(String(cargoItem.height_m)) : null,
              is_palletized: cargoItem.is_palletized || false,
              is_stackable: cargoItem.is_stackable || false,
              vehicle_type: cargoItem.vehicle_type || null,
              requires_forklift: cargoItem.requires_forklift || false,
              requires_crane: cargoItem.requires_crane || false,
              requires_special_equipment: cargoItem.requires_special_equipment || false,
              fragile: cargoItem.fragile || false,
              hazardous: cargoItem.hazardous || false,
              temperature_controlled: cargoItem.temperature_controlled || false,
              requires_permit: cargoItem.requires_permit || false,
              notes: cargoItem.notes || '',
            };
            await api.post('/orders/cargo-items/', cargoData);
          } catch (error: any) {
            const errorMsg = error.response?.data?.detail || 
                           (typeof error.response?.data === 'object' ? JSON.stringify(error.response?.data) : error.response?.data) ||
                           error.message;
            showToast('error', `Klaida kuriant krovinių aprašymą: ${errorMsg}`);
            throw error;
          }
        }
      }
      
      // Užtikrinti, kad miestai egzistuoja
      if (formData.route_from_city) {
        await ensureCityExists(formData.route_from_city);
      }
      if (formData.route_to_city) {
        await ensureCityExists(formData.route_to_city);
      }
      
      // Užkrauti pilną užsakymą su visais duomenimis
      const fullOrderResponse = await api.get(`/orders/orders/${order.id}/`);
      const fullOrder = fullOrderResponse.data;
      
      // Atnaujinti kliento email notification nustatymus, jei pažymėta
      if (selectedClient && selectedClient.is_client && (emailNotifyDueSoon || emailNotifyUnpaid || emailNotifyOverdue)) {
        try {
          const updateData: any = {};
          if (emailNotifyDueSoon !== undefined) updateData.email_notify_due_soon = emailNotifyDueSoon;
          if (emailNotifyUnpaid !== undefined) updateData.email_notify_unpaid = emailNotifyUnpaid;
          if (emailNotifyOverdue !== undefined) updateData.email_notify_overdue = emailNotifyOverdue;
          
          await api.patch(`/partners/partners/${selectedClient.id}/`, updateData);
        } catch (error: any) {
          console.error('Klaida atnaujinant kliento email notification nustatymus:', error);
        }
      }
      
      resetForm();
      fetchRouteSuggestions();
      showToast('success', 'Užsakymas sėkmingai atnaujintas');
      onSave(fullOrder);
      if (onOrderUpdate) {
        onOrderUpdate(fullOrder);
      }
      onClose();
    } catch (error: any) {
      let errorMessage = 'Klaida atnaujinant užsakymą';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (typeof error.response.data === 'object') {
          const validationErrors = Object.entries(error.response.data)
            .map(([key, value]: [string, any]) => {
              if (Array.isArray(value)) {
                return `${key}: ${value.join(', ')}`;
              }
              return `${key}: ${value}`;
            })
            .join('\n');
          errorMessage = `Validacijos klaidos:\n${validationErrors}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast('error', errorMessage);
    }
  };

  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '8px 15px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            {order ? 'Redaguoti užsakymą' : 'Naujas užsakymas'}
          </h2>
          <button
            onClick={onClose}
            className="button button-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            ✕ Uždaryti
          </button>
        </div>
        
        <div style={{ padding: '10px 15px', overflowY: 'auto', flex: 1 }}>

          <form onSubmit={isEditMode ? handleUpdateOrder : handleCreateOrder}>
            {/* 3 stulpelių struktūra */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {/* Stulpelis 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Klientas */}
              <div style={{ 
                border: '1px solid #dee2e6', 
                borderRadius: '4px', 
                  padding: '6px', 
                backgroundColor: '#f8f9fa',
                display: 'flex',
                flexDirection: 'column',
                  minHeight: selectedClient ? 'auto' : '60px'
              }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>👤 Klientas *</h4>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Ieškoti kliento (įveskite bent 2 simbolius)..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '4px 75px 4px 6px',
                      fontSize: '11px'
                    }}
                  />
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowPartnerModal(true)}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '2px 6px',
                      fontSize: '10px',
                      minWidth: 'auto',
                      height: '20px'
                    }}
                    title="Sukurti naują klientą"
                  >
                    ➕
                  </button>
                  {clients.length > 0 ? (
                    <div className="client-dropdown">
                      {clients.map((client) => (
                        <div
                          key={client.id}
                          className="client-dropdown-item"
                          onClick={() => handleClientSelect(client)}
                        >
                          {client.name} ({client.code})
                          {((client as any).has_code_errors || (client as any).code_valid === false || (client as any).vat_code_valid === false) && (
                            <span style={{ fontSize: '10px', color: '#c0392b', fontWeight: 600, marginLeft: '4px' }} title="Trūksta rekvizitų">(Trūksta duomenų)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {/* Kliento informacijos rodymas po pasirinkimo */}
                {selectedClient && (
                  <div style={{ 
                    marginTop: '6px', 
                    padding: '6px', 
                    backgroundColor: '#fff', 
                    borderRadius: '4px',
                    border: '1px solid #ced4da',
                    fontSize: '10px',
                    lineHeight: '1.4'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <h5 style={{ margin: '0', fontSize: '11px', fontWeight: 'bold' }}>Kliento informacija</h5>
                      {selectedClient.vat_code && (
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
                          🔍 Patikslinti
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '4px' }}>
                      {selectedClient.code && <div><strong>Kodas:</strong> {selectedClient.code}</div>}
                      {selectedClient.vat_code && <div><strong>PVM kodas:</strong> {selectedClient.vat_code}</div>}
                      {selectedClient.payment_term_days && <div><strong>Mokėjimo terminas:</strong> {selectedClient.payment_term_days} d.</div>}
                    </div>
                    {selectedClient.address && (
                      <div style={{ marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #e9ecef' }}>
                        <strong>Adresas:</strong> {selectedClient.address}
                      </div>
                    )}
                    {selectedClient.contact_person && (
                      <div style={{ marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #e9ecef' }}>
                        <strong>Kontaktinis asmuo:</strong>
                        <div style={{ marginLeft: '6px', marginTop: '2px', fontSize: '9px' }}>
                          {selectedClient.contact_person.first_name} {selectedClient.contact_person.last_name}
                          {selectedClient.contact_person.position && <div style={{ color: '#6c757d' }}>{selectedClient.contact_person.position}</div>}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                            {selectedClient.contact_person.email && <span>📧 {selectedClient.contact_person.email}</span>}
                            {selectedClient.contact_person.phone && <span>📞 {selectedClient.contact_person.phone}</span>}
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedClient.contacts && selectedClient.contacts.length > 0 && (
                      <div style={{ marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #e9ecef' }}>
                        <strong>Kiti kontaktai ({selectedClient.contacts.length}):</strong>
                        {selectedClient.contacts.slice(0, 2).map((contact: Contact, idx: number) => (
                          <div key={contact.id || idx} style={{ marginLeft: '6px', marginTop: '2px', fontSize: '9px' }}>
                            {contact.first_name} {contact.last_name}
                            {(contact.email || contact.phone) && (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '1px' }}>
                                {contact.email && <span>📧 {contact.email}</span>}
                                {contact.phone && <span>📞 {contact.phone}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                        {selectedClient.contacts.length > 2 && (
                          <div style={{ marginLeft: '6px', marginTop: '2px', fontSize: '9px', color: '#6c757d' }}>
                            + dar {selectedClient.contacts.length - 2} kontaktų
                          </div>
                        )}
                      </div>
                    )}
                    {selectedClient.notes && (
                      <div style={{ fontSize: '9px', color: '#6c757d', marginTop: '3px' }}>
                        <strong>Pastabos:</strong> {selectedClient.notes}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Kliento sąskaitų statusas - rodomas tik redaguojant užsakymą */}
                {isEditMode && (
                  <div style={{ 
                    marginTop: '6px', 
                    padding: '6px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '4px',
                    border: '1px solid #007bff'
                  }}>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#007bff' }}>
                      📄 Kliento sąskaitų statusas
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '4px' }}>
                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                          <input
                            type="checkbox"
                            checked={formData.client_invoice_issued}
                            onChange={(e) => setFormData({ ...formData, client_invoice_issued: e.target.checked })}
                          />
                          <span>Išrašyta sąskaita</span>
                        </label>
                      </div>
                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                          <input
                            type="checkbox"
                            checked={formData.client_invoice_received}
                            onChange={(e) => setFormData({ ...formData, client_invoice_received: e.target.checked })}
                          />
                          <span>Gauta sąskaita</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* El. pašto priminimų pasirinkimai */}
                {selectedClient && selectedClient.is_client && (
                  <div style={{ 
                    marginTop: '6px', 
                    padding: '6px', 
                    backgroundColor: '#f0f9ff', 
                    borderRadius: '4px',
                    border: '1px solid #bae6fd'
                  }}>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#495057' }}>
                      📧 El. pašto priminimai apie sąskaitas
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '10px' }}>
                        <input
                          type="checkbox"
                          checked={emailNotifyDueSoon}
                          onChange={(e) => setEmailNotifyDueSoon(e.target.checked)}
                        />
                        <span>Siųsti priminimą apie artėjantį terminą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={emailNotifyUnpaid}
                          onChange={(e) => setEmailNotifyUnpaid(e.target.checked)}
                        />
                        <span>Siųsti priminimą apie suėjusį terminą ir neapmokėtą sąskaitą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={emailNotifyOverdue}
                          onChange={(e) => setEmailNotifyOverdue(e.target.checked)}
                        />
                        <span>Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą</span>
                      </label>
                      <small style={{ fontSize: '9px', color: '#666', marginTop: '3px', display: 'block' }}>
                        Pastaba: Priminimai bus siunčiami klientui apie sąskaitas, susijusias su šiuo užsakymu.
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {/* Pakrovimo ir Iškrovimo datų intervalai */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>📅 Datos</h4>
                {/* Pakrovimo intervalas */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>📅 Pakrovimas nuo *</label>
                    <input
                      type="datetime-local"
                      value={formData.loading_date_from || ''}
                      onChange={(e) => setFormData({ ...formData, loading_date_from: e.target.value })}
                      required
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>📅 Pakrovimas iki <small>(neprivaloma)</small></label>
                    <input
                      type="datetime-local"
                      value={formData.loading_date_to || ''}
                      onChange={(e) => setFormData({ ...formData, loading_date_to: e.target.value })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                </div>

                {/* Iškrovimo intervalas */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>📅 Iškrovimas nuo *</label>
                    <input
                      type="datetime-local"
                      value={formData.unloading_date_from || ''}
                      onChange={(e) => setFormData({ ...formData, unloading_date_from: e.target.value })}
                      required
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>📅 Iškrovimas iki <small>(neprivaloma)</small></label>
                    <input
                      type="datetime-local"
                      value={formData.unloading_date_to || ''}
                      onChange={(e) => setFormData({ ...formData, unloading_date_to: e.target.value })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                    />
                  </div>
                </div>
            </div>

              {/* Kainos */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>💰 Kainos</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {/* 1. Kaina klientui (be PVM) */}
                    <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>Kaina klientui (be PVM) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.client_price_net}
                      onChange={handleClientPriceChange}
                      placeholder="0.00"
                        required
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                      />
                </div>
                
                  {/* 2. PVM tarifas */}
                    <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>PVM tarifas *</label>
                    <select
                      value={pvmRates.find(r => r.rate === formData.vat_rate && r.article === formData.vat_rate_article)?.id || ''}
                      onChange={(e) => {
                        const selectedRate = pvmRates.find(r => r.id === parseInt(e.target.value));
                        if (selectedRate) {
                          setFormData({
                            ...formData,
                            vat_rate: selectedRate.rate,
                            vat_rate_article: selectedRate.article || ''
                          });
                        }
                      }}
                        required
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px' }}
                    >
                      <option value="">-- Pasirinkite PVM tarifą --</option>
                      {pvmRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.rate}%{rate.article ? ` - ${rate.article}` : ''}
                        </option>
                      ))}
                    </select>
                    {formData.vat_rate_article && (
                      <small style={{ color: '#666', fontSize: '9px', display: 'block', marginTop: '2px' }}>
                        Straipsnis: {formData.vat_rate_article}
                      </small>
                    )}
                    {pvmRates.length === 0 && (
                      <small style={{ color: '#dc3545', fontSize: '9px', display: 'block', marginTop: '2px' }}>
                        PVM tarifų nėra. Prašome pridėti nustatymuose.
                      </small>
                    )}
                    </div>

                  {/* 3. Pervežimo/sandėliavimo išlaidos (be PVM) */}
                    <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>Pervežimo/sandėliavimo išlaidos (be PVM):</label>
                    <input
                      type="text"
                      value={(() => {
                        const total = orderCarriers.reduce((sum, c) => sum + (c.price_net ? parseFloat(String(c.price_net)) : 0), 0);
                        return formatMoney(total);
                      })()}
                      disabled
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', backgroundColor: '#f9f9f9', cursor: 'not-allowed' }}
                      />
            </div>

                  {/* 4. Kitos išlaidos */}
              <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>Kitos išlaidos:</label>
                <input
                      type="text"
                      value={(() => {
                        const total = formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0);
                        return formatMoney(total);
                      })()}
                      disabled
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', backgroundColor: '#f9f9f9', cursor: 'not-allowed' }}
                />
              </div>

                  {/* 5. Pelnas (be PVM) - buvo "Mano kaina" */}
              <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '10px', marginBottom: '2px' }}>
                      Pelnas (be PVM):
                      <span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal', marginLeft: '4px' }}>
                        (auto)
                      </span>
                    </label>
                <input
                      type="number"
                      step="0.01"
                      value={formData.my_price_net}
                      onChange={handleMyPriceChange}
                      placeholder="0.00"
                      readOnly={!myPriceManuallyEdited.current}
                      style={{ 
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: '11px',
                        ...(myPriceManuallyEdited.current ? {} : { backgroundColor: '#f9f9f9', cursor: 'not-allowed' })
                      }}
                    />
                    <small style={{ color: '#666', fontSize: '9px', display: 'block', marginTop: '2px' }}>
                      Automatiškai: Kaina klientui - Visos išlaidos (vežėjų kainos + kitos išlaidos)
                    </small>
                  </div>
              </div>
            </div>

              {/* Krovinių informacija */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ margin: '0 0 0 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>
                    📦 Krovinių informacija
                  </h4>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleAddCargoItem}
                    style={{ padding: '2px 5px', fontSize: '9px', marginLeft: '4px' }}
                  >
                    + Pridėti krovinį
                  </button>
                </div>
                
                {cargoItems.length > 0 ? (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '3px', backgroundColor: 'white', maxHeight: '120px', overflowY: 'auto' }}>
                    {cargoItems.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          padding: '4px',
                          marginBottom: index < cargoItems.length - 1 ? '3px' : '0',
                          borderBottom: index < cargoItems.length - 1 ? '1px solid #eee' : 'none',
                          backgroundColor: '#fafafa',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '11px' }}>
                            Krovinys #{index + 1}
                            {item.description && (
                              <span style={{ marginLeft: '6px', color: '#666', fontWeight: 'normal' }}>
                                - {item.description}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: '#666', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginTop: '3px' }}>
                            {item.weight_kg && (
                              <div><strong>Svoris:</strong> {item.weight_kg} kg</div>
                            )}
                            {item.ldm && (
                              <div><strong>LDM:</strong> {item.ldm}</div>
                            )}
                            {item.length_m && item.width_m && item.height_m && (
                              <div><strong>Matmenys:</strong> {item.length_m}×{item.width_m}×{item.height_m} m</div>
                            )}
                            {item.vehicle_type && (
                              <div><strong>Mašinos tipas:</strong> {item.vehicle_type}</div>
                            )}
                            {(item.is_palletized || item.is_stackable) && (
                              <div>
                                <strong>Savybės:</strong>{' '}
                                {item.is_palletized && 'Paletemis'}
                                {item.is_palletized && item.is_stackable && ', '}
                                {item.is_stackable && 'Stabeliuojamas'}
                              </div>
                            )}
                            {(item.requires_forklift || item.requires_crane || item.fragile || item.hazardous) && (
                              <div>
                                <strong>Papildoma:</strong>{' '}
                                {[
                                  item.requires_forklift && 'Keltuvas',
                                  item.requires_crane && 'Kranas',
                                  item.fragile && 'Trapus',
                                  item.hazardous && 'Pavojingas'
                                ].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleEditCargoItem(item, index)}
                            style={{ padding: '3px 6px', fontSize: '9px' }}
                          >
                            Redaguoti
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleDeleteCargoItem(index)}
                            style={{ padding: '3px 6px', fontSize: '9px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                          >
                            Trinti
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: '4px', backgroundColor: '#fafafa', fontSize: '10px' }}>
                    Nėra pridėtų krovinių aprašymų
                  </div>
                )}
              </div>

              {/* Vežėjai ir sandėliai */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ margin: '0 0 0 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>🚚 Vežėjai ir sandėliai</h4>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleAddCarrier('carrier')}
                      style={{ padding: '2px 5px', fontSize: '9px' }}
                    >
                      + Vežėjas
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleAddCarrier('warehouse')}
                      style={{ padding: '2px 5px', fontSize: '9px' }}
                    >
                      + Sandėlys
                    </button>
                  </div>
                </div>
                
                {orderCarriers.length > 0 ? (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '3px', backgroundColor: '#f9f9f9', maxHeight: '120px', overflowY: 'auto' }}>
                    {orderCarriers.map((carrier, index) => (
                      <div 
                        key={index}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '4px',
                          marginBottom: index < orderCarriers.length - 1 ? '3px' : '0',
                          borderBottom: index < orderCarriers.length - 1 ? '1px solid #eee' : 'none',
                          backgroundColor: 'white',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', marginBottom: '2px', fontSize: '11px' }}>
                            {carrier.sequence_order + 1}. {carrier.carrier_type_display}: {carrier.partner?.name || 'Partneris nenurodytas'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#666' }}>
                            Kaina: {carrier.price_net ? formatMoney(carrier.price_net) : 'Nenustatyta'}
                            {carrier.route_from && carrier.route_to && (
                              <span style={{ marginLeft: '6px' }}>
                                | {carrier.route_from} → {carrier.route_to}
                              </span>
                            )}
                          </div>
                          {carrier.status_display && (
                            <div style={{ fontSize: '9px', color: '#999', marginTop: '2px' }}>
                              Būklė: {carrier.status_display}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleEditCarrier(carrier, index)}
                            style={{ padding: '3px 6px', fontSize: '9px' }}
                          >
                            Redaguoti
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => handleDeleteCarrier(index)}
                            style={{ padding: '3px 6px', fontSize: '9px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                          >
                            Trinti
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: '4px', backgroundColor: '#fafafa', fontSize: '10px' }}>
                    Nėra pridėtų vežėjų arba sandėlių
                  </div>
                )}
            </div>

              {/* Kitos išlaidos */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ margin: '0 0 0 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>💸 Kitos išlaidos</h4>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setEditingOtherCost({ description: '', amount: '' });
                      setEditingOtherCostIndex(null);
                    }}
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                  >
                    + Pridėti išlaidą
                  </button>
                </div>
                  
                  {formData.other_costs.length > 0 && (
                    <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '3px', backgroundColor: 'white', marginBottom: '3px', maxHeight: '100px', overflowY: 'auto' }}>
                      {formData.other_costs.map((cost, index) => (
                        <div 
                          key={index}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '4px',
                            marginBottom: index < formData.other_costs.length - 1 ? '3px' : '0',
                            borderBottom: index < formData.other_costs.length - 1 ? '1px solid #eee' : 'none',
                            backgroundColor: '#fafafa',
                            borderRadius: '4px'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '500', marginBottom: '2px', fontSize: '11px' }}>{cost.description}</div>
                            <div style={{ fontSize: '10px', color: '#666' }}>
                              {formatMoney(typeof cost.amount === 'number' ? cost.amount : cost.amount)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                setEditingOtherCost({ description: cost.description, amount: String(cost.amount) });
                                setEditingOtherCostIndex(index);
                              }}
                              style={{ padding: '2px 6px', fontSize: '9px' }}
                            >
                              Redaguoti
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                const newCosts = [...formData.other_costs];
                                newCosts.splice(index, 1);
                                setFormData({ ...formData, other_costs: newCosts });
                                myPriceManuallyEdited.current = false;
                                setTimeout(() => calculateMyPrice(true), 50);
                              }}
                              style={{ padding: '2px 6px', fontSize: '9px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                            >
                              Trinti
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bendras kitų išlaidų suma */}
                  {formData.other_costs.length > 0 && (
                    <div style={{ textAlign: 'right', fontSize: '11px', fontWeight: '500', color: '#666', marginTop: '4px' }}>
                      Iš viso kitų išlaidų: {formatMoney(formData.other_costs.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount)) || 0), 0))}
                    </div>
                  )}
              </div>
              </div>

              {/* Stulpelis 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Maršrutas iš */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#f8f9fa' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#495057' }}>📍 Maršrutas iš *</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <RouteContactField
                      contactType="sender"
                      value={formData.sender_route_from}
                      onChange={(value) => setFormData({ ...formData, sender_route_from: value })}
                      onContactSelect={(contact) => {
                        setFormData({
                          ...formData,
                          sender_route_from: contact.name,
                          route_from_country: contact.country || formData.route_from_country,
                          route_from_postal_code: contact.postal_code || formData.route_from_postal_code,
                          route_from_city: contact.city || formData.route_from_city,
                          route_from_address: contact.address || formData.route_from_address
                        });
                      }}
                      label="Siuntejas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_from_country"
                      value={formData.route_from_country}
                      onChange={(value) => setFormData({ ...formData, route_from_country: value })}
                      label="Šalis"
                      required
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_from_postal_code"
                      value={formData.route_from_postal_code}
                      onChange={(value) => setFormData({ ...formData, route_from_postal_code: value })}
                      label="Pašto kodas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_from_city"
                      value={formData.route_from_city}
                      onChange={(value) => setFormData({ ...formData, route_from_city: value })}
                      label="Miestas"
                      minLength={1}
                      debounceMs={200}
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_from_address"
                      value={formData.route_from_address}
                      onChange={(value) => setFormData({ ...formData, route_from_address: value })}
                      label="Adresas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Maršrutas į */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#f8f9fa' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#495057' }}>📍 Maršrutas į *</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <RouteContactField
                      contactType="receiver"
                      value={formData.receiver_route_to}
                      onChange={(value) => setFormData({ ...formData, receiver_route_to: value })}
                      onContactSelect={(contact) => {
                        setFormData({
                          ...formData,
                          receiver_route_to: contact.name,
                          route_to_country: contact.country || formData.route_to_country,
                          route_to_postal_code: contact.postal_code || formData.route_to_postal_code,
                          route_to_city: contact.city || formData.route_to_city,
                          route_to_address: contact.address || formData.route_to_address
                        });
                      }}
                      label="Gavejas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_to_country"
                      value={formData.route_to_country}
                      onChange={(value) => setFormData({ ...formData, route_to_country: value })}
                      label="Šalis"
                      required
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_to_postal_code"
                      value={formData.route_to_postal_code}
                      onChange={(value) => setFormData({ ...formData, route_to_postal_code: value })}
                      label="Pašto kodas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_to_city"
                      value={formData.route_to_city}
                      onChange={(value) => setFormData({ ...formData, route_to_city: value })}
                      label="Miestas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <AutocompleteField
                      fieldType="route_to_address"
                      value={formData.route_to_address}
                      onChange={(value) => setFormData({ ...formData, route_to_address: value })}
                      label="Adresas"
                      style={{ padding: '4px 5px', fontSize: '11px' }}
                    />
                  </div>
                </div>
              </div>
              </div>

              {/* Stulpelis 3 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Pagrindinė info */}
                <div style={{ 
                  border: '1px solid #dee2e6', 
                  borderRadius: '4px', 
                  padding: '6px', 
                  backgroundColor: '#fff'
                }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>ℹ️ Informacija</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '10px', marginBottom: '2px' }}>Užsakymo tipas *</label>
                      <AutocompleteField
                        fieldType="order_type"
                        value={formData.order_type}
                        onChange={(value) => setFormData({ ...formData, order_type: value })}
                        placeholder="Pasirinkite užsakymo tipą..."
                        required
                        style={{ width: '100%', fontSize: '11px' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '10px', marginBottom: '2px' }}>Užsakovo užs. Nr.</label>
                      <input
                        type="text"
                        value={formData.client_order_number || ''}
                        onChange={(e) => setFormData({ ...formData, client_order_number: e.target.value })}
                        placeholder="PVZ: PO-12345"
                        style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                      />
                    </div>
                    {isEditMode && (
                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label style={{ fontSize: '10px', marginBottom: '2px' }}>Užsakymo numeris</label>
                        <input
                          type="text"
                          value={formData.order_number || ''}
                          onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                          placeholder="Pvz.: 2025-001"
                          style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                        />
                        <small style={{ color: '#666', fontSize: '9px', marginTop: '1px', display: 'block' }}>
                          Galite redaguoti užsakymo numerį
                        </small>
                      </div>
                    )}
                    {isEditMode && (
                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label style={{ fontSize: '10px', marginBottom: '2px' }}>Mokėjimo būklė</label>
                        <select
                          value={formData.client_payment_status}
                          onChange={(e) => setFormData({ ...formData, client_payment_status: e.target.value as 'not_paid' | 'partially_paid' | 'paid' })}
                          style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                        >
                          <option value="not_paid">Neapmokėta</option>
                          <option value="partially_paid">Dalinai apmokėta</option>
                          <option value="paid">Apmokėta</option>
                        </select>
                      </div>
                    )}
                    {isEditMode && (
                      <div className="form-group" style={{ marginBottom: '0' }}>
                        <label style={{ fontSize: '10px', marginBottom: '2px' }}>Būsena</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                          style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                        >
                          <option value="new">Naujas</option>
                          <option value="assigned">Priskirtas</option>
                          <option value="executing">Vykdomas</option>
                          <option value="waiting_for_docs">Laukiama Dokumentų</option>
                          <option value="finished">Baigtas</option>
                          <option value="canceled">Atšauktas</option>
                        </select>
                      </div>
                    )}
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '10px', marginBottom: '2px' }}>Užsakymo data</label>
                      <input
                        type="date"
                        value={formData.order_date ? formData.order_date.split('T')[0] : ''}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value ? `${e.target.value}T00:00` : '' })}
                        style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '10px', marginBottom: '2px' }}>Vadybininkas</label>
                      <select
                        value={formData.manager_id}
                        onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                        style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                      >
                        <option value="">Nepasirinkta</option>
                        {allManagers.map((manager) => {
                          const managerWithNames = manager as User & { first_name?: string; last_name?: string; email?: string };
                          return (
                            <option key={manager.id} value={manager.id.toString()}>
                              {managerWithNames.first_name && managerWithNames.last_name 
                                ? `${managerWithNames.first_name} ${managerWithNames.last_name}`
                                : manager.username}
                            </option>
                          );
                        })}
                      </select>
                    </div>
              </div>
            </div>

            {/* Pastabos */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>📝 Pastabos</h4>
              <div className="form-group" style={{ marginBottom: '0' }}>
                <AutocompleteTextarea
                  fieldType="order_notes"
                  value={formData.notes}
                  onChange={(value) => setFormData({ ...formData, notes: value })}
                      rows={isEditMode ? 6 : 8}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', resize: 'vertical' }}
                />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Atšaukti
              </button>
              <button type="submit" className="button" style={{ padding: '6px 12px', fontSize: '12px' }}>
                {isEditMode ? 'Išsaugoti' : 'Sukurti'}
              </button>
            </div>
          </form>
        </div>
        
        {/* Carrier Modal */}
        <CarrierModal
          carrier={editingCarrier}
          carrierType={carrierFormType}
          isOpen={showCarrierModal}
          onClose={() => {
            setShowCarrierModal(false);
            setEditingCarrier(null);
            setEditingCarrierIndex(null);
          }}
          onSave={handleSaveCarrier}
          showToast={showToast}
          onCarrierPriceChange={() => {
            myPriceManuallyEdited.current = false;
            setTimeout(() => calculateMyPrice(true), 50);
          }}
          isStandalone={false}
          orderRouteFrom={formData.route_from || ''}
          orderRouteTo={formData.route_to || ''}
          orderRouteFromCountry={formData.route_from_country || ''}
          orderRouteFromPostalCode={formData.route_from_postal_code || ''}
          orderRouteFromCity={formData.route_from_city || ''}
          orderRouteFromAddress={formData.route_from_address || ''}
          orderSenderName={formData.sender_route_from || ''}
          orderRouteToCountry={formData.route_to_country || ''}
          orderRouteToPostalCode={formData.route_to_postal_code || ''}
          orderRouteToCity={formData.route_to_city || ''}
          orderRouteToAddress={formData.route_to_address || ''}
          orderReceiverName={formData.receiver_route_to || ''}
          orderLoadingDate={formData.loading_date || null}
          orderLoadingDateFrom={formData.loading_date_from || null}
          orderLoadingDateTo={formData.loading_date_to || null}
          orderUnloadingDate={formData.unloading_date || null}
          orderUnloadingDateFrom={formData.unloading_date_from || null}
          orderUnloadingDateTo={formData.unloading_date_to || null}
          orderVatRate={formData.vat_rate || null}
          orderVatRateArticle={formData.vat_rate_article || null}
        />

        {/* Cargo Item Modal */}
        <CargoItemModal
          cargoItem={editingCargoItem}
          isOpen={showCargoItemModal}
          onClose={() => {
            setShowCargoItemModal(false);
            setEditingCargoItem(null);
            setEditingCargoItemIndex(null);
          }}
          onSave={handleSaveCargoItem}
        />

        {/* Partner Create Modal */}
        <PartnerCreateModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
          onSave={handlePartnerSave}
          showToast={showToast}
        />

        {/* Confirm Dialog */}
        {confirmState.open && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '400px', width: '90%' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>{confirmState.title || 'Patvirtinkite'}</h3>
              <p style={{ margin: '0 0 20px 0' }}>{confirmState.message || 'Ar tikrai norite tęsti?'}</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  className="button button-secondary"
                  onClick={() => setConfirmState({ open: false })}
                  style={{ padding: '8px 16px' }}
                >
                  Atšaukti
                </button>
                {confirmState.onConfirm && (
                  <button
                    className="button"
                    onClick={() => {
                      if (confirmState.onConfirm) {
                        confirmState.onConfirm();
                      }
                    }}
                    style={{ padding: '8px 16px' }}
                  >
                    Patvirtinti
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Other Cost Edit Modal */}
        {editingOtherCost !== null && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '400px', width: '90%' }}>
              <h3 style={{ margin: '0 0 15px 0' }}>{editingOtherCostIndex !== null ? 'Redaguoti išlaidą' : 'Pridėti išlaidą'}</h3>
              <div className="form-group">
                <label>Aprašymas</label>
                <input
                  type="text"
                  value={editingOtherCost?.description || ''}
                  onChange={(e) => editingOtherCost && setEditingOtherCost({ ...editingOtherCost, description: e.target.value })}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                />
              </div>
              <div className="form-group">
                <label>Suma</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingOtherCost?.amount || ''}
                  onChange={(e) => editingOtherCost && setEditingOtherCost({ ...editingOtherCost, amount: e.target.value })}
                  style={{ width: '100%', padding: '4px 6px', fontSize: '11px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setEditingOtherCost(null);
                    setEditingOtherCostIndex(null);
                  }}
                  style={{ padding: '8px 16px' }}
                >
                  Atšaukti
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (editingOtherCost && editingOtherCost.description && editingOtherCost.amount) {
                      const newCosts = [...formData.other_costs];
                      if (editingOtherCostIndex !== null && editingOtherCostIndex >= 0 && editingOtherCostIndex < newCosts.length) {
                        newCosts[editingOtherCostIndex] = {
                          description: editingOtherCost.description,
                          amount: parseFloat(editingOtherCost.amount)
                        };
                      } else {
                        newCosts.push({
                          description: editingOtherCost.description,
                          amount: parseFloat(editingOtherCost.amount)
                        });
                      }
                      setFormData({ ...formData, other_costs: newCosts });
                      setEditingOtherCost(null);
                      setEditingOtherCostIndex(null);
                      myPriceManuallyEdited.current = false;
                      setTimeout(() => calculateMyPrice(true), 50);
                    }
                  }}
                  style={{ padding: '8px 16px' }}
                >
                  Išsaugoti
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderEditModal;

