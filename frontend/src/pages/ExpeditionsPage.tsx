import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { SkeletonTable } from '../components/common/SkeletonLoader';
import ExpeditionDetailsModal from '../components/expeditions/ExpeditionDetailsModal';
import AttachmentPreviewModal, { AttachmentPreview } from '../components/common/AttachmentPreviewModal';
import CarrierModal from '../components/orders/CarrierModal';
import { Expedition } from '../types/expedition';
import { useUISettings } from '../hooks/useUISettings';
import './ExpeditionsPage.css';

interface MailAttachment {
  id: number;
  filename: string;
  file: string | null;
  download_url?: string | null;
  content_type: string | null;
  size: number;
  created_at?: string;
}

interface MailMessage {
  id: number;
  subject: string | null;
  sender_display?: string;
  sender?: string;
  date: string;
  body_plain?: string;
  body_html?: string;
  snippet?: string;
  attachments?: MailAttachment[];
  matches?: {
    expeditions?: string[];
    orders?: string[];
    sales_invoices?: string[];
    purchase_invoices?: string[];
  } | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const MAIL_MATCH_ICON = '📨';

const formatDateTime = (value?: string | null, withTime = true): string => {
  if (!value) {
    return '-';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return withTime
      ? date.toLocaleString('lt-LT', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' })
      : date.toLocaleDateString('lt-LT');
  } catch (error) {
    return value;
  }
};

const formatCurrency = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(numeric)) {
    return '—';
  }
  return `${numeric.toFixed(2)} €`;
};

