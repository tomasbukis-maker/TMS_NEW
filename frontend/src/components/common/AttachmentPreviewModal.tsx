import React from 'react';
import { api } from '../../services/api';
import './AttachmentPreviewModal.css';

interface Partner {
  id: number;
  name: string;
  code: string;
}

interface ExpenseCategory {
  id: number;
  name: string;
}

export interface AttachmentPreview {
  filename: string;
  url: string;
  id?: number; // MailAttachment ID, jei yra
}

interface AttachmentPreviewModalProps {
  attachment: AttachmentPreview | null;
  onClose: () => void;
  mailMessageId?: number; // Pridėta, kad galėtume priskirti laišką prie užsakymo/ekspedicijos
  onAssignSuccess?: (updatedMessage?: any) => void;
  // Nauji props sąskaitų kūrimui
  relatedOrderNumber?: string; // Užsakymo numeris iš konteksto
  relatedExpeditionNumber?: string; // Ekspedicijos numeris iš konteksto
  onInvoiceCreated?: () => void; // Callback po sąskaitos sukūrimo
  // Props gautoms sąskaitoms (purchase invoices)
  hideAssignButton?: boolean; // Paslėpti "Priskirti prie užsakymo" mygtuką
  hideCreateInvoiceButton?: boolean; // Paslėpti "Pridėti sąskaitą" mygtuką
  purchaseInvoiceId?: number; // Purchase invoice ID siuntimui paštu
  onSendEmail?: () => void | Promise<void>; // Callback siuntimui paštu
}

