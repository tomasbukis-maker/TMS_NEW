import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import './BankImportPage.css';

interface ImportResult {
  total_transactions?: number;
  matched_count?: number;
  unmatched_count?: number;
  results?: Array<{
    date: string;
    amount: string;
    description: string;
    matched: boolean;
    invoice_number?: string;
  }>;
  success?: boolean;
  error?: string;
}

const BankImportPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({ type: 'info', message: '', visible: false });
  const toastTimeoutRef = useRef<number | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setToast({ type, message, visible: true });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), timeoutMs);
  };
  
  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/invoices/bank/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setResult(response.data);
      showToast('success', 'Banko išrašas sėkmingai importuotas');
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida importuojant failą');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        {toast.visible && (
          <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', zIndex:2000, backgroundColor: toast.type==='success' ? '#28a745' : toast.type==='error' ? '#dc3545' : '#17a2b8', color:'#fff', padding:'12px 18px', borderRadius:8, boxShadow:'0 6px 20px rgba(0,0,0,0.25)', maxWidth:'90%', textAlign:'center' }}>
            {toast.message}
          </div>
        )}
        
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="file">Pasirinkite CSV failą</label>
              <input
                type="file"
                id="file"
                accept=".csv"
                onChange={handleFileChange}
                required
              />
            </div>
            <button type="submit" className="button" disabled={loading || !file}>
              {loading ? 'Apdorojama...' : 'Importuoti'}
            </button>
          </form>
        </div>

        {result && (
          <div className="card">
            <h2>Rezultatai</h2>
            <p><strong>Iš viso operacijų:</strong> {result.total_transactions}</p>
            <p><strong>Suderinta:</strong> {result.matched_count}</p>
            <p><strong>Nesuderinta:</strong> {result.unmatched_count}</p>

            {result.results && result.results.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Suma</th>
                    <th>Aprašymas</th>
                    <th>Statusas</th>
                    <th>Sąskaita</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((item: any, index: number) => (
                    <tr key={index}>
                      <td>{item.date}</td>
                      <td>{item.amount}</td>
                      <td>{item.description}</td>
                      <td>
                        <span className={`badge ${item.matched ? 'badge-success' : 'badge-warning'}`}>
                          {item.matched ? 'Suderinta' : 'Nesuderinta'}
                        </span>
                      </td>
                      <td>{item.invoice_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BankImportPage;

