import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface OrderAutoStatusSettings {
  id: number;
  enabled: boolean;
  auto_new_to_assigned: boolean;
  auto_assigned_to_executing: boolean;
  auto_executing_to_waiting: boolean;
  auto_waiting_to_payment: boolean;
  auto_payment_to_finished: boolean;
  auto_finished_to_closed: boolean;
  days_after_unloading: number;
}

interface OrderAutoStatusSettingsFormProps {
  onMessage?: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

const OrderAutoStatusSettingsForm: React.FC<OrderAutoStatusSettingsFormProps> = ({
  onMessage
}) => {
  const [settings, setSettings] = useState<OrderAutoStatusSettings>({
    id: 1,
    enabled: true,
    auto_new_to_assigned: true,
    auto_assigned_to_executing: true,
    auto_executing_to_waiting: true,
    auto_waiting_to_payment: true,
    auto_payment_to_finished: true,
    auto_finished_to_closed: true,
    days_after_unloading: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/order-auto-status/current/');
      setSettings(response.data);
    } catch (error: any) {
      console.error('Klaida užkraunant nustatymus:', error);
      if (onMessage) {
        onMessage({ type: 'error', text: 'Klaida užkraunant nustatymus' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings/order-auto-status/current/', settings);
      if (onMessage) {
        onMessage({ type: 'success', text: 'Nustatymai sėkmingai išsaugoti!' });
      }
    } catch (error: any) {
      const errorMsg = error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
      if (onMessage) {
        onMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof OrderAutoStatusSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return <div>Kraunama...</div>;
  }

  return (
    <div className="settings-section">
      <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: '600' }}>
        Užsakymų automatinio statusų keitimo nustatymai
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="card-section" style={{ marginBottom: '20px' }}>
          <h3 className="section-title" style={{ marginBottom: '15px' }}>Bendri nustatymai</h3>
          
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateField('enabled', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>
                Įjungti automatinį statusų keitimą
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Jei įjungta, užsakymų statusai bus keičiami automatiškai pagal datas ir kitus kriterijus
            </small>
          </div>
        </div>

        <div className="card-section" style={{ marginBottom: '20px' }}>
          <h3 className="section-title" style={{ marginBottom: '15px' }}>Automatiniai statusų keitimai</h3>
          
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_new_to_assigned}
                onChange={(e) => updateField('auto_new_to_assigned', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Naujas" į "Priskirtas"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai užsakymui priskiriamas vežėjas, automatiškai keisti statusą į "Priskirtas"
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_assigned_to_executing}
                onChange={(e) => updateField('auto_assigned_to_executing', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Priskirtas" į "Vykdomas"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai šiandien yra tarp pakrovimo ir iškrovimo datų, automatiškai keisti statusą į "Vykdomas"
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_executing_to_waiting}
                onChange={(e) => updateField('auto_executing_to_waiting', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Vykdomas" į "Laukiama Dokumentų"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai iškrovimo data praėjo (su nustatytu dienų skaičiumi), automatiškai keisti statusą į "Laukiama Dokumentų"
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '14px', marginBottom: '6px', display: 'block' }}>
              Dienų po iškrovimo (0 = tą pačią dieną)
            </label>
            <input
              type="number"
              value={settings.days_after_unloading}
              onChange={(e) => updateField('days_after_unloading', parseInt(e.target.value) || 0)}
              disabled={!settings.enabled || !settings.auto_executing_to_waiting}
              min="0"
              style={{
                width: '100px',
                padding: '6px 8px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                opacity: (settings.enabled && settings.auto_executing_to_waiting) ? 1 : 0.5,
                cursor: (settings.enabled && settings.auto_executing_to_waiting) ? 'text' : 'not-allowed'
              }}
            />
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666' }}>
              Kiek dienų po iškrovimo datos keisti statusą į "Laukiama Dokumentų" (0 = tą pačią dieną)
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_waiting_to_payment}
                onChange={(e) => updateField('auto_waiting_to_payment', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Laukiama Dokumentų" į "Laukiama Apmokėjimo"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai visi dokumentai gauti iš vežėjo ir sąskaita išsiųsta užsakovui, automatiškai keisti statusą į "Laukiama Apmokėjimo"
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_payment_to_finished}
                onChange={(e) => updateField('auto_payment_to_finished', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Laukiama Apmokėjimo" į "Baigtas"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai apmokėjimas iš kliento gautas, automatiškai keisti statusą į "Baigtas"
            </small>
          </div>

          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_finished_to_closed}
                onChange={(e) => updateField('auto_finished_to_closed', e.target.checked)}
                disabled={!settings.enabled}
                style={{ width: '18px', height: '18px', cursor: settings.enabled ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', opacity: settings.enabled ? 1 : 0.5 }}>
                Automatiškai keisti iš "Baigtas" į "Uždarytas"
              </span>
            </label>
            <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#666', marginLeft: '26px' }}>
              Kai sumokėta visiems vežėjams, automatiškai keisti statusą į "Uždarytas"
            </small>
          </div>
        </div>

        <div className="card-section" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px', fontWeight: '600' }}>
            ℹ️ Kaip veikia automatinis statusų keitimas?
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.6', color: '#495057' }}>
            <li style={{ marginBottom: '8px' }}>
              <strong>new → assigned:</strong> Kai užsakymui priskiriamas vežėjas, statusas automatiškai keičiamas į "Priskirtas"
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>assigned → executing:</strong> Kai šiandien yra tarp pakrovimo ir iškrovimo datų, statusas automatiškai keičiamas į "Vykdomas"
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>executing → waiting_for_docs:</strong> Kai iškrovimo data praėjo (su nustatytu dienų skaičiumi), statusas automatiškai keičiamas į "Laukiama Dokumentų"
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>waiting_for_docs → waiting_for_payment:</strong> Kai visi dokumentai gauti iš vežėjo ir sąskaita išsiųsta užsakovui, statusas automatiškai keičiamas į "Laukiama Apmokėjimo"
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>waiting_for_payment → finished:</strong> Kai apmokėjimas iš kliento gautas, statusas automatiškai keičiamas į "Baigtas"
            </li>
            <li>
              <strong>finished → closed:</strong> Kai sumokėta visiems vežėjams, statusas automatiškai keičiamas į "Uždarytas"
            </li>
          </ul>
          <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            <strong>Pastaba:</strong> Statusą visada galite keisti rankiniu būdu per užsakymų modalo UI, nepriklausomai nuo automatinio keitimo nustatymų. Automatinis keitimas veikia tik kai užsakymas išsaugomas.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
            style={{ padding: '8px 16px', fontSize: '14px' }}
          >
            {saving ? 'Išsaugoma...' : 'Išsaugoti nustatymus'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrderAutoStatusSettingsForm;
