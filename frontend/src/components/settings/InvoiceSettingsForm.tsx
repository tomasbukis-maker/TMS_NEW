import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import PvmRateFormModal from './PvmRateFormModal';
import '../../pages/SettingsPage.css';

interface GapInfo {
  number: string;
  range: string;
  count: number;
}

interface InvoiceSettings {
  id: number;
  default_vat_rate: string;
  default_payment_term_days: number;
  invoice_prefix_sales: string;
  invoice_number_width: number;
  invoice_footer_text: string;
  auto_numbering: boolean;
  last_invoice_number?: string | null;
  next_invoice_number?: string;
  next_invoice_number_edit?: string;
  default_display_options?: {
    show_order_type?: boolean;
    show_cargo_info?: boolean;
    show_cargo_weight?: boolean;
    show_cargo_ldm?: boolean;
    show_cargo_dimensions?: boolean;
    show_cargo_properties?: boolean;
    show_carriers?: boolean;
    show_carrier_name?: boolean;
    show_carrier_route?: boolean;
    show_carrier_dates?: boolean;
    show_prices?: boolean;
    show_my_price?: boolean;
    show_other_costs?: boolean;
  };
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  article_en?: string;
  article_ru?: string;
  is_active: boolean;
  sequence_order: number;
  created_at?: string;
  updated_at?: string;
}

interface InvoiceSettingsFormProps {
  invoiceSettings: InvoiceSettings;
  onUpdate: (settings: InvoiceSettings) => void;
  onSave: (settings: InvoiceSettings) => Promise<void>;
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
  saving: boolean;
}

