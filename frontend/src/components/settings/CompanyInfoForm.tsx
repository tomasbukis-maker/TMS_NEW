import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

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

interface CompanyInfoFormProps {
  companyInfo: CompanyInfo;
  onUpdate: (info: CompanyInfo) => void;
  onSave: (info: CompanyInfo, logoFile: File | null) => Promise<void>;
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
  saving: boolean;
}

const CompanyInfoForm: React.FC<CompanyInfoFormProps> = ({
  companyInfo: initialCompanyInfo,
  onUpdate,
  onSave,
  onMessage,
  saving
}) => {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(initialCompanyInfo);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const makeLogoPreviewUrl = (url: string | null | undefined, version?: string | null) => {
    if (!url) {
      return null;
    }
    const cacheBuster = version ? version.replace(/\D/g, '') : `${Date.now()}`;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${cacheBuster}`;
  };

  const [logoPreview, setLogoPreview] = useState<string | null>(
    makeLogoPreviewUrl(initialCompanyInfo.logo_url, initialCompanyInfo.updated_at)
  );

  useEffect(() => {
    setCompanyInfo({
      ...initialCompanyInfo,
      correspondence_address: initialCompanyInfo.correspondence_address ?? '',
    });
    setLogoPreview(makeLogoPreviewUrl(initialCompanyInfo.logo_url, initialCompanyInfo.updated_at));
  }, [initialCompanyInfo]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        onMessage({ type: 'error', text: 'Prašome pasirinkti paveikslėlio failą (PNG, JPG, GIF ir pan.)' });
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        onMessage({ type: 'error', text: 'Failo dydis negali viršyti 5MB' });
        return;
      }
      
      setLogoFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const formData = new FormData();
      formData.append('logo', '');
      
      const { id, created_at, updated_at, logo, logo_url, ...dataToSend } = companyInfo;
      Object.keys(dataToSend).forEach(key => {
        const value = (dataToSend as any)[key];
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value);
        }
      });
      
      await api.put('/settings/company/current/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setLogoPreview(null);
      setLogoFile(null);
      const updatedCompany = { ...companyInfo, logo: null, logo_url: null, updated_at: new Date().toISOString() };
      setCompanyInfo(updatedCompany);
      onUpdate(updatedCompany);
      onMessage({ type: 'success', text: 'Logotipas pašalintas sėkmingai!' });
    } catch (error: any) {
      onMessage({ type: 'error', text: 'Klaida šalinant logotipą' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(companyInfo, logoFile);
    setLogoFile(null);
  };

  return (
    <div className="settings-section company-info-compact">

      <form onSubmit={handleSubmit}>
        <div className="company-info-sections">
          <div className="info-card">
            <div className="info-card-header">
              <h3>Juridiniai duomenys</h3>
              <p>Pagrindinė informacija apie įmonę</p>
            </div>
            <div className="info-card-grid columns-3">
              <div className="form-field">
                <label>Įmonės pavadinimas *</label>
                <input
                  type="text"
                  value={companyInfo.name}
                  onChange={(e) => {
                    const updated = { ...companyInfo, name: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  required
                />
              </div>
              <div className="form-field">
                <label>Įmonės kodas *</label>
                <input
                  type="text"
                  value={companyInfo.code}
                  onChange={(e) => {
                    const updated = { ...companyInfo, code: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  required
                />
              </div>
              <div className="form-field">
                <label>PVM kodas</label>
                <input
                  type="text"
                  value={companyInfo.vat_code}
                  onChange={(e) => {
                    const updated = { ...companyInfo, vat_code: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <h3>Adresai</h3>
              <p>Registracijos ir korespondencijos duomenys</p>
            </div>
            <div className="info-card-grid columns-3 compact">
              <div className="form-field full-width">
                <label>Adresas *</label>
                <textarea
                  value={companyInfo.address}
                  onChange={(e) => {
                    const updated = { ...companyInfo, address: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  rows={2}
                  required
                />
              </div>
              <div className="form-field">
                <label>Miestas *</label>
                <input
                  type="text"
                  value={companyInfo.city}
                  onChange={(e) => {
                    const updated = { ...companyInfo, city: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  required
                />
              </div>
              <div className="form-field">
                <label>Pašto kodas</label>
                <input
                  type="text"
                  value={companyInfo.postal_code}
                  onChange={(e) => {
                    const updated = { ...companyInfo, postal_code: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
              <div className="form-field">
                <label>Šalis *</label>
                <input
                  type="text"
                  value={companyInfo.country}
                  onChange={(e) => {
                    const updated = { ...companyInfo, country: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  required
                />
              </div>
            </div>
            <div className="info-card-grid columns-1">
              <div className="form-field">
                <label>Adresas korespondencijai</label>
                <textarea
                  value={companyInfo.correspondence_address}
                  onChange={(e) => {
                    const updated = { ...companyInfo, correspondence_address: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  rows={2}
                  placeholder="Jei nenurodytas, bus naudojamas pagrindinis adresas"
                />
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <h3>Kontaktai</h3>
              <p>Ryšiui su klientais</p>
            </div>
            <div className="info-card-grid columns-2">
              <div className="form-field">
                <label>Telefonas</label>
                <input
                  type="text"
                  value={companyInfo.phone}
                  onChange={(e) => {
                    const updated = { ...companyInfo, phone: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
              <div className="form-field">
                <label>El. paštas</label>
                <input
                  type="email"
                  value={companyInfo.email}
                  onChange={(e) => {
                    const updated = { ...companyInfo, email: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <h3>Banko informacija</h3>
              <p>Mokėjimų duomenys</p>
            </div>
            <div className="info-card-grid columns-3">
              <div className="form-field">
                <label>Banko pavadinimas</label>
                <input
                  type="text"
                  value={companyInfo.bank_name}
                  onChange={(e) => {
                    const updated = { ...companyInfo, bank_name: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
              <div className="form-field">
                <label>Banko sąskaita</label>
                <input
                  type="text"
                  value={companyInfo.bank_account}
                  onChange={(e) => {
                    const updated = { ...companyInfo, bank_account: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
              <div className="form-field">
                <label>Banko kodas</label>
                <input
                  type="text"
                  value={companyInfo.bank_code}
                  onChange={(e) => {
                    const updated = { ...companyInfo, bank_code: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="info-card full-span">
            <div className="info-card-header">
              <h3>Papildoma informacija</h3>
              <p>Pastabos ar kiti svarbūs komentarai</p>
            </div>
            <div className="info-card-grid columns-1">
              <div className="form-field">
                <label>Pastabos</label>
                <textarea
                  value={companyInfo.notes}
                  onChange={(e) => {
                    const updated = { ...companyInfo, notes: e.target.value };
                    setCompanyInfo(updated);
                    onUpdate(updated);
                  }}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="info-card full-span logo-card">
            <div className="info-card-header">
              <h3>Logotipas (dokumentams)</h3>
              <p>Naudojamas sąskaitose, užsakymuose ir kituose generuojamuose dokumentuose</p>
            </div>
            <div className="logo-content">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logotipo peržiūra"
                  className="logo-preview"
                />
              ) : (
                <div className="logo-placeholder">Nėra logotipo</div>
              )}
              <div className="logo-actions">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                />
                <p className="helper-text">Palaikomi formatai: PNG, JPG, GIF. Maksimalus dydis: 5MB</p>
                {companyInfo.logo_url && !logoFile && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      alignSelf: 'flex-start',
                      backgroundColor: '#dc3545',
                      color: '#fff',
                      border: 'none'
                    }}
                  >
                    Pašalinti logotipą
                  </button>
                )}
              </div>
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

export default CompanyInfoForm;


