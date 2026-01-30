import React, { useState } from 'react';
import { api } from '../../services/api';

interface ImportStats {
  [key: string]: string | number;
}

interface ImportResult {
  success: boolean;
  applied: boolean;
  skip_existing: boolean;
  stats?: ImportStats;
  stdout?: string;
  warnings?: string;
}

interface DeleteResult {
  success: boolean;
  dry_run: boolean;
  stats?: ImportStats;
  message?: string;
}

const DataImportSection_NEW: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [skipExisting, setSkipExisting] = useState<boolean>(true);
  const [limit, setLimit] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [deleteDryRun, setDeleteDryRun] = useState<boolean>(true);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null);
  const [deleteAllInvoices, setDeleteAllInvoices] = useState<boolean>(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState<boolean>(false);

  const resetState = () => {
    setMessage(null);
    setResult(null);
    setDeleteMessage(null);
    setDeleteResult(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      resetState();
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetState();

    if (!file) {
      setMessage({ type: 'error', text: 'Pasirinkite CSV failą importui.' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('apply', (!dryRun).toString());
    formData.append('skip_existing', skipExisting.toString());
    if (limit && limit.trim()) {
      const limitNum = parseInt(limit.trim(), 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        formData.append('limit', limitNum.toString());
      }
    }

    setLoading(true);

    try {
      const response = await api.post('/tools/import/infotrans-orders/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 120 sekundžių (2 minutės) timeout importui
      });

      const data: ImportResult = response.data;
      setResult(data);
      if (data.success) {
        setMessage({
          type: 'success',
          text: data.applied
            ? 'Importas sėkmingai užbaigtas. Duomenys įrašyti į sistemą.'
            : 'Peržiūra (dry-run) atlikta. Duomenys sistemoje nepakeisti.',
        });
      } else {
        setMessage({ type: 'error', text: 'Importo atsakas be sėkmės indikatoriaus. Patikrinkite žurnalus.' });
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.details ||
        error.message ||
        'Nepavyko importuoti duomenų.';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setDryRun(true);
    setSkipExisting(true);
    setLimit('');
    setResult(null);
    setMessage(null);
    setDeleteDryRun(true);
    setDeleteResult(null);
    setDeleteMessage(null);
  };

  const handleDelete = async () => {
    setDeleteMessage(null);
    setDeleteResult(null);

    if (!file) {
      setDeleteMessage({ type: 'error', text: 'Pasirinkite CSV failą trynimui.' });
      return;
    }

    if (!deleteDryRun) {
      const confirmed = window.confirm(
        'Ar tikrai norite ištrinti visus CSV faile nurodytus užsakymus ir jų sąskaitas? Veiksmas negrįžtamas.'
      );
      if (!confirmed) {
        return;
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('dry_run', deleteDryRun.toString());

    setDeleteLoading(true);

    try {
      const response = await api.post('/tools/import/infotrans-orders/delete/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000, // 120 sekundžių (2 minutės) timeout pašalinimui
      });

      const data: DeleteResult = response.data;
      setDeleteResult(data);
      setDeleteMessage({
        type: 'success',
        text: data.dry_run
          ? 'Peržiūra (dry-run) atlikta. Duomenys nebuvo ištrinti.'
          : 'Nurodyti įrašai sėkmingai pašalinti.',
      });
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.details ||
        error.response?.data?.message ||
        error.message ||
        `Nepavyko pašalinti duomenų. Status: ${error.response?.status || 'unknown'}`;
      setDeleteMessage({ type: 'error', text: errorMessage });
      if (error.response?.data) {
        console.error('Error response data:', error.response.data);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderStats = (stats?: ImportStats, heading = 'Importo statistika') => {
    if (!stats || Object.keys(stats).length === 0) {
      return null;
    }

    return (
      <div className="import-stats" style={{ marginTop: '16px' }}>
        <h4 style={{ fontSize: '13px', marginBottom: '10px' }}>{heading}</h4>
        <ul style={{ listStyle: 'disc', paddingLeft: '18px', fontSize: '12px', color: '#374151' }}>
          {Object.entries(stats).map(([key, value]) => (
            <li key={key} style={{ marginBottom: '4px' }}>
              <strong>{key}</strong>: {value}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderOutput = (stdout?: string, warnings?: string, title = 'Importo žurnalas') => {
    if (!stdout && !warnings) {
      return null;
    }

    return (
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {stdout && (
          <div>
            <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>{title}</h4>
            <pre
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                background: '#f8f9fa',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                color: '#1f2937',
                whiteSpace: 'pre-wrap',
              }}
            >
              {stdout}
            </pre>
          </div>
        )}
        {warnings && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: '#fff7ed',
              border: '1px solid #fdba74',
              fontSize: '12px',
              color: '#9a3412',
            }}
          >
            {warnings}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '16px', marginBottom: '10px' }}>Duomenų importas (Infotrans)</h2>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '18px' }}>
        Įkelkite „infotrans_uzsakymai_enriched.csv“ failą, kad atnaujintumėte istorinius užsakymus. Galite pradėti nuo
        „tik peržiūra“ režimo, kad patikrintumėte statistiką prieš galutinį importą.
      </p>

      {message && (
        <div
          className={`message message-${message.type}`}
          style={{ marginBottom: '16px', padding: '10px 14px', fontSize: '13px' }}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>CSV failas</label>
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ fontSize: '13px' }} />
          {file && <span style={{ fontSize: '12px', color: '#4b5563' }}>Pasirinkta: {file.name}</span>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => {
                setDryRun(event.target.checked);
                setResult(null);
              }}
            />
            Tik peržiūra (dry-run, neįrašo į DB)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(event) => {
                setSkipExisting(event.target.checked);
                setResult(null);
              }}
            />
            Praleisti jau egzistuojančius užsakymus
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>
            Maksimalus importuojamų eilučių skaičius (testavimui)
          </label>
          <input
            type="number"
            min="1"
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
              setResult(null);
            }}
            placeholder="Palikite tuščią, kad importuoti visą failą"
            style={{ fontSize: '13px', padding: '6px 8px', border: '1px solid #ccc', borderRadius: '4px', maxWidth: '200px' }}
          />
          <small style={{ fontSize: '11px', color: '#666' }}>
            Nurodykite skaičių, jei norite importuoti tik pirmas N eilučių (pvz., 10). Palikite tuščią, kad importuoti visą failą.
          </small>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="button"
            disabled={loading}
            style={{ backgroundColor: '#0d6efd', color: '#fff' }}
          >
            {loading ? 'Importuojama…' : dryRun ? 'Peržiūra (dry-run)' : 'Importuoti duomenis'}
          </button>
          <button type="button" className="button button-secondary" onClick={handleReset} disabled={loading}>
            Atstatyti
          </button>
        </div>

        {renderStats(result?.stats)}
        {renderOutput(result?.stdout, result?.warnings)}
      </form>

      {deleteMessage && (
        <div
          className={`message message-${deleteMessage.type}`}
          style={{ marginTop: '20px', marginBottom: '16px', padding: '10px 14px', fontSize: '13px' }}
        >
          {deleteMessage.text}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        <div>
          <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Pašalinti importuotus duomenis</h3>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>
            Naudokite tą patį „infotrans_uzsakymai_enriched.csv“ failą, kad peržiūrėtumėte arba pašalintumėte importuotus
            užsakymus, pardavimo ir pirkimo sąskaitas. Dry-run režimas neriboja duomenų, tik pateikia statistiką.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={deleteDryRun}
              onChange={(event) => {
                setDeleteDryRun(event.target.checked);
                setDeleteResult(null);
              }}
            />
            Tik peržiūra (dry-run, nepašalina įrašų)
          </label>
        </div>

        <div style={{ fontSize: '12px', color: '#4b5563' }}>
          {file ? (
            <>
              Failas: <strong>{file.name}</strong>
            </>
          ) : (
            'Failas nepasirinktas. Naudokite aukščiau esantį įkėlimo lauką.'
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button"
            onClick={handleDelete}
            disabled={deleteLoading || deleteAllLoading}
            style={{ backgroundColor: deleteDryRun ? '#0d6efd' : '#dc3545', color: '#fff' }}
          >
            {deleteLoading ? 'Šalinama…' : deleteDryRun ? 'Peržiūra (dry-run)' : 'Ištrinti duomenis'}
          </button>
        </div>

        {deleteMessage && (
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: deleteMessage.type === 'success' ? '#d1f2eb' : '#f8d7da',
              color: deleteMessage.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${deleteMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
              fontSize: '13px',
            }}
          >
            {deleteMessage.text}
          </div>
        )}
        {renderStats(deleteResult?.stats, 'Šalinimo statistika')}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px', border: '2px solid #dc3545' }}>
        <div>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#dc3545' }}>⚠️ IŠTRINTI VISAS SĄSKAITAS</h3>
          <p style={{ fontSize: '12px', color: '#6b7280' }}>
            Ištrins VISAS pardavimo (išrašytas) ir pirkimo (gautas) sąskaitas. Veiksmas negrįžtamas!
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={deleteAllInvoices}
              onChange={(event) => {
                setDeleteAllInvoices(event.target.checked);
                setDeleteResult(null);
              }}
            />
            Suprantu, kad tai ištrins VISAS sąskaitas
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button"
            onClick={async () => {
              if (!deleteAllInvoices) {
                setDeleteMessage({ type: 'error', text: 'Prašome patvirtinti, kad suprantate veiksmą.' });
                return;
              }

              if (!window.confirm('Ar tikrai norite ištrinti VISAS sąskaitas? Veiksmas negrįžtamas!')) {
                return;
              }

              setDeleteAllLoading(true);
              setDeleteMessage(null);
              setDeleteResult(null);

              try {
                const formData = new FormData();
                formData.append('delete_all', 'true');
                formData.append('dry_run', 'false');

                const response = await api.post('/tools/import/infotrans-orders/delete/', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                  timeout: 120000,
                });

                const data: DeleteResult = response.data;
                setDeleteResult(data);
                if (data.stats) {
                  const salesCount = data.stats.deleted_sales || 0;
                  const purchaseCount = data.stats.deleted_purchase || 0;
                  setDeleteMessage({
                    type: 'success',
                    text: data.message || `Ištrinta ${salesCount} pardavimo ir ${purchaseCount} pirkimo sąskaitų.`,
                  });
                } else {
                  setDeleteMessage({
                    type: 'success',
                    text: data.message || 'Visos sąskaitos sėkmingai pašalintos.',
                  });
                }
                setDeleteAllInvoices(false);
              } catch (error: any) {
                console.error('Delete all error:', error);
                const errorMessage =
                  error.response?.data?.error ||
                  error.response?.data?.details ||
                  error.response?.data?.message ||
                  error.message ||
                  'Nepavyko pašalinti sąskaitų.';
                setDeleteMessage({ type: 'error', text: errorMessage });
              } finally {
                setDeleteAllLoading(false);
              }
            }}
            disabled={deleteAllLoading || deleteLoading || !deleteAllInvoices}
            style={{ 
              backgroundColor: deleteAllInvoices ? '#dc3545' : '#6c757d', 
              color: '#fff',
              fontWeight: 'bold'
            }}
          >
            {deleteAllLoading ? 'Šalinama…' : 'IŠTRINTI VISAS SĄSKAITAS'}
          </button>
        </div>

        {deleteResult && deleteAllInvoices && renderStats(deleteResult?.stats, 'Ištrintų sąskaitų statistika')}
      </div>
    </div>
  );
};

export default DataImportSection_NEW;

