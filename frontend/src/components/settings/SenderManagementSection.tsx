import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';

interface MailSenderRecord {
  id: number;
  email: string;
  name: string; // Sudėtinis laukas iš first_name + last_name
  first_name: string;
  last_name: string;
  is_trusted: boolean;
  is_advertising: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  email: '',
  name: '',
  is_trusted: false,
  is_advertising: false,
};

// Funkcija automatiškai sugeneruoti label iš email
const generateLabelFromEmail = (email: string): string => {
  if (!email || !email.includes('@')) return '';

  const [localPart, domain] = email.split('@');

  // Iš domeno padaryti įmonės pavadinimą (pirmoji raidė didžioji)
  const companyName = domain.split('.')[0];
  const companyFormatted = companyName.charAt(0).toUpperCase() + companyName.slice(1);

  // Iš localPart padaryti vardo formatą
  const nameParts = localPart.split('.').reverse(); // justina.podvornaja -> ['podvornaja', 'justina']
  const formattedName = nameParts.map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join(', '); // ['Podvornaja', 'Justina'] -> 'Podvornaja, Justina'

  return `${companyFormatted} | ${formattedName}`;
};

const SenderManagementSection: React.FC = () => {
  const [senders, setSenders] = useState<MailSenderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'trusted' | 'advertising' | 'other'>('trusted');

  const fetchSenders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/partners/contacts/', { params: { page_size: 200 } });
      const payload = Array.isArray(response.data) ? response.data : response.data?.results || [];
      setSenders(payload);
    } catch (err: any) {
      console.error('Nepavyko užkrauti siuntėjų sąrašo', err);
      setError('Nepavyko užkrauti siuntėjų sąrašo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  const handleClassification = useCallback(
    async (sender: MailSenderRecord, action: 'trust' | 'advertising') => {

      setActionLoading((prev) => ({ ...prev, [sender.id]: true }));
      setError(null);
      try {
        await api.post(`/partners/contacts/${sender.id}/${action}/`);
        await fetchSenders();
        setMessage({
          type: 'success',
          text: `Siuntėjas sėkmingai atnaujintas. Perkraukite pašto puslapį, kad pamatytumėte pakeitimus.`
        });
        setTimeout(() => setMessage(null), 8000);
      } catch (err: any) {
        console.error('Nepavyko atnaujinti siuntėjo statuso:', err);
        setError('Nepavyko atnaujinti siuntėjo statuso');
      } finally {
        setActionLoading((prev) => {
          const { [sender.id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [fetchSenders]
  );

  const handleFormSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!form.email.trim()) {
        return;
      }
      setSaving(true);
      setError(null);
      try {
        if (selectedSenderId) {
          await api.put(`/partners/contacts/${selectedSenderId}/`, {
            email: form.email.trim(),
            first_name: form.name.trim(),
            last_name: '',
            is_trusted: form.is_trusted,
            is_advertising: form.is_advertising,
          });
        } else {
          await api.post('/partners/contacts/', {
            email: form.email.trim(),
            first_name: form.name.trim(),
            last_name: '',
            is_trusted: form.is_trusted,
            is_advertising: form.is_advertising,
          });
        }
        setForm(EMPTY_FORM);
        setSelectedSenderId(null);
        await fetchSenders();
      } catch (err: any) {
        console.error('Nepavyko išsaugoti siuntėjo:', err);
        setError(err.response?.data?.detail || 'Nepavyko išsaugoti siuntėjo');
      } finally {
        setSaving(false);
      }
    },
    [form, fetchSenders, selectedSenderId]
  );

  const handleEditSender = useCallback((sender: MailSenderRecord) => {
    setForm({
      email: sender.email,
      name: sender.name,
      is_trusted: sender.is_trusted,
      is_advertising: sender.is_advertising,
    });
    setSelectedSenderId(sender.id);
  }, []);

  const handleDeleteSender = useCallback(
    async (sender: MailSenderRecord) => {
      console.log('Starting delete for sender:', sender.id, sender.email);
      setActionLoading((prev) => ({ ...prev, [sender.id]: true }));
      setError(null);
      try {
        console.log('Sending DELETE request to:', `/partners/contacts/${sender.id}/`);
        const response = await api.delete(`/partners/contacts/${sender.id}/`);
        console.log('DELETE response:', response);
        if (selectedSenderId === sender.id) {
          setSelectedSenderId(null);
          setForm(EMPTY_FORM);
        }
        await fetchSenders();
        setMessage({
          type: 'success',
          text: `Siuntėjas ištrintas. Perkraukite pašto puslapį, kad pakeitimai įsigaliotų.`
        });
        setTimeout(() => setMessage(null), 8000);
        console.log('Sender deleted successfully');
      } catch (err: any) {
        console.error('Nepavyko ištrinti siuntėjo:', err);
        console.error('Error details:', err.response?.data, err.response?.status);
        setError('Nepavyko ištrinti siuntėjo');
      } finally {
        setActionLoading((prev) => {
          const { [sender.id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [fetchSenders, selectedSenderId]
  );

  const filteredSenders = senders.filter((sender) => {
    if (activeTab === 'trusted') return sender.is_trusted;
    if (activeTab === 'advertising') return sender.is_advertising;
    return !sender.is_trusted && !sender.is_advertising; // other tab
  });

  return (
    <section className="settings-section sender-management-section">
      <div className="settings-section-header">
        <h3>Siuntėjų valdymas</h3>
        <p className="subtitle">
          Valdykite patikimus ir reklaminius siuntėjus atskirose skiltyse.
        </p>
        <div className="sender-tabs">
          <button
            className={`sender-tab ${activeTab === 'trusted' ? 'active' : ''}`}
            onClick={() => setActiveTab('trusted')}
          >
            Patikimi ({senders.filter(s => s.is_trusted).length})
          </button>
          <button
            className={`sender-tab ${activeTab === 'advertising' ? 'active' : ''}`}
            onClick={() => setActiveTab('advertising')}
          >
            Reklaminiai ({senders.filter(s => s.is_advertising).length})
          </button>
          <button
            className={`sender-tab ${activeTab === 'other' ? 'active' : ''}`}
            onClick={() => setActiveTab('other')}
          >
            Kiti ({senders.filter(s => !s.is_trusted && !s.is_advertising).length})
          </button>
        </div>
      </div>

      {error && <div className="settings-alert settings-alert-error">{error}</div>}

      {message && (
        <div className={`settings-alert settings-alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <form className="sender-management-form" onSubmit={handleFormSubmit}>
        <input
          type="email"
          placeholder="El. pašto adresas"
          value={form.email}
          onChange={(event) => {
            const email = event.target.value;
            const generatedLabel = generateLabelFromEmail(email);
            setForm((prev) => ({
              ...prev,
              email,
              name: generatedLabel || prev.name // Užpildyti tik jei pavyko sugeneruoti
            }));
          }}
          required
        />
        <input
          type="text"
          placeholder="Siuntėjo vardas / įmonė"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
        <label className="sender-management-checkbox">
          <input
            type="checkbox"
            checked={form.is_trusted}
            onChange={(event) => setForm((prev) => ({ ...prev, is_trusted: event.target.checked }))}
          />
          Patikimas siuntėjas
        </label>
        <label className="sender-management-checkbox">
          <input
            type="checkbox"
            checked={form.is_advertising}
            onChange={(event) => setForm((prev) => ({ ...prev, is_advertising: event.target.checked }))}
          />
          Reklaminis siuntėjas
        </label>
        <button type="submit" className="button" disabled={saving}>
          {selectedSenderId ? (saving ? 'Atnaujinama...' : 'Atnaujinti siuntėją') : (saving ? 'Išsaugoma...' : 'Pridėti siuntėją')}
        </button>
        {selectedSenderId && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              setSelectedSenderId(null);
              setForm(EMPTY_FORM);
            }}
          >
            Atšaukti redagavimą
          </button>
        )}
      </form>

      <div className="sender-management-list">
        {loading ? (
          <div className="sender-list-empty">Siuntėjų sąrašas kraunamas...</div>
        ) : filteredSenders.length === 0 ? (
          <div className="sender-list-empty">
            {activeTab === 'trusted' ? 'Patikimų siuntėjų nerasta' : 'Reklaminių siuntėjų nerasta'}
          </div>
        ) : (
          filteredSenders.map((sender) => (
            <div key={sender.id} className="sender-row">
              <div>
                <strong>{sender.name || sender.email}</strong>
                <div className="sender-row-email">{sender.email}</div>
              </div>
              <div className="sender-row-actions">
                <span
                  className={`sender-status-pill ${
                    sender.is_advertising ? 'advertising' : sender.is_trusted ? 'trusted' : 'default'
                  }`}
                >
                  {sender.is_advertising ? 'Reklaminis' : sender.is_trusted ? 'Patikimas' : 'Nepatikrintas'}
                </span>
                {activeTab === 'trusted' && (
                  <button
                    type="button"
                    className="sender-action advertising"
                    onClick={() => handleClassification(sender, 'advertising')}
                    disabled={!!actionLoading[sender.id]}
                    title="Padaryti reklaminiu"
                  >
                    🚫
                  </button>
                )}
                {activeTab === 'advertising' && (
                  <button
                    type="button"
                    className="sender-action trusted"
                    onClick={() => handleClassification(sender, 'trust')}
                    disabled={!!actionLoading[sender.id]}
                    title="Padaryti patikimu"
                  >
                    💚
                  </button>
                )}
                {activeTab === 'other' && (
                  <>
                    <button
                      type="button"
                      className="sender-action trusted"
                      onClick={() => handleClassification(sender, 'trust')}
                      disabled={!!actionLoading[sender.id]}
                      title="Padaryti patikimu"
                    >
                      💚
                    </button>
                    <button
                      type="button"
                      className="sender-action advertising"
                      onClick={() => handleClassification(sender, 'advertising')}
                      disabled={!!actionLoading[sender.id]}
                      title="Padaryti reklaminiu"
                    >
                      🚫
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="sender-row-control"
                  onClick={() => handleEditSender(sender)}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="sender-row-control delete"
                  onClick={() => handleDeleteSender(sender)}
                  disabled={!!actionLoading[sender.id]}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default SenderManagementSection;

