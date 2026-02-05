import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import AutocompleteTextarea from '../AutocompleteTextarea';
import AutocompleteField from '../AutocompleteField';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import RouteContactField from '../RouteContactField';
import PartnerEditModal from '../partners/PartnerEditModal';
import '../../pages/OrdersPage.css';

// Paprastas modal naujam partneriui kurti (vežėjui)
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
        is_client: false,
        is_supplier: true,
        payment_term_days: 0,
        email_notify_due_soon: false,
        email_notify_unpaid: false,
        email_notify_overdue: false,
        email_notify_manager_invoices: false,
        notes: '',
        status: 'active'
      };

      const response = await api.post('/partners/partners/', partnerData);
      onSave(response.data);
      showToast('success', `Partneris "${response.data.name}" sukurtas`);
      onClose();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message || 'Nepavyko sukurti partnerio';
      showToast('error', errorMsg);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', code: '', vat_code: '' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>Sukurti naują partnerį (vežėją)</h3>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Firmos pavadinimas *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Įveskite firmos pavadinimą"
                required
              />
            </div>
            <div className="form-group">
              <label>Įmonės kodas *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Įveskite įmonės kodą"
                required
              />
            </div>
            <div className="form-group">
              <label>PVM kodas</label>
              <input
                type="text"
                value={formData.vat_code}
                onChange={(e) => setFormData({ ...formData, vat_code: e.target.value })}
                placeholder="Įveskite PVM kodą"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Atšaukti
            </button>
            <button type="submit" className="button button-primary">
              Sukurti partnerį
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Interfaces
interface Client {
  id: number;
  name: string;
  code: string;
}

interface PVMRate {
  id: number;
  rate: string;
  article: string;
  is_active: boolean;
}

interface OrderCarrier {
  id?: number;
  order_id?: number | null;
  order?: number | null;
  partner: Client;
  partner_id: number;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display: string;
  expedition_number?: string | null;
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
  price_net: string | null;
  vat_rate?: string | null;
  vat_rate_article?: string | null;
  price_with_vat: string | null;
  vat_amount: string | null;
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  status_display: string;
  payment_status: 'not_paid' | 'partially_paid' | 'paid';
  payment_status_display: string;
  payment_date?: string | null;
  invoice_issued: boolean;
  invoice_received: boolean;
  invoice_received_date?: string | null;
  payment_days?: number | null;
  due_date?: string | null;
  payment_terms?: string;
  notes: string;
  sequence_order: number;

  // Effective duomenys (custom arba iš užsakymo)
  effective_route_from?: string;
  effective_route_to?: string;
  effective_route_from_country?: string;
  effective_route_from_city?: string;
  effective_route_from_address?: string;
  effective_route_to_country?: string;
  effective_route_to_city?: string;
  effective_route_to_address?: string;
  effective_loading_date_from?: string | null;
  effective_loading_date_to?: string | null;
  effective_unloading_date_from?: string | null;
  effective_unloading_date_to?: string | null;

  // Vėliavėlės (ar turi custom duomenis)
  has_custom_route?: boolean;
  has_custom_dates?: boolean;

  payment_status_info?: {
    status: 'not_paid' | 'partially_paid' | 'paid';
    message: string;
    payment_date?: string;
  };
}

interface CarrierModalProps {
  carrier: OrderCarrier | null;
  carrierType: 'carrier' | 'warehouse';
  isOpen: boolean;
  onClose: () => void;
  onSave: (carrier: OrderCarrier) => Promise<void>; // Changed to async
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  onCarrierPriceChange?: () => void; // Callback kai keičiasi vežėjo kaina
  orderRouteFrom?: string; // Užsakymo maršrutas "iš kur" - automatiškai užpildyti naujam vežėjui
  orderRouteTo?: string; // Užsakymo maršrutas "į kur" - automatiškai užpildyti naujam vežėjui
  orderRouteFromCountry?: string;
  orderRouteFromPostalCode?: string;
  orderRouteFromCity?: string;
  orderRouteFromAddress?: string;
  orderSenderName?: string;
  orderRouteToCountry?: string;
  orderRouteToPostalCode?: string;
  orderRouteToCity?: string;
  orderRouteToAddress?: string;
  orderReceiverName?: string;
  orderLoadingDate?: string | null; // Užsakymo pakrovimo data - automatiškai užpildyti naujam vežėjui
  orderLoadingDateFrom?: string | null; // Užsakymo pakrovimo data nuo - automatiškai užpildyti naujam vežėjui
  orderLoadingDateTo?: string | null; // Užsakymo pakrovimo data iki - automatiškai užpildyti naujam vežėjui
  orderUnloadingDate?: string | null; // Užsakymo iškrovimo data - automatiškai užpildyti naujam vežėjui
  orderUnloadingDateFrom?: string | null; // Užsakymo iškrovimo data nuo - automatiškai užpildyti naujam vežėjui
  orderUnloadingDateTo?: string | null; // Užsakymo iškrovimo data iki - automatiškai užpildyti naujam vežėjui
  orderVatRate?: string | null; // Užsakymo PVM tarifas - automatiškai užpildyti naujam vežėjui
  orderVatRateArticle?: string | null; // Užsakymo PVM tarifo straipsnis - automatiškai užpildyti naujam vežėjui
  isStandalone?: boolean; // true = standalone ekspedicija (iš ExpeditionsPage), false = vežėjas prie užsakymo (iš OrderEditModal)
}

