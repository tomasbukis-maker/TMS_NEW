import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import CompanyInfoForm from '../components/settings/CompanyInfoForm';
import './SettingsPage.css';

interface CompanyInfo {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  address: string;
  correspondence_address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  bank_code: string;
  logo?: string | null;
  logo_url?: string | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

const CompanyInfoPage: React.FC = () => {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    id: 0,
    name: '',
    code: '',
    vat_code: '',
    address: '',
    correspondence_address: '',
    city: '',
    postal_code: '',
    country: 'Lietuva',
    phone: '',
    email: '',
    bank_name: '',
    bank_account: '',
    bank_code: '',
    logo: null,
    logo_url: null,
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  const fetchCompanyInfo = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/company/current/');
      setCompanyInfo(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Paliekame tuščią formą
      } else {
        setMessage({
          type: 'error',
          text: 'Nepavyko įkelti įmonės rekvizitų. Patikrinkite ryšį ir bandykite dar kartą.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompanyInfo = async (info: CompanyInfo, logoFile: File | null) => {
    setSaving(true);
    setMessage(null);

    try {
      if (logoFile) {
        const formData = new FormData();
        const { id, created_at, updated_at, logo, logo_url, ...dataToSend } = info;

        Object.keys(dataToSend).forEach((key) => {
          const value = (dataToSend as any)[key];
          if (value !== null && value !== undefined && value !== '') {
            formData.append(key, value);
          }
        });

        formData.append('logo', logoFile);

        await api.put('/settings/company/current/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        const { id, created_at, updated_at, logo, logo_url, ...dataToSend } = info;
        await api.put('/settings/company/current/', dataToSend);
      }

      setMessage({ type: 'success', text: 'Įmonės rekvizitai išsaugoti sėkmingai!' });
      await fetchCompanyInfo();
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

  return (
    <div className="page">
      <div className="container">
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '20px' }}>Įmonės rekvizitai</h1>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
            Atnaujinkite juridinius rekvizitus ir logotipą, skirtą dokumentams (sąskaitoms, užsakymams). Programos išvaizdos logotipas lieka nepakitęs.
          </p>
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
          <CompanyInfoForm
            companyInfo={companyInfo}
            onUpdate={setCompanyInfo}
            onSave={handleSaveCompanyInfo}
            onMessage={setMessage}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
};

export default CompanyInfoPage;

