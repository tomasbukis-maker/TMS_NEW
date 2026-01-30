import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface AutocompleteSuggestion {
  id: number;
  field_type: string;
  field_type_display: string;
  value: string;
  usage_count: number;
  last_used_at: string;
  created_at: string;
}

const AutocompleteSuggestionsSection: React.FC = () => {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('country');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<Partial<AutocompleteSuggestion>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSuggestion, setNewSuggestion] = useState<{ field_type: string; value: string }>({ field_type: 'city', value: '' });

  // Atnaujinti newSuggestion.field_type kai keičiasi activeTab
  useEffect(() => {
    setNewSuggestion(prev => ({ ...prev, field_type: activeTab }));
  }, [activeTab]);

  const fieldTypeOptions = [
    { value: 'all', label: 'Visi laukeliai' },
    { value: 'country', label: 'Šalis' },
    { value: 'postal_code', label: 'Pašto kodas' },
    { value: 'city', label: 'Miestas' },
    { value: 'address', label: 'Adresas' },
    { value: 'cargo_description', label: 'Krovinių aprašymas' },
    { value: 'order_notes', label: 'Užsakymo pastabos' },
    { value: 'carrier_notes', label: 'Vežėjo pastabos' },
    { value: 'vehicle_type', label: 'Mašinos tipas' },
    { value: 'order_type', label: 'Užsakymo tipas' },
  ];

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      setMessage(null); // Išvalyti ankstesnes žinutes
      // Užkrauname visus pasiūlymus
      const response = await api.get('/orders/autocomplete/');
      console.log('API Response data:', response.data);

      // DRF su paginacija grąžina {results: [...], count: N}
      // Be paginacijos grąžina tiesiog masyvą [...]
      console.log('Processing response data...');
      let data = [];
      if (response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data)) {
          console.log('Response is array, length:', response.data.length);
          data = response.data;
        } else if (response.data.results && Array.isArray(response.data.results)) {
          console.log('Response is paginated, results length:', response.data.results.length);
          data = response.data.results;
        } else {
          console.warn('Unexpected response format:', response.data);
          console.warn('Response.data type:', typeof response.data);
          console.warn('Response.data keys:', Object.keys(response.data));
        }
      } else {
        console.warn('Response data is not an object:', response.data);
        console.warn('Response.data type:', typeof response.data);
      }


      setSuggestions(data);
    } catch (error: any) {
      console.error('Klaida kraunant pasiūlymus:', error);
      const errorText = error.response?.status === 401
        ? 'Nėra autentifikacijos. Prašome prisijungti iš naujo.'
        : (error.response?.data?.detail || 'Klaida kraunant pasiūlymus');
      setMessage({
        type: 'error',
        text: errorText
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = (suggestion: AutocompleteSuggestion) => {
    setEditingId(suggestion.id);
    setEditingSuggestion({
      id: suggestion.id,
      field_type: suggestion.field_type,
      value: suggestion.value,
      usage_count: suggestion.usage_count,
      last_used_at: suggestion.last_used_at
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingSuggestion.value?.trim()) {
      setMessage({ type: 'error', text: 'Reikšmė yra privaloma' });
      return;
    }

    try {
      // Siunčiame tik value, nes field_type gali būti read-only arba turi specialių validacijų
      const dataToSend = {
        value: editingSuggestion.value.trim()
      };

      console.log('Sending PATCH request to:', `/orders/autocomplete/${editingId}/`);
      console.log('Data:', dataToSend);

      const response = await api.patch(`/orders/autocomplete/${editingId}/`, dataToSend);

      console.log('PATCH response:', response);
      setMessage({ type: 'success', text: 'Pasiūlymas sėkmingai atnaujintas' });
      setEditingId(null);
      setEditingSuggestion({});
      await fetchSuggestions();
    } catch (error: any) {
      console.error('PATCH error:', error);
      console.error('Error response data:', error.response?.data);
      console.error('Error status:', error.response?.status);

      const errorMsg = error.response?.data?.detail ||
                      error.response?.data?.value?.[0] ||
                      error.response?.data?.non_field_errors?.[0] ||
                      error.response?.data?.message ||
                      error.message ||
                      'Klaida atnaujinant pasiūlymą';
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingSuggestion({});
  };

  const handleCreate = async () => {
    if (!newSuggestion.value?.trim()) {
      setMessage({ type: 'error', text: 'Reikšmė yra privaloma' });
      return;
    }

    const trimmedValue = newSuggestion.value.trim();

    try {
      // First check if it exists in the database (not just in current filtered view)
      console.log('Checking if suggestion exists:', {
        field_type: newSuggestion.field_type,
        value: trimmedValue
      });

      const checkResponse = await api.get('/orders/autocomplete/', {
        params: {
          field_type: newSuggestion.field_type,
          value: trimmedValue
        }
      });

      const existingSuggestions = checkResponse.data.results || checkResponse.data;
      const exists = Array.isArray(existingSuggestions) &&
        existingSuggestions.length > 0;

      if (exists) {
        setMessage({ type: 'error', text: `Toks pasiūlymas jau egzistuoja: "${newSuggestion.field_type}" + "${trimmedValue}"` });
        return;
      }

      console.log('Creating suggestion:', {
        field_type: newSuggestion.field_type,
        value: trimmedValue
      });

      await api.post('/orders/autocomplete/', {
        field_type: newSuggestion.field_type,
        value: trimmedValue
      });
      setMessage({ type: 'success', text: 'Pasiūlymas sėkmingai sukurtas' });
      setNewSuggestion({ field_type: 'city', value: '' });
      setShowCreateForm(false);
      await fetchSuggestions();
    } catch (error: any) {
      console.error('CREATE error:', error);
      console.error('Error response data:', error.response?.data);
      console.error('Error status:', error.response?.status);

      let errorMsg = 'Klaida kuriant pasiūlymą';

      if (error.response?.data) {
        // Handle Django unique constraint error
        if (error.response.data.detail && error.response.data.detail.includes('must make a unique set')) {
          errorMsg = `Toks pasiūlymas jau egzistuoja: "${newSuggestion.field_type}" + "${trimmedValue}"`;
        } else if (error.response.data.non_field_errors) {
          errorMsg = error.response.data.non_field_errors[0];
        } else if (error.response.data.detail) {
          errorMsg = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMsg = error.response.data.message;
        }
      } else {
        errorMsg = error.message || 'Nežinoma klaida';
      }

      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šį pasiūlymą?')) return;

    try {
      await api.delete(`/orders/autocomplete/${id}/`);
      setMessage({ type: 'success', text: 'Pasiūlymas sėkmingai ištrintas' });
      await fetchSuggestions();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Klaida trinant pasiūlymą' });
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('lt-LT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{ padding: '10px' }}>
      <h2 style={{ marginBottom: '10px', color: '#333', fontSize: '16px' }}>🔤 Autocomplete pasiūlymai</h2>

      {/* Žinutės */}
      {message && (
        <div style={{
          padding: '6px 12px',
          marginBottom: '10px',
          borderRadius: '4px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          color: message.type === 'success' ? '#155724' : '#721c24',
          fontSize: '12px'
        }}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      {/* Tab'ai */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '10px', borderBottom: '1px solid #dee2e6' }}>
          {fieldTypeOptions.filter(option => option.value !== 'all').map((option) => {
            const tabSuggestions = suggestions.filter(s => s.field_type === option.value);
            return (
              <button
                key={option.value}
                onClick={() => setActiveTab(option.value)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  border: 'none',
                  backgroundColor: activeTab === option.value ? '#007bff' : 'transparent',
                  color: activeTab === option.value ? 'white' : '#666',
                  cursor: 'pointer',
                  fontWeight: activeTab === option.value ? 'bold' : 'normal',
                  borderBottom: activeTab === option.value ? '2px solid #007bff' : '2px solid transparent',
                  marginBottom: '-1px',
                  borderRadius: '3px 3px 0 0'
                }}
              >
                {option.label} ({tabSuggestions.length})
              </button>
            );
          })}
        </div>

        {/* Aktyvaus tab'o kontrolės */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#218838'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
          >
            {showCreateForm ? '❌ Atšaukti' : '➕ Pridėti'}
          </button>

          <div style={{ fontSize: '11px', color: '#666' }}>
            Iš viso: <strong>{suggestions.length}</strong>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '10px', textAlign: 'center', fontSize: '12px' }}>Kraunama...</div>
      ) : (
        <>
          {showCreateForm && (
            <div style={{
              border: '1px solid #28a745',
              borderRadius: '4px',
              padding: '8px',
              marginBottom: '10px',
              backgroundColor: '#f8fff8'
            }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#28a745', fontSize: '13px' }}>
                📝 Pridėti naują {fieldTypeOptions.find(option => option.value === activeTab)?.label.toLowerCase()} pasiūlymą
              </h3>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Reikšmė *</label>
                <input
                  type="text"
                  value={newSuggestion.value}
                  onChange={(e) => setNewSuggestion({ ...newSuggestion, value: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: '12px',
                    border: '1px solid #ccc',
                    borderRadius: '3px'
                  }}
                  placeholder={`Įveskite ${fieldTypeOptions.find(option => option.value === activeTab)?.label.toLowerCase()}...`}
                  autoFocus
                />
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleCreate}
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  💾 Sukurti
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  ❌ Atšaukti
                </button>
              </div>
            </div>
          )}

          {/* Aktyvaus tab'o pasiūlymai */}
          {(() => {
            const tabSuggestions = suggestions.filter(s => s.field_type === activeTab);

            // Randame dublikatus aktyviame tab'e
            const duplicates: AutocompleteSuggestion[][] = [];
            const processed = new Set<number>();

            for (let i = 0; i < tabSuggestions.length; i++) {
              if (processed.has(tabSuggestions[i].id)) continue;

              const group: AutocompleteSuggestion[] = [tabSuggestions[i]];
              processed.add(tabSuggestions[i].id);

              for (let j = i + 1; j < tabSuggestions.length; j++) {
                if (processed.has(tabSuggestions[j].id)) continue;

                if (tabSuggestions[i].value.toLowerCase().trim() === tabSuggestions[j].value.toLowerCase().trim()) {
                  group.push(tabSuggestions[j]);
                  processed.add(tabSuggestions[j].id);
                }
              }

              if (group.length > 1) {
                duplicates.push(group);
              }
            }

            // Surūšiuojame pasiūlymus taip, kad dublikatai būtų kartu
            const sortedSuggestions = [...tabSuggestions].sort((a, b) => {
              // Pirmiau patikrinti ar kuris nors yra dublikate
              const aIsDuplicate = duplicates.some(group => group.some(item => item.id === a.id));
              const bIsDuplicate = duplicates.some(group => group.some(item => item.id === b.id));

              // Dublikatai eina pirmiau
              if (aIsDuplicate && !bIsDuplicate) return -1;
              if (!aIsDuplicate && bIsDuplicate) return 1;

              // Jei abu dublikatai arba abu ne, rūšiuoti pagal reikšmę
              return a.value.toLowerCase().localeCompare(b.value.toLowerCase());
            });

            const activeTabOption = fieldTypeOptions.find(option => option.value === activeTab);

            return (
              <div>
                <h3 style={{
                  fontSize: '14px',
                  marginBottom: '8px',
                  color: '#495057',
                  borderBottom: `1px solid #007bff`,
                  paddingBottom: '4px'
                }}>
                  🔤 {activeTabOption?.label} ({sortedSuggestions.length})
                  {duplicates.length > 0 && (
                    <span style={{ color: '#dc3545', marginLeft: '8px', fontSize: '12px' }}>
                      ⚠️ {duplicates.length} grupė(s) - {duplicates.reduce((sum, group) => sum + group.length, 0)} įrašai
                    </span>
                  )}
                </h3>

                {/* Dublikatų įspėjimas */}
                {duplicates.length > 0 && (
                  <div style={{
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffeaa7',
                    borderRadius: '4px',
                    padding: '6px',
                    marginBottom: '8px',
                    fontSize: '11px'
                  }}>
                    <strong style={{ color: '#856404' }}>⚠️ Dublikatų grupės:</strong>
                    {duplicates.map((duplicateGroup, idx) => (
                      <div key={idx} style={{ marginTop: '3px', color: '#856404', fontSize: '10px' }}>
                        <strong>{idx + 1}:</strong>
                        {duplicateGroup.map(s => `"${s.value}"`).join(' ↔ ')}
                      </div>
                    ))}
                  </div>
                )}

                {/* Sąrašas */}
                {duplicates.length > 0 && (
                  <div style={{
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffeaa7',
                    borderRadius: '4px',
                    padding: '6px',
                    marginBottom: '10px'
                  }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#856404', fontSize: '12px' }}>
                      ⚠️ Dublikatų grupės ({duplicates.reduce((sum, group) => sum + group.length, 0)} viso):
                    </h4>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      {duplicates.map((duplicateGroup, idx) => (
                        <div key={idx} style={{
                          backgroundColor: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: '3px',
                          padding: '4px'
                        }}>
                          <div style={{ fontSize: '10px', color: '#6c757d', marginBottom: '2px' }}>
                            {idx + 1} ({duplicateGroup.length}x):
                          </div>
                          <div style={{ fontWeight: 'bold', color: '#dc3545', fontSize: '11px' }}>
                            "{duplicateGroup[0].value}"
                          </div>
                          <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                            Naudojimų: {duplicateGroup.reduce((sum, item) => sum + item.usage_count, 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h4 style={{ marginBottom: '5px', color: '#666', fontSize: '12px' }}>
                  {duplicates.length > 0 ? 'Unikalūs įrašai:' : 'Visi įrašai:'}
                </h4>

                {sortedSuggestions.length === 0 ? (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px dashed #dee2e6',
                    fontSize: '12px'
                  }}>
                    Šioje kategorijoje dar nėra pasiūlymų
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: activeTab === 'order_notes' || activeTab === 'carrier_notes'
                      ? '1fr'
                      : 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '3px'
                  }}>

                    {sortedSuggestions.map((suggestion, index) => {
                        const isDuplicate = duplicates.some(dupGroup =>
                          dupGroup.some(dup => dup.id === suggestion.id)
                        );

                      return (
                        <div
                          key={`suggestion-${suggestion.id}-${index}`}
                          style={{
                            backgroundColor: isDuplicate ? '#f8d7da' : '#fff',
                            border: `1px solid ${isDuplicate ? '#f5c6cb' : '#dee2e6'}`,
                            borderRadius: '4px',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.2s',
                            boxShadow: isDuplicate ? '0 1px 2px rgba(220, 53, 69, 0.1)' : 'none'
                          }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {editingId === suggestion.id ? (
                                <input
                                  type="text"
                                  value={editingSuggestion.value || ''}
                                  onChange={(e) => setEditingSuggestion({ ...editingSuggestion, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit();
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '3px 4px',
                                    fontSize: '12px',
                                    border: '1px solid #007bff',
                                    borderRadius: '3px',
                                    backgroundColor: '#f8f9ff',
                                    fontWeight: 'bold'
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    color: isDuplicate ? '#856404' : '#333',
                                    flex: 1
                                  }}>
                                    {isDuplicate && '⚠️ '}{suggestion.value}
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>
                                    {suggestion.usage_count}x | {formatDate(suggestion.last_used_at)}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                              {editingId === suggestion.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10px',
                                      backgroundColor: '#28a745',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    💾
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10px',
                                      backgroundColor: '#6c757d',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ❌
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(suggestion)}
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10px',
                                      backgroundColor: '#007bff',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Redaguoti"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(suggestion.id)}
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10px',
                                      backgroundColor: '#dc3545',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Trinti"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

export default AutocompleteSuggestionsSection;
