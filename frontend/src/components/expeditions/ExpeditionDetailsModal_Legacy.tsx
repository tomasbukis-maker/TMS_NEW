import React from 'react';
import { Expedition, ExpeditionDocument } from '../../types/expedition';
import { useAuth } from '../../context/AuthContext';
import './ExpeditionDetailsModal.css';

interface ExpeditionDetailsModalProps {
  expedition: Expedition | null;
  isOpen: boolean;
  mailMessages?: MailMessage[];
  addDocumentLoading?: boolean;
  addDocumentError?: string | null;
  onAddDocument?: (payload: {
    document_type: 'invoice' | 'cmr' | 'other';
    amount?: string;
    issue_date?: string;
    received_date?: string;
    invoice_number?: string;
    cmr_number?: string;
  }) => Promise<void> | void;
  onUpdatePaymentDate?: (expeditionId: number, paymentDate: string | null) => Promise<void> | void;
  paymentDateLoading?: boolean;
  paymentDateError?: string | null;
  onClose: () => void;
}

interface MailAttachment {
  id: number;
  filename: string;
  file?: string | null;
  download_url?: string | null;
}

interface MailMessage {
  id: number;
  subject: string | null;
  date: string;
  sender?: string | null;
  sender_display?: string | null;
  attachments?: MailAttachment[];
}

type OverviewCardId = 'core' | 'timeline' | 'finance';
type MainCardId = 'mail' | 'notes' | 'payments' | 'documents';

const DEFAULT_OVERVIEW_ORDER: OverviewCardId[] = ['core', 'timeline', 'finance'];
const DEFAULT_MAIN_ORDER: MainCardId[] = ['mail', 'notes', 'payments', 'documents'];

const sanitizeStoredOrder = <T extends string>(
  storedValue: string | null,
  defaults: readonly T[]
): T[] => {
  if (!storedValue) {
    return [...defaults];
  }
  try {
    const parsed = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) {
      return [...defaults];
    }
    const valid = parsed.filter((item: unknown): item is T =>
      typeof item === 'string' && defaults.includes(item as T)
    );
    const missing = defaults.filter((item) => !valid.includes(item));
    return [...valid, ...missing];
  } catch (error) {
    return [...defaults];
  }
};

const arraysEqual = <T,>(a: T[], b: T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

const moveItem = <T,>(list: T[], item: T, direction: number): T[] => {
  const index = list.indexOf(item);
  if (index === -1) {
    return list;
  }
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= list.length) {
    return list;
  }
  const next = [...list];
  next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
};

const reorderList = <T,>(list: T[], source: T, target: T): T[] => {
  if (source === target) {
    return list;
  }
  const current = [...list];
  const sourceIndex = current.indexOf(source);
  const targetIndex = current.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) {
    return list;
  }
  current.splice(sourceIndex, 1);
  current.splice(targetIndex, 0, source);
  return current;
};