const ExpeditionsPage: React.FC = () => {
  const { t } = useTranslation();

  const STATUS_OPTIONS: Array<{ value: 'all' | Expedition['status']; label: string }> = useMemo(() => [
    { value: 'all', label: t('expeditions.filters.all_statuses') },
    { value: 'new', label: t('orders.status.new') },
    { value: 'in_progress', label: t('orders.status.in_progress') },
    { value: 'completed', label: t('orders.status.completed') },
    { value: 'cancelled', label: t('orders.status.cancelled') },
  ], [t]);

  const CARRIER_TYPE_OPTIONS: Array<{ value: 'all' | Expedition['carrier_type']; label: string }> = useMemo(() => [
    { value: 'all', label: t('expeditions.filters.all_types') },
    { value: 'carrier', label: t('expeditions.types.carrier') },
    { value: 'warehouse', label: t('expeditions.types.warehouse') },
  ], [t]);

  const { getExpeditionColor } = useUISettings();
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<'all' | Expedition['status']>('all');
  const [carrierTypeFilter, setCarrierTypeFilter] = useState<'all' | Expedition['carrier_type']>('all');
  const [mailMatchedExpeditions, setMailMatchedExpeditions] = useState<Set<string>>(() => new Set());
  const [mailModalOpen, setMailModalOpen] = useState<boolean>(false);
  const [mailModalLoading, setMailModalLoading] = useState<boolean>(false);
  const [mailModalError, setMailModalError] = useState<string | null>(null);
  const [mailModalMessages, setMailModalMessages] = useState<MailMessage[]>([]);
  const [mailModalExpeditionNumber, setMailModalExpeditionNumber] = useState<string>('');
  const [selectedExpedition, setSelectedExpedition] = useState<Expedition | null>(null);
  const [expeditionModalOpen, setExpeditionModalOpen] = useState<boolean>(false);
  const [expeditionMailCache, setExpeditionMailCache] = useState<Record<string, MailMessage[]>>({});
  const [showCarrierModal, setShowCarrierModal] = useState<boolean>(false);
  const [editingExpedition, setEditingExpedition] = useState<Expedition | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    expedition: Expedition | null;
    warnings: string[];
    hasPurchaseInvoices: boolean;
  }>({
    open: false,
    expedition: null,
    warnings: [],
    hasPurchaseInvoices: false,
  });
  const [documentAddLoading, setDocumentAddLoading] = useState<boolean>(false);
  const [documentAddError, setDocumentAddError] = useState<string | null>(null);
  const [documentDeleteLoadingIds, setDocumentDeleteLoadingIds] = useState<number[]>([]);
  const [documentDeleteError, setDocumentDeleteError] = useState<string | null>(null);
  const [paymentDateLoading, setPaymentDateLoading] = useState<boolean>(false);
  const [paymentDateError, setPaymentDateError] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState<boolean>(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  const startIndex = useMemo(() => {
    if (totalCount === 0) {
      return 0;
    }
    return (currentPage - 1) * pageSize + 1;
  }, [currentPage, pageSize, totalCount]);

  const endIndex = useMemo(() => {
    if (totalCount === 0) {
      return 0;
    }
    return Math.min(totalCount, currentPage * pageSize);
  }, [currentPage, pageSize, totalCount]);

  const fetchExpeditions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        page_size: pageSize,
        ordering: '-expedition_number',
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      if (carrierTypeFilter !== 'all') {
        params.carrier_type = carrierTypeFilter;
      }

      const response = await api.get('/orders/carriers/', { params });

      let records: Expedition[] = [];
      let count = 0;

      if (Array.isArray(response.data)) {
        records = response.data;
        count = records.length;
      } else if (response.data?.results && Array.isArray(response.data.results)) {
        records = response.data.results;
        count = typeof response.data.count === 'number' ? response.data.count : records.length;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        records = response.data.data;
        count = typeof response.data.total === 'number' ? response.data.total : records.length;
      }

      setExpeditions(records);
      setTotalCount(count);
    } catch (err: any) {
      console.error('Nepavyko gauti ekspedicijų sąrašo:', err);
      setError(err?.response?.data?.detail || err.message || 'Nepavyko užkrauti ekspedicijų duomenų.');
    } finally {
      setLoading(false);
    }
  }, [carrierTypeFilter, currentPage, pageSize, statusFilter]);

  useEffect(() => {
    fetchExpeditions();
  }, [fetchExpeditions]);

  useEffect(() => {
    let isActive = true;

    const fetchMailMatchSummary = async () => {
      try {
        const response = await api.get('/mail/messages/match-summary/');
        const expeditionNumbers: string[] = Array.isArray(response.data?.expedition_numbers)
          ? response.data.expedition_numbers
          : [];
        if (isActive) {
          setMailMatchedExpeditions(new Set(expeditionNumbers.map((value) => String(value).trim().toUpperCase())));
        }
      } catch (summaryError) {
        console.warn('Nepavyko gauti pašto sutapimų santraukos:', summaryError);
        if (isActive) {
          setMailMatchedExpeditions(new Set());
        }
      }
    };

    fetchMailMatchSummary();

    return () => {
      isActive = false;
    };
  }, []);

  // Helper funkcija, kuri nustato, ar teksto spalva turėtų būti tamsi ar šviesi
  const getContrastTextColor = (backgroundColor: string): string => {
    // Pašalinti # ir konvertuoti į RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Apskaičiuoti ryškumą (luminance)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Jei ryškumas > 0.5, naudoti tamsų tekstą, kitu atveju - šviesų
    return luminance > 0.5 ? '#000' : '#fff';
  };

  const renderStatusBadge = (expedition: Expedition) => {
    // Jei status rankiniu pakeistas (skiriasi nuo calculated_status), naudoti status
    // Kitu atveju naudoti calculated_status (automatiškai apskaičiuotas pagal datas)
    const isManuallyChanged = expedition.calculated_status && expedition.status !== expedition.calculated_status;
    const statusToUse = isManuallyChanged ? expedition.status : (expedition.calculated_status || expedition.status);
    const statusDisplayToUse = isManuallyChanged ? expedition.status_display : (expedition.calculated_status_display || expedition.status_display);
    
    const statusMap: Record<'new' | 'in_progress' | 'completed' | 'cancelled', 'new' | 'in_progress' | 'completed' | 'cancelled'> = {
      new: 'new',
      in_progress: 'in_progress',
      completed: 'completed',
      cancelled: 'cancelled',
    };

    const statusKey = statusMap[statusToUse] || 'new';
    const backgroundColor = getExpeditionColor(statusKey);
    const textColor = getContrastTextColor(backgroundColor);
    
    return (
      <span 
        className="status-badge" 
        style={{ 
          backgroundColor, 
          color: textColor,
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 600,
          position: 'relative'
        }}
        title={isManuallyChanged ? `Statusas pakeistas rankiniu būdu. Automatinis: ${expedition.calculated_status_display}` : `Statusas: ${statusDisplayToUse} (automatiškai pagal datas)`}
      >
        {statusDisplayToUse}
        {isManuallyChanged && (
          <span style={{ 
            marginLeft: '4px', 
            fontSize: '10px', 
            opacity: 0.8 
          }} title="Statusas pakeistas rankiniu būdu">
            ✏️
          </span>
        )}
      </span>
    );
  };

  const getPaymentBadgeClass = (expedition: Expedition) => {
    const status = expedition.payment_status_info?.status || expedition.payment_status;
    switch (status) {
      case 'paid':
        return 'payment-badge-success';
      case 'overdue':
        return 'payment-badge-warning';
      case 'partially_paid':
        return 'payment-badge-info';
      default:
        return 'payment-badge-danger';
    }
  };

  const fetchMailMessagesForExpedition = useCallback(
    async (expeditionNumber: string): Promise<MailMessage[]> => {
      const normalized = expeditionNumber.trim().toUpperCase();
      if (!normalized) {
        return [];
      }

      if (expeditionMailCache[normalized]) {
        return expeditionMailCache[normalized];
      }

      const response = await api.get('/mail/messages/by-expedition/', {
        params: { number: normalized },
      });
      const messages: MailMessage[] = Array.isArray(response.data?.messages)
        ? response.data.messages
        : [];
      setExpeditionMailCache((prev) => ({ ...prev, [normalized]: messages }));
      return messages;
    },
    [expeditionMailCache]
  );

  const handleOpenMailModal = async (expeditionNumber: string) => {
    const normalized = expeditionNumber.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setMailModalExpeditionNumber(normalized);
    setMailModalOpen(true);
    setMailModalLoading(true);
    setMailModalError(null);
    setMailModalMessages([]);

    try {
      const messages = await fetchMailMessagesForExpedition(normalized);
      setMailModalMessages(messages);
    } catch (err: any) {
      console.error('Nepavyko gauti laiškų ekspedicijai:', err);
      setMailModalError(err?.response?.data?.detail || err.message || 'Nepavyko gauti su ekspedicija susijusių laiškų.');
    } finally {
      setMailModalLoading(false);
    }
  };

  const handleCloseMailModal = () => {
    setMailModalOpen(false);
    setMailModalMessages([]);
    setMailModalError(null);
  };

  const handleOpenExpeditionModal = async (expedition: Expedition) => {
    setSelectedExpedition(expedition);
    setExpeditionModalOpen(true);
    setPaymentDateError(null);
    setNotesError(null);
    setDocumentDeleteError(null);
    setDocumentDeleteLoadingIds([]);

    if (expedition.expedition_number) {
      try {
        await fetchMailMessagesForExpedition(expedition.expedition_number);
      } catch (err) {
        console.warn('Nepavyko gauti laiškų ekspedicijai detalėms:', err);
      }
    }
  };

  const handleCloseExpeditionModal = () => {
    setExpeditionModalOpen(false);
    setSelectedExpedition(null);
    setDocumentAddError(null);
    setPaymentDateError(null);
    setPaymentDateLoading(false);
    setNotesError(null);
    setNotesLoading(false);
    setAttachmentPreview(null);
    setDocumentDeleteError(null);
    setDocumentDeleteLoadingIds([]);
  };

  const handleAddDocument = async (
    expedition: Expedition,
    payload: {
      document_type: 'invoice' | 'cmr' | 'other';
      amount?: string;
      issue_date?: string;
      received_date?: string;
      invoice_number?: string;
      cmr_number?: string;
    }
  ) => {
    if (!expedition) {
      return;
    }

    setDocumentAddLoading(true);
    setDocumentAddError(null);
    setDocumentDeleteError(null);

    try {
      const response = await api.post('/orders/carrier-documents/', {
        order_carrier: expedition.id,
        document_type: payload.document_type,
        amount: payload.amount,
        issue_date: payload.issue_date || null,
        received_date: payload.received_date || null,
        invoice_number: payload.invoice_number ?? null,
        cmr_number: payload.cmr_number ?? null,
      });
      const newDocument = response.data as Expedition['documents'] extends Array<infer T>
        ? T
        : {
            id: number;
            order_carrier: number;
            document_type: 'invoice' | 'cmr' | 'other';
            document_type_display?: string;
            amount?: string;
            invoice_number?: string | null;
            cmr_number?: string | null;
            issue_date?: string | null;
            received_date?: string | null;
            created_at?: string;
            updated_at?: string;
          };
      if (!newDocument.id) {
        newDocument.id = Date.now();
      }
      newDocument.order_carrier = expedition.id;

      setExpeditions((prev) =>
        prev.map((item) =>
          item.id === expedition.id
            ? {
                ...item,
                documents: [
                  {
                    ...newDocument,
                    invoice_number: payload.invoice_number ?? null,
                    cmr_number: payload.cmr_number ?? null,
                  },
                  ...((item.documents as Expedition['documents']) || []),
                ],
                payment_status_info: item.payment_status_info
                  ? {
                      ...item.payment_status_info,
                      has_invoices: true,
                    }
                  : item.payment_status_info,
              }
            : item
        )
      );

      setSelectedExpedition((prev) =>
        prev && prev.id === expedition.id
          ? {
              ...prev,
              documents: [
                {
                  ...newDocument,
                  invoice_number: payload.invoice_number ?? null,
                  cmr_number: payload.cmr_number ?? null,
                },
                ...((prev.documents as Expedition['documents']) || []),
              ],
              payment_status_info: prev.payment_status_info
                ? {
                    ...prev.payment_status_info,
                    has_invoices: true,
                  }
                : prev.payment_status_info,
            }
          : prev
      );
    } catch (err: any) {
      console.error('Nepavyko pridėti dokumento:', err);
      setDocumentAddError(err?.response?.data?.detail || err.message || 'Nepavyko pridėti dokumento.');
    } finally {
      setDocumentAddLoading(false);
    }
  };

  const handleDeleteDocument = async (expedition: Expedition, documentId: number) => {
    if (!expedition || !documentId) {
      return;
    }

    setDocumentDeleteError(null);
    setDocumentDeleteLoadingIds((prev) =>
      prev.includes(documentId) ? prev : [...prev, documentId]
    );

    try {
      await api.delete(`/orders/carrier-documents/${documentId}/`);

      const updateExpeditionDocuments = (item: Expedition): Expedition => {
        const updatedDocuments = (item.documents || []).filter((doc) => doc.id !== documentId);
        const hasInvoices = updatedDocuments.some((doc) => doc.document_type === 'invoice');
        return {
          ...item,
          documents: updatedDocuments,
          payment_status_info: item.payment_status_info
            ? {
                ...item.payment_status_info,
                has_invoices: hasInvoices,
              }
            : item.payment_status_info,
        };
      };

      setExpeditions((prev) =>
        prev.map((item) => (item.id === expedition.id ? updateExpeditionDocuments(item) : item))
      );

      setSelectedExpedition((prev) => {
        if (!prev || prev.id !== expedition.id) {
          return prev;
        }
        return updateExpeditionDocuments(prev);
      });
    } catch (err: any) {
      console.error('Nepavyko ištrinti dokumento:', err);
      setDocumentDeleteError(err?.response?.data?.detail || err.message || 'Nepavyko ištrinti dokumento.');
    } finally {
      setDocumentDeleteLoadingIds((prev) => prev.filter((id) => id !== documentId));
    }
  };

  const handleUpdatePaymentDate = async (expeditionId: number, paymentDate: string | null) => {
    setPaymentDateLoading(true);
    setPaymentDateError(null);

    try {
      const nextStatus: Expedition['payment_status'] = paymentDate ? 'paid' : 'not_paid';

      await api.patch(`/orders/carriers/${expeditionId}/`, {
        payment_date: paymentDate,
        payment_status: nextStatus,
      });

      const formattedDate = paymentDate ? formatDateTime(paymentDate, false) : null;
      const nextStatusDisplay = nextStatus === 'paid' ? 'Apmokėtas' : 'Neapmokėtas';
      const nextMessage =
        nextStatus === 'paid'
          ? `Apmokėtas${formattedDate ? ` (${formattedDate})` : ''}`
          : 'Neapmokėtas';

      setExpeditions((prev) =>
        prev.map((item) =>
          item.id === expeditionId
            ? {
                ...item,
                payment_date: paymentDate,
                payment_status: nextStatus,
                payment_status_display: nextStatusDisplay,
                payment_status_info: item.payment_status_info
                  ? {
                      ...item.payment_status_info,
                      status: nextStatus,
                      message: nextMessage,
                      payment_date: paymentDate || undefined,
                    }
                  : {
                      status: nextStatus,
                      message: nextMessage,
                      payment_date: paymentDate || undefined,
                    },
              }
            : item
        )
      );

      setSelectedExpedition((prev) => {
        if (!prev || prev.id !== expeditionId) {
          return prev;
        }
        return {
          ...prev,
          payment_date: paymentDate,
          payment_status: nextStatus,
          payment_status_display: nextStatusDisplay,
          payment_status_info: prev.payment_status_info
            ? {
                ...prev.payment_status_info,
                status: nextStatus,
                message: nextMessage,
                payment_date: paymentDate || undefined,
              }
            : {
                status: nextStatus,
                message: nextMessage,
                payment_date: paymentDate || undefined,
              },
        };
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        'Nepavyko išsaugoti apmokėjimo datos.';
      setPaymentDateError(message);
      throw new Error(message);
    } finally {
      setPaymentDateLoading(false);
    }
  };

  const handleUpdateNotes = useCallback(
    async (expeditionId: number, notes: string) => {
      setNotesLoading(true);
      setNotesError(null);
      try {
        await api.patch(`/orders/carriers/${expeditionId}/`, { notes });

        setExpeditions((prev) =>
          prev.map((item) =>
            item.id === expeditionId
              ? {
                  ...item,
                  notes,
                }
              : item
          )
        );

        setSelectedExpedition((prev) => {
          if (!prev || prev.id !== expeditionId) {
            return prev;
          }
          return {
            ...prev,
            notes,
          };
        });
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message ||
          'Nepavyko išsaugoti pastabos.';
        setNotesError(message);
        throw new Error(message);
      } finally {
        setNotesLoading(false);
      }
    },
    []
  );

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    // Paprastas toast pranešimas
    if (type === 'success') {
      alert(message);
    } else if (type === 'error') {
      alert(message);
    } else {
      alert(message);
    }
  }, []);

  const handleOpenEditModal = useCallback((expedition: Expedition) => {
    setEditingExpedition(expedition);
    setShowCarrierModal(true);
  }, []);

  const handleSaveExpedition = useCallback(
    async (carrier: any) => {
      try {
        if (editingExpedition) {
          // Redaguojama esama ekspedicija
          // Standalone ekspedicijai užsakymas neprivalomas
          const orderId = carrier.order_id || (editingExpedition.order 
            ? (typeof editingExpedition.order === 'object' && editingExpedition.order !== null 
                ? editingExpedition.order.id 
                : editingExpedition.order)
            : null);
          
          const updateData: any = {
            partner_id: carrier.partner_id || carrier.partner?.id,
            expedition_number: carrier.expedition_number || null,
            route_from: carrier.route_from || '',
            route_to: carrier.route_to || '',
            loading_date: carrier.loading_date || null,
            unloading_date: carrier.unloading_date || null,
            price_net: carrier.price_net ? parseFloat(String(carrier.price_net)) : null,
            vat_rate: carrier.vat_rate !== null && carrier.vat_rate !== undefined && carrier.vat_rate !== '' ? String(carrier.vat_rate) : null,
            vat_rate_article: carrier.vat_rate_article && carrier.vat_rate_article.trim() !== '' ? carrier.vat_rate_article.trim() : '',
            status: carrier.status || 'new',
            payment_status: carrier.payment_status || 'not_paid',
            invoice_issued: carrier.invoice_issued || false,
            invoice_received_date: carrier.invoice_received_date || null,
            payment_days: carrier.payment_days || null,
            due_date: carrier.due_date || null,
            payment_date: carrier.payment_date || null,
            payment_terms: carrier.payment_terms || '',
            notes: carrier.notes || '',
          };
          
          // Pridėti order_id tik jei jis yra (standalone ekspedicijai užsakymas neprivalomas)
          if (orderId) {
            updateData.order_id = orderId;
          }

          const response = await api.patch(`/orders/carriers/${editingExpedition.id}/`, updateData);
          const updatedExpedition = response.data;

          setExpeditions((prev) =>
            prev.map((item) =>
              item.id === editingExpedition.id
                ? {
                    ...item,
                    ...updatedExpedition,
                    partner: updatedExpedition.partner || item.partner,
                    order: updatedExpedition.order || item.order,
                    price_with_vat: updatedExpedition.price_with_vat !== undefined ? updatedExpedition.price_with_vat : item.price_with_vat,
                    vat_amount: updatedExpedition.vat_amount !== undefined ? updatedExpedition.vat_amount : item.vat_amount,
                  }
                : item
            )
          );

          setSelectedExpedition((prev) => {
            if (!prev || prev.id !== editingExpedition.id) {
              return prev;
            }
            return {
              ...prev,
              ...updatedExpedition,
              partner: updatedExpedition.partner || prev.partner,
              order: updatedExpedition.order || prev.order,
              price_with_vat: updatedExpedition.price_with_vat !== undefined ? updatedExpedition.price_with_vat : prev.price_with_vat,
              vat_amount: updatedExpedition.vat_amount !== undefined ? updatedExpedition.vat_amount : prev.vat_amount,
            };
          });
        } else {
          // Sukuriama nauja ekspedicija
          // Naudoti pasirinktą užsakymą iš carrier.order_id
          const orderId = carrier.order_id || (typeof carrier.order === 'number' ? carrier.order : (typeof carrier.order === 'object' && carrier.order !== null ? carrier.order.id : null));
          
          if (!orderId) {
            throw new Error('Pasirinkite užsakymą');
          }
          
          // Sukurti naują ekspediciją
          const createData: any = {
            order: orderId,
            partner_id: carrier.partner_id || carrier.partner?.id,
            carrier_type: carrier.carrier_type || 'carrier',
            expedition_number: carrier.expedition_number || null,
            route_from: carrier.route_from || '',
            route_to: carrier.route_to || '',
            loading_date: carrier.loading_date || null,
            unloading_date: carrier.unloading_date || null,
            price_net: carrier.price_net ? parseFloat(String(carrier.price_net)) : null,
            vat_rate: carrier.vat_rate !== null && carrier.vat_rate !== undefined && carrier.vat_rate !== '' ? String(carrier.vat_rate) : null,
            vat_rate_article: carrier.vat_rate_article && carrier.vat_rate_article.trim() !== '' ? carrier.vat_rate_article.trim() : '',
            status: carrier.status || 'new',
            payment_status: carrier.payment_status || 'not_paid',
            invoice_issued: carrier.invoice_issued || false,
            invoice_received_date: carrier.invoice_received_date || null,
            payment_days: carrier.payment_days || null,
            due_date: carrier.due_date || null,
            payment_date: carrier.payment_date || null,
            payment_terms: carrier.payment_terms || '',
            notes: carrier.notes || '',
          };

          const response = await api.post('/orders/carriers/', createData);
          const newExpedition = response.data;

          // Atnaujinti ekspedicijų sąrašą
          setExpeditions((prev) => [newExpedition, ...prev]);
          setTotalCount((prev) => prev + 1);
          
          // Atnaujinti puslapį
          await fetchExpeditions();
        }

        setShowCarrierModal(false);
        setEditingExpedition(null);
        showToast('success', editingExpedition ? 'Ekspedicija sėkmingai atnaujinta' : 'Ekspedicija sėkmingai sukurta');
      } catch (err: any) {
        console.error('Nepavyko išsaugoti ekspedicijos:', err);
        console.error('Error response:', err?.response?.data);
        console.error('Error status:', err?.response?.status);
        
        let message = 'Nepavyko išsaugoti ekspedicijos.';
        if (err?.response?.data) {
          const errorData = err.response.data;
          if (errorData.detail) {
            message = errorData.detail;
          } else if (errorData.error) {
            message = errorData.error;
          } else if (typeof errorData === 'object') {
            const firstError = Object.values(errorData)[0];
            if (Array.isArray(firstError)) {
              message = firstError[0];
            } else if (typeof firstError === 'string') {
              message = firstError;
            } else {
              message = JSON.stringify(errorData);
            }
          }
        } else if (err?.message) {
          message = err.message;
        }
        showToast('error', message);
      }
    },
    [editingExpedition, fetchExpeditions, showToast]
  );

  const handleDeleteExpedition = useCallback(
    async (expeditionId: number) => {
      const expedition = expeditions.find((e) => e.id === expeditionId);
      if (!expedition) {
        return;
      }

      // Patikrinti, ar ekspedicija turi susijusių duomenų
      const warnings: string[] = [];
      
      // Patikrinti, ar yra susijusio užsakymo
      const orderId = typeof expedition.order === 'object' && expedition.order !== null 
        ? expedition.order.id 
        : typeof expedition.order === 'number' 
          ? expedition.order 
          : null;
      if (orderId) {
        warnings.push('• Turi susijusį užsakymą');
      }
      
      // Patikrinti dokumentus
      const documents = expedition.documents || [];
      const invoiceDocs = documents.filter((d) => d.document_type === 'invoice' && d.invoice_number);
      const cmrDocs = documents.filter((d) => d.document_type === 'cmr');
      const otherDocs = documents.filter((d) => d.document_type === 'other');
      
      // Patikrinti, ar yra pirkimo sąskaitų, sukurtų iš šios ekspedicijos dokumentų
      let purchaseInvoicesCount = 0;
      const invoiceNumbers = invoiceDocs.map((d) => d.invoice_number).filter(Boolean);
      
      if (invoiceNumbers.length > 0) {
        try {
          // Patikrinti kiekvieną numerį atskirai
          for (const invoiceNumber of invoiceNumbers) {
            try {
              const response = await api.get('/invoices/purchase/', {
                params: {
                  search: invoiceNumber,
                  page_size: 100
                }
              });
              const results = response.data.results || response.data || [];
              const matching = results.filter((inv: any) => inv.received_invoice_number === invoiceNumber);
              if (matching.length > 0) {
                purchaseInvoicesCount += matching.length;
              }
            } catch (err) {
              // Ignoruoti klaidas
            }
          }
        } catch (err) {
          // Ignoruoti klaidas, jei endpoint'as nepasiekiamas
        }
      }
      
      // Jei yra pirkimo sąskaitų, sukurtų iš dokumentų, rodyti tik apie pirkimo sąskaitas
      if (purchaseInvoicesCount > 0) {
        warnings.push(`• Turi ${purchaseInvoicesCount} susijusią(-ias) pirkimo sąskaitą(-as), sukurtą(-as) iš ekspedicijos dokumentų`);
      }
      
      if (cmrDocs.length > 0) {
        warnings.push(`• Turi ${cmrDocs.length} CMR dokumentą(-us)`);
      }
      if (otherDocs.length > 0) {
        warnings.push(`• Turi ${otherDocs.length} kitą(-us) dokumentą(-us)`);
      }

      // Patikrinti, ar yra pirkimo sąskaitų, kurias reikia pasiūlyti ištrinti
      const hasPurchaseInvoices = purchaseInvoicesCount > 0;
      
      // Atidaryti custom modal
      setDeleteConfirmModal({
        open: true,
        expedition,
        warnings,
        hasPurchaseInvoices,
      });
    },
    [expeditions]
  );

  const confirmDeleteExpedition = useCallback(
    async (deletePurchaseInvoices: boolean) => {
      const expedition = deleteConfirmModal.expedition;
      if (!expedition) {
        return;
      }

      try {
        const url = `/orders/carriers/${expedition.id}/`;
        const config = deletePurchaseInvoices 
          ? { params: { delete_related_purchase_invoices: 'true' } }
          : {};
        await api.delete(url, config);
        
        // Pašalinti iš sąrašo
        setExpeditions((prev) => prev.filter((item) => item.id !== expedition.id));
        
        // Uždaryti modalą, jei trinama ekspedicija yra atidaryta
        if (selectedExpedition?.id === expedition.id) {
          setSelectedExpedition(null);
          setExpeditionModalOpen(false);
        }
        
        // Atnaujinti totalCount
        setTotalCount((prev) => Math.max(0, prev - 1));
        
        // Uždaryti delete confirm modal
        setDeleteConfirmModal({ open: false, expedition: null, warnings: [], hasPurchaseInvoices: false });
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message ||
          'Nepavyko ištrinti ekspedicijos.';
        alert(message);
      }
    },
    [deleteConfirmModal, selectedExpedition]
  );

  return (
    <div className="expeditions-page">
      <div className="expeditions-header">
        <div>
          <h1>🚚 Ekspedicijos</h1>
          <p>Stebėkite ekspedicijų eigą, dokumentų ir mokėjimų būsenas.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="expeditions-meta">
            {loading ? 'Kraunama…' : (
              totalCount > 0 ? `Rodoma ${startIndex}-${endIndex} iš ${totalCount}` : 'Nėra duomenų'
            )}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setEditingExpedition(null);
              setShowCarrierModal(true);
            }}
            style={{ whiteSpace: 'nowrap' }}
          >
            ➕ Nauja
          </button>
        </div>
      </div>

      <div className="expeditions-filters">
        <div className="expeditions-filter">
          <label htmlFor="statusFilter">Ekspedicijos statusas</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as typeof statusFilter);
              setCurrentPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="expeditions-filter">
          <label htmlFor="carrierTypeFilter">Tipas</label>
          <select
            id="carrierTypeFilter"
            value={carrierTypeFilter}
            onChange={(event) => {
              setCarrierTypeFilter(event.target.value as typeof carrierTypeFilter);
              setCurrentPage(1);
            }}
          >
            {CARRIER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="expeditions-filter">
          <label htmlFor="pageSize">Įrašų puslapyje</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setCurrentPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="expeditions-table-wrapper">
        {error && (
          <div className="expeditions-error">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={10} columns={9} />
        ) : (
          <table className="expeditions-table">
            <thead>
              <tr>
                <th>{t('expeditions.table.number')}</th>
                <th>{t('expeditions.table.created')}</th>
                <th>{t('expeditions.table.partner')}</th>
                <th>{t('expeditions.table.route')}</th>
                <th>{t('expeditions.table.loading_unloading')}</th>
                <th>{t('expeditions.table.status')}</th>
                <th>{t('expeditions.table.payment_status')}</th>
                <th>{t('expeditions.table.documents')}</th>
              </tr>
            </thead>
            <tbody>
              {expeditions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="expeditions-empty">{t('expeditions.table.no_expeditions')}</td>
                </tr>
              ) : (
                expeditions.map((expedition) => (
                  <tr
                    key={expedition.id}
                    className={
                      expedition.expedition_number && mailMatchedExpeditions.has(expedition.expedition_number.trim().toUpperCase())
                        ? 'mail-match'
                        : undefined
                    }
                    onClick={() => handleOpenExpeditionModal(expedition)}
                  >
                    <td>
                      <div className="expedition-number">
                        {expedition.expedition_number ? expedition.expedition_number : <span className="muted">Bus sugeneruota</span>}
                        <div className="expedition-type">{expedition.carrier_type_display}</div>
                        {expedition.order && typeof expedition.order === 'object' && expedition.order.order_number && (
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                            Užs. {expedition.order.order_number}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{formatDateTime(expedition.created_at)}</td>
                    <td>
                      <div className="expedition-partner">
                        <span className="partner-name">{expedition.partner?.name || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="expedition-route">
                        <div style={{ marginBottom: '2px' }}>
                          {expedition.sender_name ? (
                            <span style={{ fontSize: '11px', color: '#007bff', fontWeight: '500' }}>
                              👤 {expedition.sender_name}
                              {expedition.route_from_country && expedition.route_from_city && ` • ${expedition.route_from_country}, ${expedition.route_from_city}`}
                            </span>
                          ) : (
                            expedition.route_from_country && expedition.route_from_city && (
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                                📍 Iš: {expedition.route_from_country}, {expedition.route_from_city}
                              </span>
                            )
                          )}
                        </div>
                        {(!expedition.sender_name || !expedition.receiver_name) && (
                          <>
                            {!expedition.sender_name && expedition.route_from && (
                              <div style={{ marginBottom: '2px' }}>
                                <span style={{ fontSize: '11px', color: '#007bff', fontWeight: '500' }}>
                                  📍 Iš: {expedition.route_from}
                                </span>
                              </div>
                            )}
                            {!expedition.receiver_name && expedition.route_to && (
                              <div style={{ marginTop: '2px' }}>
                                <span style={{ fontSize: '11px', color: '#28a745', fontWeight: '500' }}>
                                  📍 Į: {expedition.route_to}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ marginTop: '2px' }}>
                          {expedition.receiver_name ? (
                            <span style={{ fontSize: '11px', color: '#28a745', fontWeight: '500' }}>
                              📦 {expedition.receiver_name}
                              {expedition.route_to_country && expedition.route_to_city && ` • ${expedition.route_to_country}, ${expedition.route_to_city}`}
                            </span>
                          ) : (
                            expedition.route_to_country && expedition.route_to_city && (
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                                📍 Į: {expedition.route_to_country}, {expedition.route_to_city}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="expedition-dates">
                        <div style={{ marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#007bff', fontWeight: '500' }}>
                            📅 {expedition.loading_date_from && expedition.loading_date_to ?
                              `${formatDateTime(expedition.loading_date_from)} - ${formatDateTime(expedition.loading_date_to)}` :
                              formatDateTime(expedition.loading_date)}
                          </span>
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#28a745', fontWeight: '500' }}>
                            🚚 {expedition.unloading_date_from && expedition.unloading_date_to ?
                              `${formatDateTime(expedition.unloading_date_from)} - ${formatDateTime(expedition.unloading_date_to)}` :
                              formatDateTime(expedition.unloading_date)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{renderStatusBadge(expedition)}</td>
                    <td>
                      <span className={`payment-badge ${getPaymentBadgeClass(expedition)}`}>
                        {formatCurrency(expedition.price_net)}
                        {(() => {
                          const status = expedition.payment_status_info?.status || expedition.payment_status;
                          if (status === 'paid' && (expedition.payment_status_info?.payment_date || expedition.payment_date)) {
                            return (
                              <>
                                {' ('}
                                {formatDateTime(
                                  expedition.payment_status_info?.payment_date || expedition.payment_date,
                                  false
                                )}
                                {')'}
                              </>
                            );
                          }
                          if (status === 'overdue') {
                            const overdueDays = expedition.payment_status_info?.overdue_days;
                            if (overdueDays && overdueDays > 0) {
                              return (
                                <>
                                  {' ('}
                                  {overdueDays} d.
                                  {')'}
                                </>
                              );
                            }
                          }
                          return null;
                        })()}
                      </span>
                    </td>
                    <td>
                      <div className="expedition-docs">
                        {expedition.expedition_number && mailMatchedExpeditions.has(expedition.expedition_number.trim().toUpperCase()) && (
                          <button
                            type="button"
                            className="expedition-mail-indicator"
                            title="Yra gautų laiškų su šiuo ekspedicijos numeriu"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (expedition.expedition_number) {
                                handleOpenMailModal(expedition.expedition_number);
                              }
                            }}
                          >
                            {MAIL_MATCH_ICON}
                          </button>
                        )}
                        {(expedition.documents || []).some((doc) => doc.document_type === 'invoice') ? (
                          <span className="invoice-indicator invoice-indicator-success">Sąskaita gauta</span>
                        ) : (
                          <span className="invoice-indicator invoice-indicator-muted">Sąskaitos nėra</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="expeditions-pagination">
        <div className="pagination-summary">
          {loading ? 'Kraunama…' : (
            totalCount > 0 ? `Rodoma ${startIndex}-${endIndex} iš ${totalCount}` : 'Nėra įrašų'
          )}
        </div>
        {totalPages > 1 && (() => {
          // Helper funkcija puslapių numeriams su "..."
          // Formatas: 1 ... 3 4 5 ... 7
          const getPageNumbers = (current: number, total: number): (number | string)[] => {
            if (total <= 5) {
              return Array.from({ length: total }, (_, i) => i + 1);
            }
            
            const pages: (number | string)[] = [];
            pages.push(1);
            
            if (current <= 3) {
              for (let i = 2; i <= 4; i++) {
                pages.push(i);
              }
              if (total > 5) {
                pages.push('...');
                pages.push(total);
              }
            } else if (current >= total - 2) {
              if (total > 5) {
                pages.push('...');
              }
              for (let i = total - 3; i <= total; i++) {
                pages.push(i);
              }
            } else {
              pages.push('...');
              for (let i = current - 1; i <= current + 1; i++) {
                pages.push(i);
              }
              pages.push('...');
              pages.push(total);
            }
            
            return pages;
          };
          
          const pageNumbers = getPageNumbers(currentPage, totalPages);
          
          return (
            <div className="pagination-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={currentPage === 1 || loading}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  cursor: (currentPage === 1 || loading) ? 'not-allowed' : 'pointer',
                  opacity: (currentPage === 1 || loading) ? 0.5 : 1
                }}
              >
                ← Atgal
              </button>
              
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                {pageNumbers.map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} style={{ padding: '0 4px', fontSize: '14px', color: '#666' }}>
                        ...
                      </span>
                    );
                  }
                  
                  const pageNum = page as number;
                  const isActive = pageNum === currentPage;
                  
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      disabled={loading}
                      onClick={() => setCurrentPage(pageNum)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '14px',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        backgroundColor: isActive ? '#007bff' : '#fff',
                        color: isActive ? '#fff' : '#333',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        minWidth: '40px',
                        fontWeight: isActive ? 'bold' : 'normal',
                        opacity: loading ? 0.5 : 1
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                type="button"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  cursor: (currentPage >= totalPages || loading) ? 'not-allowed' : 'pointer',
                  opacity: (currentPage >= totalPages || loading) ? 0.5 : 1
                }}
              >
                Pirmyn →
              </button>
            </div>
          );
        })()}
      </div>

      {mailModalOpen && (
        <div className="mail-modal-overlay" onClick={handleCloseMailModal}>
          <div className="mail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="mail-modal-header">
              <h2>📨 Laiškai ekspedicijai {mailModalExpeditionNumber}</h2>
              <button type="button" onClick={handleCloseMailModal} className="mail-modal-close">×</button>
            </div>
            <div className="mail-modal-body">
              {mailModalLoading && <div className="mail-modal-loading">Kraunama...</div>}
              {mailModalError && <div className="mail-modal-error">{mailModalError}</div>}
              {!mailModalLoading && !mailModalError && mailModalMessages.length === 0 && (
                <div className="mail-modal-empty">Laiškų nerasta.</div>
              )}
              {!mailModalLoading && !mailModalError && mailModalMessages.length > 0 && (
                <div className="mail-modal-message-list">
                  {mailModalMessages.map((message) => (
                    <div key={message.id} className="mail-modal-message">
                      <div className="mail-modal-message-header">
                        <div className="mail-modal-subject">{message.subject || '(be temos)'}</div>
                        <div className="mail-modal-meta">
                          <span>{message.sender_display || message.sender || 'Nežinomas siuntėjas'}</span>
                          <span>·</span>
                          <span>{formatDateTime(message.date)}</span>
                        </div>
                      </div>
                      {message.body_html ? (
                        <div
                          className="mail-modal-body-html"
                          dangerouslySetInnerHTML={{ __html: message.body_html }}
                        />
                      ) : (
                        <div className="mail-modal-snippet">
                          {message.body_plain || message.snippet || '…'}
                        </div>
                      )}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mail-modal-attachments">
                          <strong>Priedai:</strong>
                          <ul>
                            {message.attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <button
                                  type="button"
                                  className="mail-attachment-button"
                                  onClick={() => {
                                    const url = attachment.download_url || attachment.file || undefined;
                                    if (!url) {
                                      return;
                                    }
                                    setAttachmentPreview({
                                      filename: attachment.filename,
                                      url,
                                    });
                                  }}
                                  disabled={!attachment.file && !attachment.download_url}
                                >
                                  {attachment.filename}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ExpeditionDetailsModal
        expedition={selectedExpedition}
        isOpen={expeditionModalOpen}
        mailMessages={
          selectedExpedition?.expedition_number
            ? expeditionMailCache[selectedExpedition.expedition_number.trim().toUpperCase()] || []
            : []
        }
        onAddDocument={(payload) => selectedExpedition ? handleAddDocument(selectedExpedition, payload) : Promise.resolve()}
        addDocumentLoading={documentAddLoading}
        addDocumentError={documentAddError}
        documentDeleteError={documentDeleteError}
        deleteDocumentLoadingIds={documentDeleteLoadingIds}
        onDeleteDocument={
          selectedExpedition
            ? (documentId) => handleDeleteDocument(selectedExpedition, documentId)
            : undefined
        }
        onUpdatePaymentDate={handleUpdatePaymentDate}
        paymentDateLoading={paymentDateLoading}
        paymentDateError={paymentDateError}
        onUpdateNotes={handleUpdateNotes}
        notesLoading={notesLoading}
        notesError={notesError}
        onDelete={selectedExpedition ? () => handleDeleteExpedition(selectedExpedition.id) : undefined}
        onEdit={selectedExpedition ? () => handleOpenEditModal(selectedExpedition) : undefined}
        onClose={handleCloseExpeditionModal}
      />
      {showCarrierModal && (
        <CarrierModal
          carrier={editingExpedition ? {
            id: editingExpedition.id,
            partner: editingExpedition.partner as any,
            partner_id: editingExpedition.partner.id,
            carrier_type: editingExpedition.carrier_type,
            carrier_type_display: editingExpedition.carrier_type_display,
            expedition_number: editingExpedition.expedition_number,
            route_from: editingExpedition.route_from,
            route_to: editingExpedition.route_to,
            // Detali maršruto informacija
            route_from_country: editingExpedition.route_from_country || '',
            route_from_postal_code: editingExpedition.route_from_postal_code || '',
            route_from_city: editingExpedition.route_from_city || '',
            route_from_address: editingExpedition.route_from_address || '',
            sender_name: editingExpedition.sender_name || '',
            route_to_country: editingExpedition.route_to_country || '',
            route_to_postal_code: editingExpedition.route_to_postal_code || '',
            route_to_city: editingExpedition.route_to_city || '',
            route_to_address: editingExpedition.route_to_address || '',
            receiver_name: editingExpedition.receiver_name || '',
            loading_date: editingExpedition.loading_date,
            unloading_date: editingExpedition.unloading_date,
            loading_date_from: editingExpedition.loading_date_from || null,
            loading_date_to: editingExpedition.loading_date_to || null,
            unloading_date_from: editingExpedition.unloading_date_from || null,
            unloading_date_to: editingExpedition.unloading_date_to || null,
            price_net: editingExpedition.price_net,
            vat_rate: editingExpedition.vat_rate || null,
            vat_rate_article: editingExpedition.vat_rate_article || null,
            price_with_vat: editingExpedition.price_with_vat?.toString() || null,
            vat_amount: editingExpedition.vat_amount?.toString() || null,
            status: editingExpedition.status,
            status_display: editingExpedition.status_display,
            payment_status: editingExpedition.payment_status === 'overdue' ? 'not_paid' : editingExpedition.payment_status,
            payment_status_display: editingExpedition.payment_status_display,
            payment_date: editingExpedition.payment_date,
            invoice_issued: editingExpedition.invoice_issued,
            invoice_received: editingExpedition.invoice_received || false,
            invoice_received_date: editingExpedition.invoice_received_date,
            payment_days: editingExpedition.payment_days,
            due_date: editingExpedition.due_date,
            payment_terms: editingExpedition.payment_terms || '',
            notes: editingExpedition.notes,
            sequence_order: editingExpedition.sequence_order || 0,
          } : null}
          carrierType={editingExpedition?.carrier_type || 'carrier'}
          isOpen={showCarrierModal}
          onClose={() => {
            setShowCarrierModal(false);
            setEditingExpedition(null);
          }}
          onSave={handleSaveExpedition}
          showToast={showToast}
          isStandalone={true}
        />
      )}
      <AttachmentPreviewModal
        attachment={attachmentPreview}
        onClose={() => setAttachmentPreview(null)}
      />

      {/* Delete Confirmation Modal - turi būti virš ekspedicijos detalių modalo (z-index: 2100) */}
      {deleteConfirmModal.open && deleteConfirmModal.expedition && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ position: 'relative', zIndex: 3001 }}>
          <div className="card" style={{ width: 500 }}>
            <h3 style={{ marginTop: 0 }}>Patvirtinkite trinimą</h3>
            {deleteConfirmModal.warnings.length > 0 ? (
              <>
                <div style={{ margin: '10px 0 20px', fontSize: '14px', color: '#495057', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ color: '#dc3545', fontWeight: 'bold' }}>
                    ⚠️ DĖMESIO: Ši ekspedicija turi susijusių duomenų:
                  </div>
                  <ul style={{ margin: '6px 0 0 18px', padding: 0, listStyle: 'disc' }}>
                    {deleteConfirmModal.warnings.map((warning, index) => (
                      <li key={index} style={{ marginBottom: '6px' }}>{warning}</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '13px', color: '#6c757d', marginTop: '8px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                    <strong>Trinant ekspediciją, bus automatiškai ištrinti visi susiję dokumentai ir pirkimo sąskaitos (sukurtos iš ekspedicijos dokumentų).</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="button button-secondary"
                    onClick={() => setDeleteConfirmModal({ open: false, expedition: null, warnings: [], hasPurchaseInvoices: false })}
                  >
                    Atšaukti
                  </button>
                  <button
                    className="button"
                    style={{ backgroundColor: '#dc3545', color: 'white' }}
                    onClick={() => confirmDeleteExpedition(true)}
                  >
                    Ištrinti
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '10px 0 20px' }}>Ar tikrai norite ištrinti šią ekspediciją?</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="button button-secondary"
                    onClick={() => setDeleteConfirmModal({ open: false, expedition: null, warnings: [], hasPurchaseInvoices: false })}
                  >
                    Atšaukti
                  </button>
                  <button
                    className="button"
                    style={{ backgroundColor: '#dc3545', color: 'white' }}
                    onClick={() => confirmDeleteExpedition(false)}
                  >
                    Ištrinti
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpeditionsPage;
