import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import './AppsasPage.css';

interface SenderFromMessage {
  email: string;
  suggested_name: string;
}

interface Partner {
  id: number;
  name: string;
  code: string;
  is_client?: boolean;
}

const AppsasPage: React.FC = () => {
  const [senders, setSenders] = useState<SenderFromMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerResults, setPartnerResults] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentSender = senders[currentIndex] ?? null;

  const loadSenders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/mail/messages/senders-from-messages/');
      setSenders(Array.isArray(res.data) ? res.data : []);
      setCurrentIndex(0);
    } catch (e) {
      setSenders([]);
      setMessage({ type: 'error', text: 'Nepavyko užkrauti siuntėjų sąrašo.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSenders();
  }, [loadSenders]);

  // Kai keičiasi dabartinis siuntėjas – užpildyti vardą iš suggested_name ir išvalyti pasirinkimą
  useEffect(() => {
    if (!currentSender) {
      setFirstName('');
      setLastName('');
      setSelectedPartner(null);
      setPartnerSearch('');
      setPartnerResults([]);
      return;
    }
    const name = (currentSender.suggested_name || '').trim();
    if (name) {
      const parts = name.split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    } else {
      setFirstName('');
      setLastName('');
    }
    setSelectedPartner(null);
    setPartnerSearch('');
    setPartnerResults([]);
  }, [currentSender]);

  const searchPartners = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPartnerResults([]);
      return;
    }
    try {
      const res = await api.get('/partners/partners/', {
        params: { search: query.trim(), page_size: 20, include_code_errors: 1 }
      });
      const list = res.data.results ?? res.data ?? [];
      setPartnerResults(Array.isArray(list) ? list : []);
    } catch {
      setPartnerResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPartners(partnerSearch), 300);
    return () => clearTimeout(t);
  }, [partnerSearch, searchPartners]);

  const handleAddToClient = async () => {
    if (!currentSender || !selectedPartner) {
      setMessage({ type: 'error', text: 'Pasirinkite klientą (partnerį).' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      await api.post('/partners/contacts/', {
        partner_id: selectedPartner.id,
        email: currentSender.email,
        first_name: firstName.trim(),
        last_name: lastName.trim()
      });
      setMessage({ type: 'success', text: `Kontaktas pridėtas prie ${selectedPartner.name}.` });
      setSelectedPartner(null);
      setPartnerSearch('');
      setPartnerResults([]);
      setSenders(prev => prev.filter((_, i) => i !== currentIndex));
      setCurrentIndex(i => Math.min(i, Math.max(0, senders.length - 2)));
    } catch (err: any) {
      const msg = err.response?.data?.email?.[0] ?? err.response?.data?.detail ?? err.message ?? 'Nepavyko pridėti kontakto.';
      setMessage({ type: 'error', text: String(msg) });
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="appsas-page">
        <div className="appsas-header">
          <h1>Appsas</h1>
        </div>
        <div className="appsas-loading">Kraunama...</div>
      </div>
    );
  }

  return (
    <div className="appsas-page">
      <div className="appsas-header">
        <h1>Appsas</h1>
        <p className="appsas-subtitle">
          Siuntėjai iš gautų ir priskirtų laiškų – galite redaguoti vardą/pavardę ir pridėti kontaktą prie kliento.
        </p>
      </div>

      {message && (
        <div className={`appsas-message appsas-message--${message.type}`}>
          {message.text}
        </div>
      )}

      {senders.length === 0 ? (
        <div className="appsas-empty">
          Nėra siuntėjų iš gautų/priskirtų laiškų arba visi jau apdoroti.
        </div>
      ) : (
        <div className="appsas-content">
          <div className="appsas-sender-card">
            <div className="appsas-sender-count">
              Siuntėjas {currentIndex + 1} iš {senders.length}
            </div>
            <div className="appsas-field">
              <label>El. paštas</label>
              <div className="appsas-email">{currentSender?.email}</div>
            </div>
            <div className="appsas-field">
              <label>Vardas</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Vardas"
                className="appsas-input"
              />
            </div>
            <div className="appsas-field">
              <label>Pavardė</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Pavardė"
                className="appsas-input"
              />
            </div>
          </div>

          <div className="appsas-client-section">
            <div className="appsas-field">
              <label>Kliento paieška</label>
              <input
                type="text"
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
                placeholder="Įveskite kliento pavadinimą arba kodą..."
                className="appsas-input"
              />
            </div>
            {partnerResults.length > 0 && (
              <ul className="appsas-partner-list">
                {partnerResults.map(p => (
                  <li
                    key={p.id}
                    className={`appsas-partner-item ${selectedPartner?.id === p.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedPartner(p);
                      setPartnerSearch(p.name);
                      setPartnerResults([]);
                    }}
                  >
                    <span className="appsas-partner-name">{p.name}</span>
                    {p.code && <span className="appsas-partner-code">{p.code}</span>}
                  </li>
                ))}
              </ul>
            )}
            {selectedPartner && (
              <div className="appsas-selected">
                Pasirinktas klientas: <strong>{selectedPartner.name}</strong>
                <button
                  type="button"
                  className="appsas-clear-partner"
                  onClick={() => {
                    setSelectedPartner(null);
                    setPartnerSearch('');
                  }}
                >
                  Išvalyti
                </button>
              </div>
            )}
            <button
              type="button"
              className="appsas-add-btn"
              onClick={handleAddToClient}
              disabled={adding || !selectedPartner}
            >
              {adding ? 'Pridedama...' : 'Pridėti prie kliento'}
            </button>
          </div>
        </div>
      )}

      {senders.length > 1 && (
        <div className="appsas-nav">
          <button
            type="button"
            className="appsas-nav-btn"
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            ← Ankstesnis
          </button>
          <span className="appsas-nav-info">
            {currentIndex + 1} / {senders.length}
          </span>
          <button
            type="button"
            className="appsas-nav-btn"
            onClick={() => setCurrentIndex(i => Math.min(senders.length - 1, i + 1))}
            disabled={currentIndex === senders.length - 1}
          >
            Kitas →
          </button>
        </div>
      )}
    </div>
  );
};

export default AppsasPage;