const InvoiceSettingsForm: React.FC<InvoiceSettingsFormProps> = ({
  invoiceSettings: initialInvoiceSettings,
  onUpdate,
  onSave,
  onMessage,
  saving
}) => {
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(initialInvoiceSettings);
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);
  const [editingPvmRate, setEditingPvmRate] = useState<PVMRate | null>(null);
  const [showPvmRateForm, setShowPvmRateForm] = useState(false);
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [gapsCount, setGapsCount] = useState<number>(0);
  const [loadingGaps, setLoadingGaps] = useState(false);

  useEffect(() => {
    setInvoiceSettings(initialInvoiceSettings);
  }, [initialInvoiceSettings]);

  useEffect(() => {
    fetchPvmRates();
  }, []);

  useEffect(() => {
    fetchGaps();
  }, [invoiceSettings.invoice_prefix_sales, invoiceSettings.invoice_number_width]);

  const fetchGaps = async () => {
    setLoadingGaps(true);
    try {
      const response = await api.get('/invoices/sales/get_gaps/', {
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
      console.error('Klaida gaunant sąskaitų tarpus:', error);
      setGaps([]);
      setGapsCount(0);
    } finally {
      setLoadingGaps(false);
    }
  };

  const fetchPvmRates = async () => {
    try {
      const response = await api.get('/settings/pvm-rates/');
      setPvmRates(response.data.results || response.data || []);
    } catch (error: any) {
      // Error handling - silent fail
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(invoiceSettings);
  };

  const updateField = (field: keyof InvoiceSettings, value: any) => {
    const updated = { ...invoiceSettings, [field]: value };
    setInvoiceSettings(updated);
    onUpdate(updated);
  };

  const updateDisplayOption = (option: string, value: boolean) => {
    const updated = {
      ...invoiceSettings,
      default_display_options: {
        ...invoiceSettings.default_display_options,
        [option]: value,
      }
    };
    setInvoiceSettings(updated);
    onUpdate(updated);
  };

  const handleSavePvmRate = async (rate: PVMRate) => {
    try {
      if (rate.id) {
        await api.put(`/settings/pvm-rates/${rate.id}/`, rate);
        onMessage({ type: 'success', text: 'PVM tarifas sėkmingai atnaujintas!' });
      } else {
        await api.post('/settings/pvm-rates/', rate);
        onMessage({ type: 'success', text: 'PVM tarifas sėkmingai sukurtas!' });
      }
      setShowPvmRateForm(false);
      setEditingPvmRate(null);
      await fetchPvmRates();
    } catch (error: any) {
      const errorMsg = error.response?.data 
        ? (typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data))
        : error.message;
      onMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    }
  };

  const handleDeletePvmRate = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šį PVM tarifą?')) return;
    try {
      await api.delete(`/settings/pvm-rates/${id}/`);
      onMessage({ type: 'success', text: 'PVM tarifas sėkmingai ištrintas!' });
      await fetchPvmRates();
    } catch (error: any) {
      onMessage({ type: 'error', text: 'Klaida trinant PVM tarifą' });
    }
  };

  return (
    <>
      <div className="settings-section invoice-settings-compact">
        <h2 style={{ fontSize: '15px', marginBottom: '4px', fontWeight: '600' }}>Sąskaitų nustatymai</h2>
        <p className="section-description" style={{ fontSize: '10px', marginBottom: '8px', color: '#666' }}>
          Nustatykite numatytąsias sąskaitų vertes ir numeravimą.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-grid invoice-settings-grid" style={{ gap: '8px' }}>
            {/* Sąskaitų numeracijos informacija ir tarpai - vienoje eilutėje */}
            <div className="form-field full-width" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* Sąskaitų numeracijos informacija */}
              <div style={{ 
                padding: '6px', 
                backgroundColor: '#f0f7ff', 
                borderRadius: '3px', 
                border: '1px solid #b3d9ff'
              }}>
                <label style={{ fontWeight: 'bold', marginBottom: '6px', display: 'block', fontSize: '11px' }}>Sąskaitų numeracijos informacija</label>
                
                {/* Automatinis numeravimas */}
                <div style={{ marginBottom: '6px' }}>
                  <label className="checkbox-label" style={{ fontSize: '10px', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={invoiceSettings.auto_numbering}
                      onChange={(e) => updateField('auto_numbering', e.target.checked)}
                      style={{ marginRight: '4px' }}
                    />
                    <span>Automatinis numeravimas</span>
                  </label>
                </div>
                
                {/* Pardavimo sąskaitų prefiksas ir skaitmenų skaičius */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                  <div>
                    <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>Prefiksas *</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={invoiceSettings.invoice_prefix_sales}
                      onChange={(e) => updateField('invoice_prefix_sales', e.target.value)}
                      required
                      style={{ padding: '3px 5px', fontSize: '11px', width: '100%' }}
                    />
                    <small style={{ color: '#666', fontSize: '8px', marginTop: '1px', display: 'block' }}>
                      Pvz.: LOG
                    </small>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '10px', marginBottom: '2px', display: 'block' }}>Skaitmenų sk. *</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={invoiceSettings.invoice_number_width}
                      onChange={(e) => updateField('invoice_number_width', parseInt(e.target.value) || 7)}
                      required
                      style={{ padding: '3px 5px', fontSize: '11px', width: '100%' }}
                    />
                    <small style={{ color: '#666', fontSize: '8px', marginTop: '1px', display: 'block' }}>
                      Pvz.: 7
                    </small>
                  </div>
                </div>

                {/* Numeracijos informacija */}
                {(invoiceSettings.last_invoice_number || invoiceSettings.next_invoice_number) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px', borderTop: '1px solid #b3d9ff', marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#666', fontSize: '10px' }}>Paskutinė:</span>
                      <strong style={{ fontSize: '11px', color: '#333' }}>
                        {invoiceSettings.last_invoice_number || 'Nėra'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                      <span style={{ color: '#666', fontSize: '10px' }}>Sekanti:</span>
                      <strong style={{ fontSize: '11px', color: '#0066cc' }}>
                        {invoiceSettings.next_invoice_number || 'Nėra'}
                      </strong>
                    </div>
                    <div style={{ marginTop: '3px', paddingTop: '4px', borderTop: '1px solid #b3d9ff' }}>
                      <label style={{ display: 'block', marginBottom: '2px', fontSize: '10px', color: '#666' }}>
                        Nustatyti sekantį numerį:
                      </label>
                      <input
                        type="text"
                        value={invoiceSettings.next_invoice_number_edit || invoiceSettings.next_invoice_number || ''}
                        onChange={(e) => updateField('next_invoice_number_edit', e.target.value.toUpperCase())}
                        placeholder={invoiceSettings.next_invoice_number || `PVZ: ${invoiceSettings.invoice_prefix_sales}0001234`}
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

              {/* Sąskaitų numerių tarpai */}
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
                    Sąskaitų numerių tarpai
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

          {/* Kiti nustatymai */}
          <div className="form-grid invoice-settings-grid" style={{ marginTop: '8px', gap: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-field">
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Numatytasis PVM tarifas (%) *</label>
              <input
                type="number"
                step="0.01"
                value={invoiceSettings.default_vat_rate}
                onChange={(e) => updateField('default_vat_rate', e.target.value)}
                required
                style={{ padding: '4px 6px', fontSize: '12px' }}
              />
            </div>
            
            <div className="form-field">
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Numatytasis mokėjimo terminas (dienos) *</label>
              <input
                type="number"
                min="1"
                value={invoiceSettings.default_payment_term_days}
                onChange={(e) => updateField('default_payment_term_days', parseInt(e.target.value) || 30)}
                required
                style={{ padding: '4px 6px', fontSize: '12px' }}
              />
            </div>
            
            <div className="form-field">
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Sąskaitos apačios tekstas</label>
              <textarea
                value={invoiceSettings.invoice_footer_text}
                onChange={(e) => updateField('invoice_footer_text', e.target.value)}
                rows={2}
                placeholder="Šis tekstas bus rodomas sąskaitos apačioje..."
                style={{ padding: '4px 6px', fontSize: '11px', width: '100%' }}
              />
            </div>
            
            {/* Rodymo pasirinkimai pagal nutylėjimą */}
            <div className="form-field full-width" style={{ borderTop: '1px solid #e0e0e0', paddingTop: '6px', marginTop: '4px' }}>
              <h3 style={{ marginBottom: '4px', fontSize: '11px', fontWeight: 'bold' }}>Sąskaitos rodymo nustatymai (pagal nutylėjimą)</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
                {/* Užsakymo tipas */}
                <div style={{ padding: '4px', backgroundColor: '#f9f9f9', borderRadius: '3px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '10px' }}>
                    <input
                      type="checkbox"
                      checked={invoiceSettings.default_display_options?.show_order_type ?? true}
                      onChange={(e) => updateDisplayOption('show_order_type', e.target.checked)}
                      style={{ marginRight: '4px' }}
                    />
                    Užsakymo tipas
                  </label>
                </div>
                
                {/* Krovinių informacija */}
                <div style={{ padding: '4px', backgroundColor: '#f9f9f9', borderRadius: '3px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '10px' }}>
                    <input
                      type="checkbox"
                      checked={invoiceSettings.default_display_options?.show_cargo_info ?? true}
                      onChange={(e) => {
                        // Kai keičiasi show_cargo_info, automatiškai nustatyti visus sub-options į tą pačią reikšmę
                        const value = e.target.checked;
                        const updated = {
                          ...invoiceSettings,
                          default_display_options: {
                            ...invoiceSettings.default_display_options,
                            show_cargo_info: value,
                            show_cargo_weight: value,
                            show_cargo_ldm: value,
                            show_cargo_dimensions: value,
                            show_cargo_properties: value
                          }
                        };
                        setInvoiceSettings(updated);
                        onUpdate(updated);
                      }}
                      style={{ marginRight: '4px' }}
                    />
                    Krovinių informacija (svoris, matmenys, savybės)
                  </label>
                </div>
                
                {/* Vežėjai ir sandėliai */}
                <div style={{ padding: '4px', backgroundColor: '#f9f9f9', borderRadius: '3px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '10px' }}>
                    <input
                      type="checkbox"
                      checked={invoiceSettings.default_display_options?.show_carriers ?? false}
                      onChange={(e) => {
                        const value = e.target.checked;
                        const updated = {
                          ...invoiceSettings,
                          default_display_options: {
                            ...invoiceSettings.default_display_options,
                            show_carriers: value,
                            show_carrier_name: value,
                            show_carrier_route: value,
                            show_carrier_dates: value
                          }
                        };
                        setInvoiceSettings(updated);
                        onUpdate(updated);
                      }}
                      style={{ marginRight: '4px' }}
                    />
                    Vežėjai (NESIŪLOMA rodyti klientams!)
                  </label>
                </div>
                
                {/* Papildomos išlaidos */}
                <div style={{ padding: '4px', backgroundColor: '#f9f9f9', borderRadius: '3px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '10px' }}>
                    <input
                      type="checkbox"
                      checked={invoiceSettings.default_display_options?.show_other_costs ?? true}
                      onChange={(e) => updateDisplayOption('show_other_costs', e.target.checked)}
                      style={{ marginRight: '4px' }}
                    />
                    Papildomos išlaidos (muitinė, draudimas ir t.t.)
                  </label>
                </div>
              </div>
            </div>
            
            <div className="form-field full-width">
              <label style={{ fontSize: '11px', marginBottom: '3px' }}>Pastabos</label>
              <textarea
                value={invoiceSettings.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={2}
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

        {/* PVM Tarifų valdymas */}
        <div style={{ marginTop: '12px', borderTop: '1px solid #e0e0e0', paddingTop: '8px' }}>
          <h3 style={{ marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>PVM Tarifai su Straipsniais</h3>
          <p className="section-description" style={{ marginBottom: '8px', fontSize: '10px', color: '#666' }}>
            Valdykite PVM tarifus su atitinkamais straipsniais. Rašant sąskaitą, galėsite pasirinkti tinkamą PVM tarifą.
          </p>

          <div style={{ marginBottom: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setEditingPvmRate({
                  rate: '21.00',
                  article: '',
                  is_active: true,
                  sequence_order: pvmRates.length
                });
                setShowPvmRateForm(true);
              }}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '11px', marginBottom: '8px' }}
            >
              + Pridėti naują PVM tarifą
            </button>
          </div>

          {/* PVM Tarifų sąrašas */}
          {pvmRates.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold' }}>PVM Tarifas</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold' }}>Straipsnis</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>Aktyvus</th>
                    <th style={{ padding: '4px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {pvmRates.map((rate) => (
                    <tr key={rate.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 6px' }}>{rate.rate}%</td>
                      <td style={{ padding: '4px 6px' }}>{rate.article || '-'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        {rate.is_active ? '✓' : '✗'}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPvmRate(rate);
                            setShowPvmRateForm(true);
                          }}
                          className="btn btn-secondary"
                          style={{ fontSize: '10px', padding: '2px 6px', marginRight: '3px' }}
                        >
                          Red.
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePvmRate(rate.id!)}
                          className="btn btn-secondary"
                          style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                        >
                          Trinti
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pvmRates.length === 0 && (
            <div style={{ padding: '8px', textAlign: 'center', color: '#999', backgroundColor: '#fafafa', borderRadius: '3px', fontSize: '10px' }}>
              PVM tarifų nėra. Pridėkite pirmąjį.
            </div>
          )}
        </div>
      </div>

      <PvmRateFormModal
        isOpen={showPvmRateForm}
        pvmRate={editingPvmRate}
        onClose={() => {
          setShowPvmRateForm(false);
          setEditingPvmRate(null);
        }}
        onSave={handleSavePvmRate}
        onUpdate={(rate) => setEditingPvmRate(rate)}
        saving={saving}
      />
    </>
  );
};

export default InvoiceSettingsForm;
