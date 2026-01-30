// TODO: Šis failas yra pasenęs ir bus ištrintas. Dabar naudojamas PurchaseInvoiceModal_NEW.tsx
import React, { useState } from 'react';
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
}

interface ExpenseCategory {
  id: number;
  name: string;
}

interface PurchaseInvoice {
  id: number;
  invoice_number: string | null;
  received_invoice_number: string;
  partner: Partner;
  related_order: Order | null;
  related_orders?: Array<{ id: number; order_number: string; order_date?: string; amount?: string }>;
  expense_category: ExpenseCategory | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  issue_date: string;
  received_date: string | null;
  due_date: string;
  payment_date: string | null;
  overdue_days?: number;
  invoice_file?: string | null;
  invoice_file_url?: string | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface PurchaseInvoiceDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: PurchaseInvoice | null;
  onInvoiceUpdate: (updatedInvoice: PurchaseInvoice) => void;
  onEdit: (invoice: PurchaseInvoice) => void;
  onDelete: (invoice: PurchaseInvoice) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const PurchaseInvoiceDetailsModal: React.FC<PurchaseInvoiceDetailsModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onInvoiceUpdate,
  onEdit,
  onDelete,
  showToast
}) => {
  const [localInvoice, setLocalInvoice] = useState<PurchaseInvoice | null>(invoice);

  React.useEffect(() => {
    setLocalInvoice(invoice);
  }, [invoice]);

  if (!isOpen || !localInvoice) return null;

  const handlePaymentStatusChange = async (newStatus: string) => {
    try {
      const updateData: any = { payment_status: newStatus };
      if (newStatus === 'paid' && !localInvoice.payment_date) {
        updateData.payment_date = new Date().toISOString().split('T')[0];
      }
      if (newStatus !== 'paid' && localInvoice.payment_status === 'paid') {
        updateData.payment_date = null;
      }
      await api.patch(`/invoices/purchase/${localInvoice.id}/`, updateData);
      showToast('success', 'Mokėjimo statusas atnaujintas');
      const response = await api.get(`/invoices/purchase/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      onInvoiceUpdate(updatedInvoice);
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant mokėjimo statusą');
    }
  };

  const handlePaymentDateChange = async (newDate: string) => {
    try {
      await api.patch(`/invoices/purchase/${localInvoice.id}/`, {
        payment_date: newDate || null,
        ...(newDate && localInvoice.payment_status !== 'paid' ? { payment_status: 'paid' } : {})
      });
      showToast('success', 'Apmokėjimo data atnaujinta');
      const response = await api.get(`/invoices/purchase/${localInvoice.id}/`);
      const updatedInvoice = response.data;
      setLocalInvoice(updatedInvoice);
      onInvoiceUpdate(updatedInvoice);
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida atnaujinant mokėjimo datą');
    }
  };

  // Helper funkcija, kuri grąžina susijusius užsakymus
  const getRelatedOrders = () => {
    if (localInvoice.related_orders && localInvoice.related_orders.length > 0) {
      return localInvoice.related_orders;
    }
    if (localInvoice.related_order) {
      return [{
        id: localInvoice.related_order.id,
        order_number: localInvoice.related_order.order_number || `#${localInvoice.related_order.id}`,
        amount: undefined
      }];
    }
    return [];
  };

  const relatedOrders = getRelatedOrders();

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
      
      return date.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
    } catch (e) {
      return dateStr; // Jei klaida, grąžinti originalią
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ 
        maxWidth: '800px', 
        maxHeight: '90vh',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="modal-header" style={{ padding: '4px 6px', marginBottom: '4px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '14px', margin: 0 }}>Sąskaita #{localInvoice.received_invoice_number}</h2>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '18px', padding: '0 4px' }}>×</button>
        </div>
        <div className="invoice-details" style={{ 
          padding: '0 4px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px'
        }}>
          {/* Kairysis stulpelis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Pagrindinė informacija</h3>
              <div className="details-grid" style={{ gridTemplateColumns: '1fr', gap: '3px', fontSize: '11px' }}>
                <div><strong>Tiekėjo sąskaitos numeris:</strong> {localInvoice.received_invoice_number}</div>
                {localInvoice.invoice_number && (
                  <div><strong>Sistemos sąskaitos numeris:</strong> {localInvoice.invoice_number}</div>
                )}
                <div>
                  <strong>Mokėjimo statusas:</strong>
                  <select
                    value={localInvoice.payment_status}
                    onChange={(e) => handlePaymentStatusChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginLeft: '6px',
                      padding: '3px 6px',
                      borderRadius: '3px',
                      border: '1px solid #dee2e6',
                      fontSize: '12px',
                      cursor: 'pointer',
                      backgroundColor: localInvoice.payment_status === 'paid' ? '#d4edda' : 
                        localInvoice.payment_status === 'overdue' ? '#f8d7da' : 
                        localInvoice.payment_status === 'partially_paid' ? '#fff3cd' : '#fff',
                      color: localInvoice.payment_status === 'paid' ? '#155724' : 
                        localInvoice.payment_status === 'overdue' ? '#721c24' : 
                        localInvoice.payment_status === 'partially_paid' ? '#856404' : '#333'
                    }}
                  >
                    <option value="unpaid">Neapmokėta</option>
                    <option value="paid">Apmokėta</option>
                    <option value="overdue">Vėluoja</option>
                    <option value="partially_paid">Dalinis apmokėjimas</option>
                  </select>
                </div>
                <div><strong>Tiekėjas:</strong> {localInvoice.partner.name}</div>
                {localInvoice.expense_category && (
                  <div><strong>Išlaidų kategorija:</strong> {localInvoice.expense_category.name}</div>
                )}
              </div>
            </div>

            <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Finansinė informacija</h3>
              <div className="details-grid" style={{ gridTemplateColumns: '1fr', gap: '3px', fontSize: '11px' }}>
                {(() => {
                  const amountNet = parseFloat(localInvoice.amount_net || '0');
                  const vatRate = parseFloat(localInvoice.vat_rate || '0');
                  const vatAmount = amountNet * vatRate / 100;
                  const amountTotal = amountNet + vatAmount;
                  return (
                    <>
                      <div><strong>Suma be PVM:</strong> {amountNet.toFixed(2)} €</div>
                      <div><strong>PVM ({vatRate}%):</strong> {vatAmount.toFixed(2)} €</div>
                      <div><strong>Suma su PVM:</strong> {amountTotal.toFixed(2)} €</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {(localInvoice.invoice_file_url || localInvoice.invoice_file) && (
              <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Sąskaitos failas</h3>
                <div>
                  <a 
                    href={localInvoice.invoice_file_url || `${process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://192.168.9.11:8000'}/${localInvoice.invoice_file}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                  >
                    📄 Peržiūrėti PDF
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Dešinysis stulpelis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Susiję užsakymai */}
            {relatedOrders.length > 0 && (
              <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Susiję užsakymai ({relatedOrders.length})</h3>
                <div style={{ fontSize: '11px', maxHeight: '180px', overflowY: 'auto' }}>
                  {relatedOrders.map((order, index) => (
                    <div key={order.id} style={{ 
                      padding: '3px 4px', 
                      marginBottom: '2px', 
                      backgroundColor: '#fff', 
                      borderRadius: '3px',
                      border: '1px solid #dee2e6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <strong>{order.order_number || `Užsakymas #${order.id}`}</strong>
                        {order.order_date && (
                          <span style={{ marginLeft: '4px', color: '#666', fontSize: '10px' }}>
                            ({order.order_date.split('T')[0]})
                          </span>
                        )}
                      </div>
                      {order.amount && parseFloat(order.amount) > 0 && (
                        <div style={{ fontWeight: 'bold', color: '#28a745', fontSize: '10px' }}>
                          {parseFloat(order.amount).toFixed(2)} €
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
              <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Datų informacija</h3>
              <div className="details-grid" style={{ gridTemplateColumns: '1fr', gap: '3px', fontSize: '11px' }}>
                <div><strong>Tiekėjo sąskaitos išrašymo data:</strong> {localInvoice.issue_date}</div>
                {localInvoice.received_date && (
                  <div><strong>Gavimo data:</strong> {localInvoice.received_date}</div>
                )}
                <div><strong>Mokėjimo terminas:</strong> {formatDate(localInvoice.due_date)}</div>
                <div>
                  <strong>Apmokėjimo data:</strong>
                  <input
                    type="date"
                    value={localInvoice.payment_date || ''}
                    onChange={(e) => handlePaymentDateChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginLeft: '6px',
                      padding: '3px 6px',
                      borderRadius: '3px',
                      border: '1px solid #dee2e6',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  />
                </div>
                {localInvoice.overdue_days && localInvoice.overdue_days > 0 && (
                  <div><strong>Vėlavimo dienos:</strong> <span className="overdue-badge" style={{ fontSize: '11px', padding: '2px 6px' }}>{localInvoice.overdue_days} dienos</span></div>
                )}
              </div>
            </div>

            {localInvoice.notes && localInvoice.notes.trim() && (
              <div className="details-section" style={{ padding: '4px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                <h3 style={{ fontSize: '12px', marginBottom: '4px', fontWeight: 'bold' }}>Pastabos</h3>
                <p style={{ fontSize: '10px', margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>{localInvoice.notes}</p>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ 
          padding: '4px 6px', 
          marginTop: '4px', 
          borderTop: '1px solid #dee2e6',
          flexShrink: 0
        }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onEdit(localInvoice);
            }}
            style={{ fontSize: '10px', padding: '2px 8px' }}
          >
            Redaguoti
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onClose();
              onDelete(localInvoice);
            }}
            style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', fontSize: '10px', padding: '2px 8px' }}
          >
            Trinti
          </button>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '10px', padding: '2px 8px' }}>
            Užverti
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseInvoiceDetailsModal;

