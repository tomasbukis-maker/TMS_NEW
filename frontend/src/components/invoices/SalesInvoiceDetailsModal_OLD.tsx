/**
 * ⚠️ DEPRECATED - NEVARTOTI ⚠️
 * 
 * Šis failas pažymėtas trinimui.
 * Dabar naudojamas: SalesInvoiceModal_NEW.tsx
 * 
 * TODO: Ištrinti šį failą, kai bus patvirtinta, kad naujasis modalas veikia teisingai.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import '../../pages/InvoicesPage.css';

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
}

interface Order {
  id: number;
  order_number: string;
  client?: Partner;
  client_price_net?: string | number | null;
  vat_rate?: string | number | null;
  route_from?: string;
  route_to?: string;
  loading_date?: string;
  unloading_date?: string;
  loading_date_from?: string;
  loading_date_to?: string;
  unloading_date_from?: string;
  unloading_date_to?: string;
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
  related_order: Order | null;
  related_orders?: Array<{ id: number; order_number: string; order_date?: string; client?: { name: string }; route_from?: string; route_to?: string; loading_date?: string; unloading_date?: string; loading_date_from?: string; loading_date_to?: string; unloading_date_from?: string; unloading_date_to?: string; client_price_net?: string | null; vat_rate?: string | null }>;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  overdue_days?: number;
  credit_invoice?: number | null;
  notes: string;
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

interface SalesInvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onInvoiceUpdate: (updatedInvoice: SalesInvoice) => void;
  onEdit: (invoice: SalesInvoice) => void;
  onDelete: (invoice: SalesInvoice) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const SalesInvoiceDetailsModal = ({
  isOpen,
  onClose,
  invoice,
  onInvoiceUpdate,
  onEdit,
  onDelete,
  showToast
}: SalesInvoiceDetailsModalProps) => {
  const { i18n } = useTranslation();
  const [localInvoice, setLocalInvoice] = useState<SalesInvoice | null>(invoice);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');

  const fetchHtmlPreview = async (lang: string = 'lt') => {
    if (!localInvoice) return;
    try {
      const res = await api.get(`/invoices/sales/${localInvoice.id}/preview/`, { 
        params: { lang },
        responseType: 'text' 
      });
      setHtmlPreview({
        title: `Sąskaita ${localInvoice.invoice_number}`,
        htmlContent: res.data
      });
      setHtmlPreviewLang(lang);
    } catch (err) {
      showToast('error', 'Nepavyko paruošti peržiūros');
    }
  };

  React.useEffect(() => {
    setLocalInvoice(invoice);
    // Užkrauti pilną sąskaitą su invoice_items, kai modalas atidaromas
    if (isOpen && invoice?.id) {
      api.get(`/invoices/sales/${invoice.id}/`)
        .then(response => {
          setLocalInvoice(response.data);
        })
        .catch(error => {
          // Jei nepavyko, naudoti originalų invoice
          console.error('Nepavyko užkrauti sąskaitos detalių:', error);
        });
    }
  }, [invoice, isOpen]);

  if (!isOpen || !localInvoice) return null;

  const formatCurrency = (value: string | number | undefined | null, fallback = '0.00 €') => {
    if (value === undefined || value === null || value === '') return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(2)} €` : fallback;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Nenurodyta';
    
    try {
      // Pašalinti bet kokius tarpus ir neteisingus simbolius
      let cleanDate = dateStr.trim();
      
      // Patikrinti, ar yra neteisingas formatas su 3+ skaitmenimis dienos vietoje (pvz., "2025-12-130")
      const dateMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{2,})/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        let day = parseInt(dateMatch[3]);
        
        // Jei diena yra didesnė nei 31, tai tikriausiai yra klaida
        // Pavyzdžiui, "2025-12-130" - tai gali būti "13" + "0" (13 diena)
        // Arba "2025-12-110" - tai gali būti "11" + "0" (11 diena)
        if (day > 31) {
          const dayStr = dateMatch[3];
          // Bandyti paimti pirmus 2 skaitmenis (pvz., "130" -> "13", "110" -> "11")
          const firstTwo = parseInt(dayStr.substring(0, 2));
          if (firstTwo <= 31 && firstTwo > 0) {
            day = firstTwo;
          } else {
            // Jei pirmi 2 skaitmenys neteisingi, bandyti paimti paskutinius 2
            const lastTwo = parseInt(dayStr.substring(dayStr.length - 2));
            if (lastTwo <= 31 && lastTwo > 0) {
              day = lastTwo;
            } else {
              // Fallback: paimti pirmus 2 skaitmenis bet kokiu atveju
              day = firstTwo > 0 ? firstTwo : 1;
            }
          }
        }
        
        // Užtikrinti, kad diena būtų tarp 1 ir 31
        if (day < 1 || day > 31) {
          day = 1; // Fallback
        }
        
        cleanDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
      
      const date = new Date(cleanDate);
      if (Number.isNaN(date.getTime())) {
        // Jei nepavyko, bandyti iš kitų formatų
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
        return cleanDate; // Jei vis dar nepavyko, grąžinti pataisytą
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
      return dateStr; // Jei klaida, grąžinti originalią
    }
  };

  const cardStyle: React.CSSProperties = {
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '14px',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  };

  const mutedStyle: React.CSSProperties = { color: '#6c757d', fontSize: '12px' };

  const summaryChips: Array<{ label: string; value: string; tone?: 'danger' | 'success' | 'warning' }> = localInvoice ? (() => {
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

  const handlePaymentStatusChange = async (newStatus: string) => {
    try {
      const updateData: any = { payment_status: newStatus };
      if (newStatus === 'paid' && !localInvoice.payment_date) {
        updateData.payment_date = new Date().toISOString().split('T')[0];
      }
      if (newStatus !== 'paid' && localInvoice.payment_status === 'paid') {
        updateData.payment_date = null;
      }
      await api.patch(`/invoices/sales/${localInvoice.id}/`, updateData);
      showToast('success', 'Mokėjimo statusas atnaujintas');
      const response = await api.get(`/invoices/sales/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      onInvoiceUpdate(updatedInvoice);
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant mokėjimo statusą');
    }
  };

  const handlePaymentDateChange = async (newDate: string) => {
    try {
      await api.patch(`/invoices/sales/${localInvoice.id}/`, {
        payment_date: newDate || null,
        ...(newDate && localInvoice.payment_status !== 'paid' ? { payment_status: 'paid' } : {})
      });
      showToast('success', 'Apmokėjimo data atnaujinta');
      const response = await api.get(`/invoices/sales/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      onInvoiceUpdate(updatedInvoice);
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant mokėjimo datą');
    }
  };

  const handleItemVisibilityChange = async (index: number, visible: boolean) => {
    try {
      const updatedItems = [...(localInvoice.invoice_items || [])];
      updatedItems[index] = { ...updatedItems[index], visible };
      const visibleItemsIndexes = updatedItems.map((it, i) => i).filter((i) => updatedItems[i].visible !== false);
      await api.patch(`/invoices/sales/${localInvoice.id}/`, {
        visible_items_indexes: visibleItemsIndexes
      });
      setLocalInvoice({
        ...localInvoice,
        invoice_items: updatedItems
      });
      showToast('success', 'Eilutės rodymo statusas atnaujintas');
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant eilutės rodymo statusą');
    }
  };

  const handlePreviewHTML = async (lang: string = 'lt') => {
    try {
      const res = await api.get(`/invoices/sales/${localInvoice?.id}/preview/`, { 
        params: { lang },
        responseType: 'text' 
      });
      
      // Patikrinti ar response.data yra string (HTML)
      if (typeof res.data === 'string') {
        setHtmlPreview({
          title: `Sąskaita ${localInvoice?.invoice_number || localInvoice?.id}`,
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
        } else if (typeof e.response.data === 'object') {
          errorMessage = JSON.stringify(e.response.data);
        }
      } else if (e.message) {
        errorMessage = e.message;
      }
      showToast('error', 'Nepavyko atidaryti sąskaitos HTML: ' + errorMessage);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/invoices/sales/${localInvoice?.id}/pdf/`, { 
        params: { lang: i18n.language },
        responseType: 'blob' 
      });
      
      // Patikrinti ar response.data yra Blob
      if (res.data instanceof Blob) {
        // Patikrinti ar tai PDF (jei nėra, gali būti error HTML)
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
        } else {
          // Jei ne PDF, pabandyti perskaityti kaip tekstą (gali būti error message)
          const text = await res.data.text();
          showToast('error', 'Nepavyko parsisiųsti PDF: ' + (text || 'Nežinoma klaida'));
        }
      } else {
        showToast('error', 'Nepavyko parsisiųsti PDF: Neteisingas atsakymo formatas');
      }
    } catch (e: any) {
      let errorMessage = 'Nežinoma klaida';
      if (e.response?.data) {
        // Jei response.data yra Blob, pabandyti perskaityti
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid #dee2e6' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Sąskaita #{localInvoice.invoice_number}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="invoice-details" style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {summaryChips.map((chip) => {
              const baseStyle: React.CSSProperties = {
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                background: '#eef2f6',
                color: '#1f2a37',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
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

          {/* Key info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div style={{ ...cardStyle, backgroundColor: '#f8f9fa' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>Pagrindinė informacija</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                {localInvoice.credit_invoice && (
                  <div>
                    <strong>Kredito sąskaita:</strong> #{localInvoice.credit_invoice}
                  </div>
                )}
                <div>
                  <strong>Mokėjimo statusas:</strong>
                </div>
                <select
                  value={localInvoice.payment_status}
                  onChange={(e) => handlePaymentStatusChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #ced4da',
                    fontSize: '13px',
                    backgroundColor:
                      localInvoice.payment_status === 'paid'
                        ? '#d4edda'
                        : localInvoice.payment_status === 'overdue'
                          ? '#f8d7da'
                          : localInvoice.payment_status === 'partially_paid'
                            ? '#fff3cd'
                            : '#fff',
                    color:
                      localInvoice.payment_status === 'paid'
                        ? '#155724'
                        : localInvoice.payment_status === 'overdue'
                          ? '#721c24'
                          : localInvoice.payment_status === 'partially_paid'
                            ? '#856404'
                            : '#333',
                  }}
                >
                  <option value="unpaid">Neapmokėta</option>
                  <option value="paid">Apmokėta</option>
                  <option value="overdue">Vėluoja</option>
                  <option value="partially_paid">Dalinis apmokėjimas</option>
                </select>
              </div>
            </div>

            <div style={{ ...cardStyle, backgroundColor: '#f8f9fa' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>Datos</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                <div>
                  <strong>Išrašymo data:</strong> {formatDate(localInvoice.issue_date)}
                </div>
                <div>
                  <strong>Apmokėti iki:</strong> {formatDate(localInvoice.due_date)}
                  {localInvoice.overdue_days !== undefined && localInvoice.overdue_days !== null && (
                    <span style={{ ...mutedStyle, fontWeight: 600, color: localInvoice.overdue_days > 0 ? '#d9534f' : '#6c757d', marginLeft: '6px' }}>
                      ({localInvoice.overdue_days > 0 ? '+' : ''}{localInvoice.overdue_days} d.)
                    </span>
                  )}
                </div>
                <div>
                  <strong>Apmokėjimo data:</strong>
                </div>
                <input
                  type="date"
                  value={localInvoice.payment_date || ''}
                  onChange={(e) => handlePaymentDateChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #ced4da',
                    fontSize: '13px',
                    width: '100%'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Client & order */}
          <div style={{ display: 'grid', gridTemplateColumns: localInvoice.related_order ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr', gap: '14px' }}>
            <div style={cardStyle}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>Partneris</h4>
              <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                <div><strong>{localInvoice.partner.name}</strong></div>
                {localInvoice.partner.code && <div>Kodas: {localInvoice.partner.code}</div>}
                {localInvoice.partner.vat_code && <div>PVM: {localInvoice.partner.vat_code}</div>}
                {localInvoice.partner.address && <div>{localInvoice.partner.address}</div>}
                {(localInvoice.partner.city || localInvoice.partner.postal_code) && (
                  <div>{[localInvoice.partner.city, localInvoice.partner.postal_code].filter(Boolean).join(' ')}</div>
                )}
                {(localInvoice.partner.phone || localInvoice.partner.email) && (
                  <div style={{ marginTop: '4px', ...mutedStyle }}>
                    {localInvoice.partner.phone && <span>📞 {localInvoice.partner.phone}</span>}
                    {localInvoice.partner.phone && localInvoice.partner.email && <span> • </span>}
                    {localInvoice.partner.email && <span>✉ {localInvoice.partner.email}</span>}
                  </div>
                )}
              </div>
            </div>

            {((localInvoice.related_orders && localInvoice.related_orders.length > 0) || localInvoice.related_order) && (
              <div style={cardStyle}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>
                  {(localInvoice.related_orders && localInvoice.related_orders.length > 1) 
                    ? `Susiję užsakymai (${localInvoice.related_orders.length})` 
                    : 'Susijęs užsakymas'}
                </h4>
                <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                  {localInvoice.related_orders && localInvoice.related_orders.length > 0 ? (
                    localInvoice.related_orders.map((order, index) => (
                      <div key={order.id} style={{ marginBottom: index < localInvoice.related_orders!.length - 1 ? '12px' : '0', paddingBottom: index < localInvoice.related_orders!.length - 1 ? '12px' : '0', borderBottom: index < localInvoice.related_orders!.length - 1 ? '1px solid #dee2e6' : 'none' }}>
                        <div><strong>{order.order_number || `#${order.id}`}</strong></div>
                        {order.client && <div>Klientas: {order.client.name}</div>}
                        {order.route_from && (
                          <div>Maršrutas: {order.route_from} → {order.route_to || 'Nenurodyta'}</div>
                        )}
                        {((order.loading_date_from || order.unloading_date_from) || order.loading_date || order.unloading_date) && (
                          <div style={mutedStyle}>
                            {/* Pakrovimo datos */}
                            {(() => {
                              // Nauja logika: jei yra intervalas (nuo !== iki), rodyti intervalą, kitaip vieną datą
                              const loadingFrom = order.loading_date_from;
                              const loadingTo = order.loading_date_to;
                              const loadingSingle = order.loading_date;

                              if (loadingFrom) {
                                if (loadingTo && loadingFrom !== loadingTo) {
                                  return <span>Pakrovimas: {formatDate(loadingFrom)} - {formatDate(loadingTo)}</span>;
                                } else {
                                  return <span>Pakrovimas: {formatDate(loadingFrom)}</span>;
                                }
                              } else if (loadingSingle) {
                                return <span>Pakrovimas: {formatDate(loadingSingle)}</span>;
                              }
                              return null;
                            })()}

                            {/* Separator */}
                            {(() => {
                              const hasLoading = (order.loading_date_from || order.loading_date);
                              const hasUnloading = (order.unloading_date_from || order.unloading_date);
                              return hasLoading && hasUnloading ? <span> • </span> : null;
                            })()}

                            {/* Iškrovimo datos */}
                            {(() => {
                              const unloadingFrom = order.unloading_date_from;
                              const unloadingTo = order.unloading_date_to;
                              const unloadingSingle = order.unloading_date;

                              if (unloadingFrom) {
                                if (unloadingTo && unloadingFrom !== unloadingTo) {
                                  return <span>Iškrovimas: {formatDate(unloadingFrom)} - {formatDate(unloadingTo)}</span>;
                                } else {
                                  return <span>Iškrovimas: {formatDate(unloadingFrom)}</span>;
                                }
                              } else if (unloadingSingle) {
                                return <span>Iškrovimas: {formatDate(unloadingSingle)}</span>;
                              }
                              return null;
                            })()}
                          </div>
                        )}
                        {order.client_price_net && (
                          <div style={{ marginTop: '4px', fontWeight: 600 }}>
                            <div>Užsakymo suma be PVM: {formatCurrency(order.client_price_net)}</div>
                            {order.vat_rate !== undefined && order.vat_rate !== null && (
                              <>
                                <div>Užsakymo PVM: {Number(order.vat_rate).toFixed(0)}%</div>
                                <div>Užsakymo suma su PVM: {formatCurrency(
                                  Number(order.client_price_net) * (1 + Number(order.vat_rate) / 100)
                                )}</div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : localInvoice.related_order ? (
                    <>
                      <div><strong>{localInvoice.related_order.order_number || `#${localInvoice.related_order.id}`}</strong></div>
                      {localInvoice.related_order.client && <div>Klientas: {localInvoice.related_order.client.name}</div>}
                      {localInvoice.related_order.route_from && (
                        <div>Maršrutas: {localInvoice.related_order.route_from} → {localInvoice.related_order.route_to || 'Nenurodyta'}</div>
                      )}
                      {((localInvoice.related_order.loading_date_from || localInvoice.related_order.unloading_date_from) || localInvoice.related_order.loading_date || localInvoice.related_order.unloading_date) && (
                        <div style={mutedStyle}>
                          {(() => {
                            // Išmanus rodymas: intervalas arba viena data
                            const loadingFrom = localInvoice.related_order.loading_date_from;
                            const loadingTo = localInvoice.related_order.loading_date_to;
                            const loadingSingle = localInvoice.related_order.loading_date;

                            const unloadingFrom = localInvoice.related_order.unloading_date_from;
                            const unloadingTo = localInvoice.related_order.unloading_date_to;
                            const unloadingSingle = localInvoice.related_order.unloading_date;

                            let loadingText = null;
                            let unloadingText = null;

                            // Pakrovimo data
                            if (loadingFrom) {
                              if (loadingTo && loadingFrom !== loadingTo) {
                                loadingText = `Pakrovimas: ${formatDate(loadingFrom)} - ${formatDate(loadingTo)}`;
                              } else {
                                loadingText = `Pakrovimas: ${formatDate(loadingFrom)}`;
                              }
                            } else if (loadingSingle) {
                              loadingText = `Pakrovimas: ${formatDate(loadingSingle)}`;
                            }

                            // Iškrovimo data
                            if (unloadingFrom) {
                              if (unloadingTo && unloadingFrom !== unloadingTo) {
                                unloadingText = `Iškrovimas: ${formatDate(unloadingFrom)} - ${formatDate(unloadingTo)}`;
                              } else {
                                unloadingText = `Iškrovimas: ${formatDate(unloadingFrom)}`;
                              }
                            } else if (unloadingSingle) {
                              unloadingText = `Iškrovimas: ${formatDate(unloadingSingle)}`;
                            }

                            return (
                              <>
                                {loadingText && <span>{loadingText}</span>}
                                {loadingText && unloadingText && <span> • </span>}
                                {unloadingText && <span>{unloadingText}</span>}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {localInvoice.related_order.client_price_net && (
                        <div style={{ marginTop: '4px', fontWeight: 600 }}>
                          <div>Užsakymo suma be PVM: {formatCurrency(localInvoice.related_order.client_price_net)}</div>
                          {localInvoice.related_order.vat_rate !== undefined && localInvoice.related_order.vat_rate !== null && (
                            <>
                              <div>Užsakymo PVM: {Number(localInvoice.related_order.vat_rate).toFixed(0)}%</div>
                              <div>Užsakymo suma su PVM: {formatCurrency(
                                Number(localInvoice.related_order.client_price_net) * (1 + Number(localInvoice.related_order.vat_rate) / 100)
                              )}</div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {localInvoice.invoice_items && Array.isArray(localInvoice.invoice_items) && localInvoice.invoice_items.length > 0 && (
            <div style={{ ...cardStyle, padding: '12px', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>Sąskaitos eilutės</h4>
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
                    {localInvoice.invoice_items.map((item: InvoiceItem, idx: number) => {
                      // Rodyti visus items, nepriklausomai nuo visible statuso
                      // Visible checkbox'as tik kontroliuoja, ar eilutė bus rodoma HTML/PDF peržiūroje
                      return (
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
                      );
                    })}
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
              
              {/* Užsakymo tipas */}
              <div style={{ padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={localInvoice.display_options?.show_order_type ?? true}
                    onChange={async (e) => {
                      try {
                        const updatedOptions = {
                          ...localInvoice.display_options,
                          show_order_type: e.target.checked
                        };
                        await api.patch(`/invoices/sales/${localInvoice.id}/`, {
                          display_options: updatedOptions
                        });
                        setLocalInvoice({
                          ...localInvoice,
                          display_options: updatedOptions
                        });
                        showToast('success', 'Rodymo pasirinkimas atnaujintas');
                        const response = await api.get(`/invoices/sales/${localInvoice.id}/`);
                        const updatedInvoice = response.data;
                        setLocalInvoice(updatedInvoice);
                        onInvoiceUpdate(updatedInvoice);
                      } catch (error: any) {
                        showToast('error', error.response?.data?.error || 'Klaida atnaujinant rodymo pasirinkimą');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginRight: '8px', cursor: 'pointer' }}
                  />
                  Rodyti užsakymo tipą
                </label>
              </div>
            </div>
          )}
          
          {localInvoice.notes && (
            <div style={{ ...cardStyle, whiteSpace: 'pre-wrap' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#495057' }}>Pastabos</h4>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>{localInvoice.notes}</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={() => handlePreviewHTML(i18n.language)}
            style={{ backgroundColor: '#17a2b8', borderColor: '#17a2b8' }}
          >
            📄 Peržiūrėti HTML
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDownloadPDF}
            style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
          >
            📥 Parsisiųsti PDF
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onEdit(localInvoice);
            }}
          >
            Redaguoti
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onClose();
              onDelete(localInvoice);
            }}
            style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
          >
            Trinti
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Užverti
          </button>
        </div>
      </div>
      
      {/* HTML Preview Modal */}
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

export default SalesInvoiceDetailsModal;

