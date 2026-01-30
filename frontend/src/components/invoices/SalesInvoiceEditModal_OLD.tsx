/**
 * ⚠️ DEPRECATED - NEVARTOTI ⚠️
 * 
 * Šis failas pažymėtas trinimui.
 * Dabar naudojamas: SalesInvoiceModal_NEW.tsx
 * 
 * TODO: Ištrinti šį failą, kai bus patvirtinta, kad naujasis modalas veikia teisingai.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import '../../pages/InvoicesPage.css';

interface Partner {
  id: number;
  name: string;
  code?: string;
  payment_term_days?: number;
}

interface Order {
  id: number;
  order_number: string;
  client_price_net?: string | number | null;
  calculated_client_price_net?: string | number | null;
  vat_rate?: string | number | null;
  route_from?: string | null;
  route_to?: string | null;
  loading_date?: string | null;
  unloading_date?: string | null;
  suggested_amount_net?: string | null;
}

interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
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
  vat_rate_article?: string;
  amount_total?: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  overdue_days?: number;
  notes: string;
  invoice_items?: any[];
  manual_lines?: Array<{ description: string; amount_net: string | number; vat_rate?: string | number; vat_rate_article?: string }>;
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

interface SalesInvoiceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingInvoice: SalesInvoice | null;
  initialPartnerId?: string;
  initialOrderId?: string;
  onSave: () => void; // Callback after successful save
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
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

const SalesInvoiceEditModal: React.FC<SalesInvoiceEditModalProps> = ({
  isOpen,
  onClose,
  editingInvoice,
  initialPartnerId,
  initialOrderId,
  onSave,
  showToast,
  invoiceSettings
}) => {
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
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
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

  const [partners, setPartners] = useState<Partner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [selectedAdditionalOrderIds, setSelectedAdditionalOrderIds] = useState<number[]>([]);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [selectedPartnerName, setSelectedPartnerName] = useState('');
  const [availableGapNumber, setAvailableGapNumber] = useState<string | null>(null);
  const [showGapSuggestion, setShowGapSuggestion] = useState(false);
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);

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

  // Fetch available gap number when creating new invoice
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
      // Ignoruoti klaidas - jei nepavyko gauti, tiesiog nenaudoti tarpų
      setAvailableGapNumber(null);
      setShowGapSuggestion(false);
    }
  }, []);

  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
    }
  }, []);

  const fetchAvailableOrders = useCallback(async (partnerId: number, invoiceId?: number) => {
    if (!partnerId) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const response = await api.get('/orders/orders/available-for-invoice/', {
        params: {
          partner_id: partnerId,
          invoice_id: invoiceId,
        },
      });
      const results = response.data?.results || [];
      
      // Užtikrinti, kad visi selectedAdditionalOrderIds užsakymai yra results masyve
      // Jei nėra, pridėti juos (net jei backend negrąžino)
      if (editingInvoice && editingInvoice.related_orders) {
        const primaryOrderId = editingInvoice.related_order_id ?? editingInvoice.related_order?.id ?? null;
        const additionalIds = editingInvoice.related_orders
          .map((o: any) => o.id)
          .filter((id: number) => (primaryOrderId ? id !== primaryOrderId : true));
        
        // Pridėti trūkstamus užsakymus į results
        const existingOrderIds = new Set(results.map((o: any) => o.id));
        const missingIds = additionalIds.filter(id => !existingOrderIds.has(id));
        
        if (missingIds.length > 0) {
          // Gauti trūkstamus užsakymus iš backend
          try {
            const missingOrdersResponse = await api.get('/orders/orders/', {
              params: {
                id__in: missingIds.join(','),
                page_size: 100,
              },
            });
            const missingOrders = missingOrdersResponse.data?.results || missingOrdersResponse.data || [];
            
            // Pridėti trūkstamus užsakymus į results
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
            // Ignore errors when fetching missing orders
          }
        }
      }
      
      setOrders(results);
    } catch (error) {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [editingInvoice]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPvmRates();
      setAmountManuallyEdited(false);
      if (editingInvoice) {
        setShowGapSuggestion(false);
        setAvailableGapNumber(null);
        // Load editing invoice data
        setFormData({
          invoice_number: editingInvoice.invoice_number || '',
          partner_id: editingInvoice.partner_id?.toString() || editingInvoice.partner.id.toString(),
          related_order_id: editingInvoice.related_order_id?.toString() || editingInvoice.related_order?.id.toString() || '',
          invoice_type: editingInvoice.invoice_type,
          payment_status: editingInvoice.payment_status,
          amount_net: editingInvoice.amount_net,
          issue_date: editingInvoice.issue_date ? (editingInvoice.issue_date.includes('T') ? editingInvoice.issue_date.split('T')[0] : editingInvoice.issue_date.split(' ')[0]) : '',
          due_date: editingInvoice.due_date ? (editingInvoice.due_date.includes('T') ? editingInvoice.due_date.split('T')[0] : editingInvoice.due_date.split(' ')[0]) : '',
          payment_date: editingInvoice.payment_date ? (editingInvoice.payment_date.includes('T') ? editingInvoice.payment_date.split('T')[0] : editingInvoice.payment_date.split(' ')[0]) : '',
          notes: editingInvoice.notes,
          display_options: editingInvoice.display_options ? {
            show_order_type: editingInvoice.display_options.show_order_type ?? true,
            show_cargo_info: editingInvoice.display_options.show_cargo_info ?? true,
            show_cargo_weight: editingInvoice.display_options.show_cargo_weight ?? true,
            show_cargo_ldm: editingInvoice.display_options.show_cargo_ldm ?? true,
            show_cargo_dimensions: editingInvoice.display_options.show_cargo_dimensions ?? true,
            show_cargo_properties: editingInvoice.display_options.show_cargo_properties ?? true,
            show_carriers: editingInvoice.display_options.show_carriers ?? true,
            show_carrier_name: editingInvoice.display_options.show_carrier_name ?? true,
            show_carrier_route: editingInvoice.display_options.show_carrier_route ?? true,
            show_carrier_dates: editingInvoice.display_options.show_carrier_dates ?? true,
            show_prices: editingInvoice.display_options.show_prices ?? true,
            show_my_price: editingInvoice.display_options.show_my_price ?? true,
            show_other_costs: editingInvoice.display_options.show_other_costs ?? true,
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
        setSelectedPartnerName(editingInvoice.partner.name);
        setPartnerSearch(editingInvoice.partner.name);
        const primaryOrderId = editingInvoice.related_order_id ?? editingInvoice.related_order?.id ?? null;
        const additionalIds = editingInvoice.related_orders
          ? editingInvoice.related_orders
              .map((o: any) => o.id)
              .filter((id: number) => (primaryOrderId ? id !== primaryOrderId : true))
          : [];
        setSelectedAdditionalOrderIds(additionalIds);
        const partnerId = editingInvoice.partner_id ?? editingInvoice.partner?.id;
        if (partnerId) {
          fetchAvailableOrders(Number(partnerId), editingInvoice.id);
        } else {
          setOrders([]);
        }
      } else {
        // Reset form for new invoice
        // Patikrinti ar yra tarpų ir pasiūlyti naudoti tuščią numerį
        fetchGapNumber();
        // Naudoti default_display_options iš InvoiceSettings kaip pagal nutylėjimą
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
            // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
            due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
            return due.toISOString().split('T')[0];
          })(),
          payment_date: '',
          notes: '',
          display_options: {
            // Naudoti reikšmes iš nustatymų, jei nėra - false (nepažymėta)
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
        setSelectedAdditionalOrderIds([]);
        setOrders([]);
        
        // Jei yra initialPartnerId, užkrauti partnerio duomenis ir užsakymus
        if (initialPartnerId) {
          api.get(`/partners/partners/${initialPartnerId}/`).then(res => {
            setSelectedPartnerName(res.data.name);
            setPartnerSearch(res.data.name);
            fetchAvailableOrders(Number(initialPartnerId));
          }).catch(() => {});
        }
      }
    } else {
      setOrders([]);
      setSelectedAdditionalOrderIds([]);
      setAmountManuallyEdited(false);
    }
  }, [isOpen, editingInvoice, invoiceSettings, initialPartnerId, initialOrderId, fetchGapNumber, fetchPvmRates, fetchAvailableOrders]);

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

  useEffect(() => {
    if (ordersLoading || !editingInvoice) {
      return;
    }
    
    // Užtikrinti, kad selectedAdditionalOrderIds turi visus ID'us iš editingInvoice.related_orders
    const primaryOrderId = editingInvoice.related_order_id ?? editingInvoice.related_order?.id ?? null;
    const expectedAdditionalIds = editingInvoice.related_orders
      ? editingInvoice.related_orders
          .map((o: any) => o.id)
          .filter((id: number) => (primaryOrderId ? id !== primaryOrderId : true))
      : [];
    
    setSelectedAdditionalOrderIds((prev) => {
      // Pridėti trūkstamus ID'us iš expectedAdditionalIds
      const combined = Array.from(new Set([...prev, ...expectedAdditionalIds]));
      return combined;
    });
  }, [orders, ordersLoading, editingInvoice]);

  const handlePartnerSelect = (partner: Partner) => {
    setFormData({ ...formData, partner_id: partner.id.toString() });
    setSelectedPartnerName(partner.name);
    setPartnerSearch(partner.name);
    setShowPartnerDropdown(false);
    setPartners([]);
    setSelectedAdditionalOrderIds([]);
    setOrders([]);
    setAmountManuallyEdited(false);
    fetchAvailableOrders(partner.id, editingInvoice?.id || undefined);
    
    // Calculate due date (naudoti partnerio payment_term_days arba 30 dienų pagal nutylėjimą)
    const paymentDays = partner.payment_term_days || 30;
    const issueDate = new Date(formData.issue_date);
    const dueDate = new Date(issueDate);
    // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
    dueDate.setTime(dueDate.getTime() + (paymentDays * 24 * 60 * 60 * 1000));
    setFormData(prev => ({
      ...prev,
      due_date: dueDate.toISOString().split('T')[0],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partner_id) { showToast('info', 'Pasirinkite klientą.'); return; }
    if (!formData.issue_date) { showToast('info', 'Pasirinkite išrašymo datą.'); return; }
    if (!formData.due_date) { showToast('info', 'Pasirinkite mokėjimo terminą.'); return; }
    if (!formData.amount_net) { showToast('info', 'Įveskite sumą.'); return; }

    const amountNetToSend = parseFloat(formData.amount_net);

    try {
      const data: any = {
        partner_id: parseInt(formData.partner_id),
        invoice_type: formData.invoice_type,
        payment_status: formData.payment_status,
        amount_net: amountNetToSend,
        issue_date: formData.issue_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes,
      };

      data.related_order_id = formData.related_order_id ? parseInt(formData.related_order_id) : null;

      data.additional_order_ids = selectedAdditionalOrderIds;

      if (formData.payment_date) {
        data.payment_date = formData.payment_date.includes('T') ? formData.payment_date.split('T')[0] : (formData.payment_date.includes(' ') ? formData.payment_date.split(' ')[0] : formData.payment_date);
      } else {
        data.payment_date = null;
      }

      if (formData.display_options) {
        data.display_options = formData.display_options;
      }

      if (formData.invoice_number) {
        data.invoice_number = formData.invoice_number.toUpperCase();
      }

      await api.post('/invoices/sales/', data);
      showToast('success', 'Pardavimo sąskaita sėkmingai sukurta.');
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
    if (!formData.partner_id) { showToast('info', 'Pasirinkite klientą.'); return; }
    if (!formData.issue_date) { showToast('info', 'Pasirinkite išrašymo datą.'); return; }
    if (!formData.due_date) { showToast('info', 'Pasirinkite mokėjimo terminą.'); return; }
    if (!formData.amount_net) { showToast('info', 'Įveskite sumą.'); return; }

    const amountNetToSend = parseFloat(formData.amount_net);

    try {
      const data: any = {
        invoice_number: formData.invoice_number || editingInvoice.invoice_number,
        partner_id: parseInt(formData.partner_id),
        invoice_type: formData.invoice_type,
        payment_status: formData.payment_status,
        amount_net: amountNetToSend,
        issue_date: formData.issue_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes,
      };

      data.related_order_id = formData.related_order_id ? parseInt(formData.related_order_id) : null;

      data.additional_order_ids = selectedAdditionalOrderIds;

      if (formData.payment_date) {
        data.payment_date = formData.payment_date.includes('T') ? formData.payment_date.split('T')[0] : (formData.payment_date.includes(' ') ? formData.payment_date.split(' ')[0] : formData.payment_date);
      } else {
        data.payment_date = null;
      }

      if (formData.display_options) {
        data.display_options = formData.display_options;
      }

      await api.put(`/invoices/sales/${editingInvoice.id}/`, data);
      showToast('success', 'Pardavimo sąskaita sėkmingai atnaujinta.');
      onSave();
      onClose();
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error', 'Klaida atnaujinant sąskaitą: ' + (details ? JSON.stringify(details) : error.message));
    }
  };

  // Auto-calculate due_date when issue_date changes
  useEffect(() => {
    if (formData.issue_date && !formData.due_date) {
      const issue = new Date(formData.issue_date);
      const due = new Date(issue);
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
      // Naudoti partnerio payment_term_days, jei yra pasirinktas partneris
      const paymentDays = 30; // Default, jei nėra partnerio
      due.setTime(due.getTime() + (paymentDays * 24 * 60 * 60 * 1000));
      setFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [formData.issue_date, formData.due_date]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingInvoice ? 'Redaguoti pardavimo sąskaitą' : 'Nauja pardavimo sąskaita'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={editingInvoice ? handleUpdate : handleCreate}>
          <div className="form-grid">
            <div className="form-field">
              <label>Sąskaitos numeris</label>
              {!editingInvoice && showGapSuggestion && availableGapNumber && (
                <div style={{
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, invoice_number: availableGapNumber });
                        setShowGapSuggestion(false);
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
                      onClick={() => {
                        setShowGapSuggestion(false);
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
                  </div>
                </div>
              )}
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value.toUpperCase() })}
                placeholder={(invoiceSettings as any)?.next_invoice_number || 'Sugeneruos automatiškai'}
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Jei paliksite tuščią, numeris bus sugeneruotas automatiškai
              </small>
            </div>

            <div className="form-field">
              <label>Klientas *</label>
              <div className="autocomplete-wrapper">
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
                />
                {showPartnerDropdown && partners.length > 0 && (
                  <div className="autocomplete-dropdown">
                    {partners.map((partner) => (
                      <div
                        key={partner.id}
                        className="autocomplete-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handlePartnerSelect(partner);
                        }}
                      >
                        {partner.name} ({partner.code})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="form-field">
              <label>Susijęs užsakymas</label>
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
              >
                <option value="">Nėra</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number || `Užsakymas #${order.id}`}
                  </option>
                ))}
              </select>
            </div>
            
            {formData.partner_id && (
              <div className="form-field">
                <label>Papildomi užsakymai</label>
                {ordersLoading ? (
                  <div style={{ fontSize: '13px', color: '#666' }}>Kraunama...</div>
                ) : (
                  <>
                    {(() => {
                      // Rodyti visus užsakymus iš orders masyvo + trūkstamus iš selectedAdditionalOrderIds
                      const ordersToShow = orders.filter(order => order.id !== (primaryOrderIdNumber ?? 0));
                      const selectedButNotInOrders = selectedAdditionalOrderIds.filter(
                        id => id !== (primaryOrderIdNumber ?? 0) && !ordersToShow.some(o => o.id === id)
                      );
                      
                      // Pridėti trūkstamus užsakymus kaip "phantom" užsakymus
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
                        return <div style={{ fontSize: '13px', color: '#666' }}>Nėra galimų užsakymų.</div>;
                      }
                      
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '8px', background: '#fafafa' }}>
                          {allOrdersToShow.map(order => {
                            const amountCandidate = order.suggested_amount_net ?? order.client_price_net ?? order.calculated_client_price_net;
                            const amountLabel = amountCandidate !== null && amountCandidate !== undefined && amountCandidate !== ''
                              ? `${parseFloat(String(amountCandidate)).toFixed(2)} €`
                              : 'Suma nenustatyta';
                            const isSelected = selectedAdditionalOrderIds.includes(order.id);
                            return (
                              <label key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
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
                                />
                                <span>
                                  <strong>{order.order_number || `Užsakymas #${order.id}`}</strong>
                                  <span style={{ marginLeft: '6px', color: '#666' }}>({amountLabel})</span>
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
            )}
            
            {(primaryOrderIdNumber || selectedAdditionalOrderIds.length > 0) && (
              <div className="form-field">
                <label>Pasirinktų užsakymų suma</label>
                <div style={{ padding: '8px', background: '#f3f7ff', borderRadius: '4px', border: '1px solid #d0dcff', fontSize: '13px', fontWeight: 600 }}>
                  {selectedOrderTotal.toFixed(2)} €
                </div>
              </div>
            )}
            
            <div className="form-field">
              <label>Sąskaitos tipas *</label>
              <select
                value={formData.invoice_type}
                onChange={(e) => setFormData({ ...formData, invoice_type: e.target.value as any })}
                required
              >
                <option value="pre_invoice">Pro forma sąskaita</option>
                <option value="final">Galutinė sąskaita</option>
                <option value="credit">Kreditinė sąskaita</option>
                <option value="proforma">Proforma</option>
              </select>
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
              <input
                type="number"
                step="0.01"
                value={formData.amount_net}
                onChange={(e) => {
                  setAmountManuallyEdited(true);
                  setFormData({ ...formData, amount_net: e.target.value });
                }}
                required
              />
            </div>
            
            <div className="form-field">
              <label>Išrašymo data *</label>
              <input
                type="date"
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
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
            
            {/* Rodymo pasirinkimai */}
            <div className="form-field full-width" style={{ borderTop: '2px solid #e0e0e0', paddingTop: '15px', marginTop: '10px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '16px', fontWeight: 'bold' }}>Prekės - paslaugos (sąskaitos eilutės)</h3>
              
              {/* Užsakymo tipas */}
              <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', marginBottom: '10px' }}>
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
                    style={{ marginRight: '8px' }}
                  />
                  Rodyti užsakymo tipą
                </label>
              </div>
              
              {/* Krovinių informacija */}
              <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
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
                    style={{ marginRight: '8px' }}
                  />
                  Krovinių informacija (svoris, matmenys, savybės)
                    </label>
              </div>
              
              {/* Vežėjai ir sandėliai */}
              <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
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
                    style={{ marginRight: '8px' }}
                  />
                  Vežėjai (NESIŪLOMA rodyti klientams!)
                    </label>
              </div>
              
              {/* Papildomos išlaidos */}
              <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
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
                        style={{ marginRight: '8px' }}
                      />
                  Papildomos išlaidos (muitinė, draudimas ir t.t.)
                    </label>
              </div>
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

export default SalesInvoiceEditModal;

