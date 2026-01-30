import React, { useState, useEffect, useCallback } from 'react';
import { Decimal } from 'decimal.js';
import { OrderCarrier } from './OrderEditModal_NEW';
import { api } from '../../services/api';
import PaymentService from '../../services/paymentService';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import AttachmentPreviewModal, { AttachmentPreview } from '../common/AttachmentPreviewModal';

interface OtherCost {
  description: string;
  amount: string | number;
}

interface SalesInvoice {
  id: number;
  invoice_number: string;
  amount_total: string;
  paid_amount?: string;
  remaining_amount?: string;
  payment_status: string;
  issue_date: string;
}

interface PurchaseInvoice {
  id: number;
  received_invoice_number: string;
  amount_total: string;
  paid_amount?: string;
  remaining_amount?: string;
  payment_status: string;
  issue_date: string;
  invoice_file_url?: string;
  partner?: { name: string };
}

interface OrderFinanceProps {
  orderId?: number;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  orderCarriers: OrderCarrier[];
  setOrderCarriers: React.Dispatch<React.SetStateAction<OrderCarrier[]>>;
  pvmRates: any[];
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  handleClientPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  calculateMyPrice: (force?: boolean) => void;
  onOpenSalesInvoice: (invoice?: any) => void;
  onOpenPurchaseInvoice: (invoice?: any) => void;
  refreshTrigger?: number;
  onRefreshEmails?: () => void; // Callback'as atnaujinti email'ų sąrašą po trinimo
}

