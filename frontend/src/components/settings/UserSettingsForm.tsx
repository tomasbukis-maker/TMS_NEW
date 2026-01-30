import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface UserSettings {
  id: number;
  user_id: number;
  username: string;
  role: string;
  last_login?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  signature_image?: string | null;
  signature_image_url?: string | null;
  language: 'lt' | 'en';
  date_format: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  timezone: string;
  created_at?: string;
  updated_at?: string;
}

interface UserSettingsFormProps {
  userSettings: UserSettings;
  onUpdate: (settings: UserSettings) => void;
  onSave: (settings: UserSettings, signatureFile: File | null) => Promise<void>;
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
  saving: boolean;
}

const UserSettingsForm: React.FC<UserSettingsFormProps> = ({
  userSettings: initialUserSettings,
  onUpdate,
  onSave,
  onMessage,
  saving
}) => {
  const [userSettings, setUserSettings] = useState<UserSettings>(initialUserSettings);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [passwordFields, setPasswordFields] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    setUserSettings({
      ...initialUserSettings,
      first_name: initialUserSettings.first_name ?? '',
      last_name: initialUserSettings.last_name ?? '',
      email: initialUserSettings.email ?? '',
      phone: initialUserSettings.phone ?? '',
    });
    if (initialUserSettings.signature_image_url) {
      setSignaturePreview(initialUserSettings.signature_image_url);
    }
  }, [initialUserSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(userSettings, signatureFile);
  };
  
  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSignatureFile(file);
      
      // Sukurti preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignaturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleRemoveSignature = () => {
    setSignatureFile(null);
    setSignaturePreview(null);
    updateField('signature_image', '');
  };

  const updateField = (field: keyof UserSettings, value: any) => {
    const updated = { ...userSettings, [field]: value };
    setUserSettings(updated);
    onUpdate(updated);
  };

  const handlePasswordFieldChange = (field: 'old_password' | 'new_password' | 'confirm_password', value: string) => {
    setPasswordFields((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = async () => {
    onMessage(null);
    setPasswordLoading(true);
    try {
      await api.post('/settings/user/change_password/', {
        old_password: passwordFields.old_password,
        new_password: passwordFields.new_password,
        confirm_password: passwordFields.confirm_password,
      });
      onMessage({ type: 'success', text: 'Slaptažodis sėkmingai pakeistas.' });
      setPasswordFields({ old_password: '', new_password: '', confirm_password: '' });
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data || error.message;
      onMessage({ type: 'error', text: typeof errorMsg === 'string' ? errorMsg : 'Nepavyko pakeisti slaptažodžio.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const formatLastLogin = (value?: string | null) => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      return date.toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <div className="settings-section user-settings-compact">
      <form onSubmit={handleSubmit}>
        <div className="user-settings-sections">
          <div className="info-card full-span">
            <div className="info-card-header">
              <h3>Profilio informacija</h3>
              <p>Asmeniniai duomenys, rodomi dokumentuose ir komunikacijoje</p>
            </div>
            <div className="info-card-grid columns-2">
              <div className="form-field">
                <label>Vardas</label>
                <input
                  type="text"
                  value={userSettings.first_name || ''}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  placeholder="Jūsų vardas"
                />
              </div>
              <div className="form-field">
                <label>Pavardė</label>
                <input
                  type="text"
                  value={userSettings.last_name || ''}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  placeholder="Jūsų pavardė"
                />
              </div>
              <div className="form-field">
                <label>El. paštas</label>
                <input
                  type="email"
                  value={userSettings.email || ''}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="pvz@pvz.lt"
                />
              </div>
              <div className="form-field">
                <label>Telefonas</label>
                <input
                  type="tel"
                  value={userSettings.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+370 600 00000"
                />
              </div>
              <div className="form-field">
                <label>Pareigos</label>
                <input
                  type="text"
                  value={userSettings.position || ''}
                  onChange={(e) => updateField('position', e.target.value)}
                  placeholder="pvz., Vadybininkas, Direktorius"
                />
              </div>
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>Parašo/Stampo paveikslėlis</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {signaturePreview && (
                  <div style={{ 
                    border: '1px solid #ddd', 
                    borderRadius: '4px', 
                    padding: '8px',
                    backgroundColor: '#fff',
                    maxWidth: '200px'
                  }}>
                    <img 
                      src={signaturePreview} 
                      alt="Parašo peržiūra" 
                      style={{ maxWidth: '100%', maxHeight: '100px', display: 'block' }}
                    />
                  </div>
                )}
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureFileChange}
                    style={{ marginBottom: '8px' }}
                  />
                  {signaturePreview && (
                    <button
                      type="button"
                      onClick={handleRemoveSignature}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Pašalinti
                    </button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '4px', marginBottom: 0 }}>
                Įkelkite parašo arba stampo paveikslėlį, kuris bus naudojamas dokumentuose
              </p>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <h3>Paskyros identifikatoriai</h3>
              <p>Ši informacija yra neredaguojama ir naudojama autentifikacijai</p>
            </div>
            <div className="info-chip-group">
              <span className="info-chip">
                <strong>Vartotojo vardas:</strong> {userSettings.username}
              </span>
              <span className="info-chip secondary">
                <strong>ID:</strong> {userSettings.user_id}
              </span>
              <span className="info-chip secondary">
                <strong>Rolė:</strong> {userSettings.role || 'Be rolės'}
              </span>
              <span className="info-chip secondary">
                <strong>Paskutinį kartą prisijungė:</strong> {formatLastLogin(userSettings.last_login)}
              </span>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <h3>Sistemos nustatymai</h3>
              <p>Pasirinkimai, kaip rodoma informacija ir suderinama sąsaja</p>
            </div>
            <div className="info-card-grid columns-2">
              <div className="form-field">
                <label>Kalba</label>
                <select
                  value={userSettings.language}
                  onChange={(e) => updateField('language', e.target.value as 'lt' | 'en')}
                >
                  <option value="lt">Lietuvių</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="form-field">
                <label>Datos formatas</label>
                <select
                  value={userSettings.date_format}
                  onChange={(e) => updateField('date_format', e.target.value as any)}
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </div>

              <div className="form-field">
                <label>Laiko juosta</label>
                <input
                  type="text"
                  value={userSettings.timezone}
                  onChange={(e) => updateField('timezone', e.target.value)}
                  placeholder="Pvz.: Europe/Vilnius"
                />
              </div>
            </div>
          </div>

          <div className="info-card full-span">
            <div className="info-card-header">
              <h3>Paskyros sauga</h3>
              <p>Pakeiskite savo prisijungimo slaptažodį</p>
            </div>
            <div className="info-card-grid columns-2 compact">
              <div className="form-field">
                <label>Dabartinis slaptažodis</label>
                <input
                  type="password"
                  value={passwordFields.old_password}
                  onChange={(e) => handlePasswordFieldChange('old_password', e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="form-field">
                <label>Naujas slaptažodis</label>
                <input
                  type="password"
                  value={passwordFields.new_password}
                  onChange={(e) => handlePasswordFieldChange('new_password', e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-field">
                <label>Pakartokite naują slaptažodį</label>
                <input
                  type="password"
                  value={passwordFields.confirm_password}
                  onChange={(e) => handlePasswordFieldChange('confirm_password', e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="form-actions compact" style={{ paddingTop: '4px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePasswordChange}
                disabled={passwordLoading || saving}
                style={{ padding: '5px 18px', fontSize: '12px' }}
              >
                {passwordLoading ? 'Keičiama...' : 'Pakeisti slaptažodį'}
              </button>
            </div>
          </div>
        </div>

        <div className="form-actions compact" style={{ paddingTop: '10px', marginTop: '6px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '5px 18px', fontSize: '12px' }}>
            {saving ? 'Išsaugoma...' : 'Išsaugoti'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserSettingsForm;


