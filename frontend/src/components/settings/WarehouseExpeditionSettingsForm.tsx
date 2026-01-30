import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface WarehouseExpeditionSettings {
  id: number;
  expedition_prefix: string;
  expedition_number_width: number;
  auto_numbering: boolean;
  last_warehouse_number?: string | null;
  next_warehouse_number?: string | null;
  next_warehouse_number_edit?: string;
  created_at?: string;
  updated_at?: string;
}

interface WarehouseExpeditionSettingsFormProps {
  warehouseSettings: WarehouseExpeditionSettings;
  onUpdate: (settings: WarehouseExpeditionSettings) => void;
  onSave: (settings: WarehouseExpeditionSettings) => Promise<void>;
  saving: boolean;
}

interface GapInfo {
  number: string;
  range: string;
  count: number;
}

const WarehouseExpeditionSettingsForm: React.FC<WarehouseExpeditionSettingsFormProps> = ({
  warehouseSettings: initialSettings,
  onUpdate,
  onSave,
  saving,
}) => {
  const [warehouseSettings, setWarehouseSettings] = useState<WarehouseExpeditionSettings>(initialSettings);
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [gapsCount, setGapsCount] = useState<number>(0);
  const [loadingGaps, setLoadingGaps] = useState(false);

  useEffect(() => {
    setWarehouseSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    fetchGaps();
  }, [warehouseSettings.expedition_prefix, warehouseSettings.expedition_number_width]);

  const fetchGaps = async () => {
    setLoadingGaps(true);
    try {
      const response = await api.get('/orders/carriers/get_gaps/', {
        params: { max_gaps: 10, carrier_type: 'warehouse' }
      });
      if (response.data.has_gaps) {
        setGaps(response.data.gaps || []);
        setGapsCount(response.data.gaps_count || 0);
      } else {
        setGaps([]);
        setGapsCount(0);
      }
    } catch (error: any) {
      console.error('Klaida gaunant sandėlių ekspedicijų tarpus:', error);
      setGaps([]);
      setGapsCount(0);
    } finally {
      setLoadingGaps(false);
    }
  };

  const updateField = (field: keyof WarehouseExpeditionSettings, value: any) => {
    const updated = { ...warehouseSettings, [field]: value };
    setWarehouseSettings(updated);
    onUpdate(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(warehouseSettings);
  };

  const currentPrefix = warehouseSettings.expedition_prefix || 'WH-';
  const currentWidth = warehouseSettings.expedition_number_width || 5;
  const sampleNumber = `${currentPrefix}${String(1).padStart(currentWidth, '0')}`;

  return (
    <div className="settings-section order-settings-compact">
      <h2 style={{ fontSize: '15px', marginBottom: '4px', fontWeight: '600' }}>Sandėlių nustatymai</h2>
      <p className="section-description" style={{ fontSize: '10px', marginBottom: '8px', color: '#666' }}>
        Valdykite sandėlių ekspedicijų numeravimą. Numeris formuojamas kaip prefiksas + skaitmenys, pvz.: <strong>{sampleNumber}</strong>.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-grid order-settings-grid" style={{ gap: '8px' }}>
          {/* Sandėlių numeracijos informacija ir tarpai - vienoje eilutėje */}
          <div className="form-field full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Sandėlių numeracijos informacija */}
            <div style={{
              padding: '6px',
              backgroundColor: '#f0f7ff',
              borderRadius: '3px',
              border: '1px solid #b3d9ff'
            }}>
              <label style={{ fontWeight: 'bold', marginBottom: '6px', display: 'block', fontSize: '11px' }}>Sandėlių numeracijos informacija</label>

              {/* Automatinis numeravimas */}
              <div style={{ marginBottom: '6px' }}>
                <label className="checkbox-label" style={{ fontSize: '10px', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={warehouseSettings.auto_numbering}
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
                    value={warehouseSettings.expedition_prefix || ''}
                    onChange={(e) => updateField('expedition_prefix', e.target.value.trimStart())}
                    placeholder="Pvz.: WH-"
                    required
                    style={{ padding: '3px 5px', fontSize: '11px', width: '100%' }}
                  />
                  <small style={{ color: '#666', fontSize: '8px', marginTop: '1px', display: 'block' }}>
                    Pvz.: WH-
                  </small>
                </div>

                <div>
                  <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>Skaitmenų sk. *</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={warehouseSettings.expedition_number_width}
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
              {(warehouseSettings.last_warehouse_number || warehouseSettings.next_warehouse_number) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid #b3d9ff', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#666', fontSize: '10px' }}>Paskutinė:</span>
                    <strong style={{ fontSize: '11px', color: '#333' }}>
                      {warehouseSettings.last_warehouse_number || 'Nėra'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ color: '#666', fontSize: '10px' }}>Sekanti:</span>
                    <strong style={{ fontSize: '11px', color: '#0066cc' }}>
                      {warehouseSettings.next_warehouse_number || 'Nėra'}
                    </strong>
                  </div>
                  <div style={{ marginTop: '3px', paddingTop: '4px', borderTop: '1px solid #b3d9ff' }}>
                    <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#666' }}>
                      Nustatyti sekantį numerį:
                    </label>
                    <input
                      type="text"
                      value={warehouseSettings.next_warehouse_number_edit || warehouseSettings.next_warehouse_number || ''}
                      onChange={(e) => updateField('next_warehouse_number_edit', e.target.value)}
                      placeholder={warehouseSettings.next_warehouse_number || sampleNumber}
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

            {/* Sandėlių numerių tarpai */}
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
                  Sandėlių numerių tarpai
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

export default WarehouseExpeditionSettingsForm;
