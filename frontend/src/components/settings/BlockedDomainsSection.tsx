import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface BlockedDomain {
  id: number;
  domain: string;
  created_at: string;
  updated_at: string;
  created_by: number;
  created_by_name: string;
}

interface TrustedSender {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  created_by: number;
  created_by_name: string;
}

const BlockedDomainsSection: React.FC = () => {
  console.log('🚫 BlockedDomainsSection komponentas įkeltas!');

  const [activeTab, setActiveTab] = useState<'blocked-domains' | 'trusted-senders'>('blocked-domains');
  const [domains, setDomains] = useState<BlockedDomain[]>([]);
  const [trustedSenders, setTrustedSenders] = useState<TrustedSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newTrustedSender, setNewTrustedSender] = useState('');
  const [editingDomain, setEditingDomain] = useState<BlockedDomain | null>(null);
  const [editingTrustedSender, setEditingTrustedSender] = useState<TrustedSender | null>(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const loadDomains = async () => {
    try {
      console.log('🔄 Kraunamos domenai iš API...');
      console.log('🔑 Tikriname token:', localStorage.getItem('token') ? 'Token egzistuoja' : 'Token NĖRA');

      const response = await api.get('/blocked-domains/blocked-domains/');
      console.log('📡 API atsakymas:', response);
      console.log('📊 Response data tipas:', typeof response.data, Array.isArray(response.data) ? 'ARRAY' : 'NOT_ARRAY');
      console.log('📄 Raw response data:', JSON.stringify(response.data, null, 2));

      // Patikrinti, ar tai klaidos atsakymas
      if (response.data && typeof response.data === 'object' && 'detail' in response.data) {
        console.error('❌ API grąžino klaidos objektą:', response.data);
        setMessage({ text: `API klaida: ${response.data.detail}`, type: 'error' });
        setDomains([]);
        return;
      }

      // Patikrinti, ar tai pagination formato atsakymas
      let domainsData = [];
      if (Array.isArray(response.data)) {
        // Tiesioginis array
        domainsData = response.data;
      } else if (response.data && Array.isArray(response.data.results)) {
        // Pagination formato atsakymas
        domainsData = response.data.results;
      }
      console.log('✅ Apdoroti domenai:', domainsData);
      console.log('📈 Domenų skaičius:', domainsData.length);

      setDomains(domainsData);
      console.log('💾 Domenai nustatyti į state');
    } catch (error: any) {
      console.error('❌ Klaida kraunant domenus:', error);
      console.error('❌ Klaidos detalės:', error.response?.data, error.response?.status);

      // Rodyti konkretų klaidos pranešimą
      const errorMsg = error.response?.data?.detail || error.message || 'Nežinoma klaida';
      setMessage({ text: `Klaida: ${errorMsg}`, type: 'error' });
      setDomains([]); // Nustatyti tuščią array klaidos atveju
    } finally {
      setLoading(false);
    }
  };

  const loadTrustedSenders = async () => {
    try {
      console.log('🔄 Kraunami patikimi siuntėjai iš API...');
      const response = await api.get('/blocked-domains/trusted-senders/');
      console.log('📡 Trusted senders API atsakymas:', response);

      let sendersData: TrustedSender[] = [];
      if (Array.isArray(response.data)) {
        sendersData = response.data;
      } else if (response.data && Array.isArray(response.data.results)) {
        sendersData = response.data.results; // Handle paginated response
      }

      console.log('✅ Apdoroti patikimi siuntėjai:', sendersData);
      setTrustedSenders(sendersData);
    } catch (error: any) {
      console.error('Klaida kraunant patikimus siuntėjus:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Nežinoma klaida';
      setMessage({ text: `Klaida kraunant patikimus siuntėjus: ${errorMsg}`, type: 'error' });
      setTrustedSenders([]);
    }
  };

  const cleanupBlockedEmails = async () => {
    if (!window.confirm('Ar tikrai norite ištrinti visus laiškus iš užblokuotų domenų?\n\nŠis veiksmas negrįžtamas!')) {
      return;
    }

    setCleanupLoading(true);
    try {
      const response = await api.post('/blocked-domains/blocked-domains/cleanup_blocked_emails/');
      setMessage({
        text: response.data.message,
        type: 'success'
      });
      // Refresh domenų sąrašą (gali būti pasikeitęs)
      loadDomains();
    } catch (error: any) {
      console.error('Klaida trinanti laiškus:', error);
      const errorMsg = error.response?.data?.message || error.response?.data?.detail || 'Klaida trinanti laiškus';
      setMessage({ text: errorMsg, type: 'error' });
    } finally {
      setCleanupLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
    loadTrustedSenders();

    // Klausytis domenų ir patikimų siuntėjų pasikeitimų įvykių
    const handleDomainsChanged = () => {
      console.log('📡 Gavome domainsChanged event - atnaujiname domenus');
      loadDomains();
    };

    const handleTrustedSendersChanged = () => {
      console.log('📡 Gavome trustedSendersChanged event - atnaujiname patikimus siuntėjus');
      loadTrustedSenders();
    };

    console.log('🎧 Registruojame domainsChanged ir trustedSendersChanged event listener\'ius');
    window.addEventListener('domainsChanged', handleDomainsChanged);
    window.addEventListener('trustedSendersChanged', handleTrustedSendersChanged);

    return () => {
      window.removeEventListener('domainsChanged', handleDomainsChanged);
      window.removeEventListener('trustedSendersChanged', handleTrustedSendersChanged);
    };
  }, []);

  const addDomain = async () => {
    if (!newDomain.trim()) return;

    const domain = newDomain.trim().toLowerCase();
    if (Array.isArray(domains) && domains.some(d => d.domain === domain)) {
      setMessage({ text: 'Šis domenas jau užblokuotas', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/blocked-domains/blocked-domains/', { domain });
      setNewDomain('');
      setMessage({ text: 'Domenas sėkmingai užblokuotas', type: 'success' });
      loadDomains();
      // Pranešti kitiems komponentams apie domenų pasikeitimą
      window.dispatchEvent(new Event('domainsChanged'));
    } catch (error: any) {
      console.error('Klaida pridedant domeną:', error);
      const errorMessage = error.response?.data?.domain?.[0] ||
                          error.response?.data?.detail ||
                          'Klaida pridedant domeną';
      setMessage({ text: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (domain: BlockedDomain) => {
    setEditingDomain(domain);
    setEditValue(domain.domain);
  };

  const saveEdit = async () => {
    if (!editingDomain || !editValue.trim()) return;

    const newDomainValue = editValue.trim().toLowerCase();
    if (Array.isArray(domains) && domains.some(d => d.id !== editingDomain.id && d.domain === newDomainValue)) {
      setMessage({ text: 'Šis domenas jau užblokuotas', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/blocked-domains/blocked-domains/${editingDomain.id}/`, {
        domain: newDomainValue
      });
      setEditingDomain(null);
      setEditValue('');
      setMessage({ text: 'Domenas sėkmingai atnaujintas', type: 'success' });
      loadDomains();
      // Pranešti kitiems komponentams apie domenų pasikeitimą
      window.dispatchEvent(new Event('domainsChanged'));
    } catch (error: any) {
      console.error('Klaida atnaujinant domeną:', error);
      const errorMessage = error.response?.data?.domain?.[0] ||
                          error.response?.data?.detail ||
                          'Klaida atnaujinant domeną';
      setMessage({ text: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteDomain = async (domain: BlockedDomain) => {
    if (!window.confirm(`Ar tikrai norite ištrinti domeną "${domain.domain}"?`)) return;

    setSaving(true);
    try {
      await api.delete(`/blocked-domains/blocked-domains/${domain.id}/`);
      setMessage({ text: 'Domenas sėkmingai ištrintas', type: 'success' });
      loadDomains();
      // Pranešti kitiems komponentams apie domenų pasikeitimą
      window.dispatchEvent(new Event('domainsChanged'));
    } catch (error: any) {
      console.error('Klaida trinant domeną:', error);
      const errorMessage = error.response?.data?.detail || 'Klaida trinant domeną';
      setMessage({ text: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingDomain(null);
    setEditValue('');
  };

  if (loading) {
    return (
      <div className="settings-section">
        <h2>🚫 Blokuoti domenai</h2>
        <div>Kraunama...</div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>🚫 El. pašto filtrai</h2>

      {/* Tab'ai */}
      <div className="mail-strip" style={{ marginBottom: '20px', padding: '0' }}>
        <button
          className={`mail-tab ${activeTab === 'blocked-domains' ? 'active' : ''}`}
          onClick={() => setActiveTab('blocked-domains')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'blocked-domains' ? '3px solid #dc3545' : '3px solid transparent',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'blocked-domains' ? '600' : '400',
            color: activeTab === 'blocked-domains' ? '#dc3545' : '#6c757d',
            transition: 'all 0.2s'
          }}
        >
          🚫 Blokuoti domenai ({domains.length})
        </button>
        <button
          className={`mail-tab ${activeTab === 'trusted-senders' ? 'active' : ''}`}
          onClick={() => setActiveTab('trusted-senders')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'trusted-senders' ? '3px solid #10b981' : '3px solid transparent',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'trusted-senders' ? '600' : '400',
            color: activeTab === 'trusted-senders' ? '#10b981' : '#6c757d',
            transition: 'all 0.2s'
          }}
        >
          ✅ Patikimi siuntėjai ({trustedSenders.length})
        </button>
      </div>

      {/* Blokuoti domenai tab'as */}
      {activeTab === 'blocked-domains' && (
        <>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
            Laiškai iš šių domenų nebus rodomi pašto dėžutėje. Galite greitai užblokuoti domeną
            tiesiai iš laiško sąrašo arba valdyti čia.
          </p>

      {message && (
        <div className={`message message-${message.type}`} style={{ marginBottom: '15px' }}>
          {message.text}
        </div>
      )}

      {/* Pridėti naują domeną */}
      <div className="settings-card" style={{ marginBottom: '20px' }}>
        <h3>Pridėti naują domeną</h3>
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={cleanupBlockedEmails}
            disabled={cleanupLoading || domains.length === 0}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: cleanupLoading || domains.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {cleanupLoading ? 'Trinama...' : '🗑️ Ištrinti laiškus iš užblokuotų domenų'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="gmail.com"
            style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            onKeyPress={(e) => e.key === 'Enter' && addDomain()}
          />
          <button
            onClick={addDomain}
            disabled={saving || !newDomain.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving || !newDomain.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Pridedama...' : 'Pridėti'}
          </button>
        </div>
      </div>

      {/* Domenų sąrašas */}
      <div className="settings-card">
        <h3>Blokuoti domenai ({Array.isArray(domains) ? domains.length : 0})</h3>
        {!Array.isArray(domains) || domains.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Nėra užblokuotų domenų</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {domains.map((domain) => (
              <div
                key={domain.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px',
                  border: '1px solid #eee',
                  borderRadius: '4px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                {editingDomain?.id === domain.id ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{ flex: 1, padding: '4px', border: '1px solid #ccc', borderRadius: '3px' }}
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                    />
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontWeight: 'bold' }}>{domain.domain}</span>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {domain.created_by_name} • {new Date(domain.created_at).toLocaleDateString('lt-LT')}
                    </span>
                    <button
                      onClick={() => startEdit(domain)}
                      disabled={saving}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#ffc107',
                        color: 'black',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => deleteDomain(domain)}
                      disabled={saving}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}

      {/* Patikimi siuntėjai tab'as */}
      {activeTab === 'trusted-senders' && (
        <>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
            Šių siuntėjų laiškai niekada nebus laikomi reklama, net jei jie atitinka reklaminius kriterijus.
            <br/>
            <strong>💡 Domeno lygmuo:</strong> Jei pažymėsite vieną email iš domeno kaip patikimą, visi laiškai iš to domeno automatiškai bus laikomi ne reklaminiais.
          </p>

          <div className="settings-card">

        {/* Pridėti naują patikimą siuntėją */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h4 style={{ marginTop: '0', marginBottom: '10px' }}>Pridėti naują patikimą siuntėją</h4>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="email"
              className="form-control"
              placeholder="Įveskite el. pašto adresą (pvz.: info@tiekejas.lt)"
              value={newTrustedSender}
              onChange={(e) => setNewTrustedSender(e.target.value)}
              disabled={saving}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-success"
              onClick={async () => {
                if (!newTrustedSender.trim()) return;

                const email = newTrustedSender.trim().toLowerCase();
                if (trustedSenders.some(s => s.email === email)) {
                  setMessage({ text: 'Šis siuntėjas jau yra patikimų sąraše', type: 'error' });
                  return;
                }

                setSaving(true);
                try {
                  await api.post('/blocked-domains/trusted-senders/', { email });
                  setNewTrustedSender('');
                  setMessage({ text: 'Patikimas siuntėjas sėkmingai pridėtas', type: 'success' });
                  loadTrustedSenders();
                  window.dispatchEvent(new Event('trustedSendersChanged'));
                } catch (error: any) {
                  console.error('Klaida pridedant patikimą siuntėją:', error);
                  setMessage({ text: error.response?.data?.error || 'Klaida pridedant patikimą siuntėją', type: 'error' });
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? 'Pridedama...' : 'Pridėti'}
            </button>
          </div>
        </div>

        {/* Patikimų siuntėjų sąrašas */}
        <div>
          <h4>Patikimi siuntėjai ({trustedSenders.length})</h4>
          {trustedSenders.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: '#666' }}>Nėra patikimų siuntėjų</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {trustedSenders.map((sender) => (
                <div
                  key={sender.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '5px',
                    backgroundColor: '#f8f9fa',
                  }}
                >
                  {editingTrustedSender?.id === sender.id ? (
                    <>
                      <input
                        type="email"
                        className="form-control"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        disabled={saving}
                        style={{ flexGrow: 1 }}
                      />
                      <button
                        className="btn btn-success btn-sm"
                        onClick={async () => {
                          if (!editValue.trim()) return;

                          const newEmail = editValue.trim().toLowerCase();
                          if (trustedSenders.some(s => s.id !== sender.id && s.email === newEmail)) {
                            setMessage({ text: 'Šis siuntėjas jau yra patikimų sąraše', type: 'error' });
                            return;
                          }

                          setSaving(true);
                          try {
                            await api.put(`/blocked-domains/trusted-senders/${sender.id}/`, { email: newEmail });
                            setMessage({ text: 'Patikimas siuntėjas sėkmingai atnaujintas', type: 'success' });
                            setEditingTrustedSender(null);
                            setEditValue('');
                            loadTrustedSenders();
                            window.dispatchEvent(new Event('trustedSendersChanged'));
                          } catch (error: any) {
                            console.error('Klaida atnaujinant patikimą siuntėją:', error);
                            setMessage({ text: error.response?.data?.error || 'Klaida atnaujinant patikimą siuntėją', type: 'error' });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                      >
                        {saving ? 'Saugoma...' : 'Išsaugoti'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingTrustedSender(null);
                          setEditValue('');
                        }}
                        disabled={saving}
                      >
                        Atšaukti
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: '500' }}>{sender.email}</span>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        {sender.created_by_name} • {new Date(sender.created_at).toLocaleDateString('lt-LT')}
                      </span>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          setEditingTrustedSender(sender);
                          setEditValue(sender.email);
                        }}
                        disabled={saving}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#ffc107',
                          color: 'black',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          if (!window.confirm(`Ar tikrai norite ištrinti "${sender.email}" iš patikimų siuntėjų sąrašo?`)) {
                            return;
                          }

                          setSaving(true);
                          try {
                            await api.delete(`/blocked-domains/trusted-senders/${sender.id}/`);
                            setMessage({ text: 'Patikimas siuntėjas sėkmingai ištrintas', type: 'success' });
                            loadTrustedSenders();
                            window.dispatchEvent(new Event('trustedSendersChanged'));
                          } catch (error: any) {
                            console.error('Klaida trinant patikimą siuntėją:', error);
                            setMessage({ text: error.response?.data?.error || 'Klaida trinant patikimą siuntėją', type: 'error' });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default BlockedDomainsSection;
