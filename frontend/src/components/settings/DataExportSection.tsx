import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

type ExportType = 'orders' | 'sales-invoices' | 'purchase-invoices' | 'partners' | 'full-db';
type ExportFormat = 'xlsx' | 'csv' | 'sql';

interface ExportOption {
  value: ExportType;
  label: string;
  description: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { value: 'orders', label: 'Užsakymai', description: 'Visi užsakymai su maršrutais, vežėjais ir krovinių informacija.' },
  { value: 'sales-invoices', label: 'Pardavimo sąskaitos', description: 'Išrašytos sąskaitos su mokėjimo informacija.' },
  { value: 'purchase-invoices', label: 'Pirkimo sąskaitos', description: 'Gautos sąskaitos su tiekėjais ir susijusiais užsakymais.' },
  { value: 'partners', label: 'Partneriai', description: 'Klientų ir tiekėjų sąrašas su kontaktais.' },
  { value: 'full-db', label: 'Pilnas DB eksportas', description: 'Pilnas duomenų bazės eksportas (visos lentelės ir duomenys). Filtrai ir formatas netaikomi.' },
];

const endpointMap: Record<ExportType, string> = {
  orders: '/tools/export/orders/',
  'sales-invoices': '/tools/export/sales-invoices/',
  'purchase-invoices': '/tools/export/purchase-invoices/',
  partners: '/tools/export/partners/',
  'full-db': '/tools/export/full-db/',
};

const DataExportSection: React.FC = () => {
  const [exportType, setExportType] = useState<ExportType>('orders');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [includeDetails, setIncludeDetails] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetMessage = () => setMessage(null);

  useEffect(() => {
    if (exportType === 'full-db') {
      if (format !== 'sql') {
        setFormat('sql');
      }
      if (includeDetails) {
        setIncludeDetails(false);
      }
      if (dateFrom) {
        setDateFrom('');
      }
      if (dateTo) {
        setDateTo('');
      }
    } else if (format === 'sql') {
      setFormat('xlsx');
    }
  }, [exportType, format, includeDetails, dateFrom, dateTo]);

  const handleExport = async () => {
    resetMessage();

    if (exportType !== 'full-db' && dateFrom && dateTo && dateFrom > dateTo) {
      setMessage({ type: 'error', text: 'Data „Nuo“ negali būti vėlesnė už „Iki“.' });
      return;
    }

    const endpoint = endpointMap[exportType];
    setLoading(true);

    try {
      const params: Record<string, any> = {};
      if (exportType !== 'full-db') {
        params.format = format;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        if (includeDetails) params.include_details = 'true';
      }

      const response = await api.get(endpoint, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });

      let filename = '';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      if (!filename) {
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
          now.getDate()
        ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const defaultExtension = exportType === 'full-db' ? 'tar.gz' : format;
        filename = `${exportType}_${timestamp}.${defaultExtension}`;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Eksportas sėkmingai paruoštas. Failas atsisiųstas.' });
    } catch (error: any) {
      let errorMessage = 'Nepavyko atlikti eksporto.';
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          errorMessage = parsed?.error || parsed?.detail || errorMessage;
        } catch {
          errorMessage = error.message || errorMessage;
        }
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '16px', marginBottom: '10px' }}>Duomenų eksportavimas</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '18px' }}>
        Pasirinkite kokius sistemos duomenis norite eksportuoti. Eksportai pateikiami CSV, Excel arba pilno SQL dump
        formatu (atsarginėms kopijoms), priklausomai nuo pasirinkimo. Eksportas vykdomas realiu laiku, todėl
        priklausomai nuo duomenų apimties procesas gali užtrukti.
      </p>

      {message && (
        <div
          className={`message message-${message.type}`}
          style={{ marginBottom: '16px', padding: '10px 14px', fontSize: '13px' }}
        >
          {message.text}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>
            Ką eksportuoti
          </label>
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value as ExportType)}
            style={{ width: '100%', maxWidth: '320px', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
          >
            {EXPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '11px', color: '#777', marginTop: '6px' }}>
            {EXPORT_OPTIONS.find((option) => option.value === exportType)?.description}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>Data nuo</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={exportType === 'full-db'}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: exportType === 'full-db' ? '#f1f3f5' : undefined,
                cursor: exportType === 'full-db' ? 'not-allowed' : undefined,
              }}
            />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>Data iki</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={exportType === 'full-db'}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: exportType === 'full-db' ? '#f1f3f5' : undefined,
                cursor: exportType === 'full-db' ? 'not-allowed' : undefined,
              }}
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>Formatas</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              disabled={exportType === 'full-db'}
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              {exportType === 'full-db' ? (
                <option value="sql">Pilnas SQL dump (.sql.gz)</option>
              ) : (
                <>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </>
              )}
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={includeDetails}
            onChange={(e) => setIncludeDetails(e.target.checked)}
            disabled={exportType === 'full-db'}
          />
          Įtraukti detalizuotus duomenis (pvz., eilutes, papildomas sumas, ryšius su kitais įrašais)
        </label>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="button"
            onClick={handleExport}
            disabled={loading}
            style={{ backgroundColor: '#0d6efd', color: '#fff' }}
          >
            {loading ? 'Ruošiama...' : 'Eksportuoti'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setIncludeDetails(true);
              setFormat('xlsx');
              setExportType('orders');
              resetMessage();
            }}
          >
            Atstatyti
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataExportSection;


