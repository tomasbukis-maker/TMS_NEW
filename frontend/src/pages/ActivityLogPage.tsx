import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ActivityLogService, { ActivityLog, ActivityLogFilters } from '../services/activityLogService';

const ActivityLogPage: React.FC = () => {
  const { t } = useTranslation();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ActivityLogFilters>({
    page: 1,
    page_size: 50,
  });
  const [totalCount, setTotalCount] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [previousPage, setPreviousPage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({ type: 'info', message: '', visible: false });
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setToast({ type, message, visible: true });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), timeoutMs);
  }, []);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await ActivityLogService.getActivityLogs(filters);
      setActivityLogs(response.results);
      setTotalCount(response.count);
      setNextPage(response.next);
      setPreviousPage(response.previous);
    } catch (error: any) {
      showToast('error', 'Nepavyko užkrauti veiksmų istorijos');
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchActivityLogs();
  }, [fetchActivityLogs]);

  const handleFilterChange = (key: keyof ActivityLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filter changes
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({
      ...prev,
      page: newPage,
    }));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('lt-LT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionTypeColor = (actionType: string) => {
    if (actionType.includes('created')) return '#28a745';
    if (actionType.includes('updated')) return '#007bff';
    if (actionType.includes('deleted')) return '#dc3545';
    if (actionType.includes('payment')) return '#ffc107';
    return '#6c757d';
  };

  const getActionTypeIcon = (actionType: string) => {
    if (actionType.includes('order')) return '📦';
    if (actionType.includes('sales_invoice')) return '📄';
    if (actionType.includes('purchase_invoice')) return '📥';
    if (actionType.includes('payment')) return '💰';
    if (actionType.includes('partner')) return '🤝';
    return '📋';
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
          📋 Veiksmų istorija
        </h1>
        <p style={{ margin: '8px 0 0 0', color: '#666', fontSize: '14px' }}>
          Visų svarbių veiksmų sistemoje registravimas
        </p>
      </div>

      {/* Filtrai */}
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Objekto tipas
          </label>
          <select
            value={filters.content_type || ''}
            onChange={(e) => handleFilterChange('content_type', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          >
            <option value="">Visi objektai</option>
            <option value="order">Užsakymai</option>
            <option value="sales_invoice">Pardavimo sąskaitos</option>
            <option value="purchase_invoice">Pirkimo sąskaitos</option>
            <option value="partner">Partneriai</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Objekto ID
          </label>
          <input
            type="number"
            value={filters.object_id || ''}
            onChange={(e) => handleFilterChange('object_id', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="pvz., 123"
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Veiksmo tipas
          </label>
          <select
            value={filters.action_type || ''}
            onChange={(e) => handleFilterChange('action_type', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          >
            <option value="">Visi tipai</option>
            <option value="order_created">Užsakymas sukurtas</option>
            <option value="order_updated">Užsakymas atnaujintas</option>
            <option value="order_field_updated">Užsakymo laukas pakeistas</option>
            <option value="order_deleted">Užsakymas ištrintas</option>
            <option value="sales_invoice_created">Pardavimo sąskaita sukurta</option>
            <option value="sales_invoice_updated">Pardavimo sąskaita atnaujinta</option>
            <option value="sales_invoice_deleted">Pardavimo sąskaita ištrinta</option>
            <option value="purchase_invoice_created">Pirkimo sąskaita sukurta</option>
            <option value="purchase_invoice_updated">Pirkimo sąskaita atnaujinta</option>
            <option value="purchase_invoice_deleted">Pirkimo sąskaita ištrinta</option>
            <option value="payment_added">Mokėjimas pridėtas</option>
            <option value="payment_deleted">Mokėjimas ištrintas</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Data nuo
          </label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => handleFilterChange('date_from', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Data iki
          </label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => handleFilterChange('date_to', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#495057' }}>
            Paieška
          </label>
          <input
            type="text"
            placeholder="Ieškoti pagal aprašymą..."
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
        </div>
      </div>

      {/* Statistika */}
      <div style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
        Rasta įrašų: <strong>{totalCount}</strong>
      </div>

      {/* Sąrašas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Kraunama...
        </div>
      ) : activityLogs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#666',
        }}>
          Veiksmų istorijos įrašų nerasta
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {activityLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: '12px',
                  alignItems: 'start',
                }}
              >
                {/* Veiksmo tipas */}
                <div style={{
                  fontSize: '20px',
                  lineHeight: '1',
                }}>
                  {getActionTypeIcon(log.action_type)}
                </div>

                {/* Pagrindinė informacija */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: getActionTypeColor(log.action_type),
                      color: 'white',
                      fontWeight: '600',
                    }}>
                      {log.action_type_display}
                    </span>
                    {log.content_object_info && (
                      <span style={{
                        fontSize: '11px',
                        color: '#666',
                        backgroundColor: '#f0f0f0',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}>
                        {log.content_object_info.model}: {log.content_object_info.order_number || log.content_object_info.invoice_number || log.content_object_info.name || log.content_object_info.id}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#333',
                    marginBottom: '4px',
                  }}>
                    {log.description}
                  </div>

                  {/* Detalūs laukų pakeitimai */}
                  {log.metadata && log.action_type === 'order_field_updated' && log.metadata.old_display && log.metadata.new_display && (
                    <div style={{
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      padding: '8px',
                      marginBottom: '8px',
                    }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: '#495057',
                        marginBottom: '6px',
                      }}>
                        📝 Lauko pakeitimas: {log.metadata.field_display}
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '13px',
                      }}>
                        <div style={{
                          backgroundColor: '#fff3cd',
                          border: '1px solid #ffeaa7',
                          borderRadius: '3px',
                          padding: '6px 8px',
                          color: '#856404',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>BUVO:</div>
                          <div>{log.metadata.old_display}</div>
                        </div>
                        <div style={{
                          backgroundColor: '#d1ecf1',
                          border: '1px solid #bee5eb',
                          borderRadius: '3px',
                          padding: '6px 8px',
                          color: '#0c5460',
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>TAPO:</div>
                          <div>{log.metadata.new_display}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}>
                    <span>👤 {log.user_display}</span>
                    <span>🕒 {formatDate(log.created_at)}</span>
                    {log.ip_address && (
                      <span>🌐 {log.ip_address}</span>
                    )}
                  </div>
                </div>

                {/* Metadata (jei yra) */}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <div style={{
                    fontSize: '11px',
                    color: '#999',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {JSON.stringify(log.metadata).substring(0, 50)}...
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Puslapiavimas */}
          {(nextPage || previousPage) && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginTop: '20px',
            }}>
              <button
                onClick={() => handlePageChange((filters.page || 1) - 1)}
                disabled={!previousPage}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: previousPage ? '#fff' : '#f5f5f5',
                  color: previousPage ? '#333' : '#999',
                  cursor: previousPage ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                }}
              >
                ← Ankstesnis
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>
                Puslapis {filters.page || 1} iš {Math.ceil(totalCount / (filters.page_size || 50))}
              </span>
              <button
                onClick={() => handlePageChange((filters.page || 1) + 1)}
                disabled={!nextPage}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: nextPage ? '#fff' : '#f5f5f5',
                  color: nextPage ? '#333' : '#999',
                  cursor: nextPage ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                }}
              >
                Sekantis →
              </button>
            </div>
          )}
        </>
      )}

      {/* Toast notification */}
      {toast.visible && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 20px',
          backgroundColor: toast.type === 'error' ? '#dc3545' : toast.type === 'success' ? '#28a745' : '#007bff',
          color: 'white',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 10000,
          fontSize: '14px',
          fontWeight: '500',
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease-out',
        }}>
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default ActivityLogPage;
