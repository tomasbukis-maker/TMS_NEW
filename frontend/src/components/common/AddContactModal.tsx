import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';

interface Partner {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  is_client: boolean;
  is_supplier: boolean;
}

interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position?: string;
  notes?: string;
}

interface AddContactModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
  onContactAdded: (partnerId?: number) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const AddContactModal: React.FC<AddContactModalProps> = ({
  isOpen,
  email,
  onClose,
  onContactAdded,
  showToast
}) => {
  // Apdoroti email - išskirti tik email adresą
  const processedEmail = React.useMemo(() => {
    const emailMatch = email.match(/[\w\.-]+@[\w\.-]+\.\w+/);
    return emailMatch ? emailMatch[0] : email;
  }, [email]);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [suggestedPartner, setSuggestedPartner] = useState<Partner | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  // Užkrauti partnerius
  useEffect(() => {
    if (isOpen) {
      loadPartners();
    }
  }, [isOpen]);

  // Rasti pasiūlytą partnerį pagal domeną
  useEffect(() => {
    if (partners.length > 0 && processedEmail) {
      const domain = processedEmail.split('@')[1]?.toLowerCase();
      if (domain) {
        // Ieškoti partnerio pagal domeną pavadinime arba koduose
        const cleanDomain = domain.replace('.lt', '').replace('.com', '');

        const domainPartner = partners.find(p => {
          const nameMatch = p.name.toLowerCase().includes(cleanDomain);
          const codeMatch = p.code.toLowerCase().includes(cleanDomain);
          return nameMatch || codeMatch;
        });

        setSuggestedPartner(domainPartner || null);
        if (domainPartner) {
          setSelectedPartnerId(domainPartner.id);
          setSelectedPartner(domainPartner);
          setPartnerSearchQuery(`${domainPartner.name} (${domainPartner.code})`);
        }
      }
    }
  }, [partners, processedEmail]);

  const loadPartners = async () => {
    try {
      const response = await api.get('/partners/partners/?page_size=1000');
      setPartners(response.data.results || []);
    } catch (error: any) {
      console.error('Klaida užkraunant partnerius:', error);
      showToast('error', 'Nepavyko užkrauti partnerių sąrašo');
    }
  };

  const filteredPartners = useMemo(() => {
    if (!partnerSearchQuery.trim()) {
      return partners.slice(0, 10); // Pirmi 10 jei nėra paieškos
    }
    const query = partnerSearchQuery.toLowerCase();
    return partners.filter(partner =>
      partner.name.toLowerCase().includes(query) ||
      partner.code.toLowerCase().includes(query)
    ).slice(0, 10); // Ribojame iki 10 rezultatų
  }, [partners, partnerSearchQuery]);

  const handlePartnerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPartnerSearchQuery(value);
    setShowPartnerDropdown(true);

    // Išvalyti pasirinkimą jei paieška pasikeitė
    if (selectedPartner && !value.includes(selectedPartner.name)) {
      setSelectedPartnerId(null);
      setSelectedPartner(null);
    }
  };

  const handlePartnerSelect = (partner: Partner) => {
    setSelectedPartner(partner);
    setSelectedPartnerId(partner.id);
    setPartnerSearchQuery(`${partner.name} (${partner.code})`);
    setShowPartnerDropdown(false);
  };

  const handleAddContact = async () => {
    if (!selectedPartnerId) {
      showToast('error', 'Pasirinkite partnerį');
      return;
    }

    console.log('🚀 Pridedant kontaktą:', {
      selectedPartnerId,
      processedEmail,
      token: localStorage.getItem('token') ? 'Token egzistuoja' : 'Token NERASTAS!'
    });

    setLoading(true);
    try {
      const response = await api.post(`/partners/partners/${selectedPartnerId}/add_contact/`, {
        email: processedEmail
      });

      console.log('✅ Kontaktas pridėtas sėkmingai:', response.data);
      showToast('success', `Kontaktas "${processedEmail}" pridėtas prie partnerio`);
      onContactAdded(selectedPartnerId);

      // Išsiųsti event'ą apie partnerio atnaujinimą
      window.dispatchEvent(new CustomEvent('partnerUpdated', {
        detail: { partnerId: selectedPartnerId }
      }));

      onClose();
    } catch (error: any) {
      console.error('❌ Klaida pridedant kontaktą:', error);
      console.error('Error response:', error.response);
      console.error('Error status:', error.response?.status);
      console.error('Error data:', error.response?.data);

      const errorMessage = error.response?.status === 401
        ? 'Sesija baigėsi - prašome prisijungti iš naujo'
        : error.response?.data?.error || 'Nepavyko pridėti kontakto';

      showToast('error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;


  return (
    <>
      {/* Pagrindinis modal */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }} onClick={onClose}>
        <div
          className="card"
          style={{ width: '90%', maxWidth: '500px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3>➕ Pridėti kontaktą</h3>
          <p><strong>El. paštas:</strong> {processedEmail}</p>

          {/* Pasiūlymas */}
          {suggestedPartner && (
            <div style={{
              padding: '12px',
              backgroundColor: '#e8f5e8',
              border: '1px solid #4caf50',
              borderRadius: '4px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#2e7d32' }}>💡</span>
                <strong>Pasiūlymas:</strong>
              </div>
              <p style={{ margin: '4px 0 0 24px', color: '#2e7d32' }}>
                {suggestedPartner.name} ({suggestedPartner.code})
              </p>
            </div>
          )}

          {/* Partnerio pasirinkimas */}
          <div className="form-group">
            <label htmlFor="partner-search">Pasirinkite partnerį *</label>
            <div style={{ position: 'relative' }}>
              <input
                id="partner-search"
                type="text"
                value={partnerSearchQuery}
                onChange={handlePartnerSearchChange}
                onFocus={() => setShowPartnerDropdown(true)}
                onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 200)}
                placeholder="Įveskite partnerio pavadinimą arba kodą..."
                className="form-control"
                style={{ width: '100%' }}
              />
              {showPartnerDropdown && filteredPartners.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #ccc',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 10,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  {filteredPartners.map((partner: Partner) => (
                    <div
                      key={partner.id}
                      onClick={() => handlePartnerSelect(partner)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee',
                        backgroundColor: selectedPartnerId === partner.id ? '#f0f8ff' : 'white'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedPartnerId === partner.id ? '#f0f8ff' : 'white'}
                    >
                      <div style={{ fontWeight: 'bold' }}>{partner.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{partner.code}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mygtukai */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '20px' }}>
            <div>
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Atšaukti
              </button>
            </div>
            <div>
              <button
                type="button"
                className="button button-primary"
                onClick={handleAddContact}
                disabled={!selectedPartnerId || loading}
              >
                {loading ? 'Pridedama...' : 'Pridėti kontaktą'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddContactModal;