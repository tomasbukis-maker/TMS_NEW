import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import UserSettingsForm from '../components/settings/UserSettingsForm';
import UserManagementSection from '../components/settings/UserManagementSection';
import './SettingsPage.css';

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

const UserSettingsPage: React.FC = () => {
  const [userSettings, setUserSettings] = useState<UserSettings>({
    id: 0,
    user_id: 0,
    username: '',
    role: 'Be rolės',
    last_login: null,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    language: 'lt',
    date_format: 'YYYY-MM-DD',
    timezone: 'Europe/Vilnius',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'users'>('profile');

  useEffect(() => {
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/user/my_settings/');
      const data = response.data;
      setUserSettings({
        id: data.id,
        user_id: data.user_id,
        username: data.username,
        role: data.role || 'Be rolės',
        last_login: data.last_login ?? null,
        first_name: data.first_name ?? '',
        last_name: data.last_name ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        position: data.position ?? '',
        signature_image: data.signature_image ?? null,
        signature_image_url: data.signature_image_url ?? null,
        language: data.language ?? 'lt',
        date_format: data.date_format ?? 'YYYY-MM-DD',
        timezone: data.timezone ?? 'Europe/Vilnius',
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Paliekame numatytas reikšmes
      } else {
        setMessage({
          type: 'error',
          text: 'Nepavyko įkelti vartotojo nustatymų. Patikrinkite ryšį ir bandykite dar kartą.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUserSettings = async (settings: UserSettings, signatureFile: File | null) => {
    setSaving(true);
    setMessage(null);

    try {
      const { id, user_id, username, role, last_login, created_at, updated_at, signature_image, signature_image_url, ...dataToSend } = settings;
      
      if (signatureFile) {
        const formData = new FormData();
        Object.keys(dataToSend).forEach((key) => {
          const value = (dataToSend as any)[key];
          if (value !== null && value !== undefined && value !== '') {
            formData.append(key, value);
          }
        });
        formData.append('signature_image', signatureFile);
        
        await api.put('/settings/user/my_settings/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await api.put('/settings/user/my_settings/', dataToSend);
      }
      
      setMessage({ type: 'success', text: 'Vartotojo nustatymai išsaugoti sėkmingai!' });
      await fetchUserSettings();
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = useMemo(() => (userSettings.role || '').toLowerCase().includes('administrator'), [userSettings.role]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'users') {
      setActiveTab('profile');
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    setMessage(null);
  }, [activeTab]);

  return (
    <div className="page">
      <div className="container">
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '20px' }}>Vartotojo nustatymai</h1>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
            Atnaujinkite asmeninę informaciją, kalbą, laiko formatą ir kitus vartotojo nustatymus.
          </p>
        </div>

        <div className="user-settings-tabs">
          <button
            className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Mano nustatymai
          </button>
          {isAdmin && (
            <button
              className={`tab ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Vartotojų valdymas
            </button>
          )}
        </div>

        {message && (
          <div
            className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}
            style={{ marginBottom: '16px' }}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <p>Kraunama...</p>
        ) : (
          <>
            {activeTab === 'profile' && (
              <UserSettingsForm
                userSettings={userSettings}
                onUpdate={setUserSettings}
                onSave={handleSaveUserSettings}
                onMessage={setMessage}
                saving={saving}
              />
            )}
            {activeTab === 'users' && isAdmin && (
              <UserManagementSection onMessage={setMessage} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserSettingsPage;

