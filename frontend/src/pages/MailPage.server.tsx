import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import lt from 'date-fns/locale/lt';
import './MailPage.css';
import { api } from '../services/api';

interface MailAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  file: string;
  download_url?: string;
}

interface MailTag {
  id: number;
  name: string;
  color: string;
}

interface MailMessage {
  id: number;
  subject: string;
  sender: string;
  recipients: string;
  cc: string;
  bcc: string;
  date: string;
  folder: string;
  status: 'new' | 'linked' | 'ignored' | 'task';
  snippet: string;
  body_plain: string;
  body_html: string;
  attachments: MailAttachment[];
  tags: {
    id: number;
    tag: MailTag;
  }[];
}

interface MailSyncState {
  id: number;
  folder: string;
  last_synced_at: string | null;
  last_uid: string;
  status: string;
  message: string;
}

const PAGE_SIZE = 20;

const MailPage: React.FC = () => {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<MailSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | MailMessage['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchSyncState = useCallback(async () => {
    try {
      const response = await api.get('/mail/sync-state/', { params: { folder: 'INBOX' } });
      if (Array.isArray(response.data) && response.data.length > 0) {
        setSyncState(response.data[0]);
      } else if (response.data?.results?.length) {
        setSyncState(response.data.results[0]);
      } else {
        setSyncState(null);
      }
    } catch (err: any) {
      console.warn('Nepavyko gauti sinchronizacijos būsenos', err);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        page_size: PAGE_SIZE,
        ordering: '-date',
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      const response = await api.get('/mail/messages/', { params });
      if (response.data?.results) {
        setMessages(response.data.results);
        setTotalCount(response.data.count || response.data.results.length);
      } else if (Array.isArray(response.data)) {
        setMessages(response.data);
        setTotalCount(response.data.length);
      } else {
        setMessages([]);
        setTotalCount(0);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Nepavyko užkrauti laiškų');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, searchQuery]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    fetchSyncState();
  }, [fetchSyncState]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await api.post('/mail/messages/sync/', { limit: 50 });
      if (response.data?.status !== 'ok') {
        const message = response.data?.message || 'Sinchronizacijos klaida';
        setError(message);
      }
      await fetchSyncState();
      await fetchMessages();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Sinchronizacijos klaida');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = useCallback((value: string) => {
    try {
      return format(new Date(value), 'yyyy-MM-dd HH:mm', { locale: lt });
    } catch {
      return value;
    }
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  const renderedBody = useMemo(() => {
    if (!selectedMessage) return null;
    if (selectedMessage.body_html) {
      return (
        <div
          className="mail-body mail-body-html"
          dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
        />
      );
    }
    if (selectedMessage.body_plain) {
      return <pre className="mail-body mail-body-plain">{selectedMessage.body_plain}</pre>;
    }
    return <div className="mail-body mail-body-empty">Laiško turinys nerastas.</div>;
  }, [selectedMessage]);

  return (
    <div className="page mail-page">
      <div className="container">
        <div className="mail-strip">
          <div className="mail-strip-actions">
            <button
              className="mail-strip-button"
              onClick={handleSync}
              disabled={syncing}
              title="Sinchronizuoja naujus laiškus iš IMAP serverio"
            >
              {syncing ? 'Sinchronizuojama...' : 'Sinchronizuoti dabar'}
            </button>
          </div>

          <div className="mail-strip-status">
            <span className={`mail-strip-dot ${syncState?.status === 'error' ? 'error' : 'success'}`} />
            <span className="mail-strip-title">
              {syncState?.status === 'error' ? 'Sinchronizacijos klaida' : 'Sinchronizacija pasirengusi'}
            </span>
          </div>

          <div className="mail-strip-meta">
            <div className="mail-strip-item">
              <span className="label">Paskutinį kartą:</span>
              <span>{syncState?.last_synced_at ? formatDate(syncState.last_synced_at) : 'Dar nevykdyta'}</span>
            </div>
            <div className="mail-strip-item">
              <span className="label">Aplankas:</span>
              <span>{syncState?.folder || 'INBOX'}</span>
            </div>
            {syncState?.message && (
              <div className="mail-strip-item message">{syncState.message}</div>
            )}
          </div>
        </div>

        {error && <div className="mail-strip-error">{error}</div>}

        <div className="mail-layout">
          <div className="mail-list-panel">
            <div className="mail-filters">
              <div className="mail-filter-group">
                <span className="label">Būsena:</span>
                <button
                  className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  Visi
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'new' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('new')}
                >
                  Nauji
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'linked' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('linked')}
                >
                  Susieti
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'task' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('task')}
                >
                  Užduotys
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'ignored' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ignored')}
                >
                  Ignoruoti
                </button>
              </div>
              <div className="mail-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Paieška pagal temą, siuntėją..."
                />
                {searchQuery && (
                  <button className="clear-btn" onClick={() => setSearchQuery('')}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="mail-list">
              {loading ? (
                <div className="mail-empty">Kraunama...</div>
              ) : messages.length === 0 ? (
                <div className="mail-empty">Laiškų nerasta.</div>
              ) : (
                messages.map((message) => {
                  const isSelected = selectedMessage?.id === message.id;
                  return (
                    <div
                      key={message.id}
                      className={`mail-list-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedMessage(message)}
                    >
                      <div className="mail-item-header">
                        <div className="mail-item-subject">{message.subject || '(Be temos)'}</div>
                        <div className="mail-item-date">{formatDate(message.date)}</div>
                      </div>
                      <div className="mail-item-meta">
                        <span className="mail-item-sender">{message.sender}</span>
                        <span className={`mail-item-status status-${message.status}`}>{message.status}</span>
                      </div>
                      <div className="mail-item-snippet">{message.snippet || '...'}</div>
                    </div>
                  );
                })
              )}
            </div>

            {totalPages > 1 && (
              <div className="mail-pagination">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  ← Ankstesnis
                </button>
                <span>
                  Puslapis {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Sekantis →
                </button>
              </div>
            )}
          </div>

          <div className="mail-details-panel">
            {selectedMessage ? (
              <div className="mail-details">
                <header className="mail-details-header">
                  <h2>{selectedMessage.subject || '(Be temos)'}</h2>
                  <div className="mail-details-meta">
                    <div>
                      <span className="label">Siuntėjas:</span> {selectedMessage.sender}
                    </div>
                    <div>
                      <span className="label">Gauta:</span> {formatDate(selectedMessage.date)}
                    </div>
                    {selectedMessage.recipients && (
                      <div>
                        <span className="label">Gavėjai:</span> {selectedMessage.recipients}
                      </div>
                    )}
                    {selectedMessage.cc && (
                      <div>
                        <span className="label">Kopija:</span> {selectedMessage.cc}
                      </div>
                    )}
                  </div>
                  <div className="mail-details-badges">
                    <span className={`status-badge status-${selectedMessage.status}`}>
                      {selectedMessage.status.toUpperCase()}
                    </span>
                    {selectedMessage.tags.map((tagRelation) => (
                      <span
                        key={tagRelation.id}
                        className="mail-tag"
                        style={{ backgroundColor: tagRelation.tag.color || '#6b7280' }}
                      >
                        {tagRelation.tag.name}
                      </span>
                    ))}
                  </div>
                </header>

                <section className="mail-details-body">{renderedBody}</section>

                {selectedMessage.attachments?.length > 0 && (
                  <section className="mail-attachments">
                    <h3>Priedai</h3>
                    <ul>
                      {selectedMessage.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <a
                            href={attachment.download_url || attachment.file}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📎 {attachment.filename}{' '}
                            <span className="attachment-size">
                              ({Math.round(attachment.size / 1024)} KB)
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <div className="mail-placeholder">Pasirinkite laišką iš sąrašo, kad pamatytumėte detales.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MailPage;

