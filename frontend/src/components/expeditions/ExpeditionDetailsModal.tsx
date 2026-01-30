import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Expedition, ExpeditionDocument } from '../../types/expedition';
import AttachmentPreviewModal, { AttachmentPreview } from '../common/AttachmentPreviewModal';
import HTMLPreviewModal, { HTMLPreview } from '../common/HTMLPreviewModal';
import './ExpeditionDetailsModal.css';

type DocumentType = 'invoice' | 'cmr' | 'other';

type MailAttachment = {
  id: number;
  filename: string;
  file?: string | null;
  download_url?: string | null;
};

type MailMessage = {
  id: number;
  subject: string | null;
  date: string;
  sender?: string | null;
  sender_display?: string | null;
  attachments?: MailAttachment[];
};

interface ExpeditionDetailsModalProps {
  expedition: Expedition | null;
  isOpen: boolean;
  mailMessages?: MailMessage[];
  addDocumentLoading?: boolean;
  addDocumentError?: string | null;
  documentDeleteError?: string | null;
  onAddDocument?: (payload: {
    document_type: DocumentType;
    amount?: string;
    issue_date?: string;
    received_date?: string;
    invoice_number?: string;
    cmr_number?: string;
  }) => Promise<void> | void;
  onUpdatePaymentDate?: (expeditionId: number, paymentDate: string | null) => Promise<void> | void;
  paymentDateLoading?: boolean;
  paymentDateError?: string | null;
  onUpdateNotes?: (expeditionId: number, notes: string) => Promise<void> | void;
  notesLoading?: boolean;
  notesError?: string | null;
  onDeleteDocument?: (documentId: number) => Promise<void> | void;
  deleteDocumentLoadingIds?: number[];
  onDelete?: () => Promise<void> | void;
  onEdit?: () => void;
  onClose: () => void;
}