const formatDateTime = (value?: string | null, includeTime = true): string => {
  if (!value) {
    return '-';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return includeTime
      ? date.toLocaleString('lt-LT', {
          hour: '2-digit',
          minute: '2-digit',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
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

const ExpeditionDetailsModal: React.FC<ExpeditionDetailsModalProps> = ({
  expedition,
  isOpen,
  mailMessages = [],
  addDocumentLoading = false,
  addDocumentError = null,
  onAddDocument,
  onUpdatePaymentDate,
  paymentDateLoading = false,
  paymentDateError = null,
  onClose,
}) => {
  const { user } = useAuth();
  const storageKeySuffix = user?.id ? `user_${user.id}` : 'guest';
  const overviewStorageKey = `expedition_modal_overview_${storageKeySuffix}`;
  const mainStorageKey = `expedition_modal_main_${storageKeySuffix}`;

  const [documentType, setDocumentType] = React.useState<'invoice' | 'cmr' | 'other'>('invoice');
  const [documentAmount, setDocumentAmount] = React.useState<string>('');
  const [documentIssueDate, setDocumentIssueDate] = React.useState<string>('');
  const [documentReceivedDate, setDocumentReceivedDate] = React.useState<string>('');
  const [documentInvoiceNumber, setDocumentInvoiceNumber] = React.useState<string>('');
  const [documentCmrNumber, setDocumentCmrNumber] = React.useState<string>('');
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [showDocumentForm, setShowDocumentForm] = React.useState<boolean>(false);

  const [paymentDateInput, setPaymentDateInput] = React.useState<string>('');
  const [paymentDateFeedback, setPaymentDateFeedback] = React.useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = React.useState(false);
  const [overviewOrder, setOverviewOrder] = React.useState<OverviewCardId[]>(() => [
    ...DEFAULT_OVERVIEW_ORDER,
  ]);
  const [mainOrder, setMainOrder] = React.useState<MainCardId[]>(() => [...DEFAULT_MAIN_ORDER]);
  const [draggingOverviewId, setDraggingOverviewId] = React.useState<OverviewCardId | null>(null);
  const [draggingMainId, setDraggingMainId] = React.useState<MainCardId | null>(null);
  const [hoverOverviewId, setHoverOverviewId] = React.useState<OverviewCardId | null>(null);
  const [hoverMainId, setHoverMainId] = React.useState<MainCardId | null>(null);
  const lastOverviewTargetRef = React.useRef<OverviewCardId | null>(null);
  const lastMainTargetRef = React.useRef<MainCardId | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setDocumentType('invoice');
      setDocumentAmount('');
      setDocumentIssueDate('');
      setDocumentReceivedDate('');
      setDocumentInvoiceNumber('');
      setDocumentCmrNumber('');
      setLocalError(null);
      setShowDocumentForm(false);
      const initialPaymentDate =
        expedition?.payment_status_info?.payment_date ||
        expedition?.payment_date ||
        '';
      setPaymentDateInput(initialPaymentDate ? initialPaymentDate.substring(0, 10) : '');
      setPaymentDateFeedback(null);
    }
  }, [isOpen, expedition?.id, expedition?.payment_date, expedition?.payment_status_info?.payment_date]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const nextOverview = sanitizeStoredOrder<OverviewCardId>(
      localStorage.getItem(overviewStorageKey),
      DEFAULT_OVERVIEW_ORDER
    );
    setOverviewOrder((prev) => (arraysEqual(prev, nextOverview) ? prev : nextOverview));

    const nextMain = sanitizeStoredOrder<MainCardId>(
      localStorage.getItem(mainStorageKey),
      DEFAULT_MAIN_ORDER
    );
    setMainOrder((prev) => (arraysEqual(prev, nextMain) ? prev : nextMain));
  }, [isOpen, overviewStorageKey, mainStorageKey]);

  React.useEffect(() => {
    if (!isOpen) {
      setIsReorderMode(false);
      setDraggingOverviewId(null);
      setDraggingMainId(null);
      setHoverOverviewId(null);
      setHoverMainId(null);
      lastOverviewTargetRef.current = null;
      lastMainTargetRef.current = null;
      setShowDocumentForm(false);
      setShowDocumentForm(false);
    }
  }, [isOpen]);

  const handleMoveOverview = React.useCallback(
    (cardId: OverviewCardId, direction: number) => {
      setOverviewOrder((prev) => {
        const next = moveItem(prev, cardId, direction);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(overviewStorageKey, JSON.stringify(next));
        return next;
      });
    },
    [overviewStorageKey]
  );

  const handleMoveMain = React.useCallback(
    (cardId: MainCardId, direction: number) => {
      setMainOrder((prev) => {
        const next = moveItem(prev, cardId, direction);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(mainStorageKey, JSON.stringify(next));
        return next;
      });
    },
    [mainStorageKey]
  );

  const handleResetLayout = React.useCallback(() => {
    const defaultOverview = [...DEFAULT_OVERVIEW_ORDER];
    const defaultMain = [...DEFAULT_MAIN_ORDER];
    setOverviewOrder(defaultOverview);
    setMainOrder(defaultMain);
    setDraggingOverviewId(null);
    setDraggingMainId(null);
    setHoverOverviewId(null);
    setHoverMainId(null);
    lastOverviewTargetRef.current = null;
    lastMainTargetRef.current = null;
    localStorage.removeItem(overviewStorageKey);
    localStorage.removeItem(mainStorageKey);
    setShowDocumentForm(false);
  }, [overviewStorageKey, mainStorageKey]);

  const handleOverviewDragStart = React.useCallback(
    (event: React.DragEvent<HTMLElement>, cardId: OverviewCardId) => {
      if (!isReorderMode) {
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', cardId);
      setDraggingOverviewId(cardId);
      lastOverviewTargetRef.current = cardId;
    },
    [isReorderMode]
  );

  const handleOverviewDragEnd = React.useCallback(() => {
    setDraggingOverviewId(null);
    setHoverOverviewId(null);
    lastOverviewTargetRef.current = null;
  }, []);

  const handleOverviewDrop = React.useCallback(
    (targetId: OverviewCardId) => {
      if (!isReorderMode || !draggingOverviewId) {
        return;
      }
      setOverviewOrder((prev) => {
        const next = reorderList(prev, draggingOverviewId, targetId);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(overviewStorageKey, JSON.stringify(next));
        return next;
      });
      setDraggingOverviewId(null);
      setHoverOverviewId(null);
      lastOverviewTargetRef.current = null;
    },
    [draggingOverviewId, isReorderMode, overviewStorageKey]
  );

  const handleOverviewDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLElement>, targetId: OverviewCardId) => {
      if (!isReorderMode || !draggingOverviewId || draggingOverviewId === targetId) {
        return;
      }
      event.preventDefault();
      if (lastOverviewTargetRef.current === targetId) {
        return;
      }
      setOverviewOrder((prev) => {
        const next = reorderList(prev, draggingOverviewId, targetId);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(overviewStorageKey, JSON.stringify(next));
        return next;
      });
      lastOverviewTargetRef.current = targetId;
      setHoverOverviewId(targetId);
    },
    [draggingOverviewId, isReorderMode, overviewStorageKey]
  );

  const handleOverviewDragLeave = React.useCallback(
    (targetId: OverviewCardId) => {
      if (hoverOverviewId === targetId) {
        setHoverOverviewId(null);
      }
    },
    [hoverOverviewId]
  );

  const handleMainDragStart = React.useCallback(
    (event: React.DragEvent<HTMLElement>, cardId: MainCardId) => {
      if (!isReorderMode) {
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', cardId);
      setDraggingMainId(cardId);
      lastMainTargetRef.current = cardId;
    },
    [isReorderMode]
  );

  const handleMainDragEnd = React.useCallback(() => {
    setDraggingMainId(null);
    setHoverMainId(null);
    lastMainTargetRef.current = null;
  }, []);

  const handleMainDrop = React.useCallback(
    (targetId: MainCardId) => {
      if (!isReorderMode || !draggingMainId) {
        return;
      }
      setMainOrder((prev) => {
        const next = reorderList(prev, draggingMainId, targetId);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(mainStorageKey, JSON.stringify(next));
        return next;
      });
      setDraggingMainId(null);
      setHoverMainId(null);
      lastMainTargetRef.current = null;
    },
    [draggingMainId, isReorderMode, mainStorageKey]
  );

  const handleMainDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLElement>, targetId: MainCardId) => {
      if (!isReorderMode || !draggingMainId || draggingMainId === targetId) {
        return;
      }
      event.preventDefault();
      if (lastMainTargetRef.current === targetId) {
        return;
      }
      setMainOrder((prev) => {
        const next = reorderList(prev, draggingMainId, targetId);
        if (next === prev) {
          return prev;
        }
        localStorage.setItem(mainStorageKey, JSON.stringify(next));
        return next;
      });
      lastMainTargetRef.current = targetId;
      setHoverMainId(targetId);
    },
    [draggingMainId, isReorderMode, mainStorageKey]
  );

  const handleMainDragLeave = React.useCallback(
    (targetId: MainCardId) => {
      if (hoverMainId === targetId) {
        setHoverMainId(null);
      }
    },
    [hoverMainId]
  );

  const handleDocumentTypeChange = (value: 'invoice' | 'cmr' | 'other') => {
    setDocumentType(value);
    setLocalError(null);
    if (value !== 'invoice') {
      setDocumentAmount('');
      setDocumentInvoiceNumber('');
    }
    if (value !== 'cmr') {
      setDocumentCmrNumber('');
    }
  };

  const handleDocumentSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onAddDocument) {
      return;
    }

    if (documentType === 'invoice' && !documentAmount) {
      setLocalError('Sąskaitai būtina nurodyti sumą.');
      return;
    }
    if (documentType === 'invoice' && !documentInvoiceNumber.trim()) {
      setLocalError('Sąskaitai būtina nurodyti numerį.');
      return;
    }
    if (documentType === 'cmr' && !documentCmrNumber.trim()) {
      setLocalError('CMR dokumentui būtina nurodyti numerį.');
      return;
    }

    setLocalError(null);

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
      setShowDocumentForm(false);
    }
  };

  const renderDocumentMeta = (document: ExpeditionDocument) => {
    const parts: string[] = [];
    if (document.document_type === 'invoice' && document.invoice_number) {
      parts.push(`Sąskaitos Nr.: ${document.invoice_number}`);
    }
    if (document.document_type === 'cmr' && document.cmr_number) {
      parts.push(`CMR Nr.: ${document.cmr_number}`);
    }
    if (document.issue_date) {
      parts.push(`Išrašyta: ${formatDateTime(document.issue_date, false)}`);
    }
    if (document.received_date) {
      parts.push(`Gauta: ${formatDateTime(document.received_date, false)}`);
    }
    if (document.created_at) {
      parts.push(`Įvesta: ${formatDateTime(document.created_at)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  if (!isOpen || !expedition) {
    return null;
  }

  const latestPaymentDate =
    expedition.payment_status_info?.payment_date ||
    expedition.payment_date ||
    null;
  const paymentStatusVariant = (expedition.payment_status || 'not_paid').toLowerCase();
  const paymentStatusClass = `expedition-status-badge expedition-status-badge--${paymentStatusVariant}`;
  const expeditionStatusSlug = (expedition.status || 'default').toLowerCase();
  const expeditionStatusClass = `expedition-progress-badge expedition-progress-badge--${expeditionStatusSlug}`;
  const invoiceDocsCount =
    expedition.documents?.filter((document) => document.document_type === 'invoice').length || 0;
  const cmrDocsCount =
    expedition.documents?.filter((document) => document.document_type === 'cmr').length || 0;
  const otherDocsCount =
    expedition.documents?.filter((document) => document.document_type === 'other').length || 0;
  const totalDocsCount = expedition.documents?.length || 0;

  const hasMailAttachments = mailMessages.some((message) => (message.attachments || []).length > 0);

  const renderOverviewCard = (cardId: OverviewCardId, index: number) => {
    switch (cardId) {
      case 'core':
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--summary${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingOverviewId === cardId ? ' expedition-card--dragging' : ''
            }${hoverOverviewId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleOverviewDragStart(event, cardId)}
            onDragEnd={handleOverviewDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleOverviewDrop(cardId);
            }}
            onDragEnter={(event) => handleOverviewDragEnter(event, cardId)}
            onDragLeave={() => handleOverviewDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Pagrindinė informacija</h3>
              </div>
              <div className="expedition-card-header-meta">
                <span>{formatDateTime(expedition.created_at, true)}</span>
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            <div className="expedition-overview-items">
              <div>
                <span className="label">Ekspedicijos nr.</span>
                <span className="value">{expedition.expedition_number || '—'}</span>
              </div>
              <div>
                <span className="label">Partneris</span>
                <span className="value">{expedition.partner?.name || '—'}</span>
              </div>
              <div>
                <span className="label">Tipas</span>
                <span className="value">{expedition.carrier_type_display}</span>
              </div>
              <div className="expedition-badge-row">
                <span className={expeditionStatusClass}>{expedition.status_display}</span>
                <span className={paymentStatusClass}>
                  {expedition.payment_status_info?.message || expedition.payment_status_display}
                </span>
              </div>
            </div>
          </section>
        );
      case 'timeline':
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--summary${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingOverviewId === cardId ? ' expedition-card--dragging' : ''
            }${hoverOverviewId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleOverviewDragStart(event, cardId)}
            onDragEnd={handleOverviewDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleOverviewDrop(cardId);
            }}
            onDragEnter={(event) => handleOverviewDragEnter(event, cardId)}
            onDragLeave={() => handleOverviewDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Laiko juosta ir maršrutas</h3>
              </div>
              <div className="expedition-card-header-meta">
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            <div className="expedition-route-grid">
              <div>
                <span className="label">Pakrovimo data</span>
                <span className="value">{formatDateTime(expedition.loading_date)}</span>
              </div>
              <div>
                <span className="label">Iškrovimo data</span>
                <span className="value">{formatDateTime(expedition.unloading_date)}</span>
              </div>
              <div>
                <span className="label">Maršrutas</span>
                <span className="value">
                  {(expedition.route_from || '—')} → {(expedition.route_to || '—')}
                </span>
              </div>
            </div>
          </section>
        );
      case 'finance':
      default:
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--summary${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingOverviewId === cardId ? ' expedition-card--dragging' : ''
            }${hoverOverviewId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleOverviewDragStart(event, cardId)}
            onDragEnd={handleOverviewDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleOverviewDrop(cardId);
            }}
            onDragEnter={(event) => handleOverviewDragEnter(event, cardId)}
            onDragLeave={() => handleOverviewDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Finansinė santrauka</h3>
              </div>
              <div className="expedition-card-header-meta">
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            <div className="expedition-overview-items">
              <div>
                <span className="label">Suma be PVM</span>
                <span className="value">{formatCurrency(expedition.price_net)}</span>
              </div>
              <div>
                <span className="label">Suma su PVM</span>
                <span className="value">{formatCurrency(expedition.price_with_vat)}</span>
              </div>
              <div>
                <span className="label">Paskutinė apmokėjimo data</span>
                <span className="value">{formatDateTime(latestPaymentDate, false)}</span>
              </div>
              <div>
                <span className="label">Dokumentai</span>
                <span className="value">
                  {totalDocsCount} vnt. · Sąskaitos {invoiceDocsCount} / CMR {cmrDocsCount} / Kita{' '}
                  {otherDocsCount}
                </span>
              </div>
            </div>
          </section>
        );
    }
  };

  const renderMainCard = (cardId: MainCardId, index: number) => {
    switch (cardId) {
      case 'mail':
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--main${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingMainId === cardId ? ' expedition-card--dragging' : ''
            }${hoverMainId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleMainDragStart(event, cardId)}
            onDragEnd={handleMainDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleMainDrop(cardId);
            }}
            onDragEnter={(event) => handleMainDragEnter(event, cardId)}
            onDragLeave={() => handleMainDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Pašto sutapimai</h3>
              </div>
              <div className="expedition-card-header-meta">
                <span>
                  {mailMessages.length} laišk. {hasMailAttachments ? '· Yra priedų' : '· Priedų nėra'}
                </span>
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            {mailMessages.length === 0 ? (
              <p className="expedition-modal-mail-empty">Susijusių laiškų nerasta.</p>
            ) : (
              <ul className="expedition-modal-mail-list compact">
                {mailMessages.map((message) => (
                  <li key={message.id} className="expedition-modal-mail-item">
                    <div className="mail-item-header">
                      <span className="mail-item-subject">{message.subject || '(be temos)'}</span>
                      <span className="mail-item-meta">
                        {message.sender_display || message.sender || 'Nežinomas siuntėjas'} ·{' '}
                        {formatDateTime(message.date)}
                      </span>
                    </div>
                    {(message.attachments || []).length > 0 ? (
                      <ul className="mail-attachment-list">
                        {(message.attachments || []).map((attachment) => (
                          <li key={attachment.id}>
                            {attachment.download_url || attachment.file ? (
                              <a href={attachment.download_url || attachment.file || undefined} target="_blank" rel="noreferrer">
                                {attachment.filename}
                              </a>
                            ) : (
                              <span>{attachment.filename}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="expedition-modal-mail-empty">Priedų nerasta.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      case 'notes':
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--main${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingMainId === cardId ? ' expedition-card--dragging' : ''
            }${hoverMainId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleMainDragStart(event, cardId)}
            onDragEnd={handleMainDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleMainDrop(cardId);
            }}
            onDragEnter={(event) => handleMainDragEnter(event, cardId)}
            onDragLeave={() => handleMainDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Pastabos</h3>
              </div>
              <div className="expedition-card-header-meta">
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            <div className="expedition-modal-notes">
              {expedition.notes && expedition.notes.trim().length > 0 ? (
                expedition.notes
              ) : (
                <span className="placeholder">Pastabų nėra.</span>
              )}
            </div>
          </section>
        );
      case 'payments':
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--main${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingMainId === cardId ? ' expedition-card--dragging' : ''
            }${hoverMainId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleMainDragStart(event, cardId)}
            onDragEnd={handleMainDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleMainDrop(cardId);
            }}
            onDragEnter={(event) => handleMainDragEnter(event, cardId)}
            onDragLeave={() => handleMainDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Mokėjimų valdymas</h3>
              </div>
              <div className="expedition-card-header-meta">
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
            <div className="expedition-payment-overview">
              <div>
                <span className="label">Dabartinė būsena</span>
                <span className={paymentStatusClass}>
                  {expedition.payment_status_info?.message || expedition.payment_status_display}
                </span>
              </div>
              <div>
                <span className="label">Suma be PVM</span>
                <span className="value">{formatCurrency(expedition.price_net)}</span>
              </div>
              <div>
                <span className="label">Suma su PVM</span>
                <span className="value">{formatCurrency(expedition.price_with_vat)}</span>
              </div>
              <div>
                <span className="label">Paskutinis apmokėjimas</span>
                <span className="value">{formatDateTime(latestPaymentDate, false)}</span>
              </div>
            </div>
            {onUpdatePaymentDate && (
              <div className="expedition-payment-date-form">
                <label>
                  Apmokėjimo data
                  <input
                    type="date"
                    value={paymentDateInput}
                    onChange={(event) => {
                      setPaymentDateInput(event.target.value);
                      setPaymentDateFeedback(null);
                    }}
                  />
                </label>
                <div className="payment-date-actions">
                  <button
                    type="button"
                    className="payment-date-clear"
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
                    className="payment-date-save"
                    onClick={async () => {
                      if (!onUpdatePaymentDate || paymentDateLoading) {
                        return;
                      }
                      setPaymentDateFeedback(null);
                      try {
                        await onUpdatePaymentDate(
                          expedition.id,
                          paymentDateInput ? paymentDateInput : null
                        );
                        setPaymentDateFeedback('Apmokėjimo data išsaugota.');
                      } catch (error: any) {
                        setPaymentDateFeedback(null);
                      }
                    }}
                    disabled={paymentDateLoading}
                  >
                    {paymentDateLoading ? 'Saugoma...' : 'Išsaugoti'}
                  </button>
                </div>
                {(paymentDateError || paymentDateFeedback) && (
                  <div
                    className={`payment-date-message ${
                      paymentDateError ? 'payment-date-error' : 'payment-date-success'
                    }`}
                  >
                    {paymentDateError || paymentDateFeedback}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      case 'documents':
      default:
        return (
          <section
            key={cardId}
            className={`expedition-card expedition-card--main${
              isReorderMode ? ' expedition-card--reordering' : ''
            }${
              draggingMainId === cardId ? ' expedition-card--dragging' : ''
            }${hoverMainId === cardId ? ' expedition-card--hover' : ''}`}
            draggable={isReorderMode}
            onDragStart={(event) => handleMainDragStart(event, cardId)}
            onDragEnd={handleMainDragEnd}
            onDragOver={(event) => {
              if (isReorderMode) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleMainDrop(cardId);
            }}
            onDragEnter={(event) => handleMainDragEnter(event, cardId)}
            onDragLeave={() => handleMainDragLeave(cardId)}
          >
            <div className="expedition-card-header">
              <div className="expedition-card-header-title">
                <h3>Dokumentų valdymas</h3>
              </div>
              <div className="expedition-card-header-meta">
                {isReorderMode && (
                  <span className="reorder-hint">Tempkite kortelę norėdami pakeisti tvarką</span>
                )}
              </div>
            </div>
              <div className="expedition-document-summary">
                <span className="summary-chip">Viso: {totalDocsCount}</span>
                <span className="summary-chip">Sąskaitos: {invoiceDocsCount}</span>
                <span className="summary-chip">CMR: {cmrDocsCount}</span>
                <span className="summary-chip">Kiti: {otherDocsCount}</span>
              </div>

              <div className="expedition-modal-add-doc">
                <div className="expedition-add-doc-header">
                  <h4>Pridėti gautą dokumentą</h4>
                  <button
                    type="button"
                    className="expedition-add-doc-toggle"
                    onClick={() => {
                      setShowDocumentForm((prev) => !prev);
                      setLocalError(null);
                    }}
                  >
                    {showDocumentForm ? 'Atšaukti' : 'Naujas dokumentas'}
                  </button>
                </div>

                {showDocumentForm && (
                  <form onSubmit={handleDocumentSubmit} className="expedition-document-form">
                    <div className="document-form-row compact">
                      <label>
                        Tipas
                        <select
                          value={documentType}
                          onChange={(event) => handleDocumentTypeChange(event.target.value as 'invoice' | 'cmr' | 'other')}
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

                    {(localError || addDocumentError) && (
                      <div className="document-form-error">{localError || addDocumentError}</div>
                    )}

                    <div className="document-form-actions">
                      <button type="submit" disabled={addDocumentLoading}>
                        {addDocumentLoading ? 'Pridedama…' : 'Pridėti dokumentą'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

            {expedition.documents && expedition.documents.length > 0 && (
              <div className="expedition-modal-document-list scrollable">
                <h4>Pridėti dokumentai</h4>
                <ul>
                  {expedition.documents.map((document) => (
                    <li key={document.id}>
                      <div className="document-item">
                        <div className="document-item-main">
                          <span className="document-type">
                            {document.document_type_display || document.document_type}
                          </span>
                          {document.amount && (
                            <span className="document-amount">{formatCurrency(document.amount)}</span>
                          )}
                        </div>
                        <div className="document-item-meta">{renderDocumentMeta(document)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
    }
  };

  return (
    <div className="expedition-modal-overlay" onClick={onClose}>
      <div className="expedition-modal" onClick={(event) => event.stopPropagation()}>
        <div className="expedition-modal-header">
          <div>
            <h2>Ekspedicijos detalės</h2>
            <p>
              {expedition.expedition_number ? `Ekspedicija ${expedition.expedition_number}` : 'Ekspedicija be numerio'} ·
              <span className="expedition-modal-status"> {expedition.status_display}</span>
            </p>
          </div>
          <div className="expedition-header-actions">
            <button
              type="button"
              className={`expedition-reorder-toggle${isReorderMode ? ' active' : ''}`}
              onClick={() => setIsReorderMode((prev) => !prev)}
            >
              {isReorderMode ? 'Baigti tvarkymą' : 'Keisti išdėstymą'}
            </button>
            {isReorderMode && (
              <button
                type="button"
                className="expedition-reorder-reset"
                onClick={handleResetLayout}
              >
                Atstatyti
              </button>
            )}
            <button type="button" className="expedition-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="expedition-modal-body">
          <div className="expedition-overview-grid">
            {overviewOrder.map((cardId, index) => renderOverviewCard(cardId, index))}
          </div>

          <div className="expedition-main-grid">
            {mainOrder.map((cardId, index) => renderMainCard(cardId, index))}
          </div>
        </div>

        <div className="expedition-modal-footer">
          <button type="button" className="expedition-modal-close-btn" onClick={onClose}>
            Uždaryti
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpeditionDetailsModal;
