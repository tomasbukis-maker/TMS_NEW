import React, { useState } from 'react';
import { api } from '../../services/api';

interface PaymentImportStats {
  total_rows: number;
  matched: number;
  updated: number;
  not_found: number;
  errors: number;
  details: Array<{
    row: number;
    invoice_number: string;
    invoice_id?: number;
    status: 'matched' | 'not_found' | 'error';
    message: string;
  }>;
}

const PaymentImportSection: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'purchase' | 'sales'>('purchase');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [limit, setLimit] = useState<string>('');
  const [fromEnd, setFromEnd] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    dry_run: boolean;
    invoice_type: string;
    stats: PaymentImportStats;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Pasirinkite CSV failą');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('invoice_type', activeSubTab);
      formData.append('dry_run', dryRun.toString());
      if (limit && limit.trim()) {
        const limitNum = parseInt(limit.trim(), 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          formData.append('limit', limitNum.toString());
        }
      }
      formData.append('from_end', fromEnd.toString());

      const response = await api.post('/tools/import/payments/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Klaida importuojant mokėjimus';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '16px', marginBottom: '6px' }}>Mokėjimų importavimas</h2>
      <p className="section-description" style={{ fontSize: '11px', marginBottom: '12px' }}>
        Importuokite mokėjimus iš CSV failo ir automatiškai pažymėkite apmokėtas sąskaitas.
      </p>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', borderBottom: '2px solid #dee2e6' }}>
        <button
          onClick={() => {
            setActiveSubTab('purchase');
            setResult(null);
            setError(null);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            backgroundColor: 'transparent',
            borderBottom: activeSubTab === 'purchase' ? '2px solid #dc3545' : '2px solid transparent',
            color: activeSubTab === 'purchase' ? '#dc3545' : '#666',
            cursor: 'pointer',
            fontWeight: activeSubTab === 'purchase' ? 'bold' : 'normal',
            marginBottom: '-2px'
          }}
        >
          Gautų sąskaitų apmokėjimai
        </button>
        <button
          onClick={() => {
            setActiveSubTab('sales');
            setResult(null);
            setError(null);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            border: 'none',
            backgroundColor: 'transparent',
            borderBottom: activeSubTab === 'sales' ? '2px solid #007bff' : '2px solid transparent',
            color: activeSubTab === 'sales' ? '#007bff' : '#666',
            cursor: 'pointer',
            fontWeight: activeSubTab === 'sales' ? 'bold' : 'normal',
            marginBottom: '-2px'
          }}
        >
          Išrašytų sąskaitų apmokėjimai
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: '600' }}>
            CSV failas:
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{
              padding: '6px',
              fontSize: '12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              width: '100%',
              maxWidth: '400px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <span>Dry-run (tik peržiūra, nekeisti duomenų)</span>
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: '600' }}>
            Limit (kiek eilučių importuoti, palikite tuščią, kad importuoti visą failą):
          </label>
          <input
            type="number"
            min="1"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="Pvz., 100"
            style={{
              padding: '6px',
              fontSize: '12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              width: '150px',
              marginBottom: '8px'
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={fromEnd}
              onChange={(e) => setFromEnd(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <span>Importuoti nuo galo (paskutines N eilučių)</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            backgroundColor: activeSubTab === 'purchase' ? '#dc3545' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: (!file || loading) ? 'not-allowed' : 'pointer',
            opacity: (!file || loading) ? 0.6 : 1
          }}
        >
          {loading ? 'Importuojama...' : 'Importuoti mokėjimus'}
        </button>
      </form>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee',
          color: '#c33',
          borderRadius: '4px',
          marginBottom: '15px',
          fontSize: '12px'
        }}>
          <strong>Klaida:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          <h3 style={{ fontSize: '14px', marginBottom: '10px', fontWeight: 'bold' }}>
            {result.dry_run ? 'Peržiūros rezultatai (dry-run)' : 'Importavimo rezultatai'}
          </h3>
          
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <div>
                <strong>Viso eilučių:</strong> {result.stats.total_rows}
              </div>
              <div style={{ color: '#28a745' }}>
                <strong>Rasta:</strong> {result.stats.matched}
              </div>
              <div style={{ color: result.dry_run ? '#666' : '#28a745' }}>
                <strong>{result.dry_run ? 'Būtų atnaujinta:' : 'Atnaujinta:'}</strong> {result.stats.updated}
              </div>
              <div style={{ color: '#dc3545' }}>
                <strong>Nerasta:</strong> {result.stats.not_found}
              </div>
              {result.stats.errors > 0 && (
                <div style={{ color: '#dc3545' }}>
                  <strong>Klaidos:</strong> {result.stats.errors}
                </div>
              )}
            </div>
          </div>

          {result.stats.details.length > 0 && (
            <div style={{ marginTop: '15px' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '8px', fontWeight: 'bold' }}>
                Detalūs rezultatai (pirmos 50):
              </h4>
              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                padding: '8px'
              }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Eilutė</th>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Sąskaitos Nr.</th>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Statusas</th>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Pranešimas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stats.details.slice(0, 50).map((detail, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '6px' }}>{detail.row}</td>
                        <td style={{ padding: '6px' }}>{detail.invoice_number}</td>
                        <td style={{ padding: '6px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            backgroundColor:
                              detail.status === 'matched' ? '#d4edda' :
                              detail.status === 'not_found' ? '#fff3cd' :
                              '#f8d7da',
                            color:
                              detail.status === 'matched' ? '#155724' :
                              detail.status === 'not_found' ? '#856404' :
                              '#721c24'
                          }}>
                            {detail.status === 'matched' ? 'Rasta' :
                             detail.status === 'not_found' ? 'Nerasta' :
                             'Klaida'}
                          </span>
                        </td>
                        <td style={{ padding: '6px' }}>{detail.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.stats.details.length > 50 && (
                  <div style={{ marginTop: '8px', fontSize: '10px', color: '#666' }}>
                    ... ir dar {result.stats.details.length - 50} eilučių
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentImportSection;