const CarrierModal: React.FC<CarrierModalProps> = ({
  carrier: initialCarrier,
  carrierType,
  isOpen,
  onClose,
  onSave,
  showToast,
  onCarrierPriceChange,
  orderRouteFrom = '',
  orderRouteTo = '',
  orderRouteFromCountry = '',
  orderRouteFromPostalCode = '',
  orderRouteFromCity = '',
  orderRouteFromAddress = '',
  orderSenderName = '',
  orderRouteToCountry = '',
  orderRouteToPostalCode = '',
  orderRouteToCity = '',
  orderRouteToAddress = '',
  orderReceiverName = '',
  orderLoadingDate = null,
  orderLoadingDateFrom = null,
  orderLoadingDateTo = null,
  orderUnloadingDate = null,
  orderUnloadingDateFrom = null,
  orderUnloadingDateTo = null,
  orderVatRate = null,
  orderVatRateArticle = null,
  isStandalone = false
}) => {
  const { i18n } = useTranslation();
  const [editingCarrier, setEditingCarrier] = useState<OrderCarrier | null>(initialCarrier);
  const [carrierPartnerSearch, setCarrierPartnerSearch] = useState('');
  const [carrierPartners, setCarrierPartners] = useState<Client[]>([]);
  const [selectedCarrierPartnerName, setSelectedCarrierPartnerName] = useState<string>('');
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  // Numatytasis payment_terms - jei API nepavyks užkrauti, naudosime šį
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState<string>(
    '30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.'
  );
  // Užsakymo pasirinkimas naujai ekspedicijai
  const [orderSearch, setOrderSearch] = useState('');
  const [orders, setOrders] = useState<{ id: number; order_number?: string | null; client?: { id: number; name: string } }[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Naujamo partnerio kūrimas
  const [showPartnerModal, setShowPartnerModal] = useState(false);

  // Partnerio redagavimas
  const [showPartnerEditModal, setShowPartnerEditModal] = useState(false);
  const [selectedPartnerForEdit, setSelectedPartnerForEdit] = useState<any>(null);
  const [allCarrierPartners, setAllCarrierPartners] = useState<Client[]>([]); // Saugoti visus partnerius
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);
  const [useCustomRoute, setUseCustomRoute] = useState(false);
  const [useCustomDates, setUseCustomDates] = useState(false);

  const handlePartnerSave = useCallback(async (partner: any) => {
    // Po sėkmingo partnerio sukūrimo, automatiškai pasirinkti jį kaip vežėją
    setShowPartnerModal(false);

    // Pasirinkti ką tik sukurtą partnerį
    if (editingCarrier) {
      const selectedPartner = {
        id: partner.id,
        name: partner.name,
        code: partner.code
      };

      setEditingCarrier({
        ...editingCarrier,
        partner: selectedPartner,
        partner_id: selectedPartner.id,
        route_from: useCustomRoute ? (editingCarrier.route_from || '') : ((editingCarrier.route_from && editingCarrier.route_from.trim()) || orderRouteFrom || ''),
        route_to: useCustomRoute ? (editingCarrier.route_to || '') : ((editingCarrier.route_to && editingCarrier.route_to.trim()) || orderRouteTo || ''),
        // Detali maršruto informacija iš užsakymo
        route_from_country: useCustomRoute ? (editingCarrier.route_from_country || '') : ((editingCarrier.route_from_country && editingCarrier.route_from_country.trim()) || orderRouteFromCountry || ''),
        route_from_postal_code: useCustomRoute ? (editingCarrier.route_from_postal_code || '') : ((editingCarrier.route_from_postal_code && editingCarrier.route_from_postal_code.trim()) || orderRouteFromPostalCode || ''),
        route_from_city: useCustomRoute ? (editingCarrier.route_from_city || '') : ((editingCarrier.route_from_city && editingCarrier.route_from_city.trim()) || orderRouteFromCity || ''),
        route_from_address: useCustomRoute ? (editingCarrier.route_from_address || '') : ((editingCarrier.route_from_address && editingCarrier.route_from_address.trim()) || orderRouteFromAddress || ''),
        sender_name: useCustomRoute ? (editingCarrier.sender_name || '') : ((editingCarrier.sender_name && editingCarrier.sender_name.trim()) || orderSenderName || ''),
        route_to_country: useCustomRoute ? (editingCarrier.route_to_country || '') : ((editingCarrier.route_to_country && editingCarrier.route_to_country.trim()) || orderRouteToCountry || ''),
        route_to_postal_code: useCustomRoute ? (editingCarrier.route_to_postal_code || '') : ((editingCarrier.route_to_postal_code && editingCarrier.route_to_postal_code.trim()) || orderRouteToPostalCode || ''),
        route_to_city: useCustomRoute ? (editingCarrier.route_to_city || '') : ((editingCarrier.route_to_city && editingCarrier.route_to_city.trim()) || orderRouteToCity || ''),
        route_to_address: useCustomRoute ? (editingCarrier.route_to_address || '') : ((editingCarrier.route_to_address && editingCarrier.route_to_address.trim()) || orderRouteToAddress || ''),
        receiver_name: useCustomRoute ? (editingCarrier.receiver_name || '') : ((editingCarrier.receiver_name && editingCarrier.receiver_name.trim()) || orderReceiverName || ''),
      });

      // Atnaujinti paieškos lauką ir pasirinkto partnerio pavadinimą
      setCarrierPartnerSearch(partner.name);
      setSelectedCarrierPartnerName(partner.name);
      // Išvalyti partnerių sąrašą, nes jau pasirinkome
      setCarrierPartners([]);
    }
  }, [editingCarrier, useCustomRoute, orderRouteFrom, orderRouteTo, orderRouteFromCountry, orderRouteFromPostalCode, orderRouteFromCity, orderRouteFromAddress, orderSenderName, orderRouteToCountry, orderRouteToPostalCode, orderRouteToCity, orderRouteToAddress, orderReceiverName]);

  const handlePartnerEditSave = useCallback(async (updatedPartner: any) => {
    // Po sėkmingo partnerio atnaujinimo, atnaujinti editingCarrier
    setShowPartnerEditModal(false);

    // Atnaujinti editingCarrier su naujais partnerio duomenimis
    if (editingCarrier) {
      setEditingCarrier({
        ...editingCarrier,
        partner: {
          id: updatedPartner.id,
          name: updatedPartner.name,
          code: updatedPartner.code
        },
        partner_id: updatedPartner.id,
      });

      // Atnaujinti paieškos lauką ir pasirinkto partnerio pavadinimą
      setCarrierPartnerSearch(updatedPartner.name);
      setSelectedCarrierPartnerName(updatedPartner.name);
    }
  }, [editingCarrier]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen && initialCarrier) {
      // Nustatyti custom vėliavėles pagal duomenis iš API
      setUseCustomRoute(initialCarrier.has_custom_route || false);
      setUseCustomDates(initialCarrier.has_custom_dates || false);

      setEditingCarrier({
        ...initialCarrier,
        expedition_number: initialCarrier.expedition_number ?? null,
        // Naudoti effective duomenis kaip pradines reikšmes
        route_from: initialCarrier.effective_route_from || '',
        route_to: initialCarrier.effective_route_to || '',
        route_from_country: initialCarrier.effective_route_from_country || '',
        route_from_postal_code: initialCarrier.route_from_postal_code || '', // Šis nėra effective
        route_from_city: initialCarrier.effective_route_from_city || '',
        route_from_address: initialCarrier.effective_route_from_address || '',
        route_to_country: initialCarrier.effective_route_to_country || '',
        route_to_postal_code: initialCarrier.route_to_postal_code || '', // Šis nėra effective
        route_to_city: initialCarrier.effective_route_to_city || '',
        route_to_address: initialCarrier.effective_route_to_address || '',
        // Naudoti effective datas kaip pradines reikšmes
        loading_date_from: initialCarrier.effective_loading_date_from || null,
        loading_date_to: initialCarrier.effective_loading_date_to || null,
        unloading_date_from: initialCarrier.effective_unloading_date_from || null,
        unloading_date_to: initialCarrier.effective_unloading_date_to || null,
      });
      setCarrierPartnerSearch(initialCarrier.partner.name);
      setSelectedCarrierPartnerName(initialCarrier.partner.name);
      setCarrierPartners([]); // Išvalyti pasiūlymus, kad neneškiestų dropdown
      // Nustatyti order_id, jei yra
      const orderId = typeof initialCarrier.order === 'number'
        ? initialCarrier.order
        : initialCarrier.order_id || null;
      setSelectedOrderId(orderId);
      setOrderSearch('');
      setOrders([]);
    } else if (isOpen && !initialCarrier) {
      // Naujas vežėjas - sukurti tuščią editingCarrier iš karto, kad visi laukai būtų matomi
      const newCarrier: OrderCarrier = {
        partner: { id: 0, name: '', code: '' }, // Bus pakeistas, kai pasirinks partnerį
        partner_id: 0,
        carrier_type: carrierType,
        carrier_type_display: carrierType === 'carrier' ? 'Vežėjas' : 'Sandėlys',
        sequence_order: 0,
        expedition_number: null,
        price_net: null,
        price_with_vat: null,
        vat_amount: null,
        route_from: useCustomRoute ? '' : (orderRouteFrom || ''),
        route_to: useCustomRoute ? '' : (orderRouteTo || ''),
        // Detali maršruto informacija iš užsakymo
        route_from_country: useCustomRoute ? '' : (orderRouteFromCountry || ''),
        route_from_postal_code: useCustomRoute ? '' : (orderRouteFromPostalCode || ''),
        route_from_city: useCustomRoute ? '' : (orderRouteFromCity || ''),
        route_from_address: useCustomRoute ? '' : (orderRouteFromAddress || ''),
        sender_name: useCustomRoute ? '' : (orderSenderName || ''),
        route_to_country: useCustomRoute ? '' : (orderRouteToCountry || ''),
        route_to_postal_code: useCustomRoute ? '' : (orderRouteToPostalCode || ''),
        route_to_city: useCustomRoute ? '' : (orderRouteToCity || ''),
        route_to_address: useCustomRoute ? '' : (orderRouteToAddress || ''),
        receiver_name: useCustomRoute ? '' : (orderReceiverName || ''),
        loading_date: useCustomDates ? null : (orderLoadingDate || null),
        unloading_date: useCustomDates ? null : (orderUnloadingDate || null),
        loading_date_from: useCustomDates ? null : (orderLoadingDateFrom || orderLoadingDate || null),
        loading_date_to: useCustomDates ? null : (orderLoadingDateTo || null),
        unloading_date_from: useCustomDates ? null : (orderUnloadingDateFrom || orderUnloadingDate || null),
        unloading_date_to: useCustomDates ? null : (orderUnloadingDateTo || null),
        vat_rate: orderVatRate || null,
        vat_rate_article: orderVatRateArticle || null,
        status: 'new',
        status_display: 'Naujas',
        invoice_issued: false,
        invoice_received: false,
        payment_status: 'not_paid',
        payment_status_display: 'Neapmokėta',
        payment_date: null,
        payment_terms: defaultPaymentTerms || '',
        notes: ''
      };
      setEditingCarrier(newCarrier);
      setCarrierPartnerSearch('');
      setSelectedCarrierPartnerName('');
      setSelectedOrderId(null);
      setOrderSearch('');
      setOrders([]);
    } else {
      // Modal uždarytas
      setEditingCarrier(null);
      setCarrierPartnerSearch('');
      setSelectedCarrierPartnerName('');
      setCarrierPartners([]);
      setSelectedOrderId(null);
      setOrderSearch('');
      setOrders([]);
    }
  }, [isOpen, initialCarrier, carrierType, orderRouteFrom, orderRouteTo, orderRouteFromCountry, orderRouteFromPostalCode, orderRouteFromCity, orderRouteFromAddress, orderSenderName, orderRouteToCountry, orderRouteToPostalCode, orderRouteToCity, orderRouteToAddress, orderReceiverName, orderLoadingDate, orderUnloadingDate, orderVatRate, orderVatRateArticle, defaultPaymentTerms, useCustomRoute, useCustomDates]);

  // Automatiškai užpildyti datas iš užsakymo iš karto, kai modalas atidaromas
  useEffect(() => {
    if (isOpen && editingCarrier && (orderLoadingDate || orderUnloadingDate)) {
      const updates: Partial<OrderCarrier> = {};
      let needsUpdate = false;

      if (!editingCarrier.loading_date_from && orderLoadingDate) {
        updates.loading_date_from = orderLoadingDate;
        needsUpdate = true;
      }

      if (!editingCarrier.loading_date_to && orderLoadingDate) {
        updates.loading_date_to = orderLoadingDate;
        needsUpdate = true;
      }

      if (!editingCarrier.unloading_date_from && orderUnloadingDate) {
        updates.unloading_date_from = orderUnloadingDate;
        needsUpdate = true;
      }

      if (!editingCarrier.unloading_date_to && orderUnloadingDate) {
        updates.unloading_date_to = orderUnloadingDate;
        needsUpdate = true;
      }

      if (needsUpdate) {
        setEditingCarrier({
          ...editingCarrier,
          ...updates
        });
      }
    }
  }, [isOpen, editingCarrier, orderLoadingDate, orderUnloadingDate]);

  // Kai pasirenkamas partneris ir yra užsakymo maršrutas, automatiškai užpildyti maršrutą
  useEffect(() => {
    if (isOpen && editingCarrier && editingCarrier.partner) {
      // Jei vežėjas jau turi partnerį, bet maršrutas arba datos dar neužpildytos, užpildyti
      const updates: Partial<OrderCarrier> = {};
      let needsUpdate = false;

      // Automatiškai užpildyti maršrutą tik jei naudotojas nenorėjo custom maršruto
      if (!useCustomRoute) {
        // Užpildyti pagrindinius laukus
        if (!editingCarrier.route_from || editingCarrier.route_from.trim() === '') {
          updates.route_from = orderRouteFrom || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_to || editingCarrier.route_to.trim() === '') {
          updates.route_to = orderRouteTo || '';
          needsUpdate = true;
        }

        // Užpildyti detalius maršruto laukus
        if (!editingCarrier.route_from_country || editingCarrier.route_from_country.trim() === '') {
          updates.route_from_country = orderRouteFromCountry || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_from_postal_code || editingCarrier.route_from_postal_code.trim() === '') {
          updates.route_from_postal_code = orderRouteFromPostalCode || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_from_city || editingCarrier.route_from_city.trim() === '') {
          updates.route_from_city = orderRouteFromCity || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_from_address || editingCarrier.route_from_address.trim() === '') {
          updates.route_from_address = orderRouteFromAddress || '';
          needsUpdate = true;
        }
        if (!editingCarrier.sender_name || editingCarrier.sender_name.trim() === '') {
          updates.sender_name = orderSenderName || '';
          needsUpdate = true;
        }

        if (!editingCarrier.route_to_country || editingCarrier.route_to_country.trim() === '') {
          updates.route_to_country = orderRouteToCountry || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_to_postal_code || editingCarrier.route_to_postal_code.trim() === '') {
          updates.route_to_postal_code = orderRouteToPostalCode || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_to_city || editingCarrier.route_to_city.trim() === '') {
          updates.route_to_city = orderRouteToCity || '';
          needsUpdate = true;
        }
        if (!editingCarrier.route_to_address || editingCarrier.route_to_address.trim() === '') {
          updates.route_to_address = orderRouteToAddress || '';
          needsUpdate = true;
        }
        if (!editingCarrier.receiver_name || editingCarrier.receiver_name.trim() === '') {
          updates.receiver_name = orderReceiverName || '';
          needsUpdate = true;
        }
      }

      if (!editingCarrier.loading_date && orderLoadingDate) {
        updates.loading_date = orderLoadingDate;
        needsUpdate = true;
      }

      if (!editingCarrier.unloading_date && orderUnloadingDate) {
        updates.unloading_date = orderUnloadingDate;
        needsUpdate = true;
      }

      if (!editingCarrier.vat_rate && orderVatRate) {
        updates.vat_rate = orderVatRate;
        needsUpdate = true;
      }

      if (!editingCarrier.vat_rate_article && orderVatRateArticle) {
        updates.vat_rate_article = orderVatRateArticle;
        needsUpdate = true;
      }

      // Užpildyti payment_terms, jei tuščias
      if ((!editingCarrier.payment_terms || editingCarrier.payment_terms.trim() === '') && defaultPaymentTerms) {
        updates.payment_terms = defaultPaymentTerms;
        needsUpdate = true;
      }

      if (needsUpdate) {
        setEditingCarrier({
          ...editingCarrier,
          ...updates
        });
      }
    }
  }, [isOpen, editingCarrier, orderRouteFrom, orderRouteTo, orderRouteFromCountry, orderRouteFromPostalCode, orderRouteFromCity, orderRouteFromAddress, orderSenderName, orderRouteToCountry, orderRouteToPostalCode, orderRouteToCity, orderRouteToAddress, orderReceiverName, orderLoadingDate, orderUnloadingDate, orderVatRate, orderVatRateArticle, defaultPaymentTerms, useCustomRoute]);

  // Automatiškai užpildyti maršrutą ir datas, kai modal atidaromas su užsakymo duomenimis (net jei partneris dar nepasirinktas)
  // Tai užtikrina, kad kai bus pasirinktas partneris, maršrutas jau bus užpildytas
  useEffect(() => {
    if (isOpen && !initialCarrier && (orderRouteFrom || orderRouteTo || orderLoadingDate || orderUnloadingDate)) {
      // Jei modal atidaromas be vežėjo, bet yra užsakymo duomenys, jie bus naudojami, kai bus pasirinktas partneris
      // handleCarrierPartnerSelect jau turi šią logiką, bet užtikriname, kad prop'ai yra teisingi
    }
  }, [isOpen, initialCarrier, orderRouteFrom, orderRouteTo, orderLoadingDate, orderUnloadingDate]);


  // Search carrier partners
  const searchCarrierPartners = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCarrierPartners([]);
      return;
    }
    try {
      const response = await api.get('/partners/partners/', {
        params: {
          search: query,
          page_size: 10,
          include_code_errors: 1
        }
      });
      const partners = response.data.results || response.data || [];
      setCarrierPartners(Array.isArray(partners) ? partners : []);
      setAllCarrierPartners(Array.isArray(partners) ? partners : []); // Saugoti visus rezultatus
    } catch (error) {
      setCarrierPartners([]);
    }
  }, []);

  // Search partners when typing
  useEffect(() => {
    const trimmed = carrierPartnerSearch?.trim() || '';
    // Ieškoti tik jei yra bent 2 simboliai IR tekstas nesutampa su pasirinktu partneriu
    if (trimmed.length >= 2 && trimmed !== selectedCarrierPartnerName) {
      const timeout = setTimeout(() => {
        searchCarrierPartners(trimmed);
      }, 300);
      return () => clearTimeout(timeout);
    } else if (trimmed === selectedCarrierPartnerName) {
      // Jei tekstas sutampa su pasirinktu partneriu, išvalyti pasiūlymus
      setCarrierPartners([]);
    } else {
      setCarrierPartners([]);
    }
  }, [carrierPartnerSearch, selectedCarrierPartnerName, searchCarrierPartners]);

  // Search orders
  const searchOrders = useCallback(async (query: string) => {
    if (query.length < 1) {
      setOrders([]);
      return;
    }
    try {
      const response = await api.get('/orders/orders/', {
        params: {
          search: query,
          page_size: 10
        }
      });
      const ordersData = response.data.results || response.data || [];
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (error) {
      setOrders([]);
    }
  }, []);

  // Search orders when typing
  useEffect(() => {
    if (orderSearch) {
      const timeout = setTimeout(() => searchOrders(orderSearch), 300);
      return () => clearTimeout(timeout);
    } else {
      setOrders([]);
    }
  }, [orderSearch, searchOrders]);

  // Uždaryti užsakymo dropdown, kai paspaudžiama už jo ribų
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showOrderDropdown && !target.closest('.form-group')) {
        setShowOrderDropdown(false);
      }
    };

    if (showOrderDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showOrderDropdown]);

  // Handle order selection
  const handleOrderSelect = useCallback((order: { id: number; order_number?: string | null; client?: { id: number; name: string } }) => {
    setSelectedOrderId(order.id);
    setOrderSearch(order.order_number || `#${order.id}`);
    setOrders([]);
    setShowOrderDropdown(false);

    // Jei užsakymas turi maršrutą, automatiškai užpildyti
    if (editingCarrier) {
      // Galime gauti užsakymo detales, bet dabar tiesiog nustatyti order_id
      setEditingCarrier({
        ...editingCarrier,
        order_id: order.id,
        order: order.id
      });
    } else if (!editingCarrier) {
      // Jei dar nėra editingCarrier, sukurti su order_id
      const newCarrier: OrderCarrier = {
        partner: { id: 0, name: '', code: '' }, // Bus pakeistas, kai pasirinks partnerį
        partner_id: 0,
        carrier_type: carrierType,
        carrier_type_display: carrierType === 'carrier' ? 'Vežėjas' : 'Sandėlys',
        sequence_order: 0,
        expedition_number: null,
        price_net: null,
        price_with_vat: null,
        vat_amount: null,
        route_from: useCustomRoute ? '' : (orderRouteFrom || ''),
        route_to: useCustomRoute ? '' : (orderRouteTo || ''),
        // Detali maršruto informacija iš užsakymo
        route_from_country: useCustomRoute ? '' : (orderRouteFromCountry || ''),
        route_from_postal_code: useCustomRoute ? '' : (orderRouteFromPostalCode || ''),
        route_from_city: useCustomRoute ? '' : (orderRouteFromCity || ''),
        route_from_address: useCustomRoute ? '' : (orderRouteFromAddress || ''),
        sender_name: useCustomRoute ? '' : (orderSenderName || ''),
        route_to_country: useCustomRoute ? '' : (orderRouteToCountry || ''),
        route_to_postal_code: useCustomRoute ? '' : (orderRouteToPostalCode || ''),
        route_to_city: useCustomRoute ? '' : (orderRouteToCity || ''),
        route_to_address: useCustomRoute ? '' : (orderRouteToAddress || ''),
        receiver_name: useCustomRoute ? '' : (orderReceiverName || ''),
        loading_date: useCustomDates ? null : (orderLoadingDate || null),
        unloading_date: useCustomDates ? null : (orderUnloadingDate || null),
        loading_date_from: useCustomDates ? null : (orderLoadingDateFrom || orderLoadingDate || null),
        loading_date_to: useCustomDates ? null : (orderLoadingDateTo || null),
        unloading_date_from: useCustomDates ? null : (orderUnloadingDateFrom || orderUnloadingDate || null),
        unloading_date_to: useCustomDates ? null : (orderUnloadingDateTo || null),
        status: 'new',
        status_display: 'Naujas',
        invoice_issued: false,
        invoice_received: false,
        payment_status: 'not_paid',
        payment_status_display: 'Neapmokėta',
        payment_date: null,
        payment_terms: defaultPaymentTerms || '',
        notes: ''
      };
      // Set order_id after creating the carrier object
      newCarrier.order_id = order.id;
      newCarrier.order = order.id;
      setEditingCarrier(newCarrier);
    }
  }, [editingCarrier, carrierType, orderRouteFrom, orderRouteTo, orderRouteFromCountry, orderRouteFromPostalCode, orderRouteFromCity, orderRouteFromAddress, orderSenderName, orderRouteToCountry, orderRouteToPostalCode, orderRouteToCity, orderRouteToAddress, orderReceiverName, orderLoadingDate, orderUnloadingDate, orderVatRate, orderVatRateArticle, defaultPaymentTerms, useCustomRoute]);


  // Fetch PVM rates
  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
      // Ignore errors
    }
  }, []);

  // Fetch ExpeditionSettings to get default payment_terms
  const fetchExpeditionSettings = useCallback(async () => {
    try {
      const response = await api.get('/settings/expedition/');
      // ExpeditionSettingsViewSet grąžina queryset, bet gali būti paginacija
      const settings = response.data.results?.[0] || response.data?.[0] || response.data;
      if (settings?.payment_terms) {
        setDefaultPaymentTerms(settings.payment_terms);
      } else {
        // Jei nėra payment_terms, naudoti numatytąją reikšmę
        const defaultTerms = '30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.';
        setDefaultPaymentTerms(defaultTerms);
      }
    } catch (error) {
      console.error('Error fetching ExpeditionSettings:', error);
      // Jei klaida, naudoti numatytąją reikšmę
      const defaultTerms = '30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.';
      setDefaultPaymentTerms(defaultTerms);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPvmRates();
      fetchExpeditionSettings();
    }
  }, [isOpen, fetchPvmRates, fetchExpeditionSettings]);

  const handleCarrierPartnerSelect = (partner: Client) => {
    // Visada turime editingCarrier, nes jis sukuriamas kai modalas atidaromas
    if (editingCarrier) {
      setEditingCarrier({
        ...editingCarrier,
        partner,
        partner_id: partner.id,
        route_from: useCustomRoute ? (editingCarrier.route_from || '') : ((editingCarrier.route_from && editingCarrier.route_from.trim()) || orderRouteFrom || ''),
        route_to: useCustomRoute ? (editingCarrier.route_to || '') : ((editingCarrier.route_to && editingCarrier.route_to.trim()) || orderRouteTo || ''),
        // Detali maršruto informacija iš užsakymo
        route_from_country: useCustomRoute ? (editingCarrier.route_from_country || '') : ((editingCarrier.route_from_country && editingCarrier.route_from_country.trim()) || orderRouteFromCountry || ''),
        route_from_postal_code: useCustomRoute ? (editingCarrier.route_from_postal_code || '') : ((editingCarrier.route_from_postal_code && editingCarrier.route_from_postal_code.trim()) || orderRouteFromPostalCode || ''),
        route_from_city: useCustomRoute ? (editingCarrier.route_from_city || '') : ((editingCarrier.route_from_city && editingCarrier.route_from_city.trim()) || orderRouteFromCity || ''),
        route_from_address: useCustomRoute ? (editingCarrier.route_from_address || '') : ((editingCarrier.route_from_address && editingCarrier.route_from_address.trim()) || orderRouteFromAddress || ''),
        sender_name: useCustomRoute ? (editingCarrier.sender_name || '') : ((editingCarrier.sender_name && editingCarrier.sender_name.trim()) || orderSenderName || ''),
        route_to_country: useCustomRoute ? (editingCarrier.route_to_country || '') : ((editingCarrier.route_to_country && editingCarrier.route_to_country.trim()) || orderRouteToCountry || ''),
        route_to_postal_code: useCustomRoute ? (editingCarrier.route_to_postal_code || '') : ((editingCarrier.route_to_postal_code && editingCarrier.route_to_postal_code.trim()) || orderRouteToPostalCode || ''),
        route_to_city: useCustomRoute ? (editingCarrier.route_to_city || '') : ((editingCarrier.route_to_city && editingCarrier.route_to_city.trim()) || orderRouteToCity || ''),
        route_to_address: useCustomRoute ? (editingCarrier.route_to_address || '') : ((editingCarrier.route_to_address && editingCarrier.route_to_address.trim()) || orderRouteToAddress || ''),
        receiver_name: useCustomRoute ? (editingCarrier.receiver_name || '') : ((editingCarrier.receiver_name && editingCarrier.receiver_name.trim()) || orderReceiverName || ''),
        loading_date: useCustomDates ? (editingCarrier.loading_date || null) : ((editingCarrier.loading_date && editingCarrier.loading_date.trim()) || orderLoadingDate || null),
        unloading_date: useCustomDates ? (editingCarrier.unloading_date || null) : ((editingCarrier.unloading_date && editingCarrier.unloading_date.trim()) || orderUnloadingDate || null),
        loading_date_from: useCustomDates ? (editingCarrier.loading_date_from || null) : ((editingCarrier.loading_date_from && editingCarrier.loading_date_from.trim()) || orderLoadingDateFrom || orderLoadingDate || null),
        loading_date_to: useCustomDates ? (editingCarrier.loading_date_to || null) : ((editingCarrier.loading_date_to && editingCarrier.loading_date_to.trim()) || orderLoadingDateTo || null),
        unloading_date_from: useCustomDates ? (editingCarrier.unloading_date_from || null) : ((editingCarrier.unloading_date_from && editingCarrier.unloading_date_from.trim()) || orderUnloadingDateFrom || orderUnloadingDate || null),
        unloading_date_to: useCustomDates ? (editingCarrier.unloading_date_to || null) : ((editingCarrier.unloading_date_to && editingCarrier.unloading_date_to.trim()) || orderUnloadingDateTo || null),
        vat_rate: editingCarrier.vat_rate || orderVatRate || null,
        vat_rate_article: editingCarrier.vat_rate_article || orderVatRateArticle || null,
        payment_terms: editingCarrier.payment_terms || defaultPaymentTerms || ''
      });
    } else {
      // Jei kažkodėl editingCarrier nėra, sukurti naują
      const newCarrier: OrderCarrier = {
        partner,
        partner_id: partner.id,
        carrier_type: carrierType,
        carrier_type_display: carrierType === 'carrier' ? 'Vežėjas' : 'Sandėlys',
        sequence_order: 0,
        expedition_number: null,
        price_net: null,
        price_with_vat: null,
        vat_amount: null,
        route_from: useCustomRoute ? '' : (orderRouteFrom || ''),
        route_to: useCustomRoute ? '' : (orderRouteTo || ''),
        // Detali maršruto informacija iš užsakymo
        route_from_country: useCustomRoute ? '' : (orderRouteFromCountry || ''),
        route_from_postal_code: useCustomRoute ? '' : (orderRouteFromPostalCode || ''),
        route_from_city: useCustomRoute ? '' : (orderRouteFromCity || ''),
        route_from_address: useCustomRoute ? '' : (orderRouteFromAddress || ''),
        sender_name: useCustomRoute ? '' : (orderSenderName || ''),
        route_to_country: useCustomRoute ? '' : (orderRouteToCountry || ''),
        route_to_postal_code: useCustomRoute ? '' : (orderRouteToPostalCode || ''),
        route_to_city: useCustomRoute ? '' : (orderRouteToCity || ''),
        route_to_address: useCustomRoute ? '' : (orderRouteToAddress || ''),
        receiver_name: useCustomRoute ? '' : (orderReceiverName || ''),
        loading_date: useCustomDates ? null : (orderLoadingDate || null),
        unloading_date: useCustomDates ? null : (orderUnloadingDate || null),
        loading_date_from: useCustomDates ? null : (orderLoadingDateFrom || orderLoadingDate || null),
        loading_date_to: useCustomDates ? null : (orderLoadingDateTo || null),
        unloading_date_from: useCustomDates ? null : (orderUnloadingDateFrom || orderUnloadingDate || null),
        unloading_date_to: useCustomDates ? null : (orderUnloadingDateTo || null),
        vat_rate: orderVatRate || null,
        vat_rate_article: orderVatRateArticle || null,
        status: 'new',
        status_display: 'Naujas',
        invoice_issued: false,
        invoice_received: false,
        payment_status: 'not_paid',
        payment_status_display: 'Neapmokėta',
        payment_date: null,
        payment_terms: defaultPaymentTerms || '',
        notes: ''
      };
      setEditingCarrier(newCarrier);
    }
    setCarrierPartnerSearch(partner.name);
    setSelectedCarrierPartnerName(partner.name);
    setCarrierPartners([]);
    // Įtraukti pasirinktą partnerį į allCarrierPartners jei jo ten nėra
    setAllCarrierPartners(prev => {
      const exists = prev.some(p => p.id === partner.id);
      if (!exists) {
        return [...prev, partner];
      }
      return prev;
    });
  };

  const handleSave = async () => {
    if (!editingCarrier) {
      showToast('error', 'Pasirinkite partnerį');
      return;
    }

    const partnerId = editingCarrier.partner_id || editingCarrier.partner?.id;
    if (!partnerId) {
      showToast('error', 'Pasirinkite partnerį');
      return;
    }

    // Standalone ekspedicijai užsakymas neprivalomas, bet jei nurodytas, turi būti validus
    // Vežėjui prie užsakymo (isStandalone=false) užsakymas bus priskirtas automatiškai išsaugant užsakymą
    // Todėl čia netikriname užsakymo, jei tai ne standalone

    const updatedCarrier: OrderCarrier = {
      ...editingCarrier,
      partner_id: partnerId,
      order_id: selectedOrderId || editingCarrier.order_id || (typeof editingCarrier.order === 'number' ? editingCarrier.order : null),
      expedition_number: editingCarrier.expedition_number && editingCarrier.expedition_number.trim() !== '' ? editingCarrier.expedition_number.trim() : null,
      route_from: editingCarrier.route_from || '',
      route_to: editingCarrier.route_to || '',
      // Detali maršruto informacija
      route_from_country: editingCarrier.route_from_country || '',
      route_from_postal_code: editingCarrier.route_from_postal_code || '',
      route_from_city: editingCarrier.route_from_city || '',
      route_from_address: editingCarrier.route_from_address || '',
      sender_name: editingCarrier.sender_name || '',
      route_to_country: editingCarrier.route_to_country || '',
      route_to_postal_code: editingCarrier.route_to_postal_code || '',
      route_to_city: editingCarrier.route_to_city || '',
      route_to_address: editingCarrier.route_to_address || '',
      receiver_name: editingCarrier.receiver_name || '',
      loading_date: editingCarrier.loading_date || null,
      unloading_date: editingCarrier.unloading_date || null,
      loading_date_from: editingCarrier.loading_date_from ? (editingCarrier.loading_date_from.includes('T') ? editingCarrier.loading_date_from.split('T')[0] : editingCarrier.loading_date_from) : null,
      loading_date_to: editingCarrier.loading_date_to ? (editingCarrier.loading_date_to.includes('T') ? editingCarrier.loading_date_to.split('T')[0] : editingCarrier.loading_date_to) : null,
      unloading_date_from: editingCarrier.unloading_date_from ? (editingCarrier.unloading_date_from.includes('T') ? editingCarrier.unloading_date_from.split('T')[0] : editingCarrier.unloading_date_from) : null,
      unloading_date_to: editingCarrier.unloading_date_to ? (editingCarrier.unloading_date_to.includes('T') ? editingCarrier.unloading_date_to.split('T')[0] : editingCarrier.unloading_date_to) : null,
      price_net: editingCarrier.price_net ? String(editingCarrier.price_net) : null,
      vat_rate: editingCarrier.vat_rate !== null && editingCarrier.vat_rate !== undefined && editingCarrier.vat_rate !== '' ? String(editingCarrier.vat_rate) : null,
      vat_rate_article: editingCarrier.vat_rate_article && editingCarrier.vat_rate_article.trim() !== '' ? editingCarrier.vat_rate_article.trim() : '',  // Siųsti tuščią string, ne null
      price_with_vat: editingCarrier.price_with_vat ? (typeof editingCarrier.price_with_vat === 'string' ? editingCarrier.price_with_vat : String(editingCarrier.price_with_vat)) : null,
      vat_amount: editingCarrier.vat_amount || null,
      status: editingCarrier.status || 'new',
      status_display: editingCarrier.status_display || 'Naujas',
      payment_status: editingCarrier.payment_status || 'not_paid',
      payment_status_display: editingCarrier.payment_status_display || 'Neapmokėta',
      invoice_issued: editingCarrier.invoice_issued ?? false,
      invoice_received: editingCarrier.invoice_received ?? false,
      payment_terms: editingCarrier.payment_terms || defaultPaymentTerms || '',
      notes: editingCarrier.notes || '',
      sequence_order: editingCarrier.sequence_order ?? 0,
    };

    try {
      await onSave(updatedCarrier);
      onClose(); // Uždaryti tik jei sėkmingai išsaugota
    } catch (error) {
      // Error jau apdorojamas handleSaveExpedition, tik neleisti uždaryti modalo
      console.error('CarrierModal: Error saving carrier:', error);
      throw error; // Perduoti error toliau, kad handleSaveExpedition galėtų jį apdoroti
    }
  };
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2200 }}>
      <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '95vh', overflowY: 'auto', padding: '15px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            {editingCarrier?.id ? 'Redaguoti' : 'Pridėti'} {carrierType === 'carrier' ? 'vežėją' : 'sandėlį'}
          </h3>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {editingCarrier?.id && (
              <button
                type="button"
                className="button button-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const token = localStorage.getItem('token');
                    // Gauti backend URL
                    const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
                    let baseUrl = apiBaseUrl.replace('/api', '');

                    if (!baseUrl || baseUrl === '') {
                      baseUrl = window.location.hostname === 'localhost'
                        ? 'http://localhost:8000'
                        : window.location.origin;
                    }

                    const url = `${baseUrl}/api/orders/carriers/${editingCarrier.id}/preview/`;

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
                      title: `Vežėjo sutartis ${editingCarrier.partner?.name || editingCarrier.id}`,
                      htmlContent: htmlContent
                    });
                  } catch (error: any) {
                    const errorMsg = error.message || error.toString() || 'Nežinoma klaida';
                    showToast('error', `Nepavyko atidaryti vežėjo sutarties peržiūros: ${errorMsg}`);
                  }
                }}
              >
                👁️ Peržiūrėti sutartį
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                color: '#999',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Užsakymo pasirinkimas - tik standalone ekspedicijai (ne vežėjui prie užsakymo) */}
        {isStandalone && !editingCarrier?.id && (
          <div className="form-group" style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '13px', marginBottom: '4px' }}>Užsakymas</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ieškoti užsakymo (numeris arba klientas)..."
                value={orderSearch}
                onChange={(e) => {
                  setOrderSearch(e.target.value);
                  setShowOrderDropdown(true);
                }}
                onFocus={() => {
                  if (orderSearch) {
                    setShowOrderDropdown(true);
                  }
                }}
              />
              {showOrderDropdown && orders.length > 0 && (
                <div className="client-dropdown" style={{ zIndex: 3000 }}>
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="client-dropdown-item"
                      onClick={() => handleOrderSelect(order)}
                    >
                      {order.order_number || `#${order.id}`} {order.client ? ` - ${order.client.name}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <small style={{ color: '#6b7280', fontSize: '11px' }}>
              Pasirinkite užsakymą, prie kurio bus priskirta ekspedicija (neprivaloma). Jei nėra tinkamo užsakymo, ekspedicija gali būti be užsakymo.
            </small>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '13px', marginBottom: '4px' }}>Partneris *</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Ieškoti partnerio (bent 2 simboliai)..."
              value={carrierPartnerSearch}
              onChange={(e) => {
                const value = e.target.value;
                setCarrierPartnerSearch(value);
                // Jei tekstas nesutampa su pasirinktu partneriu, išvalyti pasirinkimą
                if (value !== selectedCarrierPartnerName) {
                  setSelectedCarrierPartnerName('');
                  // Atnaujinti editingCarrier, jei jis yra
                  if (editingCarrier) {
                    setEditingCarrier({
                      ...editingCarrier,
                      partner: { id: 0, name: '', code: '' },
                      partner_id: 0
                    });
                  }
                }
              }}
              onFocus={(e) => {
                // Kai fokusuojame, jei yra tekstas ir jis nesutampa su pasirinktu partneriu, iš karto ieškoti
                const value = e.target.value?.trim() || '';
                if (value.length >= 2 && value !== selectedCarrierPartnerName) {
                  searchCarrierPartners(value);
                }
              }}
              required
              style={{
                paddingRight: '65px' // Padaryti vietos dviem mygtukams
              }}
            />
            {selectedCarrierPartnerName && selectedCarrierPartnerName.trim() && (
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  // Rasti pasirinkto partnerio duomenis iš visų partnerių (allCarrierPartners)
                  const selectedPartner = allCarrierPartners.find(p => p.name === selectedCarrierPartnerName);
                  if (selectedPartner) {
                    try {
                      // Gauti pilnus partnerio duomenis iš API
                      const response = await api.get(`/partners/partners/${selectedPartner.id}/`);
                      setSelectedPartnerForEdit(response.data);
                      setShowPartnerEditModal(true);
                    } catch (error: any) {
                      showToast('error', 'Nepavyko gauti partnerio duomenų');
                      console.error('Error fetching partner data:', error);
                    }
                  } else {
                    // Jei nerandame tarp allCarrierPartners, bandyti ieškoti pagal editingCarrier.partner_id
                    if (editingCarrier?.partner_id) {
                      try {
                        const response = await api.get(`/partners/partners/${editingCarrier.partner_id}/`);
                        setSelectedPartnerForEdit(response.data);
                        setShowPartnerEditModal(true);
                      } catch (error: any) {
                        showToast('error', 'Nepavyko gauti partnerio duomenų');
                        console.error('Error fetching partner data by ID:', error);
                      }
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  right: '38px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '2px 6px',
                  fontSize: '10px',
                  minWidth: 'auto',
                  height: '20px'
                }}
                title="Redaguoti partnerį"
              >
                ✏️
              </button>
            )}
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
              title="Sukurti naują partnerį"
            >
              ➕
            </button>
            {carrierPartners.length > 0 && (
              <div className="client-dropdown">
                {carrierPartners.map((partner) => (
                  <div
                    key={partner.id}
                    className="client-dropdown-item"
                    onClick={() => handleCarrierPartnerSelect(partner)}
                  >
                    {partner.name} ({partner.code})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {editingCarrier ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Stulpelis 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Kainos sekcija */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>💰 Kainos</h4>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Kaina be PVM</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingCarrier.price_net ? (typeof editingCarrier.price_net === 'string' ? editingCarrier.price_net : String(editingCarrier.price_net)) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditingCarrier({
                          ...editingCarrier,
                          price_net: value === '' ? null : value
                        });
                        // Callback to parent if provided
                        if (onCarrierPriceChange) {
                          setTimeout(() => onCarrierPriceChange(), 50);
                        }
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>PVM tarifas</label>
                    <select
                      value={pvmRates.find(r => r.rate === editingCarrier.vat_rate && r.article === (editingCarrier.vat_rate_article || ''))?.id || ''}
                      onChange={(e) => {
                        const selectedRate = pvmRates.find(r => r.id === parseInt(e.target.value));
                        if (selectedRate) {
                          setEditingCarrier({
                            ...editingCarrier,
                            vat_rate: selectedRate.rate,
                            vat_rate_article: selectedRate.article || ''
                          });
                        } else {
                          setEditingCarrier({
                            ...editingCarrier,
                            vat_rate: null,
                            vat_rate_article: ''
                          });
                        }
                      }}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '3px' }}
                    >
                      <option value="">-- PVM tarifas --</option>
                      {pvmRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.rate}%{rate.article ? ` - ${rate.article}` : ''}
                        </option>
                      ))}
                    </select>
                    {editingCarrier.vat_rate_article && (
                      <small style={{ color: '#666', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                        Straipsnis: {editingCarrier.vat_rate_article}
                      </small>
                    )}
                    {pvmRates.length === 0 && (
                      <small style={{ color: '#dc3545', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                        PVM tarifų nėra
                      </small>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Apmokėjimo terminas</label>
                    <textarea
                      value={(editingCarrier.payment_terms && editingCarrier.payment_terms.trim() !== '') ? editingCarrier.payment_terms : (defaultPaymentTerms || '')}
                      onChange={(e) => setEditingCarrier({
                        ...editingCarrier,
                        payment_terms: e.target.value
                      })}
                      rows={2}
                      placeholder="Apmokėjimo terminas..."
                      style={{ width: '100%', padding: '6px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* Informacija sekcija */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>ℹ️ Informacija</h4>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Ekspedicijos numeris</label>
                    <input
                      type="text"
                      value={editingCarrier.expedition_number || ''}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setEditingCarrier({
                          ...editingCarrier,
                          expedition_number: value,
                        });
                      }}
                      placeholder="Auto generuojamas"
                    />
                    <small style={{ color: '#6b7280', fontSize: '10px', display: 'block', marginTop: '2px' }}>
                      Palikite tuščią - sugeneruos automatiškai
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Vežimo/sandėlio būklė</label>
                    <select
                      value={editingCarrier.status || 'new'}
                      onChange={(e) => setEditingCarrier({
                        ...editingCarrier,
                        status: e.target.value as 'new' | 'in_progress' | 'completed' | 'cancelled',
                        status_display: e.target.value === 'new' ? 'Naujas' :
                          e.target.value === 'in_progress' ? 'Vykdomas' :
                          e.target.value === 'completed' ? 'Baigtas' : 'Atšauktas'
                      })}
                    >
                      <option value="new">Naujas</option>
                      <option value="in_progress">Vykdomas</option>
                      <option value="completed">Baigtas</option>
                      <option value="cancelled">Atšauktas</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Mokėjimo būklė</label>
                    <select
                      value={editingCarrier.payment_status || 'not_paid'}
                      onChange={(e) => setEditingCarrier({
                        ...editingCarrier,
                        payment_status: e.target.value as 'not_paid' | 'partially_paid' | 'paid',
                        payment_status_display: e.target.value === 'not_paid' ? 'Neapmokėta' :
                          e.target.value === 'partially_paid' ? 'Dalinai apmokėta' : 'Apmokėta'
                      })}
                    >
                      <option value="not_paid">Neapmokėta</option>
                      <option value="partially_paid">Dalinai apmokėta</option>
                      <option value="paid">Apmokėta</option>
                    </select>
                  </div>
                </div>

                {/* Datos sekcija */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <h4 style={{ margin: '0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>📅 Datos</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#6c757d' }}>
                      <input
                        type="checkbox"
                        checked={useCustomDates}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseCustomDates(checked);
                          if (!checked && initialCarrier) {
                            // Jei atžymėjo, grįžti prie užsakymo datų
                            setEditingCarrier(prev => prev ? {
                              ...prev,
                              loading_date: orderLoadingDate || null,
                              unloading_date: orderUnloadingDate || null,
                              loading_date_from: orderLoadingDateFrom || orderLoadingDate || null,
                              loading_date_to: orderLoadingDateTo || null,
                              unloading_date_from: orderUnloadingDateFrom || orderUnloadingDate || null,
                              unloading_date_to: orderUnloadingDateTo || null
                            } : null);
                          }
                        }}
                      />
                      Tinkinti
                    </label>
                  </div>
                  {/* Pakrovimo intervalas */}
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '13px', marginBottom: '4px' }}>📅 Pakrovimas nuo</label>
                      <input
                        type="date"
                        value={editingCarrier.loading_date_from || editingCarrier.loading_date ? (editingCarrier.loading_date_from || editingCarrier.loading_date!)!.split('T')[0] : ''}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          loading_date_from: e.target.value,
                          loading_date: e.target.value ? `${e.target.value}T00:00` : null
                        })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '13px', marginBottom: '4px' }}>📅 Pakrovimas iki</label>
                      <input
                        type="date"
                        value={editingCarrier.loading_date_to || ''}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          loading_date_to: e.target.value
                        })}
                      />
                    </div>
                  </div>

                  {/* Iškrovimo intervalas */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '13px', marginBottom: '4px' }}>📅 Iškrovimas nuo</label>
                      <input
                        type="date"
                        value={editingCarrier.unloading_date_from || editingCarrier.unloading_date ? (editingCarrier.unloading_date_from || editingCarrier.unloading_date!)!.split('T')[0] : ''}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          unloading_date_from: e.target.value,
                          unloading_date: e.target.value ? `${e.target.value}T00:00` : null
                        })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label style={{ fontSize: '13px', marginBottom: '4px' }}>📅 Iškrovimas iki</label>
                      <input
                        type="date"
                        value={editingCarrier.unloading_date_to || ''}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          unloading_date_to: e.target.value
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Pastabos sekcija */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>📝 Pastabos</h4>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <AutocompleteTextarea
                      fieldType="carrier_notes"
                      value={editingCarrier.notes || ''}
                      onChange={(value) => setEditingCarrier({
                        ...editingCarrier,
                        notes: value
                      })}
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Stulpelis 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Maršrutas iš */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#f8f9fa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <h4 style={{ margin: '0', fontSize: '11px', fontWeight: 'bold', color: '#495057' }}>📍 Maršrutas iš *</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Custom indikatorius */}
                      {initialCarrier?.has_custom_route && (
                        <span style={{
                          fontSize: '9px',
                          color: '#dc3545',
                          backgroundColor: '#f8d7da',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          border: '1px solid #f5c6cb'
                        }}>
                          CUSTOM
                        </span>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#6c757d' }}>
                        <input
                          type="checkbox"
                          checked={useCustomRoute}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUseCustomRoute(checked);
                            if (!checked && initialCarrier) {
                              // Jei atžymėjo, grįžti prie užsakymo maršruto (effective duomenys)
                              setEditingCarrier(prev => prev ? {
                                ...prev,
                                route_from: initialCarrier.effective_route_from || '',
                                route_from_country: initialCarrier.effective_route_from_country || '',
                                route_from_postal_code: initialCarrier.route_from_postal_code || '', // Šis nėra effective
                                route_from_city: initialCarrier.effective_route_from_city || '',
                                route_from_address: initialCarrier.effective_route_from_address || '',
                                sender_name: initialCarrier.sender_name || ''
                              } : null);
                            }
                          }}
                        />
                        Tinkinti
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Šalis</label>
                      <input
                        type="text"
                        value={editingCarrier.route_from_country}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_from_country: e.target.value
                        })}
                        placeholder="Lietuva"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Pašto kodas</label>
                      <input
                        type="text"
                        value={editingCarrier.route_from_postal_code}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_from_postal_code: e.target.value
                        })}
                        placeholder="LT-00000"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Miestas *</label>
                      <input
                        type="text"
                        value={editingCarrier.route_from_city}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_from_city: e.target.value
                        })}
                        placeholder="Vilnius"
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Adresas</label>
                      <input
                        type="text"
                        value={editingCarrier.route_from_address}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_from_address: e.target.value
                        })}
                        placeholder="Gedimino pr. 1"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Siuntėjas</label>
                      <RouteContactField
                        contactType="sender"
                        value={editingCarrier.sender_name || ''}
                        onChange={(value) => setEditingCarrier({ ...editingCarrier, sender_name: value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Maršrutas į */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 'bold', color: '#495057' }}>📍 Maršrutas į *</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Šalis</label>
                      <input
                        type="text"
                        value={editingCarrier.route_to_country}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_to_country: e.target.value
                        })}
                        placeholder="Lietuva"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Pašto kodas</label>
                      <input
                        type="text"
                        value={editingCarrier.route_to_postal_code}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_to_postal_code: e.target.value
                        })}
                        placeholder="LT-00000"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Miestas *</label>
                      <input
                        type="text"
                        value={editingCarrier.route_to_city}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_to_city: e.target.value
                        })}
                        placeholder="Kaunas"
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Adresas</label>
                      <input
                        type="text"
                        value={editingCarrier.route_to_address}
                        onChange={(e) => setEditingCarrier({
                          ...editingCarrier,
                          route_to_address: e.target.value
                        })}
                        placeholder="Kęstučio g. 1"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '11px', marginBottom: '2px' }}>Gavėjas</label>
                      <RouteContactField
                        contactType="receiver"
                        value={editingCarrier.receiver_name || ''}
                        onChange={(value) => setEditingCarrier({ ...editingCarrier, receiver_name: value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stulpelis 3 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Sąskaitos informacija */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', padding: '6px', backgroundColor: '#fff' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>💳 Sąskaitos informacija</h4>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Kada gauta sąskaita</label>
                    <input
                      type="date"
                      value={editingCarrier.invoice_received_date ? editingCarrier.invoice_received_date.substring(0, 10) : ''}
                      onChange={(e) => {
                        const receivedDate = e.target.value || null;
                        const paymentDays = editingCarrier.payment_days || null;
                        let calculatedDueDate = null;

                        if (receivedDate && paymentDays) {
                          const date = new Date(receivedDate);
                          date.setTime(date.getTime() + (paymentDays * 24 * 60 * 60 * 1000));
                          calculatedDueDate = date.toISOString().split('T')[0];
                        }

                        setEditingCarrier({
                          ...editingCarrier,
                          invoice_received_date: receivedDate,
                          due_date: calculatedDueDate || editingCarrier.due_date || null
                        });
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Mokėjimo terminas (dienos)</label>
                    <input
                      type="number"
                      min="0"
                      value={editingCarrier.payment_days || ''}
                      onChange={(e) => {
                        const days = parseInt(e.target.value) || null;
                        const receivedDate = editingCarrier.invoice_received_date;
                        let calculatedDueDate = null;

                        if (receivedDate && days) {
                          const date = new Date(receivedDate);
                          date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                          calculatedDueDate = date.toISOString().split('T')[0];
                        }

                        setEditingCarrier({
                          ...editingCarrier,
                          payment_days: days,
                          due_date: calculatedDueDate || editingCarrier.due_date || null
                        });
                      }}
                      placeholder="30"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Apmokėti iki</label>
                    <input
                      type="date"
                      value={editingCarrier.due_date ? editingCarrier.due_date.substring(0, 10) : ''}
                      onChange={(e) => setEditingCarrier({
                        ...editingCarrier,
                        due_date: e.target.value || null
                      })}
                    />
                    <small style={{ fontSize: '10px', color: '#666', marginTop: '2px', display: 'block' }}>
                      (galima pasirinkti tiesiogiai arba bus apskaičiuota)
                    </small>
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '13px', marginBottom: '4px' }}>Apmokėjimo data</label>
                    <input
                      type="date"
                      value={editingCarrier.payment_date ? editingCarrier.payment_date.substring(0, 10) : ''}
                      onChange={(e) => setEditingCarrier({
                        ...editingCarrier,
                        payment_date: e.target.value || null
                      })}
                    />
                    <small style={{ fontSize: '10px', color: '#666', marginTop: '2px', display: 'block' }}>
                      (data, kai tikrai apmokėjome)
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: '8px', marginTop: '15px', paddingTop: '12px', borderTop: '1px solid #ddd' }}>
          <button
            type="button"
            className="button"
            onClick={handleSave}
            disabled={!editingCarrier || !editingCarrier.partner_id}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            Išsaugoti
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            Atšaukti
          </button>
        </div>
      </div>

      {/* HTML Preview Modal */}
      <HTMLPreviewModal
        preview={htmlPreview}
        onClose={() => setHtmlPreview(null)}
        onDownloadPDF={htmlPreview && editingCarrier ? async () => {
          try {
            const response = await api.get(`/orders/carriers/${editingCarrier.id}/pdf/`, {
              params: { lang: i18n.language },
              responseType: 'blob',
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `vezimo-sutartis-${editingCarrier!.id}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
            showToast('success', 'PDF sėkmingai atsisiųstas');
          } catch (error: any) {
            showToast('error', 'Nepavyko atsisiųsti PDF');
          }
        } : undefined}
        onSendEmail={htmlPreview && editingCarrier ? async () => {
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

      {/* Partner Create Modal */}
      <PartnerCreateModal
        isOpen={showPartnerModal}
        onClose={() => setShowPartnerModal(false)}
        onSave={handlePartnerSave}
        showToast={showToast}
      />

      {/* Partner Edit Modal */}
      <PartnerEditModal
        isOpen={showPartnerEditModal}
        partner={selectedPartnerForEdit}
        onClose={() => setShowPartnerEditModal(false)}
        onSave={handlePartnerEditSave}
        onPartnerUpdate={handlePartnerEditSave}
        showToast={showToast}
      />
    </div>
  );
};

export default CarrierModal;
