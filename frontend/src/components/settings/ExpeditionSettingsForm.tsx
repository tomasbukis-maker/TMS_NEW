import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface ObligationItem {
  text: string;
  text_en?: string;
  text_ru?: string;
}

interface ExpeditionSettings {
  id: number;
  expedition_prefix: string;
  expedition_number_width: number;
  auto_numbering: boolean;
  payment_terms?: string;
  payment_terms_en?: string;
  payment_terms_ru?: string;
  carrier_obligations?: ObligationItem[];
  client_obligations?: ObligationItem[];
  notes: string;
  last_expedition_number?: string | null;
  next_expedition_number?: string | null;
  next_expedition_number_edit?: string;
  created_at?: string;
  updated_at?: string;
}

interface ExpeditionSettingsFormProps {
  expeditionSettings: ExpeditionSettings;
  onUpdate: (settings: ExpeditionSettings) => void;
  onSave: (settings: ExpeditionSettings) => Promise<void>;
  saving: boolean;
}

interface GapInfo {
  number: string;
  range: string;
  count: number;
}

const ExpeditionSettingsForm: React.FC<ExpeditionSettingsFormProps> = ({
  expeditionSettings: initialSettings,
  onUpdate,
  onSave,
  saving,
}) => {
  const [expeditionSettings, setExpeditionSettings] = useState<ExpeditionSettings>(initialSettings);
  const [editingCarrierObligation, setEditingCarrierObligation] = useState<ObligationItem | null>(null);
  const [editingCarrierObligationIndex, setEditingCarrierObligationIndex] = useState<number | null>(null);
  const [editingClientObligation, setEditingClientObligation] = useState<ObligationItem | null>(null);
  const [editingClientObligationIndex, setEditingClientObligationIndex] = useState<number | null>(null);
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [gapsCount, setGapsCount] = useState<number>(0);
  const [loadingGaps, setLoadingGaps] = useState(false);

  useEffect(() => {
    setExpeditionSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    fetchGaps();
  }, [expeditionSettings.expedition_prefix, expeditionSettings.expedition_number_width]);

  const fetchGaps = async () => {
    setLoadingGaps(true);
    try {
      const response = await api.get('/orders/carriers/get_gaps/', {
        params: { max_gaps: 10 }
      });
      if (response.data.has_gaps) {
        setGaps(response.data.gaps || []);
        setGapsCount(response.data.gaps_count || 0);
      } else {
        setGaps([]);
        setGapsCount(0);
      }
    } catch (error: any) {
      console.error('Klaida gaunant ekspedicijų tarpus:', error);
      setGaps([]);
      setGapsCount(0);
    } finally {
      setLoadingGaps(false);
    }
  };

  const updateField = (field: keyof ExpeditionSettings, value: any) => {
    const updated = { ...expeditionSettings, [field]: value };
    setExpeditionSettings(updated);
    onUpdate(updated);
  };

  const handleAddCarrierObligation = () => {
    setEditingCarrierObligation({ text: '' });
    setEditingCarrierObligationIndex(null);
  };

  const handleEditCarrierObligation = (item: ObligationItem, index: number) => {
    setEditingCarrierObligation({ ...item });
    setEditingCarrierObligationIndex(index);
  };

  const handleDeleteCarrierObligation = (index: number) => {
    const obligations = [...(expeditionSettings.carrier_obligations || [])];
    obligations.splice(index, 1);
    updateField('carrier_obligations', obligations);
  };

  const handleSaveCarrierObligation = () => {
    if (!editingCarrierObligation || !editingCarrierObligation.text || !editingCarrierObligation.text.trim()) {
      return;
    }
    const obligations = [...(expeditionSettings.carrier_obligations || [])];
    if (editingCarrierObligationIndex !== null) {
      obligations[editingCarrierObligationIndex] = { ...editingCarrierObligation };
    } else {
      obligations.push({ ...editingCarrierObligation });
    }
    updateField('carrier_obligations', obligations);
    setEditingCarrierObligation(null);
    setEditingCarrierObligationIndex(null);
  };

  const handleAddClientObligation = () => {
    setEditingClientObligation({ text: '' });
    setEditingClientObligationIndex(null);
  };

  const handleEditClientObligation = (item: ObligationItem, index: number) => {
    setEditingClientObligation({ ...item });
    setEditingClientObligationIndex(index);
  };

  const handleDeleteClientObligation = (index: number) => {
    const obligations = [...(expeditionSettings.client_obligations || [])];
    obligations.splice(index, 1);
    updateField('client_obligations', obligations);
  };

  const handleSaveClientObligation = () => {
    if (!editingClientObligation || !editingClientObligation.text || !editingClientObligation.text.trim()) {
      return;
    }
    const obligations = [...(expeditionSettings.client_obligations || [])];
    if (editingClientObligationIndex !== null) {
      obligations[editingClientObligationIndex] = { ...editingClientObligation };
    } else {
      obligations.push({ ...editingClientObligation });
    }
    updateField('client_obligations', obligations);
    setEditingClientObligation(null);
    setEditingClientObligationIndex(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(expeditionSettings);
  };

  const currentPrefix = expeditionSettings.expedition_prefix || 'E';
  const currentWidth = expeditionSettings.expedition_number_width || 5;
  const sampleNumber = `${currentPrefix}${String(1).padStart(currentWidth, '0')}`;

  return (
    <div className="settings-section order-settings-compact">
      <h2 style={{ fontSize: '15px', marginBottom: '4px', fontWeight: '600' }}>Ekspedicijos nustatymai</h2>
      <p className="section-description" style={{ fontSize: '10px', marginBottom: '8px', color: '#666' }}>
        Valdykite ekspedicijų numeravimą. Numeris formuojamas kaip prefiksas + skaitmenys, pvz.: <strong>{sampleNumber}</strong>.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-grid order-settings-grid" style={{ gap: '8px' }}>
          {/* Ekspedicijų numeracijos informacija ir tarpai - vienoje eilutėje */}
          <div className="form-field full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Ekspedicijų numeracijos informacija */}
            <div style={{ 
              padding: '6px', 
              backgroundColor: '#f0f7ff', 
              borderRadius: '3px', 
              border: '1px solid #b3d9ff'
            }}>
              <label style={{ fontWeight: 'bold', marginBottom: '6px', display: 'block', fontSize: '11px' }}>Ekspedicijų numeracijos informacija</label>
              
              {/* Automatinis numeravimas */}
              <div style={{ marginBottom: '6px' }}>
                <label className="checkbox-label" style={{ fontSize: '10px', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={expeditionSettings.auto_numbering}
                    onChange={(e) => updateField('auto_numbering', e.target.checked)}
                    style={{ marginRight: '4px' }}
                  />
                  <span>Automatinis numeravimas</span>
                </label>
              </div>
              
              {/* Prefiksas ir skaitmenų skaičius */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>Prefiksas *</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={expeditionSettings.expedition_prefix || ''}
                    onChange={(e) => updateField('expedition_prefix', e.target.value.trimStart())}
                    placeholder="Pvz.: E"
                    required
                    style={{ padding: '3px 5px', fontSize: '11px', width: '100%' }}
                  />
                  <small style={{ color: '#666', fontSize: '8px', marginTop: '1px', display: 'block' }}>
                    Pvz.: E
                  </small>
                </div>
                
                <div>
                  <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>Skaitmenų sk. *</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={expeditionSettings.expedition_number_width}
                    onChange={(e) => updateField('expedition_number_width', parseInt(e.target.value, 10) || 1)}
                    required
                    style={{ padding: '3px 5px', fontSize: '11px', width: '100%' }}
                  />
                  <small style={{ color: '#666', fontSize: '8px', marginTop: '1px', display: 'block' }}>
                    Pvz.: {currentWidth}
                  </small>
                </div>
              </div>

              {/* Numeracijos informacija */}
              {(expeditionSettings.last_expedition_number || expeditionSettings.next_expedition_number) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid #b3d9ff', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#666', fontSize: '10px' }}>Paskutinė:</span>
                    <strong style={{ fontSize: '11px', color: '#333' }}>
                      {expeditionSettings.last_expedition_number || 'Nėra'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ color: '#666', fontSize: '10px' }}>Sekanti:</span>
                    <strong style={{ fontSize: '11px', color: '#0066cc' }}>
                      {expeditionSettings.next_expedition_number || 'Nėra'}
                    </strong>
                  </div>
                  <div style={{ marginTop: '3px', paddingTop: '4px', borderTop: '1px solid #b3d9ff' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#666' }}>
                      Nustatyti sekantį numerį:
                    </label>
                    <input
                      type="text"
                      value={expeditionSettings.next_expedition_number_edit || expeditionSettings.next_expedition_number || ''}
                      onChange={(e) => updateField('next_expedition_number_edit', e.target.value)}
                      placeholder={expeditionSettings.next_expedition_number || sampleNumber}
                      style={{
                        width: '100%',
                        padding: '3px 5px',
                        fontSize: '11px',
                        border: '1px solid #ccc',
                        borderRadius: '3px'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Ekspedicijų numerių tarpai */}
            <div
              style={{
                padding: '6px',
                backgroundColor: '#f0f7ff',
                borderRadius: '3px',
                border: '1px solid #b3d9ff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '11px' }}>
                  Ekspedicijų numerių tarpai
                </label>
                <button
                  type="button"
                  onClick={fetchGaps}
                  disabled={loadingGaps}
                  style={{
                    padding: '2px 6px',
                    fontSize: '9px',
                    backgroundColor: '#0066cc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: loadingGaps ? 'not-allowed' : 'pointer',
                    opacity: loadingGaps ? 0.6 : 1
                  }}
                >
                  {loadingGaps ? 'Kraunama...' : 'Atnaujinti'}
                </button>
              </div>
              {loadingGaps ? (
                <div style={{ fontSize: '10px', color: '#666', textAlign: 'center', padding: '4px' }}>
                  Kraunama...
                </div>
              ) : gaps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>
                    Rasta {gapsCount} trūkstamų numerių:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '100px', overflowY: 'auto' }}>
                    {gaps.map((gap, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '2px 4px',
                          backgroundColor: '#fff',
                          borderRadius: '2px',
                          border: '1px solid #b3d9ff',
                          fontSize: '10px',
                          fontFamily: 'monospace'
                        }}
                      >
                        <strong>{gap.range}</strong>
                        {gap.count > 1 && (
                          <span style={{ color: '#666', marginLeft: '4px' }}>
                            ({gap.count})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '10px', color: '#666', textAlign: 'center', padding: '4px' }}>
                  Tarpų nėra
                </div>
              )}
            </div>
          </div>

          {/* Kiti nustatymai */}
          <div className="form-field full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Apmokėjimo terminas (LT)</label>
              <textarea
                value={expeditionSettings.payment_terms || ''}
                onChange={(e) => updateField('payment_terms', e.target.value)}
                rows={2}
                placeholder="Lietuvių k..."
                style={{ padding: '4px 6px', fontSize: '11px', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Apmokėjimo terminas (EN)</label>
              <textarea
                value={expeditionSettings.payment_terms_en || ''}
                onChange={(e) => updateField('payment_terms_en', e.target.value)}
                rows={2}
                placeholder="Anglų k..."
                style={{ padding: '4px 6px', fontSize: '11px', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Apmokėjimo terminas (RU)</label>
              <textarea
                value={expeditionSettings.payment_terms_ru || ''}
                onChange={(e) => updateField('payment_terms_ru', e.target.value)}
                rows={2}
                placeholder="Rusų k..."
                style={{ padding: '4px 6px', fontSize: '11px', width: '100%' }}
              />
            </div>
          </div>

          <div className="form-field full-width" style={{ marginTop: '8px' }}>
            <label style={{ fontSize: '11px', marginBottom: '4px', fontWeight: '600' }}>VEŽĖJO TEISĖS IR PAREIGOS</label>
            <div style={{ marginBottom: '4px' }}>
              <button
                type="button"
                onClick={handleAddCarrierObligation}
                className="button button-secondary"
                style={{ padding: '3px 6px', fontSize: '10px' }}
              >
                + Pridėti punktą
              </button>
            </div>
            {(expeditionSettings.carrier_obligations || []).length > 0 ? (
              <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '4px', backgroundColor: 'white', maxHeight: '150px', overflowY: 'auto', marginBottom: '4px' }}>
                {(expeditionSettings.carrier_obligations || []).map((item, index) => (
                  <div key={index} style={{ padding: '4px', borderBottom: index < (expeditionSettings.carrier_obligations || []).length - 1 ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ flex: 1, fontSize: '11px', marginRight: '6px' }}>{item.text}</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <button
                        type="button"
                        onClick={() => handleEditCarrierObligation(item, index)}
                        className="button button-secondary"
                        style={{ padding: '2px 5px', fontSize: '9px' }}
                      >
                        Red.
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCarrierObligation(index)}
                        className="button button-secondary"
                        style={{ padding: '2px 5px', fontSize: '9px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                      >
                        Trinti
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '6px', textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: '3px', backgroundColor: '#fafafa', marginBottom: '4px', fontSize: '10px' }}>
                Nėra pridėtų punktų
              </div>
            )}
            {editingCarrierObligation !== null && (
              <div style={{ border: '1px solid #0066cc', borderRadius: '3px', padding: '6px', backgroundColor: '#f0f8ff', marginBottom: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '4px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>LT tekstas</label>
                    <textarea
                      value={editingCarrierObligation.text}
                      onChange={(e) => setEditingCarrierObligation({ ...editingCarrierObligation, text: e.target.value })}
                      rows={2}
                      placeholder="LT tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>EN tekstas</label>
                    <textarea
                      value={editingCarrierObligation.text_en || ''}
                      onChange={(e) => setEditingCarrierObligation({ ...editingCarrierObligation, text_en: e.target.value })}
                      rows={2}
                      placeholder="EN tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>RU tekstas</label>
                    <textarea
                      value={editingCarrierObligation.text_ru || ''}
                      onChange={(e) => setEditingCarrierObligation({ ...editingCarrierObligation, text_ru: e.target.value })}
                      rows={2}
                      placeholder="RU tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={handleSaveCarrierObligation}
                    className="button button-primary"
                    style={{ padding: '3px 8px', fontSize: '10px' }}
                  >
                    Išsaugoti
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCarrierObligation(null); setEditingCarrierObligationIndex(null); }}
                    className="button button-secondary"
                    style={{ padding: '3px 8px', fontSize: '10px' }}
                  >
                    Atšaukti
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-field full-width" style={{ marginTop: '8px' }}>
            <label style={{ fontSize: '11px', marginBottom: '4px', fontWeight: '600' }}>UŽSAKOVO TEISĖS IR PAREIGOS</label>
            <div style={{ marginBottom: '4px' }}>
              <button
                type="button"
                onClick={handleAddClientObligation}
                className="button button-secondary"
                style={{ padding: '3px 6px', fontSize: '10px' }}
              >
                + Pridėti punktą
              </button>
            </div>
            {(expeditionSettings.client_obligations || []).length > 0 ? (
              <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '4px', backgroundColor: 'white', maxHeight: '150px', overflowY: 'auto', marginBottom: '4px' }}>
                {(expeditionSettings.client_obligations || []).map((item, index) => (
                  <div key={index} style={{ padding: '4px', borderBottom: index < (expeditionSettings.client_obligations || []).length - 1 ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ flex: 1, fontSize: '11px', marginRight: '6px' }}>{item.text}</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <button
                        type="button"
                        onClick={() => handleEditClientObligation(item, index)}
                        className="button button-secondary"
                        style={{ padding: '2px 5px', fontSize: '9px' }}
                      >
                        Red.
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClientObligation(index)}
                        className="button button-secondary"
                        style={{ padding: '2px 5px', fontSize: '9px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                      >
                        Trinti
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '6px', textAlign: 'center', color: '#999', border: '1px dashed #ddd', borderRadius: '3px', backgroundColor: '#fafafa', marginBottom: '4px', fontSize: '10px' }}>
                Nėra pridėtų punktų
              </div>
            )}
            {editingClientObligation !== null && (
              <div style={{ border: '1px solid #0066cc', borderRadius: '3px', padding: '6px', backgroundColor: '#f0f8ff', marginBottom: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '4px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>LT tekstas</label>
                    <textarea
                      value={editingClientObligation.text}
                      onChange={(e) => setEditingClientObligation({ ...editingClientObligation, text: e.target.value })}
                      rows={2}
                      placeholder="LT tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>EN tekstas</label>
                    <textarea
                      value={editingClientObligation.text_en || ''}
                      onChange={(e) => setEditingClientObligation({ ...editingClientObligation, text_en: e.target.value })}
                      rows={2}
                      placeholder="EN tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: '#666' }}>RU tekstas</label>
                    <textarea
                      value={editingClientObligation.text_ru || ''}
                      onChange={(e) => setEditingClientObligation({ ...editingClientObligation, text_ru: e.target.value })}
                      rows={2}
                      placeholder="RU tekstas..."
                      style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={handleSaveClientObligation}
                    className="button button-primary"
                    style={{ padding: '3px 8px', fontSize: '10px' }}
                  >
                    Išsaugoti
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingClientObligation(null); setEditingClientObligationIndex(null); }}
                    className="button button-secondary"
                    style={{ padding: '3px 8px', fontSize: '10px' }}
                  >
                    Atšaukti
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-field full-width" style={{ marginTop: '8px' }}>
            <label style={{ fontSize: '11px', marginBottom: '3px' }}>Pastabos</label>
            <textarea
              value={expeditionSettings.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={2}
              placeholder="Papildoma informacija apie ekspedicijų numeravimą..."
              style={{ padding: '4px 6px', fontSize: '11px' }}
            />
          </div>
        </div>

        <div className="form-actions" style={{ paddingTop: '6px', marginTop: '4px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '4px 12px', fontSize: '11px' }}>
            {saving ? 'Išsaugoma...' : 'Išsaugoti'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpeditionSettingsForm;

