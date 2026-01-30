import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface NotificationSettings {
  id: number;
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  smtp_username: string;
  smtp_password?: string;
  smtp_from_email: string;
  smtp_from_name: string;
  imap_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  imap_use_starttls: boolean;
  imap_username: string;
  imap_password?: string;
  imap_folder: string;
  imap_sync_interval_minutes: number;
  // SĄSKAITOS
  email_notify_due_soon_enabled: boolean;
  email_notify_due_soon_days_before: number;
  email_notify_due_soon_recipient: 'client' | 'manager' | 'both';
  email_notify_due_soon_min_amount: number;
  email_notify_unpaid_enabled: boolean;
  email_notify_unpaid_interval_days: number;
  email_notify_unpaid_recipient: 'client' | 'manager' | 'both';
  email_notify_unpaid_min_amount: number;
  email_notify_overdue_enabled: boolean;
  email_notify_overdue_min_days: number;
  email_notify_overdue_max_days: number;
  email_notify_overdue_interval_days: number;
  email_notify_overdue_recipient: 'client' | 'manager' | 'both';
  email_notify_overdue_min_amount: number;
  overdue_reminder_mode: 'automatic' | 'manual' | 'both';
  // UŽSAKYMAI
  email_notify_new_order_enabled: boolean;
  email_notify_new_order_recipient: 'client' | 'manager' | 'both';
  email_notify_order_status_changed_enabled: boolean;
  email_notify_order_status_changed_recipient: 'client' | 'manager' | 'both';
  // EKSPEDICIJOS
  email_notify_new_expedition_enabled: boolean;
  email_notify_new_expedition_recipient: 'carrier' | 'manager' | 'both';
  email_notify_expedition_status_changed_enabled: boolean;
  email_notify_expedition_status_changed_recipient: 'carrier' | 'manager' | 'both';
  // MOKĖJIMAI
  email_notify_payment_received_enabled: boolean;
  email_notify_payment_received_recipient: 'client' | 'manager' | 'both';
  email_notify_payment_received_min_amount: number;
  email_notify_partial_payment_enabled: boolean;
  email_notify_partial_payment_recipient: 'client' | 'manager' | 'both';
  // KRITINĖS SĄSKAITOS
  email_notify_high_amount_invoice_enabled: boolean;
  email_notify_high_amount_threshold: number;
  email_notify_high_amount_recipient: 'client' | 'manager' | 'both';
  email_signature: string;
  email_auto_generated_notice: string;
  email_contact_manager_notice: string;
  email_test_mode: boolean;
  email_test_recipient: string;
  toast_duration_ms: number;
  toast_position: 'top' | 'center' | 'bottom';
  toast_enable_sound: boolean;
  toast_success_color: string;
  toast_error_color: string;
  toast_info_color: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface NotificationSettingsFormProps {
  notificationSettings: NotificationSettings;
  onUpdate: (settings: NotificationSettings) => void;
  onSave: (settings: NotificationSettings) => Promise<void>;
  saving: boolean;
  mode?: 'email' | 'notifications';
}

const NotificationSettingsForm: React.FC<NotificationSettingsFormProps> = ({
  notificationSettings: initialNotificationSettings,
  onUpdate,
  onSave,
  saving,
  mode = 'notifications'
}) => {
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(initialNotificationSettings);
  const isEmailMode = mode === 'email';
  const [testEmail, setTestEmail] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sendingTestImap, setSendingTestImap] = useState(false);
  const [testImapMessage, setTestImapMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setNotificationSettings((prev) => ({
      ...prev,
      ...initialNotificationSettings,
      // SMTP nustatymai
      smtp_enabled: initialNotificationSettings.smtp_enabled ?? false,
      smtp_host: initialNotificationSettings.smtp_host ?? '',
      smtp_port: initialNotificationSettings.smtp_port ?? 587,
      smtp_use_tls: initialNotificationSettings.smtp_use_tls ?? true,
      smtp_username: initialNotificationSettings.smtp_username ?? '',
      smtp_from_email: initialNotificationSettings.smtp_from_email ?? '',
      smtp_from_name: initialNotificationSettings.smtp_from_name ?? '',
      // IMAP nustatymai
      imap_enabled: initialNotificationSettings.imap_enabled ?? false,
      imap_host: initialNotificationSettings.imap_host ?? '',
      imap_port: initialNotificationSettings.imap_port ?? 993,
      imap_use_ssl: initialNotificationSettings.imap_use_ssl ?? true,
      imap_use_starttls: initialNotificationSettings.imap_use_starttls ?? false,
      imap_username: initialNotificationSettings.imap_username ?? '',
      imap_password: initialNotificationSettings.imap_password ?? '',
      imap_folder: initialNotificationSettings.imap_folder ?? 'INBOX',
      imap_sync_interval_minutes: initialNotificationSettings.imap_sync_interval_minutes ?? 5,
      // Testavimo režimas
      email_test_mode: initialNotificationSettings.email_test_mode ?? false,
      email_test_recipient: initialNotificationSettings.email_test_recipient ?? 'info@hotmail.lt',
      // Vėluojama apmokėti
      overdue_reminder_mode: initialNotificationSettings.overdue_reminder_mode ?? 'automatic',
    }));
  }, [initialNotificationSettings]);

  useEffect(() => {
    if (!isEmailMode) {
      setTestEmail('');
      setTestEmailMessage(null);
      setSendingTestEmail(false);
      setSendingTestImap(false);
      setTestImapMessage(null);
    }
  }, [isEmailMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(notificationSettings);
  };

  const updateField = (field: keyof NotificationSettings, value: any) => {
    const updated = { ...notificationSettings, [field]: value };
    setNotificationSettings(updated);
    onUpdate(updated);
    if (typeof field === 'string' && field.startsWith('imap_')) {
      setTestImapMessage(null);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail.trim()) {
      setTestEmailMessage({ type: 'error', text: 'Prašome įvesti el. pašto adresą.' });
      return;
    }

    setSendingTestEmail(true);
    setTestEmailMessage(null);
    const emailToSend = testEmail.trim();

    try {
      const response = await api.post('/settings/notifications/send-test-email/', { email: emailToSend });
      const successMessage = response.data?.message || `Testinis laiškas išsiųstas adresu ${emailToSend}.`;
      setTestEmailMessage({ type: 'success', text: successMessage });
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.detail ||
        error.message ||
        'Nepavyko išsiųsti testinio laiško.';
      setTestEmailMessage({ type: 'error', text: errorMsg });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleTestImapConnection = async () => {
    setSendingTestImap(true);
    setTestImapMessage(null);

    try {
      const payload: Record<string, any> = {
        imap_enabled: notificationSettings.imap_enabled,
        imap_host: notificationSettings.imap_host,
        imap_port: notificationSettings.imap_port,
        imap_use_ssl: notificationSettings.imap_use_ssl,
        imap_use_starttls: notificationSettings.imap_use_starttls,
        imap_username: notificationSettings.imap_username,
        imap_folder: notificationSettings.imap_folder,
      };

      if (notificationSettings.imap_password && notificationSettings.imap_password.trim() !== '') {
        payload.imap_password = notificationSettings.imap_password;
      }

      const response = await api.post('/settings/notifications/test-imap/', payload);
      const message = response.data?.message || 'IMAP prisijungimas pavyko.';
      setTestImapMessage({ type: 'success', text: message });
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.detail ||
        error.message ||
        'Nepavyko prisijungti prie IMAP serverio.';
      setTestImapMessage({ type: 'error', text: errorMsg });
    } finally {
      setSendingTestImap(false);
    }
  };

  return (
    <div className="settings-section notification-settings-compact">
      <h2 className="section-title">
        {isEmailMode ? 'El. pašto nustatymai' : 'UI pranešimų nustatymai'}
      </h2>
      <p className="section-description section-lead">
        {isEmailMode
          ? 'Konfigūruokite el. pašto serverį, IMAP sinchronizaciją ir automatinius pranešimus.'
          : 'Suderinkite programos vidinių pranešimų (toast) elgesį ir išvaizdą.'}
      </p>

      <form onSubmit={handleSubmit}>
        {isEmailMode ? (
          <div className="notification-settings-sections">
            <div className="info-card">
              <div className="info-card-header">
                <h3>SMTP serverio nustatymai</h3>
                <p>Naudojami siunčiant automatinę korespondenciją ir testinius laiškus.</p>
              </div>
              <div className="toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.smtp_enabled}
                    onChange={(e) => updateField('smtp_enabled', e.target.checked)}
                  />
                  Įjungti el. laiškų siuntimą
                </label>
              </div>

              {notificationSettings.smtp_enabled && (
                <div className="info-card-grid columns-2">
                  <div className="form-field">
                    <label>SMTP serveris</label>
                    <input
                      type="text"
                      value={notificationSettings.smtp_host}
                      onChange={(e) => updateField('smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com"
                    />
                  </div>

                  <div className="form-field">
                    <label>SMTP portas</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={notificationSettings.smtp_port}
                      onChange={(e) => updateField('smtp_port', parseInt(e.target.value, 10) || 587)}
                    />
                    <small className="field-hint">Dažniausiai: 587 (TLS) arba 465 (SSL)</small>
                  </div>

                  <div className="form-field">
                    <label>SMTP naudotojas</label>
                    <input
                      type="text"
                      value={notificationSettings.smtp_username}
                      onChange={(e) => updateField('smtp_username', e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>SMTP slaptažodis</label>
                    <input
                      type="password"
                      value={notificationSettings.smtp_password || ''}
                      onChange={(e) => updateField('smtp_password', e.target.value)}
                      placeholder="Palikite tuščią, jei nenorite keisti"
                    />
                  </div>

                  <div className="form-field">
                    <label>Numatytasis siuntėjas (el. paštas)</label>
                    <input
                      type="email"
                      value={notificationSettings.smtp_from_email}
                      onChange={(e) => updateField('smtp_from_email', e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label>Numatytasis siuntėjas (vardas)</label>
                    <input
                      type="text"
                      value={notificationSettings.smtp_from_name}
                      onChange={(e) => updateField('smtp_from_name', e.target.value)}
                    />
                  </div>

                  <div className="form-field checkbox-inline">
                    <label>
                      <input
                        type="checkbox"
                        checked={notificationSettings.smtp_use_tls}
                        onChange={(e) => updateField('smtp_use_tls', e.target.checked)}
                      />
                      Naudoti TLS
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>IMAP (gaunamo pašto) nustatymai</h3>
                <p>Sinchronizuojami laiškai iš pasirinkto pašto dėžutės aplanko.</p>
              </div>

              <div className="toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.imap_enabled}
                    onChange={(e) => updateField('imap_enabled', e.target.checked)}
                  />
                  Įjungti gaunamo pašto sinchronizavimą
                </label>
              </div>

              {notificationSettings.imap_enabled && (
                <>
                  <div className="info-card-grid columns-2">
                    <div className="form-field">
                      <label>IMAP serveris</label>
                      <input
                        type="text"
                        value={notificationSettings.imap_host}
                        onChange={(e) => updateField('imap_host', e.target.value)}
                        placeholder="sykas.serveriai.lt"
                      />
                    </div>

                    <div className="form-field">
                      <label>IMAP portas</label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={notificationSettings.imap_port}
                        onChange={(e) => updateField('imap_port', parseInt(e.target.value, 10) || 993)}
                      />
                      <small className="field-hint">Pvz. 993 (SSL) arba 143 (STARTTLS)</small>
                    </div>

                    <div className="form-field">
                      <label>IMAP naudotojas</label>
                      <input
                        type="text"
                        value={notificationSettings.imap_username}
                        onChange={(e) => updateField('imap_username', e.target.value)}
                        placeholder="tms@loglena.lt"
                      />
                    </div>

                    <div className="form-field">
                      <label>IMAP slaptažodis</label>
                      <input
                        type="password"
                        value={notificationSettings.imap_password || ''}
                        onChange={(e) => updateField('imap_password', e.target.value)}
                        placeholder="Palikite tuščią, jei nenorite keisti"
                      />
                    </div>

                    <div className="form-field">
                      <label>IMAP aplankas</label>
                      <input
                        type="text"
                        value={notificationSettings.imap_folder}
                        onChange={(e) => updateField('imap_folder', e.target.value)}
                        placeholder="INBOX"
                      />
                    </div>

                    <div className="form-field">
                      <label>Automatinės sinchronizacijos intervalas (min.)</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={notificationSettings.imap_sync_interval_minutes}
                        onChange={(e) =>
                          updateField(
                            'imap_sync_interval_minutes',
                            Math.min(1440, Math.max(1, parseInt(e.target.value || '0', 10)))
                          )
                        }
                      />
                      <small className="field-hint">Foninė sinchronizacija vyks kas nurodytą intervalą (1–1440 min.).</small>
                    </div>

                    <div className="form-field checkbox-inline">
                      <label>
                        <input
                          type="checkbox"
                          checked={notificationSettings.imap_use_ssl}
                          onChange={(e) => updateField('imap_use_ssl', e.target.checked)}
                        />
                        Naudoti SSL
                      </label>
                    </div>

                    {!notificationSettings.imap_use_ssl && (
                      <div className="form-field checkbox-inline">
                        <label>
                          <input
                            type="checkbox"
                            checked={notificationSettings.imap_use_starttls}
                            onChange={(e) => updateField('imap_use_starttls', e.target.checked)}
                          />
                          Naudoti STARTTLS
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="inline-action-row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={handleTestImapConnection}
                      disabled={sendingTestImap}
                    >
                      {sendingTestImap ? 'Tikrinama...' : 'Tikrinti prisijungimą prie IMAP'}
                    </button>
                    {testImapMessage && (
                      <div className={`inline-status ${testImapMessage.type}`}>
                        <span>{testImapMessage.text}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>Automatiniai el. laiškų pranešimai</h3>
                <p>Įjunkite priminimus klientams arba komandai apie svarbiausius įvykius.</p>
              </div>

              <div className="info-card-grid columns-1 compact" style={{ gap: '24px' }}>
                {/* SĄSKAITOS */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>📄 SĄSKAITOS</h4>
                  
                  {/* Artėja terminas */}
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_due_soon_enabled ?? false}
                        onChange={(e) => updateField('email_notify_due_soon_enabled', e.target.checked)}
                      />
                      Artėja terminas apmokėjimui
                    </label>
                    {notificationSettings.email_notify_due_soon_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-field">
                          <label>Priminimas X dienų prieš terminą</label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={notificationSettings.email_notify_due_soon_days_before ?? 3}
                            onChange={(e) => updateField('email_notify_due_soon_days_before', parseInt(e.target.value, 10) || 3)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_due_soon_recipient ?? 'client'}
                            onChange={(e) => updateField('email_notify_due_soon_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Minimali suma (EUR, 0 = be apribojimų)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={notificationSettings.email_notify_due_soon_min_amount ?? 0}
                            onChange={(e) => updateField('email_notify_due_soon_min_amount', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Neapmokėta */}
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_unpaid_enabled ?? false}
                        onChange={(e) => updateField('email_notify_unpaid_enabled', e.target.checked)}
                      />
                      Neapmokėta sąskaita
                    </label>
                    {notificationSettings.email_notify_unpaid_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-field">
                          <label>Priminimo intervalas (dienos)</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={notificationSettings.email_notify_unpaid_interval_days ?? 7}
                            onChange={(e) => updateField('email_notify_unpaid_interval_days', parseInt(e.target.value, 10) || 7)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_unpaid_recipient ?? 'client'}
                            onChange={(e) => updateField('email_notify_unpaid_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Minimali suma (EUR, 0 = be apribojimų)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={notificationSettings.email_notify_unpaid_min_amount ?? 0}
                            onChange={(e) => updateField('email_notify_unpaid_min_amount', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vėluojama */}
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_overdue_enabled ?? false}
                        onChange={(e) => updateField('email_notify_overdue_enabled', e.target.checked)}
                      />
                      Vėluojama apmokėti
                    </label>
                    {notificationSettings.email_notify_overdue_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-field">
                          <label>Minimalus vėlavimas (dienos)</label>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={notificationSettings.email_notify_overdue_min_days ?? 1}
                            onChange={(e) => updateField('email_notify_overdue_min_days', parseInt(e.target.value, 10) || 1)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Maksimalus vėlavimas (dienos, 0 = be apribojimų)</label>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={notificationSettings.email_notify_overdue_max_days ?? 365}
                            onChange={(e) => updateField('email_notify_overdue_max_days', parseInt(e.target.value, 10) || 365)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Priminimo intervalas (dienos)</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={notificationSettings.email_notify_overdue_interval_days ?? 7}
                            onChange={(e) => updateField('email_notify_overdue_interval_days', parseInt(e.target.value, 10) || 7)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_overdue_recipient ?? 'client'}
                            onChange={(e) => updateField('email_notify_overdue_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Minimali suma (EUR, 0 = be apribojimų)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={notificationSettings.email_notify_overdue_min_amount ?? 0}
                            onChange={(e) => updateField('email_notify_overdue_min_amount', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Priminimų siuntimo būdas</label>
                          <select
                            value={notificationSettings.overdue_reminder_mode ?? 'automatic'}
                            onChange={(e) => updateField('overdue_reminder_mode', e.target.value as 'automatic' | 'manual' | 'both')}
                          >
                            <option value="automatic">Automatinis</option>
                            <option value="manual">Rankinis</option>
                            <option value="both">Automatinis ir rankinis</option>
                          </select>
                          <small style={{ color: '#666', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                            Automatinis: sistema siunčia priminimus pagal nustatytą intervalą. Rankinis: priminimus siunčiate patys per mygtuką. Abi: veikia abu būdai.
                          </small>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Didelės sumos sąskaitos */}
                  <div>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_high_amount_invoice_enabled ?? false}
                        onChange={(e) => updateField('email_notify_high_amount_invoice_enabled', e.target.checked)}
                      />
                      Didelės sumos sąskaitos
                    </label>
                    {notificationSettings.email_notify_high_amount_invoice_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-field">
                          <label>Sumos riba (EUR)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={notificationSettings.email_notify_high_amount_threshold ?? 10000}
                            onChange={(e) => updateField('email_notify_high_amount_threshold', parseFloat(e.target.value) || 10000)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_high_amount_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_high_amount_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* UŽSAKYMAI */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>📦 UŽSAKYMAI</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_new_order_enabled ?? false}
                        onChange={(e) => updateField('email_notify_new_order_enabled', e.target.checked)}
                      />
                      Naujas užsakymas
                    </label>
                    {notificationSettings.email_notify_new_order_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_new_order_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_new_order_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_order_status_changed_enabled ?? false}
                        onChange={(e) => updateField('email_notify_order_status_changed_enabled', e.target.checked)}
                      />
                      Užsakymo statuso pakeitimas
                    </label>
                    {notificationSettings.email_notify_order_status_changed_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_order_status_changed_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_order_status_changed_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* EKSPEDICIJOS */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>🚚 EKSPEDICIJOS</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_new_expedition_enabled ?? false}
                        onChange={(e) => updateField('email_notify_new_expedition_enabled', e.target.checked)}
                      />
                      Nauja ekspedicija
                    </label>
                    {notificationSettings.email_notify_new_expedition_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_new_expedition_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_new_expedition_recipient', e.target.value as 'carrier' | 'manager' | 'both')}
                          >
                            <option value="carrier">Vežėjui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_expedition_status_changed_enabled ?? false}
                        onChange={(e) => updateField('email_notify_expedition_status_changed_enabled', e.target.checked)}
                      />
                      Ekspedicijos statuso pakeitimas
                    </label>
                    {notificationSettings.email_notify_expedition_status_changed_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_expedition_status_changed_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_expedition_status_changed_recipient', e.target.value as 'carrier' | 'manager' | 'both')}
                          >
                            <option value="carrier">Vežėjui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* MOKĖJIMAI */}
                <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '16px', backgroundColor: '#f8f9fa' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>💰 MOKĖJIMAI</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_payment_received_enabled ?? false}
                        onChange={(e) => updateField('email_notify_payment_received_enabled', e.target.checked)}
                      />
                      Gautas mokėjimas
                    </label>
                    {notificationSettings.email_notify_payment_received_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_payment_received_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_payment_received_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label>Minimali suma (EUR, 0 = be apribojimų)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={notificationSettings.email_notify_payment_received_min_amount ?? 0}
                            onChange={(e) => updateField('email_notify_payment_received_min_amount', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="checkbox-stack">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_notify_partial_payment_enabled ?? false}
                        onChange={(e) => updateField('email_notify_partial_payment_enabled', e.target.checked)}
                      />
                      Dalinis mokėjimas
                    </label>
                    {notificationSettings.email_notify_partial_payment_enabled && (
                      <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                        <div className="form-field">
                          <label>Kam siųsti</label>
                          <select
                            value={notificationSettings.email_notify_partial_payment_recipient ?? 'manager'}
                            onChange={(e) => updateField('email_notify_partial_payment_recipient', e.target.value as 'client' | 'manager' | 'both')}
                          >
                            <option value="client">Klientui</option>
                            <option value="manager">Vadybininkui</option>
                            <option value="both">Abiems</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>El. laiškų pasirašymas ir pranešimai</h3>
                <p>Nustatykite pasirašymą ir pranešimus, kurie bus naudojami el. laiškuose.</p>
              </div>

              <div className="info-card-grid columns-1 compact">
                <div className="form-field">
                  <label>El. laiškų pasirašymas</label>
                  <input
                    type="text"
                    value={notificationSettings.email_signature || ''}
                    onChange={(e) => updateField('email_signature', e.target.value)}
                    placeholder="pvz.: Loglena, UAB - TMS Sistema"
                  />
                  <small style={{ color: '#6c757d', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Pasirašymas, kuris bus rodomas el. laiškuose po "Su pagarba,"
                  </small>
                </div>

                <div className="form-field">
                  <label>Pranešimas apie automatinį generavimą</label>
                  <textarea
                    value={notificationSettings.email_auto_generated_notice || ''}
                    onChange={(e) => updateField('email_auto_generated_notice', e.target.value)}
                    rows={3}
                    placeholder="pvz.: Šis laiškas sugeneruotas automatiškai. Į jį atsakyti nereikia."
                  />
                  <small style={{ color: '#6c757d', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Pranešimas, kuris bus pridėtas į automatiškai sugeneruotus el. laiškus
                  </small>
                </div>

                <div className="form-field">
                  <label>Pranešimas apie vadybininką</label>
                  <textarea
                    value={notificationSettings.email_contact_manager_notice || ''}
                    onChange={(e) => updateField('email_contact_manager_notice', e.target.value)}
                    rows={3}
                    placeholder="pvz.: Kilus neaiškumams kreipkitės į vadybininką."
                  />
                  <small style={{ color: '#6c757d', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Pranešimas apie vadybininką (vadybininkas bus nustatomas pagal užsakymą/sąskaitą)
                  </small>
                </div>
              </div>
            </div>

            <div className="info-card" style={{ border: '2px solid #ffc107', backgroundColor: '#fff9e6' }}>
              <div className="info-card-header">
                <h3>Testavimo režimas el. laiškams</h3>
                <p>Įjunkite testavimo režimą, kad visi automatiniai el. laiškai būtų siunčiami į testavimo adresą, o ne tikriems gavėjams.</p>
              </div>

              <div className="info-card-grid columns-1 compact">
                <label className="checkbox-stack">
                  <input
                    type="checkbox"
                    checked={notificationSettings.email_test_mode || false}
                    onChange={(e) => updateField('email_test_mode', e.target.checked)}
                  />
                  Įjungti testavimo režimą
                </label>
                {notificationSettings.email_test_mode && (
                  <div className="form-field">
                    <label>Testavimo adresas</label>
                    <input
                      type="email"
                      value={notificationSettings.email_test_recipient || 'info@hotmail.lt'}
                      onChange={(e) => updateField('email_test_recipient', e.target.value)}
                      placeholder="info@hotmail.lt"
                    />
                    <small style={{ color: '#856404', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Visi automatiniai el. laiškai bus siunčiami į šį adresą. Originalus gavėjas bus nurodytas laiško temoje ir turinyje.
                    </small>
                  </div>
                )}
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>Testinis el. laiškas</h3>
                <p>Įsitikinkite, kad SMTP nustatymai veikia prieš siunčiant klientams.</p>
              </div>

              {testEmailMessage && (
                <div className={`alert ${testEmailMessage.type === 'success' ? 'alert-success' : 'alert-error'} test-status-message`}>
                  {testEmailMessage.text}
                </div>
              )}

              <div className="test-mail-row">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@pavyzdys.lt"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail}
                >
                  {sendingTestEmail ? 'Siunčiama...' : 'Siųsti testą'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="notification-settings-sections">
            <div className="info-card">
              <div className="info-card-header">
                <h3>Programos pranešimų (Toast) nustatymai</h3>
                <p>Valdykite rodymo trukmę, poziciją ir vizualinį stilių.</p>
              </div>

              <div className="info-card-grid columns-2">
                <div className="form-field">
                  <label>Pranešimų trukmė (milisekundės)</label>
                  <input
                    type="number"
                    min={1000}
                    max={10000}
                    step={100}
                    value={notificationSettings.toast_duration_ms}
                    onChange={(e) => updateField('toast_duration_ms', parseInt(e.target.value, 10) || 3500)}
                  />
                  <small className="field-hint">Kiek laiko rodyti pranešimą (1000–10000 ms)</small>
                </div>

                <div className="form-field">
                  <label>Pranešimų pozicija</label>
                  <select
                    value={notificationSettings.toast_position}
                    onChange={(e) => updateField('toast_position', e.target.value as 'top' | 'center' | 'bottom')}
                  >
                    <option value="top">Viršuje</option>
                    <option value="center">Centre</option>
                    <option value="bottom">Apačioje</option>
                  </select>
                </div>

                <div className="form-field checkbox-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={notificationSettings.toast_enable_sound}
                      onChange={(e) => updateField('toast_enable_sound', e.target.checked)}
                    />
                    Groti garso signalą rodant pranešimą
                  </label>
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>Pranešimų spalvos</h3>
                <p>Hex kodai apibrėžia kiekvieno pranešimo tipo foną.</p>
              </div>

              <div className="info-card-grid columns-3 compact">
                <div className="form-field">
                  <label>Sėkmės spalva</label>
                  <input
                    type="color"
                    value={notificationSettings.toast_success_color}
                    onChange={(e) => updateField('toast_success_color', e.target.value)}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={notificationSettings.toast_success_color}
                    onChange={(e) => updateField('toast_success_color', e.target.value)}
                    placeholder="#28a745"
                  />
                </div>

                <div className="form-field">
                  <label>Klaidos spalva</label>
                  <input
                    type="color"
                    value={notificationSettings.toast_error_color}
                    onChange={(e) => updateField('toast_error_color', e.target.value)}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={notificationSettings.toast_error_color}
                    onChange={(e) => updateField('toast_error_color', e.target.value)}
                    placeholder="#dc3545"
                  />
                </div>

                <div className="form-field">
                  <label>Informacijos spalva</label>
                  <input
                    type="color"
                    value={notificationSettings.toast_info_color}
                    onChange={(e) => updateField('toast_info_color', e.target.value)}
                    className="color-input"
                  />
                  <input
                    type="text"
                    value={notificationSettings.toast_info_color}
                    onChange={(e) => updateField('toast_info_color', e.target.value)}
                    placeholder="#17a2b8"
                  />
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <h3>Pastabos</h3>
                <p>Vidiniai komentarai ar papildoma informacija komandai.</p>
              </div>
              <textarea
                value={notificationSettings.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="form-actions notification-actions">
          <button
            type="submit"
            className="btn btn-primary btn-small"
            disabled={saving}
          >
            {saving
              ? 'Išsaugoma...'
              : isEmailMode
              ? 'Išsaugoti el. pašto nustatymus'
              : 'Išsaugoti pranešimų nustatymus'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NotificationSettingsForm;


