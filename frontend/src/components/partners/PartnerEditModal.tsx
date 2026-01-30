import React, { useState } from 'react';
import { api } from '../../services/api';
import '../../pages/PartnersPage.css';

interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position?: string;
  notes?: string;
}

interface Partner {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  address: string;
  is_client: boolean;
  is_supplier: boolean;
  status: string;
  status_display: string;
  contact_person: Contact | null;
  contacts?: Contact[];
  payment_term_days: number;
  email_notify_due_soon?: boolean;
  email_notify_unpaid?: boolean;
  email_notify_overdue?: boolean;
  notes: string;
}

type NewContact = Partial<Contact & { position?: string; notes?: string; is_primary?: boolean }>;

interface PartnerEditModalProps {
  isOpen: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSave: (partner: Partner) => void;
  onPartnerUpdate: (partner: Partner) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const PartnerEditModal: React.FC<PartnerEditModalProps> = ({
  isOpen,
  partner,
  onClose,
  onSave,
  onPartnerUpdate,
  showToast
}) => {
  const [editingPartner, setEditingPartner] = useState<Partner | null>(partner);
  const [editNewContact, setEditNewContact] = useState<NewContact>({ 
    first_name: '', 
    last_name: '', 
    email: '', 
    phone: '', 
    position: '', 
    notes: '' 
  });

  React.useEffect(() => {
    setEditingPartner(partner);
  }, [partner]);

  if (!isOpen || !editingPartner) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/partners/partners/${editingPartner.id}/`, editingPartner);
      onSave(editingPartner);
      onClose();
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida išsaugant');
    }
  };

  const setPrimaryForEditing = async (partnerId: number, contactId: number) => {
    try {
      await api.patch(`/partners/partners/${partnerId}/`, { contact_person_id: contactId });
      const res = await api.get(`/partners/partners/${partnerId}/`);
      const updatedPartner = res.data;
      setEditingPartner(updatedPartner);
      onPartnerUpdate(updatedPartner);
    } catch (error: any) {
      showToast('error', 'Nepavyko nustatyti pirminio kontakto');
    }
  };

  const addContactForEditing = async () => {
    if (!editingPartner) return;
    const hasAny = !!(editNewContact.first_name || editNewContact.last_name || editNewContact.email || editNewContact.phone || editNewContact.position || editNewContact.notes);
    if (!hasAny) {
      showToast('info', 'Užpildykite bent vieną kontakto lauką');
      return;
    }
    try {
      await api.post('/partners/contacts/', {
        partner_id: editingPartner.id,
        first_name: editNewContact.first_name || '',
        last_name: editNewContact.last_name || '',
        email: editNewContact.email || '',
        phone: editNewContact.phone || '',
        position: editNewContact.position || '',
        notes: editNewContact.notes || ''
      });
      const res = await api.get(`/partners/partners/${editingPartner.id}/`);
      const updatedPartner = res.data;
      setEditingPartner(updatedPartner);
      onPartnerUpdate(updatedPartner);
      setEditNewContact({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
    } catch (error: any) {
      showToast('error', 'Nepavyko pridėti kontakto');
    }
  };

  const handleCheckVies = async () => {
    const vat = (editingPartner.vat_code || '').trim();
    if (!vat) { 
      showToast('info', 'Įveskite PVM kodą'); 
      return; 
    }
    try {
      const res = await api.get('/partners/partners/resolve_name/', { params: { vat_code: vat } });
      const data = res.data;
      if (data.valid && data.name) {
        const updated = {
          ...editingPartner,
          name: data.name,
          address: data.address || editingPartner.address || '',
          is_client: true,
        };
        setEditingPartner(updated);
      } else {
        showToast('info', 'VIES nerado pavadinimo pagal šį PVM kodą');
      }
    } catch (e: any) {
      showToast('error', 'Nepavyko patikrinti internete: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
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
      <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2>Redaguoti partnerį: {editingPartner.name}</h2>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Firmos pavadinimas *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={editingPartner.name || ''}
                onChange={(e) => setEditingPartner({...editingPartner, name: e.target.value})}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCheckVies}
                title="Tikrinti internete (VIES)"
              >
                Tikrinti internete
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Įmonės kodas *</label>
            <input
              type="text"
              value={editingPartner.code || ''}
              onChange={(e) => setEditingPartner({...editingPartner, code: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>PVM kodas</label>
            <input
              type="text"
              value={editingPartner.vat_code || ''}
              onChange={(e) => setEditingPartner({...editingPartner, vat_code: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Adresas</label>
            <textarea
              value={editingPartner.address || ''}
              onChange={(e) => setEditingPartner({...editingPartner, address: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Mokėjimo terminas (dienos)</label>
            <input
              type="number"
              value={editingPartner.payment_term_days || 30}
              onChange={(e) => setEditingPartner({...editingPartner, payment_term_days: parseInt(e.target.value) || 0})}
              min="0"
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={editingPartner.is_client}
                onChange={(e) => setEditingPartner({...editingPartner, is_client: e.target.checked})}
              />
              {' '}Klientas
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={editingPartner.is_supplier}
                onChange={(e) => setEditingPartner({...editingPartner, is_supplier: e.target.checked})}
              />
              {' '}Tiekėjas
            </label>
          </div>

          <div className="form-group">
            <label>Būsena</label>
            <select
              value={editingPartner.status}
              onChange={(e) => setEditingPartner({...editingPartner, status: e.target.value})}
            >
              <option value="active">Aktyvus</option>
              <option value="blocked">Užblokuotas</option>
            </select>
          </div>

          {editingPartner.is_client && (
            <div className="form-group" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>El. pašto priminimai</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingPartner.email_notify_due_soon !== false}
                    onChange={(e) => setEditingPartner({...editingPartner, email_notify_due_soon: e.target.checked})}
                  />
                  <span>Siųsti priminimą apie artėjantį terminą</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingPartner.email_notify_unpaid !== false}
                    onChange={(e) => setEditingPartner({...editingPartner, email_notify_unpaid: e.target.checked})}
                  />
                  <span>Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingPartner.email_notify_overdue !== false}
                    onChange={(e) => setEditingPartner({...editingPartner, email_notify_overdue: e.target.checked})}
                  />
                  <span>Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą</span>
                </label>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Pastabos</label>
            <textarea
              value={editingPartner.notes || ''}
              onChange={(e) => setEditingPartner({...editingPartner, notes: e.target.value})}
            />
          </div>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <h3>Kontaktiniai asmenys</h3>
            {editingPartner.contacts && editingPartner.contacts.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {editingPartner.contacts.map((c) => (
                  <li key={c.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div><strong>{c.first_name} {c.last_name}</strong></div>
                        <div style={{ fontSize: 12, color: '#555' }}>{c.position || ''}</div>
                        <div style={{ fontSize: 12 }}>{c.email || '-'}</div>
                        <div style={{ fontSize: 12 }}>{c.phone || '-'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12 }}>
                          <input
                            type="radio"
                            name="primaryEditingContact"
                            checked={editingPartner.contact_person?.id === c.id}
                            onChange={() => setPrimaryForEditing(editingPartner.id, c.id)}
                          />{' '}Pirminis
                        </label>
                      </div>
                    </div>
                    {c.notes && <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>{c.notes}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 13, color: '#666' }}>Kontaktinių asmenų nėra</div>
            )}

            <div style={{ marginTop: 12, borderTop: '1px solid #e0e0e0', paddingTop: 12 }}>
              <h4 style={{ marginBottom: 8 }}>Pridėti kontaktą</h4>
              <div className="form-group">
                <label>Vardas</label>
                <input type="text" value={editNewContact.first_name || ''} onChange={(e) => setEditNewContact({ ...editNewContact, first_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Pavardė</label>
                <input type="text" value={editNewContact.last_name || ''} onChange={(e) => setEditNewContact({ ...editNewContact, last_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>El. paštas</label>
                <input type="email" value={editNewContact.email || ''} onChange={(e) => setEditNewContact({ ...editNewContact, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Telefonas</label>
                <input type="tel" value={editNewContact.phone || ''} onChange={(e) => setEditNewContact({ ...editNewContact, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Pareigos</label>
                <input type="text" value={editNewContact.position || ''} onChange={(e) => setEditNewContact({ ...editNewContact, position: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Pastabos</label>
                <textarea value={editNewContact.notes || ''} onChange={(e) => setEditNewContact({ ...editNewContact, notes: e.target.value })} />
              </div>
              <button type="button" className="button" onClick={addContactForEditing}>+ Pridėti</button>
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button type="submit" className="button">
              Išsaugoti
            </button>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Atšaukti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartnerEditModal;