const formatDateTime = (value?: string | null, includeTime = true): string => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  if (!includeTime) {
    return parsed.toLocaleDateString('lt-LT');
  }
  return parsed.toLocaleString('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

const ExpeditionDetailsModal = ({
  expedition,
  isOpen,
  mailMessages = [],
  addDocumentLoading = false,
  addDocumentError = null,
  documentDeleteError = null,
  onAddDocument,
  onUpdatePaymentDate,
  paymentDateLoading = false,
  paymentDateError = null,
  onUpdateNotes,
  notesLoading = false,
  notesError = null,
  onDeleteDocument,
  deleteDocumentLoadingIds = [],
  onDelete,
  onEdit,
  onClose,
}: ExpeditionDetailsModalProps) => {
  const { i18n } = useTranslation();
  const [documentType, setDocumentType] = useState<DocumentType>('invoice');
  const [documentAmount, setDocumentAmount] = useState('');
  const [documentIssueDate, setDocumentIssueDate] = useState('');
  const [documentReceivedDate, setDocumentReceivedDate] = useState('');
  const [documentInvoiceNumber, setDocumentInvoiceNumber] = useState('');
  const [documentCmrNumber, setDocumentCmrNumber] = useState('');
  const [documentFormVisible, setDocumentFormVisible] = useState(false);
  const [localDocumentError, setLocalDocumentError] = useState<string | null>(null);

  const [paymentDateInput, setPaymentDateInput] = useState('');
  const [paymentDateFeedback, setPaymentDateFeedback] = useState<string | null>(null);

  const [notesInput, setNotesInput] = useState('');
  const [notesFeedback, setNotesFeedback] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');

  const fetchHtmlPreview = useCallback(async (lang: string = 'lt') => {
    if (!expedition) return;
    try {
      const baseUrl = window.location.origin.replace(':3000', ':8000');
      const url = `${baseUrl}/api/orders/carriers/${expedition.id}/preview/?lang=${lang}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          'Accept': 'text/html',
        },
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('HTTP ' + response.status);
      
      const htmlContent = await response.text();
      setHtmlPreview({
        title: `Vežėjo sutartis ${expedition.expedition_number || expedition.id}`,
        htmlContent: htmlContent
      });
      setHtmlPreviewLang(lang);
    } catch (error) {
      alert('Nepavyko užkrauti peržiūros');
    }
  }, [expedition]);

  useEffect(() => {
    if (!isOpen || !expedition) {
      return;
    }
    setDocumentType('invoice');
    setDocumentAmount('');
    setDocumentIssueDate('');
    setDocumentReceivedDate('');
    setDocumentInvoiceNumber('');
    setDocumentCmrNumber('');
    setDocumentFormVisible(false);
    setLocalDocumentError(null);

    const existingPaymentDate =
      expedition.payment_status_info?.payment_date || expedition.payment_date || '';
    setPaymentDateInput(existingPaymentDate ? existingPaymentDate.substring(0, 10) : '');
    setPaymentDateFeedback(null);

    setNotesInput(expedition.notes || '');
    setNotesFeedback(null);
  }, [isOpen, expedition]);

  useEffect(() => {
    if (!isOpen) {
      setAttachmentPreview(null);
    }
  }, [isOpen]);
  const handleSaveNotes = useCallback(async () => {
    if (!expedition || !onUpdateNotes) {
      return;
    }
    setNotesFeedback(null);
    try {
      await onUpdateNotes(expedition.id, notesInput.trim());
      setNotesInput((prev) => prev.trim());
      setNotesFeedback('Pastaba išsaugota.');
    } catch (error: any) {
      const message = error?.message || 'Nepavyko išsaugoti pastabos.';
      setNotesFeedback(message);
    }
  }, [expedition, notesInput, onUpdateNotes]);

  const handleResetNotes = useCallback(() => {
    setNotesInput(expedition?.notes || '');
    setNotesFeedback(null);
  }, [expedition?.notes]);


  const expeditionDocuments = useMemo<ExpeditionDocument[]>(
    () => expedition?.documents ?? [],
    [expedition?.documents]
  );

  const invoiceDocsCount = expeditionDocuments.filter((doc) => doc.document_type === 'invoice').length;
  const cmrDocsCount = expeditionDocuments.filter((doc) => doc.document_type === 'cmr').length;
  const otherDocsCount = expeditionDocuments.filter((doc) => doc.document_type === 'other').length;
  const totalDocsCount = expeditionDocuments.length;

  const latestPaymentDate =
    expedition?.payment_status_info?.payment_date || expedition?.payment_date || null;

  const hasMailAttachments = useMemo(
    () => mailMessages.some((message) => (message.attachments || []).length > 0),
    [mailMessages]
  );

  const handleDocumentTypeChange = useCallback((value: DocumentType) => {
    setDocumentType(value);
    setLocalDocumentError(null);
    if (value !== 'invoice') {
      setDocumentAmount('');
      setDocumentInvoiceNumber('');
    }
    if (value !== 'cmr') {
      setDocumentCmrNumber('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDocumentSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!onAddDocument) {
        return;
      }
      if (documentType === 'invoice' && !documentAmount) {
        setLocalDocumentError('Sąskaitai būtina nurodyti sumą.');
        return;
      }
      if (documentType === 'invoice' && !documentInvoiceNumber.trim()) {
        setLocalDocumentError('Sąskaitai būtina nurodyti numerį.');
        return;
      }
      if (documentType === 'cmr' && !documentCmrNumber.trim()) {
        setLocalDocumentError('CMR dokumentui būtina nurodyti numerį.');
        return;
      }

      await onAddDocument({
        document_type: documentType,
        amount: documentType === 'invoice' ? documentAmount : undefined,
        issue_date: documentIssueDate || undefined,
        received_date: documentReceivedDate || undefined,
        invoice_number: documentType === 'invoice' ? documentInvoiceNumber.trim() : undefined,
        cmr_number: documentType === 'cmr' ? documentCmrNumber.trim() : undefined,
      });

      if (!addDocumentError) {
        setDocumentType('invoice');
        setDocumentAmount('');
        setDocumentIssueDate('');
        setDocumentReceivedDate('');
        setDocumentInvoiceNumber('');
        setDocumentCmrNumber('');
        setDocumentFormVisible(false);
        setLocalDocumentError(null);
      }
    },
    [
      onAddDocument,
      documentType,
      documentAmount,
      documentIssueDate,
      documentReceivedDate,
      documentInvoiceNumber,
      documentCmrNumber,
      addDocumentError,
    ]
  );

  const handlePaymentDateSave = useCallback(async () => {
    if (!expedition || !onUpdatePaymentDate || paymentDateLoading) {
      return;
    }
    setPaymentDateFeedback(null);
    try {
      await onUpdatePaymentDate(expedition.id, paymentDateInput ? paymentDateInput : null);
      setPaymentDateFeedback('Apmokėjimo data išsaugota.');
    } catch {
      setPaymentDateFeedback(null);
    }
  }, [expedition, onUpdatePaymentDate, paymentDateInput, paymentDateLoading]);

  if (!isOpen || !expedition) {
    return null;
  }

  const paymentStatusClass = `expedition-status-badge expedition-status-badge--${(
    expedition.payment_status || 'not_paid'
  ).toLowerCase()}`;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const expeditionStatusClass = `expedition-progress-badge expedition-progress-badge--${(
    expedition.status || 'default'
  ).toLowerCase()}`;

  return (
    <div className="expedition-modal-overlay" onClick={onClose}>
      <div className="expedition-modal" onClick={(event) => event.stopPropagation()}>
        <div className="expedition-modal-header">
          <div className="expedition-header-title">
            <h2>Ekspedicijos detalės</h2>
            <span className="expedition-header-created">
              Sukurta {formatDateTime(expedition.created_at, true)}
            </span>
          </div>
          <button type="button" className="expedition-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="expedition-modal-body">
          <section className="exp-summary">
            <div className="exp-summary-status" />
          </section>

          <div className="exp-top-grid">
            <article className="exp-top-card">
              <h3>Ekspedicija {expedition.expedition_number || `#${expedition.id}`}</h3>
              <div className="exp-basic-info">
                <span className="exp-type-badge">{expedition.carrier_type_display}</span>
                <span className="exp-partner">🏢 {expedition.partner?.name || '—'}</span>
              </div>

              <div className="exp-payment-status">
                <span className={paymentStatusClass}>
                  {expedition.payment_status_info?.message || expedition.payment_status_display}
                </span>
              </div>

              <div className="exp-prices-payments">
                <div className="exp-price-item">
                  <span className="exp-price-label">💰 Be PVM:</span>
                  <span className="exp-price-value">{formatCurrency(expedition.price_net)}</span>
                </div>
                <div className="exp-price-item">
                  <span className="exp-price-label">💰 Su PVM:</span>
                  <span className="exp-price-value">{formatCurrency(expedition.price_with_vat)}</span>
                </div>
                {latestPaymentDate && (
                  <div className="exp-payment-item">
                    <span className="exp-payment-label">✅ Mokėjimas:</span>
                    <span className="exp-payment-value">{formatDateTime(latestPaymentDate, false)}</span>
                  </div>
                )}
              </div>

              {onUpdatePaymentDate && (
                <div className="exp-payment-form-compact">
                  <label>
                    <span className="exp-payment-form-label">📅 Apmokėjimo data</span>
                    <input
                      type="date"
                      value={paymentDateInput}
                      onChange={(event) => setPaymentDateInput(event.target.value)}
                      disabled={paymentDateLoading}
                    />
                  </label>
                  <div className="exp-payment-actions-compact">
                    <button
                      type="button"
                      className="exp-payment-clear-compact"
                      onClick={() => {
                        setPaymentDateInput('');
                        setPaymentDateFeedback(null);
                      }}
                      disabled={paymentDateLoading}
                    >
                      Išvalyti
                    </button>
                    <button
                      type="button"
                      className="exp-payment-save-compact"
                      onClick={handlePaymentDateSave}
                      disabled={paymentDateLoading}
                    >
                      {paymentDateLoading ? 'Saugoma…' : 'Išsaugoti'}
                    </button>
                  </div>
                  {(paymentDateError || paymentDateFeedback) && (
                    <div
                      className={`exp-payment-feedback-compact ${paymentDateError ? 'is-error' : 'is-success'}`}
                    >
                      {paymentDateError || paymentDateFeedback}
                    </div>
                  )}
                </div>
              )}
            </article>

            <article className="exp-top-card">
              <h3>Maršrutas</h3>
              <div className="exp-route-compact">
                <div className="exp-route-from">
                  <div className="exp-route-label">📍 Iš:</div>
                  <div className="exp-route-content">
                    {expedition.sender_name && (
                      <div className="exp-route-contact">👤 {expedition.sender_name}</div>
                    )}
                    <div className="exp-route-location">
                      {expedition.route_from_country && expedition.route_from_city
                        ? `${expedition.route_from_country}, ${expedition.route_from_city}${expedition.route_from_address ? ` • ${expedition.route_from_address}` : ''}`
                        : expedition.route_from || '—'
                      }
                    </div>
                    <div className="exp-route-date">
                      📅 {expedition.loading_date_from && expedition.loading_date_to ?
                        `${formatDateTime(expedition.loading_date_from)} - ${formatDateTime(expedition.loading_date_to)}` :
                        formatDateTime(expedition.loading_date)}
                    </div>
                  </div>
                </div>

                <div className="exp-route-arrow">→</div>

                <div className="exp-route-to">
                  <div className="exp-route-label">📍 Į:</div>
                  <div className="exp-route-content">
                    {expedition.receiver_name && (
                      <div className="exp-route-contact">📦 {expedition.receiver_name}</div>
                    )}
                    <div className="exp-route-location">
                      {expedition.route_to_country && expedition.route_to_city
                        ? `${expedition.route_to_country}, ${expedition.route_to_city}${expedition.route_to_address ? ` • ${expedition.route_to_address}` : ''}`
                        : expedition.route_to || '—'
                      }
                    </div>
                    <div className="exp-route-date">
                      🚚 {expedition.unloading_date_from && expedition.unloading_date_to ?
                        `${formatDateTime(expedition.unloading_date_from)} - ${formatDateTime(expedition.unloading_date_to)}` :
                        formatDateTime(expedition.unloading_date)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="exp-route-notes">
                <h4>Pastabos</h4>
                <textarea
                  className="exp-notes-textarea-compact"
                  rows={2}
                  value={notesInput}
                  onChange={(event) => setNotesInput(event.target.value)}
                  placeholder="Pastaba ekspedicijai…"
                  disabled={notesLoading}
                />
                <div className="exp-notes-actions-compact">
                  <button
                    type="button"
                    className="exp-notes-reset-compact"
                    onClick={handleResetNotes}
                    disabled={notesLoading}
                  >
                    Atstatyti
                  </button>
                  <button
                    type="button"
                    className="exp-notes-save-compact"
                    onClick={handleSaveNotes}
                    disabled={notesLoading || !onUpdateNotes}
                  >
                    {notesLoading ? 'Saugoma…' : 'Išsaugoti'}
                  </button>
                </div>
                {(notesError || notesFeedback) && (
                  <div className={`exp-notes-message-compact ${notesError ? 'is-error' : 'is-success'}`}>
                    {notesError || notesFeedback}
                  </div>
                )}
              </div>
            </article>
          </div>



          <section className="exp-grid exp-grid--bottom">
            <article className="exp-bottom-card">
              <header>
                <div>
                  <h3>Pašto sutapimai</h3>
                  <span className="exp-bottom-meta">
                    {mailMessages.length} laišk. {hasMailAttachments ? 'Yra priedų' : 'Priedų nėra'}
                  </span>
                </div>
              </header>
              <div className="exp-bottom-body">
                {mailMessages.length === 0 ? (
                  <div className="expedition-empty">Susijusių laiškų nerasta.</div>
                ) : (
                  <ul className="mail-list">
                    {mailMessages.map((message) => (
                      <li key={message.id} className="mail-item">
                        <div className="mail-item-header">
                          <span className="mail-subject">{message.subject || '(be temos)'}</span>
                          <span className="mail-meta">
                            {message.sender_display || message.sender || 'Nežinomas siuntėjas'} ·{' '}
                            {formatDateTime(message.date)}
                          </span>
                        </div>
                        {(message.attachments || []).length > 0 ? (
                          <ul className="mail-attachments">
                            {(message.attachments || []).map((attachment) => (
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
                        ) : (
                          <div className="expedition-empty">Priedų nerasta.</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>

            <article className="exp-bottom-card">
              <header>
                <div>
                  <h3>Dokumentai</h3>
                  <span className="exp-bottom-meta">
                    Viso {totalDocsCount} · Sąskaitos {invoiceDocsCount} · CMR {cmrDocsCount} · Kita {otherDocsCount}
                  </span>
                </div>
                <button
                  type="button"
                  className="document-toggle"
                  onClick={() => {
                    setDocumentFormVisible((prev) => !prev);
                    setLocalDocumentError(null);
                  }}
                >
                  {documentFormVisible ? 'Atšaukti' : 'Naujas dokumentas'}
                </button>
              </header>
              <div className="exp-bottom-body">
                {documentFormVisible && (
                  <form onSubmit={handleDocumentSubmit} className="document-form">
                    <div className="document-form-grid">
                      <label>
                        Tipas
                        <select
                          value={documentType}
                          onChange={(event) => handleDocumentTypeChange(event.target.value as DocumentType)}
                        >
                          <option value="invoice">Sąskaita</option>
                          <option value="cmr">CMR</option>
                          <option value="other">Kiti dokumentai</option>
                        </select>
                      </label>

                      {documentType === 'invoice' && (
                        <label>
                          Sąskaitos numeris
                          <input
                            type="text"
                            value={documentInvoiceNumber}
                            onChange={(event) => setDocumentInvoiceNumber(event.target.value)}
                            placeholder="INV-2025-001"
                          />
                        </label>
                      )}

                      {documentType === 'cmr' && (
                        <label>
                          CMR numeris
                          <input
                            type="text"
                            value={documentCmrNumber}
                            onChange={(event) => setDocumentCmrNumber(event.target.value)}
                            placeholder="CMR-123456"
                          />
                        </label>
                      )}

                      <label>
                        Išrašymo data
                        <input
                          type="date"
                          value={documentIssueDate}
                          onChange={(event) => setDocumentIssueDate(event.target.value)}
                        />
                      </label>

                      <label>
                        Gavimo data
                        <input
                          type="date"
                          value={documentReceivedDate}
                          onChange={(event) => setDocumentReceivedDate(event.target.value)}
                        />
                      </label>

                      {documentType === 'invoice' && (
                        <label>
                          Suma (be PVM)
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={documentAmount}
                            onChange={(event) => setDocumentAmount(event.target.value)}
                          />
                        </label>
                      )}
                    </div>

                    {(localDocumentError || addDocumentError) && (
                      <div className="document-error">{localDocumentError || addDocumentError}</div>
                    )}

                    <div className="document-actions">
                      <button type="submit" disabled={addDocumentLoading}>
                        {addDocumentLoading ? 'Pridedama…' : 'Pridėti dokumentą'}
                      </button>
                    </div>
                  </form>
                )}

                {documentDeleteError && (
                  <div className="document-error">{documentDeleteError}</div>
                )}

                {expeditionDocuments.length === 0 ? (
                  <div className="expedition-empty">Dokumentų nėra.</div>
                ) : (
                  <ul className="document-list">
                    {expeditionDocuments.map((document) => {
                      const isDeleting = deleteDocumentLoadingIds.includes(document.id);
                      return (
                        <li key={document.id}>
                          <div className="document-row">
                            <div className="document-row-header">
                              <div className="document-title">
                                <strong>{document.document_type_display || document.document_type}</strong>
                                {document.amount && <span>{formatCurrency(document.amount)}</span>}
                              </div>
                              {onDeleteDocument && (
                                <button
                                  type="button"
                                  className="document-delete"
                                  disabled={isDeleting}
                                  onClick={() => {
                                    if (isDeleting) {
                                      return;
                                    }
                                    const confirmed = window.confirm('Ar tikrai pašalinti dokumentą?');
                                    if (!confirmed) {
                                      return;
                                    }
                                    onDeleteDocument(document.id);
                                  }}
                                >
                                  {isDeleting ? 'Šalinama…' : 'Pašalinti'}
                                </button>
                              )}
                            </div>
                            <div className="document-meta">
                              {[
                                document.invoice_number && `Sąsk. Nr. ${document.invoice_number}`,
                                document.cmr_number && `CMR Nr. ${document.cmr_number}`,
                                document.issue_date && `Išrašyta ${formatDateTime(document.issue_date, false)}`,
                                document.received_date && `Gauta ${formatDateTime(document.received_date, false)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </article>
          </section>
        </div>

        <div className="expedition-modal-footer">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="expedition-modal-preview-btn"
              onClick={(e) => {
                e.stopPropagation();
                fetchHtmlPreview(i18n.language);
              }}
              style={{
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              👁️ Peržiūrėti sutartį
            </button>
            <button
              type="button"
              className="expedition-modal-pdf-btn"
              onClick={async (e) => {
                e.stopPropagation();
                if (!expedition) return;
                try {
                  const token = localStorage.getItem('token');
                  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
                  let baseUrl = apiBaseUrl.replace('/api', '');
                  
                  if (!baseUrl || baseUrl === '') {
                    baseUrl = window.location.hostname === 'localhost' 
                      ? 'http://localhost:8000' 
                      : window.location.origin;
                  }
                  
                  const url = `${baseUrl}/api/orders/carriers/${expedition.id}/pdf/`;
                  
                  const response = await fetch(url, {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Accept': 'application/pdf',
                    },
                    credentials: 'include',
                  });
                  
                  if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                  }
                  
                  const blob = await response.blob();
                  
                  // Patikrinti ar tai tikrai PDF
                  if (blob.type !== 'application/pdf' && !blob.type.includes('pdf')) {
                    // Patikrinti pirmus 4 baitus
                    const firstBytes = await blob.slice(0, 4).text();
                    if (!firstBytes.startsWith('%PDF')) {
                      throw new Error('Gautas failas nėra PDF formatas');
                    }
                  }
                  
                  const blobUrl = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = blobUrl;
                  link.download = `vezejo_sutartis_${expedition.expedition_number || expedition.id}.pdf`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(blobUrl);
                } catch (error: any) {
                  const errorMsg = error.message || error.toString() || 'Nežinoma klaida';
                  alert(`Nepavyko atsisiųsti PDF: ${errorMsg}`);
                }
              }}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              📄 Atsisiųsti PDF
            </button>
            {onEdit && (
              <button
                type="button"
                className="expedition-modal-edit-btn"
                onClick={() => {
                  if (onEdit) {
                    onEdit();
                  }
                }}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                ✏️ Redaguoti
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="expedition-modal-delete-btn"
                onClick={async () => {
                  await onDelete();
                }}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                🗑️ Ištrinti ekspediciją
              </button>
            )}
          <button type="button" className="expedition-modal-close-btn" onClick={onClose}>
            Uždaryti
          </button>
          </div>
        </div>
        <AttachmentPreviewModal
          attachment={attachmentPreview}
          onClose={() => setAttachmentPreview(null)}
        />
        
        {/* HTML Preview Modal */}
        <HTMLPreviewModal
          preview={htmlPreview}
          onClose={() => setHtmlPreview(null)}
          onLanguageChange={fetchHtmlPreview}
          currentLang={htmlPreviewLang}
          onDownloadPDF={htmlPreview && expedition ? async () => {
            try {
              const response = await fetch(`${window.location.origin.replace(':3000', ':8000')}/api/orders/carriers/${expedition.id}/pdf/?lang=${htmlPreviewLang}`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
                },
                credentials: 'include',
              });

              if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
              }

              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `vezimo-sutartis-${expedition.id}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
              alert('PDF sėkmingai atsisiųstas');
            } catch (error: any) {
              alert('Nepavyko atsisiųsti PDF: ' + (error.message || 'Nežinoma klaida'));
            }
          } : undefined}
          onSendEmail={htmlPreview && expedition ? async () => {
            // Atidaryti email modalą - naudoti tą patį, kaip HTML template'e
            const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              try {
                // Iškviesti sendEmail funkciją iš iframe
                (iframe.contentWindow as any).sendEmail?.();
              } catch (e) {
                alert('Nepavyko atidaryti email modalo');
              }
            }
          } : undefined}
        />
      </div>
    </div>
  );
};

export default ExpeditionDetailsModal;