const OrderEdit_Finance: React.FC<OrderFinanceProps> = ({
  orderId,
  formData,
  setFormData,
  orderCarriers,
  setOrderCarriers,
  pvmRates,
  showToast,
  handleClientPriceChange,
  calculateMyPrice,
  onOpenSalesInvoice,
  onOpenPurchaseInvoice,
  refreshTrigger,
  onRefreshEmails,
}) => {
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [paymentAction, setPaymentAction] = useState<{ id: number, type: 'sales' | 'purchase', date: string } | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewInvoiceId, setHtmlPreviewInvoiceId] = useState<number | null>(null);
  const [htmlPreviewInvoiceType, setHtmlPreviewInvoiceType] = useState<'sales' | 'purchase' | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number, type: 'sales' | 'purchase', invoiceNumber: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Krauti sąskaitas jei užsakymas jau egzistuoja
  const fetchInvoices = React.useCallback(async () => {
    if (!orderId) return;
    setLoadingInvoices(true);
    try {
      const response = await api.get(`/orders/orders/${orderId}/related-invoices-info/`);
      setSalesInvoices(response.data.sales_invoices || []);
      setPurchaseInvoices(response.data.purchase_invoices || []);
    } catch (err) {
      // Fallback jei endpoint'as dar nepalaiko info action (nors turėtų)
      try {
        const [salesRes, purchaseRes] = await Promise.all([
          api.get(`/invoices/sales/?related_order=${orderId}`),
          api.get(`/invoices/purchase/?related_order=${orderId}`)
        ]);
        setSalesInvoices(salesRes.data.results || salesRes.data || []);
        setPurchaseInvoices(purchaseRes.data.results || purchaseRes.data || []);
      } catch (err2) {
      }
    } finally {
      setLoadingInvoices(false);
    }
  }, [orderId]);

  const handleDeleteInvoice = async () => {
    if (!deleteConfirm || deleting) return;

    setDeleting(true);
    try {
      const endpoint = deleteConfirm.type === 'sales' 
        ? `/invoices/sales/${deleteConfirm.id}/` 
        : `/invoices/purchase/${deleteConfirm.id}/`;
      
      await api.delete(endpoint);
      showToast('success', `${deleteConfirm.type === 'sales' ? 'Pardavimo' : 'Pirkimo'} sąskaita ${deleteConfirm.invoiceNumber} sėkmingai ištrinta`);
      setDeleteConfirm(null);
      // Atnaujinti sąrašą
      await fetchInvoices();
      // Atnaujinti email'ų sąrašą, jei yra onRefreshEmails callback
      if (onRefreshEmails) {
        onRefreshEmails();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.response?.data?.error || error.message || 'Nepavyko ištrinti sąskaitos';
      showToast('error', errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!paymentAction) return;
    if (!paymentAction.date) {
      showToast('info', 'Pasirinkite apmokėjimo datą');
      return;
    }

    try {
      // Rasti sąskaitą, kad gauti likusią sumą
      const invoice = paymentAction.type === 'sales' 
        ? salesInvoices.find(inv => inv.id === paymentAction.id)
        : purchaseInvoices.find(inv => inv.id === paymentAction.id);
      
      if (!invoice) {
        showToast('error', `${paymentAction.type === 'sales' ? 'Pardavimo' : 'Pirkimo'} sąskaita nerasta`);
        return;
      }

      // Apskaičiuoti sumą - jei yra remaining_amount, naudoti ją, kitu atveju amount_total
      const amount = invoice.remaining_amount && parseFloat(invoice.remaining_amount) > 0
        ? parseFloat(invoice.remaining_amount)
        : parseFloat(invoice.amount_total);

      // Sukurti InvoicePayment įrašą per PaymentService
      await PaymentService.addPayment({
        invoice_type: paymentAction.type === 'sales' ? 'sales' : 'purchase',
        invoice_id: paymentAction.id,
        amount: amount,
        payment_date: paymentAction.date,
        payment_method: 'Pavedimu', // Numatytoji reikšmė
        notes: 'Apmokėta iš užsakymo finansų skilties'
      });

      showToast('success', `${paymentAction.type === 'sales' ? 'Pardavimo' : 'Pirkimo'} sąskaita pažymėta kaip apmokėta`);
      setPaymentAction(null);
      fetchInvoices();
    } catch (err: any) {
      showToast('error', 'Nepavyko pažymėti apmokėjimo: ' + (err.response?.data?.error || err.message));
    }
  };

  const fetchHtmlPreview = async (id: number, type: 'sales' | 'purchase', lang: string = 'lt') => {
    try {
      const endpoint = type === 'sales' ? `/invoices/sales/${id}/preview/` : `/invoices/purchase/${id}/preview/`;
      const response = await api.get(endpoint, {
        params: { lang },
        responseType: 'text',
      });
      setHtmlPreview({
        title: `${type === 'sales' ? 'Pardavimo' : 'Pirkimo'} sąskaita ${id}`,
        htmlContent: response.data
      });
      setHtmlPreviewInvoiceId(id);
      setHtmlPreviewInvoiceType(type);
      setHtmlPreviewLang(lang);
    } catch (error: any) {
      showToast('error', 'Nepavyko atidaryti peržiūros');
    }
  };

  const handlePreview = async (inv: any, type: 'sales' | 'purchase') => {
    if (type === 'sales') {
      fetchHtmlPreview(inv.id, 'sales', 'lt');
    } else if (type === 'purchase') {
      if (inv.invoice_file_url) {
        // Atidaryti PDF modale naudojant AttachmentPreviewModal
        setAttachmentPreview({
          filename: `${inv.received_invoice_number || inv.id}.pdf`,
          url: inv.invoice_file_url
        });
      } else {
        showToast('info', 'Ši pirkimo sąskaita neturi prisegto failo');
      }
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices, refreshTrigger]);

  // Automatiškai atnaujinti sąskaitas kas 10 sekundes, jei komponentas matomas
  // Tai užtikrina, kad mokėjimų puslapyje atlikti pakeitimai būtų matomi
  useEffect(() => {
    if (!orderId) return;
    
    const interval = setInterval(() => {
      fetchInvoices();
    }, 10000); // Atnaujinti kas 10 sekundes

    return () => clearInterval(interval);
  }, [orderId, fetchInvoices]);

  // Apskaičiuoti bendras sumas
  const clientPriceNet = new Decimal(formData.client_price_net || 0);
  
  const carriersPriceNet = orderCarriers.reduce((sum, c) => {
    return sum.plus(new Decimal(c.price_net || 0));
  }, new Decimal(0));
  
  const otherCostsNet = (formData.other_costs || []).reduce((sum: Decimal, c: OtherCost) => {
    return sum.plus(new Decimal(c.amount || 0));
  }, new Decimal(0));
  
  const totalCostsNet = carriersPriceNet.plus(otherCostsNet);
  const profitNet = clientPriceNet.minus(totalCostsNet);
  
  const profitPercentage = clientPriceNet.gt(0) 
    ? profitNet.dividedBy(clientPriceNet).times(100).toFixed(2)
    : '0.00';

  const handleCarrierChange = (idx: number, field: keyof OrderCarrier, value: any) => {
    const newCarriers = [...orderCarriers];
    newCarriers[idx] = { ...newCarriers[idx], [field]: value };
    setOrderCarriers(newCarriers);
  };

  const handleClientFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const onOtherCostChange = (idx: number, field: string, value: any) => {
    const newCosts = [...formData.other_costs];
    newCosts[idx] = { ...newCosts[idx], [field]: value };
    setFormData((prev: any) => ({ ...prev, other_costs: newCosts }));
    if (field === 'amount') {
      setTimeout(() => calculateMyPrice(true), 50);
    }
  };

  const onOtherCostDelete = (idx: number) => {
    const newCosts = [...formData.other_costs];
    newCosts.splice(idx, 1);
    setFormData((prev: any) => ({ ...prev, other_costs: newCosts }));
    setTimeout(() => calculateMyPrice(true), 50);
  };

  const onOtherCostAdd = () => {
    const newCosts = [...(formData.other_costs || []), { description: '', amount: '' }];
    setFormData((prev: any) => ({ ...prev, other_costs: newCosts }));
  };

  return (
    <div className="finance-tab">
      {/* 1. Pelno suvestinė */}
      <div className="profit-summary-card" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '15px',
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        marginBottom: '20px'
      }}>
        <div className="summary-item">
          <label style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Pardavimas</label>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#007bff' }}>{clientPriceNet.toFixed(2)} EUR</div>
        </div>
        <div className="summary-item">
          <label style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Sąnaudos</label>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc3545' }}>{totalCostsNet.toFixed(2)} EUR</div>
        </div>
        <div className="summary-item">
          <label style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Pelnas</label>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: profitNet.gte(0) ? '#28a745' : '#dc3545' }}>
            {profitNet.toFixed(2)} EUR
          </div>
        </div>
        <div className="summary-item">
          <label style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>Pelningumas</label>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: profitNet.gte(0) ? '#28a745' : '#dc3545' }}>
            {profitPercentage}%
          </div>
        </div>
      </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
                    <div>
                      {/* 2. Pardavimo sąskaitos */}
                      <div className="card-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <h4 className="section-title" style={{ marginBottom: 0 }}>🧾 Pardavimo sąskaitos (Klientui)</h4>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button 
                              type="button" 
                              className="button button-secondary" 
                              style={{ fontSize: '12px', padding: '5px 10px' }}
                              onClick={() => fetchInvoices()}
                              disabled={!orderId || loadingInvoices}
                            >
                              {loadingInvoices ? '🔄' : 'Atnaujinti'}
                            </button>
                            <button 
                              type="button" 
                              className="button button-primary" 
                              style={{ fontSize: '12px', padding: '5px 10px' }}
                              onClick={() => onOpenSalesInvoice()}
                              disabled={!orderId}
                              title={!orderId ? 'Pirmiausia išsaugokite užsakymą' : ''}
                            >
                              + Išrašyti sąskaitą
                            </button>
                          </div>
                        </div>
            
            {salesInvoices.length > 0 ? (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Nr.</th>
                    <th>Data</th>
                    <th>Suma su PVM</th>
                    <th>Būsena</th>
                    <th>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {salesInvoices.map(inv => {
                    // Apskaičiuoti tikrąjį statusą pagal paid_amount ir remaining_amount
                    const paidAmount = parseFloat(inv.paid_amount || '0');
                    const totalAmount = parseFloat(inv.amount_total || '0');
                    const remainingAmount = parseFloat(inv.remaining_amount || '0');
                    
                    // Jei payment_status yra 'paid', naudoti jį kaip pagrindinį indikatorių
                    let actualStatus = inv.payment_status;
                    if (inv.payment_status === 'paid') {
                      actualStatus = 'paid';
                    } else if (paidAmount >= totalAmount && remainingAmount <= 0.01) {
                      actualStatus = 'paid';
                    } else if (paidAmount > 0 && remainingAmount > 0.01) {
                      actualStatus = 'partially_paid';
                    } else {
                      actualStatus = 'unpaid';
                    }
                    
                    return (
                    <tr key={inv.id}>
                      <td>{inv.invoice_number}</td>
                      <td>{inv.issue_date}</td>
                      <td>
                        <div>{inv.amount_total} EUR</div>
                        {inv.paid_amount && parseFloat(inv.paid_amount) > 0 && (
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            Apmokėta: {parseFloat(inv.paid_amount).toFixed(2)} EUR
                          </div>
                        )}
                        {inv.paid_amount && inv.remaining_amount && 
                         parseFloat(inv.paid_amount) > 0 && 
                         parseFloat(inv.remaining_amount) > 0 && 
                         parseFloat(inv.paid_amount) < parseFloat(inv.amount_total) && (
                          <div style={{ fontSize: '11px', color: '#dc3545', fontWeight: '600' }}>
                            Likutis: {parseFloat(inv.remaining_amount).toFixed(2)} EUR
                          </div>
                        )}
                      </td>
                                  <td>
                                    <span className={`badge status-${actualStatus}`} style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      padding: '4px 10px',
                                      fontSize: '12px',
                                      fontWeight: actualStatus === 'paid' ? '700' : 'normal',
                                      boxShadow: actualStatus === 'paid' ? '0 0 0 1px #28a745' : 'none'
                                    }}>
                                      {actualStatus === 'paid' ? '✅ APMOKĖTA' : (actualStatus === 'overdue' ? '⚠️ VĖLUOJA' : actualStatus === 'partially_paid' ? '🟡 DALINIS' : '⏳ LAUKIA')}
                                    </span>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                      <button type="button" onClick={() => handlePreview(inv, 'sales')} className="btn-icon" title="Peržiūrėti">👁️</button>
                                      <button type="button" onClick={() => onOpenSalesInvoice(inv)} className="btn-icon" title="Redaguoti">✏️</button>
                                      <button type="button" onClick={() => setDeleteConfirm({ id: inv.id, type: 'sales', invoiceNumber: inv.invoice_number })} className="btn-icon" title="Ištrinti" style={{ color: '#dc3545' }}>🗑️</button>
                                      {actualStatus !== 'paid' && (
                                        paymentAction?.id === inv.id && paymentAction?.type === 'sales' ? (
                                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <input 
                                              type="date" 
                                              value={paymentAction.date} 
                                              onChange={(e) => setPaymentAction({ ...paymentAction, date: e.target.value })}
                                              className="form-control"
                                              style={{ fontSize: '11px', padding: '2px 4px', width: '110px' }}
                                            />
                                            <button 
                                              type="button" 
                                              onClick={handleMarkPaid}
                                              className="button button-primary"
                                              style={{ fontSize: '10px', padding: '2px 6px' }}
                                            >
                                              OK
                                            </button>
                                            <button 
                                              type="button" 
                                              onClick={() => setPaymentAction(null)}
                                              className="button button-secondary"
                                              style={{ fontSize: '10px', padding: '2px 6px' }}
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <button 
                                            type="button" 
                                            onClick={() => setPaymentAction({ id: inv.id, type: 'sales', date: new Date().toISOString().split('T')[0] })} 
                                            className="button" 
                                            style={{ 
                                              fontSize: '10px', 
                                              padding: '2px 8px', 
                                              backgroundColor: '#e6ffed', 
                                              color: '#28a745', 
                                              border: '1px solid #b7ebb5' 
                                            }}
                                          >
                                            Pažymėti kaip apmokėtą
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state" style={{ fontSize: '12px', color: '#888' }}>
                {orderId ? 'Sąskaitų dar nėra' : 'Išsaugokite užsakymą, kad galėtumėte išrašyti sąskaitą'}
              </div>
            )}
          </div>

          {/* 3. Pirkimo sąskaitos */}
          <div className="card-section" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 className="section-title" style={{ marginBottom: 0 }}>📥 Pirkimo sąskaitos (Iš vežėjų)</h4>
              <button 
                type="button" 
                className="button button-primary" 
                style={{ fontSize: '12px', padding: '5px 10px' }}
                onClick={() => onOpenPurchaseInvoice()}
                disabled={!orderId}
              >
                + Įvesti gautą sąskaitą
              </button>
            </div>
            
                        {purchaseInvoices.length > 0 ? (
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>Tiekėjas</th>
                                <th>Sąsk. Nr.</th>
                                <th>Suma</th>
                                <th>Būsena</th>
                                <th>Veiksmai</th>
                              </tr>
                            </thead>
                            <tbody>
                              {purchaseInvoices.map(inv => {
                                // Apskaičiuoti tikrąjį statusą pagal paid_amount ir remaining_amount
                                const paidAmount = parseFloat(inv.paid_amount || '0');
                                const totalAmount = parseFloat(inv.amount_total || '0');
                                const remainingAmount = parseFloat(inv.remaining_amount || '0');
                                
                                let actualStatus = inv.payment_status;
                                if (paidAmount >= totalAmount && remainingAmount <= 0.01) {
                                  actualStatus = 'paid';
                                } else if (paidAmount > 0 && remainingAmount > 0.01) {
                                  actualStatus = 'partially_paid';
                                } else if (paidAmount <= 0) {
                                  actualStatus = 'unpaid';
                                }
                                
                                return (
                                <tr key={inv.id}>
                                  <td>
                                    <div style={{ fontWeight: '600' }}>{inv.partner?.name || 'Nenurodyta'}</div>
                                    <div style={{ fontSize: '10px', color: '#888' }}>{inv.issue_date}</div>
                                  </td>
                                  <td>{inv.received_invoice_number}</td>
                                  <td>
                                    <div>{inv.amount_total} EUR</div>
                                    {inv.paid_amount && parseFloat(inv.paid_amount) > 0 && (
                                      <div style={{ fontSize: '11px', color: '#666' }}>
                                        Apmokėta: {parseFloat(inv.paid_amount).toFixed(2)} EUR
                                      </div>
                                    )}
                                    {inv.paid_amount && inv.remaining_amount && 
                                     parseFloat(inv.paid_amount) > 0 && 
                                     parseFloat(inv.remaining_amount) > 0 && 
                                     parseFloat(inv.paid_amount) < parseFloat(inv.amount_total) && (
                                      <div style={{ fontSize: '11px', color: '#dc3545', fontWeight: '600' }}>
                                        Likutis: {parseFloat(inv.remaining_amount).toFixed(2)} EUR
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <span className={`badge status-${actualStatus}`} style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      padding: '4px 10px',
                                      fontSize: '12px',
                                      fontWeight: actualStatus === 'paid' ? '700' : 'normal',
                                      boxShadow: actualStatus === 'paid' ? '0 0 0 1px #28a745' : 'none'
                                    }}>
                                      {actualStatus === 'paid' ? '✅ APMOKĖTA' : (actualStatus === 'overdue' ? '⚠️ VĖLUOJA' : actualStatus === 'partially_paid' ? '🟡 DALINIS' : '⏳ LAUKIA')}
                                    </span>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                      <button type="button" onClick={() => handlePreview(inv, 'purchase')} className="btn-icon" title="Peržiūrėti">👁️</button>
                                      <button type="button" onClick={() => onOpenPurchaseInvoice(inv)} className="btn-icon" title="Redaguoti">✏️</button>
                                      <button type="button" onClick={() => setDeleteConfirm({ id: inv.id, type: 'purchase', invoiceNumber: inv.received_invoice_number })} className="btn-icon" title="Ištrinti" style={{ color: '#dc3545' }}>🗑️</button>
                                      {actualStatus !== 'paid' && (
                                        paymentAction?.id === inv.id && paymentAction?.type === 'purchase' ? (
                                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <input 
                                              type="date" 
                                              value={paymentAction.date} 
                                              onChange={(e) => setPaymentAction({ ...paymentAction, date: e.target.value })}
                                              className="form-control"
                                              style={{ fontSize: '11px', padding: '2px 4px', width: '110px' }}
                                            />
                                            <button 
                                              type="button" 
                                              onClick={handleMarkPaid}
                                              className="button button-primary"
                                              style={{ fontSize: '10px', padding: '2px 6px' }}
                                            >
                                              OK
                                            </button>
                                            <button 
                                              type="button" 
                                              onClick={() => setPaymentAction(null)}
                                              className="button button-secondary"
                                              style={{ fontSize: '10px', padding: '2px 6px' }}
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <button 
                                            type="button" 
                                            onClick={() => setPaymentAction({ id: inv.id, type: 'purchase', date: new Date().toISOString().split('T')[0] })} 
                                            className="button" 
                                            style={{ 
                                              fontSize: '10px', 
                                              padding: '2px 8px', 
                                              backgroundColor: '#e6ffed', 
                                              color: '#28a745', 
                                              border: '1px solid #b7ebb5' 
                                            }}
                                          >
                                            Pažymėti kaip apmokėtą
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
              <div className="empty-state" style={{ fontSize: '12px', color: '#888' }}>
                {orderId ? 'Gautų pirkimo sąskaitų dar nėra' : 'Išsaugokite užsakymą, kad galėtumėte įvesti pirkimo sąskaitas'}
              </div>
            )}
          </div>
        </div>

        <div className="side-finance">
          {/* 4. Kliento finansinė dalis */}
          <div className="card-section">
            <h4 className="section-title">👤 Pardavimo kaina</h4>
            <div className="form-group">
              <label>Kaina klientui (be PVM) *</label>
              <input 
                type="number" 
                step="0.01" 
                value={formData.client_price_net} 
                onChange={(e) => {
                  console.log('💰 Input onChange:', e.target.value);
                  handleClientPriceChange(e);
                }} 
                className="form-control" 
              />
            </div>
            <div className="form-group">
              <label>PVM tarifas *</label>
              <select 
                value={pvmRates.find(r => r.rate === formData.vat_rate && r.article === formData.vat_rate_article)?.id || ''}
                onChange={e => {
                  const r = pvmRates.find(x => x.id === parseInt(e.target.value));
                  if (r) {
                    setFormData((prev: any) => ({
                      ...prev, 
                      vat_rate: r.rate, 
                      vat_rate_article: r.article || ''
                    }));
                  }
                }}
                className="form-control"
              >
                {pvmRates.map(r => <option key={r.id} value={r.id}>{r.rate}% {r.article}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PVM tarifo straipsnis</label>
              <input 
                type="text" 
                value={formData.vat_rate_article || ''} 
                onChange={(e) => handleClientFieldChange('vat_rate_article', e.target.value)} 
                className="form-control" 
                placeholder="PVZ: 122 straipsnis"
              />
            </div>
            
            <div style={{ marginTop: '10px' }}>
              <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={formData.client_invoice_issued} 
                  onChange={(e) => handleClientFieldChange('client_invoice_issued', e.target.checked)} 
                />
                Pardavimo sąskaita išrašyta sistemoje
              </label>
            </div>
          </div>

          {/* 5. Kitos išlaidos */}
          <div className="card-section" style={{ marginTop: '20px' }}>
            <h4 className="section-title">💸 Kitos sąnaudos</h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {(formData.other_costs || []).map((cost: OtherCost, idx: number) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '5px', 
                  marginBottom: '5px', 
                  alignItems: 'center',
                  padding: '5px',
                  backgroundColor: '#fff',
                  border: '1px solid #eee',
                  borderRadius: '4px'
                }}>
                  <input 
                    type="text" 
                    value={cost.description} 
                    onChange={(e) => onOtherCostChange(idx, 'description', e.target.value)} 
                    className="form-control" 
                    placeholder="Kas?"
                    style={{ flex: 2, fontSize: '12px', padding: '4px' }}
                  />
                  <input 
                    type="number" 
                    value={cost.amount} 
                    onChange={(e) => onOtherCostChange(idx, 'amount', e.target.value)} 
                    className="form-control" 
                    placeholder="Suma"
                    style={{ flex: 1, fontSize: '12px', padding: '4px' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => onOtherCostDelete(idx)} 
                    className="btn-icon"
                  >🗑️</button>
                </div>
              ))}
              <button 
                type="button" 
                onClick={onOtherCostAdd} 
                className="button button-secondary"
                style={{ width: '100%', marginTop: '5px', fontSize: '11px', padding: '4px' }}
              >
                + Pridėti kitas išlaidas
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Vežėjų lentelė apačioje per visą plotį */}
      <div className="card-section" style={{ marginTop: '20px' }}>
        <h4 className="section-title">🚚 Vežėjų ir sandėlių sąnaudos</h4>
        {orderCarriers.length > 0 ? (
          <table className="mini-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Partneris</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Kaina (be PVM)</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>PVM (%)</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Gauta sąsk.</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Mokėjimo būklė</th>
              </tr>
            </thead>
            <tbody>
                          {orderCarriers.map((c, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '8px', fontWeight: '600' }}>
                                {c.partner?.name}
                                <div style={{ fontSize: '10px', color: '#888' }}>{c.carrier_type === 'carrier' ? 'Vežėjas' : 'Sandėlys'}</div>
                                {orderId && (
                                  <button 
                                    type="button" 
                                    onClick={() => onOpenPurchaseInvoice({ 
                                      partner_id: c.partner_id,
                                      amount_net: c.price_net,
                                      order_carrier_id: c.id
                                    })} 
                                    style={{ 
                                      fontSize: '10px', 
                                      padding: '2px 5px', 
                                      marginTop: '4px',
                                      backgroundColor: '#e7f3ff',
                                      color: '#007bff',
                                      border: '1px solid #cce5ff',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    + Pridėti sąskaitą
                                  </button>
                                )}
                              </td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={c.price_net || ''} 
                      onChange={(e) => handleCarrierChange(idx, 'price_net', e.target.value)} 
                      className="form-control"
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={c.vat_rate || ''} 
                      onChange={(e) => handleCarrierChange(idx, 'vat_rate', e.target.value)} 
                      className="form-control"
                      style={{ width: '60px' }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                      <input 
                        type="checkbox" 
                        checked={c.invoice_received} 
                        onChange={(e) => handleCarrierChange(idx, 'invoice_received', e.target.checked)} 
                      />
                      Gauta
                    </label>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <select 
                      value={c.payment_status} 
                      onChange={(e) => handleCarrierChange(idx, 'payment_status', e.target.value)} 
                      className="form-control"
                      style={{ 
                        fontSize: '12px',
                        backgroundColor: c.payment_status === 'paid' ? '#e6ffed' : (c.payment_status === 'partially_paid' ? '#fff9e6' : '#fff')
                      }}
                    >
                      <option value="not_paid">Neapmokėta</option>
                      <option value="partially_paid">Dalinai</option>
                      <option value="paid">Apmokėta</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: '20px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
            Vežėjų nepridėta.
          </div>
        )}
      </div>

      <style>{`
        .finance-tab { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; }
                    .status-paid { background: #e6ffed; color: #28a745; }
                    .status-unpaid, .status-overdue { background: #fff5f5; color: #dc3545; }
                    .status-partially_paid { background: #fff9e6; color: #ffc107; }
                    .status-overdue { font-weight: bold; border: 1px solid #dc3545; }
      `}</style>

      {htmlPreview && (
        <HTMLPreviewModal
          preview={htmlPreview}
          onClose={() => {
            setHtmlPreview(null);
            setHtmlPreviewInvoiceId(null);
          }}
          onLanguageChange={(lang) => {
            if (htmlPreviewInvoiceId && htmlPreviewInvoiceType) {
              fetchHtmlPreview(htmlPreviewInvoiceId, htmlPreviewInvoiceType, lang);
            }
          }}
          currentLang={htmlPreviewLang}
          onDownloadPDF={async () => {
            if (!htmlPreviewInvoiceId) return;
            try {
              const response = await api.get(`/invoices/sales/${htmlPreviewInvoiceId}/pdf/`, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob'
              });
              
              const url = window.URL.createObjectURL(new Blob([response.data]));
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', `saskaita_${htmlPreviewInvoiceId}.pdf`);
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
        />
      )}

      {/* Ištrynimo patvirtinimo modalas */}
      {deleteConfirm && (
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
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div 
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#dc3545' }}>
              ⚠️ Patvirtinkite ištrynimą
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#333' }}>
              Ar tikrai norite ištrinti {deleteConfirm.type === 'sales' ? 'išrašytą' : 'gautą'} sąskaitą <strong>{deleteConfirm.invoiceNumber}</strong>?
            </p>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#dc3545', fontWeight: '600' }}>
              ⚠️ Šis veiksmas negrįžtamas!
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="button button-secondary"
                style={{ fontSize: '13px', padding: '8px 16px' }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={handleDeleteInvoice}
                disabled={deleting}
                className="button"
                style={{ 
                  fontSize: '13px', 
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: '#fff',
                  border: 'none'
                }}
              >
                {deleting ? 'Trinama...' : 'Ištrinti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderEdit_Finance;