const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  onClose,
  mailMessageId,
  onAssignSuccess,
  relatedOrderNumber,
  relatedExpeditionNumber,
  onInvoiceCreated,
  hideAssignButton = false,
  hideCreateInvoiceButton = false,
  purchaseInvoiceId,
  onSendEmail
}) => {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [manualOrderNumber, setManualOrderNumber] = React.useState('');
  const [manualExpeditionNumber, setManualExpeditionNumber] = React.useState('');
  const [assigning, setAssigning] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  // Nauji state'ai moderniam priskyrimui su dropdown
  const [showAssignModal, setShowAssignModal] = React.useState(false);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [orderSearch, setOrderSearch] = React.useState('');
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);

  // Sąskaitos formos state
  const [showInvoiceForm, setShowInvoiceForm] = React.useState(false);
  const [invoiceFormData, setInvoiceFormData] = React.useState({
    received_invoice_number: '',
    partner_id: '',
    partner_search: '', // Naujas laukas paieškai
    related_orders: [] as string[],
    expense_category_id: '',
    amount_net: '',
    vat_rate: '21.00',
    issue_date: '',
    received_date: new Date().toISOString().split('T')[0], // Šiandien
    due_date: '',
  });
  const [invoiceFormLoading, setInvoiceFormLoading] = React.useState(false);
  const [invoiceFormError, setInvoiceFormError] = React.useState<string | null>(null);

  // Sąskaitos numerio validation
  const [invoiceNumberValidating, setInvoiceNumberValidating] = React.useState(false);
  const [invoiceNumberError, setInvoiceNumberError] = React.useState<string | null>(null);
  const [invoiceNumberValid, setInvoiceNumberValid] = React.useState<boolean | null>(null);

  // Tiekėjai ir kategorijos
  const [suppliers, setSuppliers] = React.useState<Partner[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = React.useState<Partner[]>([]);
  const [expenseCategories, setExpenseCategories] = React.useState<ExpenseCategory[]>([]);
  const [suppliersLoading, setSuppliersLoading] = React.useState(false);
  const [categoriesLoading, setCategoriesLoading] = React.useState(false);

  React.useEffect(() => {
    let revokedObjectUrl: string | null = null;
    let revokedDownloadUrl: string | null = null;
    let aborted = false;

    const load = async () => {
      if (!attachment) {
        setObjectUrl(null);
        setDownloadUrl(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      setObjectUrl(null);
      setDownloadUrl(null);
      try {
        const isAbsoluteUrl = attachment.url.startsWith('http');
        let requestPath = attachment.url;
        if (!isAbsoluteUrl) {
          requestPath = attachment.url.startsWith('/api/')
            ? attachment.url.replace(/^\/api/, '')
            : attachment.url;
        }

        const axiosResponse = await api.get(requestPath, {
          baseURL: isAbsoluteUrl ? '' : undefined,
          responseType: 'blob',
          withCredentials: true,
        });
        const blobData = axiosResponse.data as Blob;
        const arrayBuffer = await blobData.arrayBuffer();

        const extension = attachment.filename.split('.').pop()?.toLowerCase() || '';
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'heic', 'heif', 'avif'].includes(extension);
        const isPdf = extension === 'pdf';
        const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(extension);

        const mimeType =
          (isPdf && 'application/pdf') ||
          (isImage && `image/${extension === 'jpg' ? 'jpeg' : extension}`) ||
          (isVideo && `video/${extension}`) ||
          blobData.type ||
          'application/octet-stream';
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const downloadBlob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        if (aborted) {
          return;
        }
        revokedObjectUrl = URL.createObjectURL(blob);
        revokedDownloadUrl = URL.createObjectURL(downloadBlob);
        setObjectUrl(revokedObjectUrl);
        setDownloadUrl(revokedDownloadUrl);
      } catch (err: any) {
        if (!aborted) {
          setError(err?.message || 'Nepavyko įkelti priedo peržiūrai.');
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      aborted = true;
      if (revokedObjectUrl) {
        URL.revokeObjectURL(revokedObjectUrl);
      }
      if (revokedDownloadUrl) {
        URL.revokeObjectURL(revokedDownloadUrl);
      }
    };
  }, [attachment]);

  // Užkrauti tiekėjus ir kategorijas kai atsidaro forma
  React.useEffect(() => {
    if (showInvoiceForm) {
      const loadFormData = async () => {
        // Užkrauti tiekėjus
        setSuppliersLoading(true);
        try {
          const suppliersResponse = await api.get('/partners/partners/', {
            params: { is_supplier: true, page_size: 1000 } // Daugiau tiekėjų
          });
          const suppliersList = suppliersResponse.data?.results || [];
          setSuppliers(suppliersList);
          setFilteredSuppliers(suppliersList); // Pradžioje rodyti visus
        } catch (error) {
        } finally {
          setSuppliersLoading(false);
        }

        // Užkrauti išlaidų kategorijas
        setCategoriesLoading(true);
        try {
          const categoriesResponse = await api.get('/invoices/expense-categories/');
          setExpenseCategories(categoriesResponse.data?.results || categoriesResponse.data || []);
        } catch (error) {
        } finally {
          setCategoriesLoading(false);
        }
      };

      loadFormData();
    }
  }, [showInvoiceForm]);

  // Filtruoti tiekėjus pagal paiešką
  React.useEffect(() => {
    if (invoiceFormData.partner_search.trim() === '') {
      setFilteredSuppliers(suppliers);
    } else {
      const searchTerm = invoiceFormData.partner_search.toLowerCase();
      const filtered = suppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(searchTerm) ||
        (supplier.code && supplier.code.toLowerCase().includes(searchTerm))
      );
      setFilteredSuppliers(filtered);
    }
  }, [invoiceFormData.partner_search, suppliers]);

  // Sąskaitos numerio patikrinimo funkcija
  const checkInvoiceNumber = React.useCallback(async () => {
    const number = invoiceFormData.received_invoice_number.trim();
    if (!number) {
      setInvoiceNumberError(null);
      setInvoiceNumberValid(null);
      return;
    }

    setInvoiceNumberValidating(true);
    setInvoiceNumberError(null);
    setInvoiceNumberValid(null);

    try {
      const response = await api.get('/invoices/purchase/', {
        params: { received_invoice_number: number }
      });

      if (response.data.count > 0) {
        setInvoiceNumberError('Tokia sąskaita jau įvesta į sistemą');
        setInvoiceNumberValid(false);
      } else {
        setInvoiceNumberError(null);
        setInvoiceNumberValid(true);
      }
    } catch (error) {
      setInvoiceNumberError('Nepavyko patikrinti sąskaitos numerio');
      setInvoiceNumberValid(null);
    } finally {
      setInvoiceNumberValidating(false);
    }
  }, []);

  const handleManualAssign = React.useCallback(async () => {
    if (!mailMessageId || assigning) return;
    
    const orderNum = manualOrderNumber.trim();
    const expNum = manualExpeditionNumber.trim();
    
    if (!orderNum && !expNum) {
      setAssignError('Įveskite užsakymo numerį arba ekspedicijos numerį');
      return;
    }
    
    setAssigning(true);
    setAssignError(null);
    try {
      const response = await api.post(`/mail/messages/${mailMessageId}/assign/`, {
        order_number: orderNum || undefined,
        expedition_number: expNum || undefined,
      });
      setManualOrderNumber('');
      setManualExpeditionNumber('');
      setAssignError(null);
      onAssignSuccess?.(response.data);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Nepavyko priskirti laiško';
      setAssignError(errMsg);
    } finally {
      setAssigning(false);
    }
  }, [mailMessageId, manualOrderNumber, manualExpeditionNumber, assigning, onAssignSuccess]);

  // Nauja funkcija užsakymų paieškai
  const searchOrders = React.useCallback(async (query: string) => {
    if (!query.trim()) {
      setOrders([]);
      return;
    }
    setOrdersLoading(true);
    try {
      const response = await api.get('/orders/orders/', {
        params: { search: query, page_size: 20 }
      });
      setOrders(response.data.results || []);
    } catch (err) {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // Nauja funkcija moderniam priskyrimui su order_id
  const handleModernAssign = React.useCallback(async () => {
    if (!mailMessageId || !selectedOrderId || assigning) return;

    setAssigning(true);
    setAssignError(null);
    try {
      const response = await api.post(`/mail/messages/${mailMessageId}/assign/`, {
        order_id: selectedOrderId,
      });
      setSelectedOrderId(null);
      setOrderSearch('');
      setOrders([]);
      setShowAssignModal(false);
      setAssignError(null);
      onAssignSuccess?.(response.data);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Nepavyko priskirti laiško';
      setAssignError(errMsg);
    } finally {
      setAssigning(false);
    }
  }, [mailMessageId, selectedOrderId, assigning, onAssignSuccess]);

  // Debounced užsakymų paieška
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (orderSearch.trim()) {
        searchOrders(orderSearch);
      } else {
        setOrders([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [orderSearch, searchOrders]);

  const handleCreateInvoice = React.useCallback(async () => {
    if (invoiceFormLoading) return;

    // Validacija
    if (!invoiceFormData.received_invoice_number.trim()) {
      setInvoiceFormError('Sąskaitos numeris yra privalomas');
      return;
    }

    // Patikrinti ar nėra sąskaitos numerio klaidos
    if (invoiceNumberError) {
      setInvoiceFormError('Ištaisykite sąskaitos numerio klaidą prieš išsaugant');
      return;
    }
    if (!invoiceFormData.partner_id) {
      setInvoiceFormError('Tiekėjas yra privalomas');
      return;
    }
    if (!invoiceFormData.expense_category_id) {
      setInvoiceFormError('Išlaidų kategorija yra privaloma');
      return;
    }
    if (!invoiceFormData.amount_net || parseFloat(invoiceFormData.amount_net) <= 0) {
      setInvoiceFormError('Suma be PVM turi būti didesnė už 0');
      return;
    }
    if (!invoiceFormData.issue_date) {
      setInvoiceFormError('Išrašymo data yra privaloma');
      return;
    }
    if (!invoiceFormData.due_date) {
      setInvoiceFormError('Mokėjimo terminas yra privalomas');
      return;
    }

    setInvoiceFormLoading(true);
    setInvoiceFormError(null);

    try {
      // Paruošti duomenis
      // Sukurti sąskaitą
      const formData = new FormData();

      // Pridėti pagrindinius laukus
      formData.append('received_invoice_number', invoiceFormData.received_invoice_number.trim());
      formData.append('partner_id', invoiceFormData.partner_id);
      if (invoiceFormData.expense_category_id) {
        formData.append('expense_category_id', invoiceFormData.expense_category_id);
      }
      formData.append('amount_net', invoiceFormData.amount_net);
      formData.append('vat_rate', invoiceFormData.vat_rate);
      formData.append('issue_date', invoiceFormData.issue_date);
      if (invoiceFormData.received_date) {
        formData.append('received_date', invoiceFormData.received_date);
      }
      formData.append('due_date', invoiceFormData.due_date);
      
      // Pridėti source_attachment_id, jei yra (kad nustatytų ryšį su priedu)
      if (attachment?.id) {
        formData.append('source_attachment_id', attachment.id.toString());
      }

      // Pridėti užsakymus jei yra
      if (relatedOrderNumber) {
      // Bandome rasti užsakymą pagal numerį
      try {
        const ordersResponse = await api.get('/orders/orders/', {
          params: { search: relatedOrderNumber, page_size: 10 }
        });
        const orders = ordersResponse.data?.results || [];
        if (orders.length > 0) {
          const selectedOrder = orders[0];
          // PurchaseInvoice naudoja related_order_ids (ManyToMany) arba related_order_id (ForeignKey)
          // Siųsti kaip masyvą, kad serializer galėtų apdoroti
          formData.append('related_order_ids', selectedOrder.id.toString());
          // Taip pat nustatyti related_order_id (ForeignKey) suderinamumui
          formData.append('related_order_id', selectedOrder.id.toString());

          // Gauti užsakymo sumą ir nusiųsti į backend
          const orderAmount = selectedOrder.price_with_vat || selectedOrder.price_net || 0;
          const relatedOrdersAmounts = [{
            order_id: selectedOrder.id,
            amount: orderAmount.toString()
          }];
          formData.append('related_orders_amounts', JSON.stringify(relatedOrdersAmounts));
        } else {
          // Pabandykime ieškoti pagal search
          const directOrdersResponse = await api.get('/orders/orders/', {
            params: { search: relatedOrderNumber, page_size: 5 }
          });
          const directOrders = directOrdersResponse.data?.results || [];
          if (directOrders.length > 0) {
            const selectedOrder = directOrders[0];
            // PurchaseInvoice naudoja related_order_ids (ManyToMany) arba related_order_id (ForeignKey)
            // Siųsti kaip masyvą, kad serializer galėtų apdoroti
            formData.append('related_order_ids', selectedOrder.id.toString());
            // Taip pat nustatyti related_order_id (ForeignKey) suderinamumui
            formData.append('related_order_id', selectedOrder.id.toString());

            // Gauti užsakymo sumą ir nusiųsti į backend
            const orderAmount = selectedOrder.price_with_vat || selectedOrder.price_net || 0;
            const relatedOrdersAmounts = [{
              order_id: selectedOrder.id,
              amount: orderAmount.toString()
            }];
            formData.append('related_orders_amounts', JSON.stringify(relatedOrdersAmounts));
          }
        }
      } catch (error) {
      }
      } else if (invoiceFormData.related_orders && invoiceFormData.related_orders.length > 0) {
        // Tvarkyti rankiniu būdu įvestus užsakymus

        const orderIds: string[] = [];
        const relatedOrdersAmounts: Array<{order_id: number, amount: string}> = [];

        for (const orderStr of invoiceFormData.related_orders) {
          if (orderStr.trim()) {
            try {
              // Bandom rasti užsakymą pagal numerį
              const ordersResponse = await api.get('/orders/orders/', {
                params: { search: orderStr.trim(), page_size: 5 }
              });
              const orders = ordersResponse.data?.results || [];

              if (orders.length > 0) {
                const selectedOrder = orders[0];
                orderIds.push(selectedOrder.id.toString());

          // Gauti užsakymo sumą
          const orderAmount = selectedOrder.price_with_vat || selectedOrder.price_net || 0;
                relatedOrdersAmounts.push({
                  order_id: selectedOrder.id,
                  amount: orderAmount.toString()
                });

              }
            } catch (error) {
            }
          }
        }

        if (orderIds.length > 0) {
          formData.append('related_order_ids', orderIds.join(','));
          formData.append('related_orders_amounts', JSON.stringify(relatedOrdersAmounts));
        }
      } else {
      }

      await api.post('/invoices/purchase/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Išvalyti formą ir uždaryti
      setInvoiceFormData({
        received_invoice_number: '',
        partner_id: '',
        partner_search: '',
        related_orders: [],
        expense_category_id: '',
        amount_net: '',
        vat_rate: '21.00',
        issue_date: '',
        received_date: new Date().toISOString().split('T')[0],
        due_date: '',
      });
      setShowInvoiceForm(false);
      setInvoiceFormError(null);

      // Callback - leidžia tėviniam komponentui rodyti pranešimus kaip nori
      onInvoiceCreated?.();

    } catch (error: any) {
      const errorMessage = error.response?.data?.detail ||
                          error.response?.data?.error ||
                          error.response?.data?.received_invoice_number?.[0] ||
                          error.message ||
                          'Nepavyko sukurti sąskaitos';
      setInvoiceFormError(errorMessage);
    } finally {
      setInvoiceFormLoading(false);
    }
  }, [invoiceFormData, invoiceFormLoading, relatedOrderNumber, onInvoiceCreated]);

  if (!attachment) {
    return null;
  }
  const extension = attachment.filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'heic', 'heif', 'avif'].includes(extension);
  const isPdf = extension === 'pdf';
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(extension);

  return (
    <div className="attachment-preview-overlay" onClick={onClose}>
      {/* Assign to Order Modal */}
      {showAssignModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setShowAssignModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>📌 Priskirti laišką prie užsakymo</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Ieškoti užsakymo:
              </label>
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Įveskite užsakymo numerį arba kliento pavadinimą..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px', maxHeight: '200px', overflow: 'auto' }}>
              {ordersLoading && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  🔍 Ieškoma...
                </div>
              )}
              {!ordersLoading && orders.length === 0 && orderSearch.trim() && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  📭 Užsakymų nerasta
                </div>
              )}
              {!ordersLoading && orders.map(order => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  style={{
                    padding: '8px 12px',
                    border: selectedOrderId === order.id ? '2px solid #007bff' : '1px solid #e9ecef',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    backgroundColor: selectedOrderId === order.id ? '#e7f3ff' : 'white'
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{order.order_number}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {order.client?.name || 'Klientas nenurodytas'}
                  </div>
                </div>
              ))}
            </div>

            {assignError && (
              <div style={{
                color: '#dc3545',
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px',
                padding: '8px 12px',
                marginBottom: '16px',
                fontSize: '14px'
              }}>
                ⚠️ {assignError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedOrderId(null);
                  setOrderSearch('');
                  setOrders([]);
                  setAssignError(null);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={handleModernAssign}
                disabled={!selectedOrderId || assigning}
                style={{
                  padding: '8px 16px',
                  backgroundColor: selectedOrderId && !assigning ? '#007bff' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedOrderId && !assigning ? 'pointer' : 'not-allowed',
                  opacity: selectedOrderId && !assigning ? 1 : 0.6
                }}
              >
                {assigning ? 'Priskiriama...' : '📌 Priskirti'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="attachment-preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="attachment-preview-header">
          <h3>{attachment.filename}</h3>
          <div className="attachment-preview-actions">
            {!hideAssignButton && (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="attachment-preview-assign-order"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginRight: '8px'
                }}
              >
                📌 Priskirti prie užsakymo
              </button>
            )}
            {!hideCreateInvoiceButton && (
              <button
                type="button"
                onClick={() => setShowInvoiceForm(true)}
                className="attachment-preview-create-invoice"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginRight: '8px'
                }}
              >
                ➕ Pridėti sąskaitą
              </button>
            )}
            {onSendEmail && (
              <button
                type="button"
                onClick={onSendEmail}
                className="attachment-preview-send-email"
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  marginRight: '8px'
                }}
              >
                ✉️ Siuntimo paštu
              </button>
            )}
            <a
              href={
                downloadUrl ||
                (attachment.url.startsWith('http')
                  ? attachment.url
                  : `${(process.env.REACT_APP_API_URL || '/api').replace(/\/$/, '')}${
                      attachment.url.startsWith('/') ? attachment.url : `/${attachment.url}`
                    }`)
              }
              download={attachment.filename}
              className="attachment-preview-download"
            >
              Atsisiųsti
            </a>
            <button type="button" onClick={onClose} className="attachment-preview-close">
              ×
            </button>
          </div>
        </header>
        
        {/* Sąskaitos kūrimo forma */}
        {showInvoiceForm && (
          <div style={{
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            marginBottom: '0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>➕ Pridėti gautą sąskaitą</h4>
              <button
                type="button"
                onClick={() => setShowInvoiceForm(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '16px',
                  cursor: 'pointer',
                  color: '#6c757d'
                }}
              >
                ×
              </button>
            </div>

            {invoiceFormError && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                marginBottom: '12px',
                fontSize: '12px'
              }}>
                {invoiceFormError}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '8px',
              fontSize: '12px'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Sąskaitos numeris *
                </label>
                <input
                  type="text"
                  value={invoiceFormData.received_invoice_number}
                  onChange={(e) => {
                    setInvoiceFormData(prev => ({ ...prev, received_invoice_number: e.target.value }));
                    // Išvalyti validation state kai vartotojas pradeda vesti
                    if (invoiceNumberError) {
                      setInvoiceNumberError(null);
                      setInvoiceNumberValid(null);
                    }
                  }}
                  onBlur={checkInvoiceNumber}
                  className={
                    invoiceNumberError ? 'error' :
                    invoiceNumberValid ? 'success' :
                    invoiceNumberValidating ? 'validating' : ''
                  }
                  placeholder="pvz., INV-2025-001"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />

                {/* Sąskaitos numerio validation žinutės */}
                {invoiceNumberValidating && (
                  <div style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#856404',
                    fontStyle: 'italic'
                  }}>
                    🔍 Tikrinama ar sąskaita jau egzistuoja...
                  </div>
                )}

                {invoiceNumberError && (
                  <div style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#721c24',
                    fontWeight: '500'
                  }}>
                    ❌ {invoiceNumberError}
                  </div>
                )}

                {invoiceNumberValid === true && (
                  <div style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#155724',
                    fontWeight: '500'
                  }}>
                    ✅ Sąskaitos numeris galioja
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Užsakymo numeris
                </label>
                <input
                  type="text"
                  value={relatedOrderNumber || invoiceFormData.related_orders.join(', ')}
                  onChange={(e) => setInvoiceFormData(prev => ({
                    ...prev,
                    related_orders: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : []
                  }))}
                  placeholder="pvz., 2025-190"
                  disabled={!!relatedOrderNumber}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px',
                    backgroundColor: relatedOrderNumber ? '#e9ecef' : 'white'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Suma be PVM (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={invoiceFormData.amount_net}
                  onChange={(e) => setInvoiceFormData(prev => ({ ...prev, amount_net: e.target.value }))}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  PVM tarifas (%) *
                </label>
                <select
                  value={invoiceFormData.vat_rate}
                  onChange={(e) => setInvoiceFormData(prev => ({ ...prev, vat_rate: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                >
                  <option value="21.00">21% (standartinis)</option>
                  <option value="9.00">9% (mažesnis)</option>
                  <option value="5.00">5% (mažesnis)</option>
                  <option value="0.00">0% (neapmokestinamas)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Išrašymo data *
                </label>
                <input
                  type="date"
                  value={invoiceFormData.issue_date}
                  onChange={(e) => setInvoiceFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Mokėti iki *
                </label>
                <input
                  type="date"
                  value={invoiceFormData.due_date}
                  onChange={(e) => setInvoiceFormData(prev => ({ ...prev, due_date: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Tiekėjas *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={invoiceFormData.partner_search}
                    onChange={(e) => {
                      const searchValue = e.target.value;
                      setInvoiceFormData(prev => ({
                        ...prev,
                        partner_search: searchValue,
                        partner_id: '' // Išvalyti pasirinkimą kai ieškoma
                      }));
                    }}
                    placeholder={suppliersLoading ? 'Kraunama...' : 'Ieškoti tiekėjo...'}
                    disabled={suppliersLoading}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #ced4da',
                      borderRadius: '3px',
                      fontSize: '12px',
                      marginBottom: '2px'
                    }}
                  />
                  <select
                    value={invoiceFormData.partner_id}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const selectedSupplier = suppliers.find(s => s.id.toString() === selectedId);
                      setInvoiceFormData(prev => ({
                        ...prev,
                        partner_id: selectedId,
                        partner_search: selectedSupplier ? selectedSupplier.name : prev.partner_search
                      }));
                    }}
                    disabled={suppliersLoading}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #ced4da',
                      borderRadius: '3px',
                      fontSize: '12px',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}
                    size={Math.min(filteredSuppliers.length + 1, 5)} // Rodyti iki 5 elementų
                  >
                    <option value="">
                      {suppliersLoading ? 'Kraunama...' : filteredSuppliers.length === 0 ? 'Nerasta tiekėjų' : 'Pasirinkite tiekėją iš sąrašo...'}
                    </option>
                    {filteredSuppliers.slice(0, 50).map(supplier => ( // Riboti iki 50 rezultatų
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} {supplier.code && `(${supplier.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                {invoiceFormData.partner_id && (
                  <div style={{ fontSize: '11px', color: '#28a745', marginTop: '2px' }}>
                    ✓ Pasirinkta: {suppliers.find(s => s.id.toString() === invoiceFormData.partner_id)?.name}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '2px', fontWeight: '500' }}>
                  Išlaidų kategorija *
                </label>
                <select
                  value={invoiceFormData.expense_category_id}
                  onChange={(e) => setInvoiceFormData(prev => ({ ...prev, expense_category_id: e.target.value }))}
                  disabled={categoriesLoading}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                >
                  <option value="">
                    {categoriesLoading ? 'Kraunama...' : 'Pasirinkite kategoriją...'}
                  </option>
                  {expenseCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowInvoiceForm(false)}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={invoiceFormLoading || !invoiceFormData.received_invoice_number || !invoiceFormData.partner_id || !invoiceFormData.amount_net || !invoiceFormData.issue_date || !invoiceFormData.due_date}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: invoiceFormLoading || !invoiceFormData.received_invoice_number || !invoiceFormData.partner_id || !invoiceFormData.amount_net || !invoiceFormData.issue_date || !invoiceFormData.due_date ? 'not-allowed' : 'pointer',
                  opacity: invoiceFormLoading || !invoiceFormData.received_invoice_number || !invoiceFormData.partner_id || !invoiceFormData.amount_net || !invoiceFormData.issue_date || !invoiceFormData.due_date ? 0.6 : 1
                }}
              >
                {invoiceFormLoading ? 'Kuriama...' : 'Sukurti sąskaitą'}
              </button>
            </div>
          </div>
        )}

        {/* Rankinis priskyrimas prie užsakymo arba ekspedicijos */}
        {mailMessageId && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            marginBottom: '0'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                Rankinis priskyrimas:
              </span>
              <span style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>
                Jei sistema nerado numerio, galite priskirti rankiniu būdu
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: '1', minWidth: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: '500', whiteSpace: 'nowrap', marginRight: '2px' }}>
                  Užsakymo nr:
                </label>
                <input
                  type="text"
                  value={manualOrderNumber}
                  onChange={(e) => setManualOrderNumber(e.target.value)}
                  placeholder="pvz., 2025-001"
                  style={{
                    flex: '0 0 120px',
                    padding: '3px 6px',
                    fontSize: '10px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: '1', minWidth: 0 }}>
                <label style={{ fontSize: '10px', fontWeight: '500', whiteSpace: 'nowrap', marginRight: '2px' }}>
                  Ekspedicijos nr:
                </label>
                <input
                  type="text"
                  value={manualExpeditionNumber}
                  onChange={(e) => setManualExpeditionNumber(e.target.value)}
                  placeholder="pvz., EXP-2025-001"
                  style={{
                    flex: '0 0 120px',
                    padding: '3px 6px',
                    fontSize: '10px',
                    border: '1px solid #ced4da',
                    borderRadius: '3px'
                  }}
                />
              </div>
              <button
                onClick={handleManualAssign}
                disabled={assigning || (!manualOrderNumber.trim() && !manualExpeditionNumber.trim())}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  whiteSpace: 'nowrap',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: assigning || (!manualOrderNumber.trim() && !manualExpeditionNumber.trim()) ? 'not-allowed' : 'pointer',
                  opacity: assigning || (!manualOrderNumber.trim() && !manualExpeditionNumber.trim()) ? 0.6 : 1,
                  flexShrink: 0
                }}
              >
                {assigning ? 'Priskiriama...' : 'Priskirti'}
              </button>
            </div>
            {assignError && (
              <div style={{ marginTop: '4px', fontSize: '10px', color: '#dc3545' }}>
                {assignError}
              </div>
            )}
          </div>
        )}
        <div className="attachment-preview-body">
          {loading && <div className="attachment-preview-loading">Įkeliama…</div>}
          {error && (
            <div className="attachment-preview-error">
              {error}
              <a href={attachment.url} target="_blank" rel="noreferrer">
                Atidaryti naujame lange
              </a>
            </div>
          )}
          {!loading && !error && objectUrl && (
            <>
              {isImage ? (
                <div className="preview-content preview-content--image-wrapper">
                  <img
                    src={objectUrl}
                    alt={attachment.filename}
                    className="preview-content preview-content--image"
                  />
                </div>
              ) : isPdf ? (
                <object
                  data={objectUrl}
                  type="application/pdf"
                  className="preview-content preview-content--pdf"
                >
                  <p>
                    PDF nepavyko parodyti.{' '}
                    <a href={objectUrl} download>
                      Parsisiųsti
                    </a>
                  </p>
                </object>
              ) : isVideo ? (
                <video className="preview-content preview-content--video" controls>
                  <source src={objectUrl} />
                  Jūsų naršyklė nepalaiko vaizdo grotuvų.
                </video>
              ) : (
                <object
                  data={objectUrl}
                  className="preview-content preview-content--default"
                >
                  <p>
                    Priedo peržiūra nepalaikoma.{' '}
                    <a href={objectUrl} download>
                      Parsisiųsti
                    </a>
                  </p>
                </object>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttachmentPreviewModal;

