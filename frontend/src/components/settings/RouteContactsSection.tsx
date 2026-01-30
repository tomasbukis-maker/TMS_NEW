import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';

interface RouteContact {
  id: number;
  contact_type: 'sender' | 'receiver';
  contact_type_display: string;
  name: string;
  country: string;
  postal_code: string;
  city: string;
  address: string;
  usage_count: number;
  last_used_at: string;
  created_at: string;
}

interface ContactGroup {
  type: 'sender' | 'receiver';
  displayName: string;
  contacts: RouteContact[];
  duplicates: RouteContact[][];
}

const RouteContactsSection: React.FC = () => {
  const [contacts, setContacts] = useState<RouteContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterContactType, setFilterContactType] = useState<string>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContact, setEditingContact] = useState<Partial<RouteContact>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newContact, setNewContact] = useState<Partial<RouteContact>>({ contact_type: 'sender' });

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);
      const params: any = {};
      if (filterContactType !== 'all') {
        params.contact_type = filterContactType;
      }
      const response = await api.get('/orders/route-contacts/', { params });
      
      // DRF su paginacija grąžina {results: [...], count: N}
      // Be paginacijos grąžina tiesiog masyvą [...]
      let data = [];
      if (response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data)) {
          data = response.data;
        } else if (response.data.results && Array.isArray(response.data.results)) {
          data = response.data.results;
        } else {
          console.warn('Nežinomas API atsakymo formatas:', response.data);
          data = [];
        }
      }
      
      setContacts(data);
    } catch (error: any) {
      let errorMessage = 'Klaida užkraunant kontaktus';
      if (error.response?.status === 401) {
        errorMessage = 'Nėra autentifikacijos. Prašome prisijungti iš naujo.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Neturite teisės pasiekti šių duomenų.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      setMessage({ type: 'error', text: errorMessage });
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [filterContactType]);

  useEffect(() => {
    fetchContacts();
  }, [filterContactType, fetchContacts]);

  // Grupuoja kontaktus pagal tipą ir randa dublikatus
  const getGroupedContacts = (): ContactGroup[] => {
    const senders = contacts.filter(c => c.contact_type === 'sender');
    const receivers = contacts.filter(c => c.contact_type === 'receiver');

    const findDuplicates = (contactList: RouteContact[]): RouteContact[][] => {
      const duplicates: RouteContact[][] = [];
      const processed = new Set<number>();

      for (let i = 0; i < contactList.length; i++) {
        if (processed.has(contactList[i].id)) continue;

        const group: RouteContact[] = [contactList[i]];
        processed.add(contactList[i].id);

        for (let j = i + 1; j < contactList.length; j++) {
          if (processed.has(contactList[j].id)) continue;

          // Lygina pagal pagrindinius laukus
          const similarity = calculateSimilarity(contactList[i], contactList[j]);
          if (similarity > 0.8) { // 80% panašumas
            group.push(contactList[j]);
            processed.add(contactList[j].id);
          }
        }

        if (group.length > 1) {
          duplicates.push(group);
        }
      }

      return duplicates;
    };

    return [
      {
        type: 'sender',
        displayName: 'Siuntėjai',
        contacts: senders,
        duplicates: findDuplicates(senders)
      },
      {
        type: 'receiver',
        displayName: 'Gavėjai',
        contacts: receivers,
        duplicates: findDuplicates(receivers)
      }
    ];
  };

  // Apskaičiuoja kontaktų panašumą
  const calculateSimilarity = (contact1: RouteContact, contact2: RouteContact): number => {
    const fields = ['name', 'country', 'city', 'address'] as const;
    let totalScore = 0;
    let fieldCount = 0;

    for (const field of fields) {
      const val1 = (contact1[field] || '').toLowerCase().trim();
      const val2 = (contact2[field] || '').toLowerCase().trim();

      if (val1 || val2) {
        fieldCount++;
        if (val1 === val2) {
          totalScore += 1;
        } else if (val1.includes(val2) || val2.includes(val1)) {
          totalScore += 0.7; // Dalinis atitikimas
        }
      }
    }

    return fieldCount > 0 ? totalScore / fieldCount : 0;
  };

  const handleEdit = (contact: RouteContact) => {
    setEditingId(contact.id);
    setEditingContact({
      name: contact.name,
      country: contact.country,
      postal_code: contact.postal_code,
      city: contact.city,
      address: contact.address
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    
    try {
      await api.patch(`/orders/route-contacts/${editingId}/`, {
        name: editingContact.name?.trim(),
        country: editingContact.country?.trim() || '',
        postal_code: editingContact.postal_code?.trim() || '',
        city: editingContact.city?.trim() || '',
        address: editingContact.address?.trim() || ''
      });
      setMessage({ type: 'success', text: 'Kontaktas sėkmingai atnaujintas' });
      setEditingId(null);
      setEditingContact({});
      await fetchContacts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message || 'Klaida atnaujinant kontaktą';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContact({});
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šį kontaktą?')) {
      return;
    }

    try {
      await api.delete(`/orders/route-contacts/${id}/`);
      setMessage({ type: 'success', text: 'Kontaktas sėkmingai ištrintas' });
      await fetchContacts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message || 'Klaida trinant kontaktą';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleCreate = async () => {
    if (!newContact.name?.trim()) {
      setMessage({ type: 'error', text: 'Vardas yra privalomas' });
      return;
    }

    try {
      await api.post('/orders/route-contacts/', {
        contact_type: newContact.contact_type,
        name: newContact.name.trim(),
        country: newContact.country?.trim() || '',
        postal_code: newContact.postal_code?.trim() || '',
        city: newContact.city?.trim() || '',
        address: newContact.address?.trim() || ''
      });
      setMessage({ type: 'success', text: 'Kontaktas sėkmingai sukurtas' });
      setNewContact({ contact_type: 'sender' });
      setShowCreateForm(false);
      await fetchContacts();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message || 'Klaida kuriant kontaktą';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Kraunama...</div>;
  }

  const groupedContacts = getGroupedContacts();

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '16px', marginBottom: '6px' }}>Siuntėjų ir gavėjų komplektai</h2>
      <p className="section-description" style={{ fontSize: '11px', marginBottom: '12px' }}>
        Valdykite siuntėjų ir gavėjų komplektus su jų adresų informacija. Kontaktų grupavimas pagal tipą su dublikatų aptikimu.
      </p>

      {message && (
        <div className={`message message-${message.type}`} style={{ marginBottom: '15px' }}>
          {message.text}
        </div>
      )}

      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '12px', marginRight: '8px' }}>Filtruoti pagal tipą:</label>
          <select
            value={filterContactType}
            onChange={(e) => setFilterContactType(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="all">Visi</option>
            <option value="sender">Siuntėjai</option>
            <option value="receiver">Gavėjai</option>
          </select>
        </div>

        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showCreateForm ? '❌ Atšaukti' : '➕ Kurti naują'}
        </button>
      </div>

      {showCreateForm && (
        <div style={{
          border: '2px solid #28a745',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#f8fff8'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#28a745' }}>📝 Kurti naują kontaktą</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Tipas *</label>
              <select
                value={newContact.contact_type || 'sender'}
                onChange={(e) => setNewContact({ ...newContact, contact_type: e.target.value as 'sender' | 'receiver' })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="sender">Siuntėjas</option>
                <option value="receiver">Gavėjas</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Vardas *</label>
              <input
                type="text"
                value={newContact.name || ''}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="Įveskite vardą..."
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Šalis</label>
              <input
                type="text"
                value={newContact.country || ''}
                onChange={(e) => setNewContact({ ...newContact, country: e.target.value })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="Lietuva..."
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Pašto kodas</label>
              <input
                type="text"
                value={newContact.postal_code || ''}
                onChange={(e) => setNewContact({ ...newContact, postal_code: e.target.value })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="LT-12345..."
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Miestas</label>
              <input
                type="text"
                value={newContact.city || ''}
                onChange={(e) => setNewContact({ ...newContact, city: e.target.value })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="Vilnius..."
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Adresas</label>
              <input
                type="text"
                value={newContact.address || ''}
                onChange={(e) => setNewContact({ ...newContact, address: e.target.value })}
                style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="Gedimino pr. 1..."
              />
            </div>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCreate}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              💾 Sukurti
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              style={{
                padding: '8px 16px',
                fontSize: '12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ❌ Atšaukti
            </button>
          </div>
        </div>
      )}

      {/* Grupės su dublikatais */}
      {groupedContacts.map((group) => {
        const filteredContacts = filterContactType === 'all' || filterContactType === group.type ? group.contacts : [];

        if (filteredContacts.length === 0) return null;

        return (
          <div key={group.type} style={{ marginBottom: '30px' }}>
            <h3 style={{
              fontSize: '14px',
              marginBottom: '10px',
              color: group.type === 'sender' ? '#007bff' : '#28a745',
              borderBottom: `2px solid ${group.type === 'sender' ? '#007bff' : '#28a745'}`,
              paddingBottom: '5px'
            }}>
              📍 {group.displayName} ({filteredContacts.length})
              {group.duplicates.length > 0 && (
                <span style={{ color: '#dc3545', marginLeft: '10px', fontSize: '12px' }}>
                  ⚠️ {group.duplicates.length} dublikatų grupė(s)
                </span>
              )}
            </h3>

            {/* Dublikatų įspėjimas */}
            {group.duplicates.length > 0 && (
              <div style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px',
                padding: '10px',
                marginBottom: '15px'
              }}>
                <strong style={{ color: '#856404' }}>⚠️ Aptikti panašūs kontaktai:</strong>
                {group.duplicates.map((duplicateGroup, idx) => (
                  <div key={idx} style={{ marginTop: '5px', color: '#856404', fontSize: '11px' }}>
                    <strong>Grupė {idx + 1}:</strong>
                    {duplicateGroup.map(c => `${c.name} (${c.city || 'be miesto'})`).join(' ↔ ')}
                  </div>
                ))}
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '80px' }}>Tipas</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6' }}>Vardas</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6' }}>Šalis</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6' }}>Pašto kodas</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6' }}>Miestas</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6' }}>Adresas</th>
                    <th style={{ padding: '8px', textAlign: 'left', borderRight: '1px solid #dee2e6', width: '80px' }}>Naudojimų</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '120px' }}>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                        Šio tipo kontaktų nėra
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map((contact) => {
                      const isDuplicate = group.duplicates.some(dupGroup =>
                        dupGroup.some(dup => dup.id === contact.id)
                      );

                      return (
                        <tr key={contact.id} style={{
                          borderBottom: '1px solid #eee',
                          backgroundColor: isDuplicate ? '#fff3cd' : 'transparent'
                        }}>
                          {editingId === contact.id ? (
                            <>
                              <td style={{ padding: '8px' }}>
                                {contact.contact_type_display}
                                {isDuplicate && <span style={{ color: '#856404', marginLeft: '4px' }}>⚠️</span>}
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="text"
                                  value={editingContact.name || ''}
                                  onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                                  style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="text"
                                  value={editingContact.country || ''}
                                  onChange={(e) => setEditingContact({ ...editingContact, country: e.target.value })}
                                  style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="text"
                                  value={editingContact.postal_code || ''}
                                  onChange={(e) => setEditingContact({ ...editingContact, postal_code: e.target.value })}
                                  style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="text"
                                  value={editingContact.city || ''}
                                  onChange={(e) => setEditingContact({ ...editingContact, city: e.target.value })}
                                  style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="text"
                                  value={editingContact.address || ''}
                                  onChange={(e) => setEditingContact({ ...editingContact, address: e.target.value })}
                                  style={{ width: '100%', padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {contact.usage_count}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  onClick={handleSaveEdit}
                                  style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  💾
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  ✕
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '8px' }}>
                                {contact.contact_type_display}
                                {isDuplicate && <span style={{ color: '#856404', marginLeft: '4px' }}>⚠️</span>}
                              </td>
                              <td style={{ padding: '8px' }}>{contact.name || '-'}</td>
                              <td style={{ padding: '8px' }}>{contact.country || '-'}</td>
                              <td style={{ padding: '8px' }}>{contact.postal_code || '-'}</td>
                              <td style={{ padding: '8px' }}>{contact.city || '-'}</td>
                              <td style={{ padding: '8px' }}>{contact.address || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{contact.usage_count}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleEdit(contact)}
                                  style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDelete(contact.id)}
                                  style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  🗑️
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
          </tbody>
        </table>
      </div>
          </div>
        );
      })}
    </div>
  );
};

export default RouteContactsSection;


