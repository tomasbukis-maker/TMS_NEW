import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import './PartnersPage.css';

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
  contacts_count?: number;
  payment_term_days: number;
  email_notify_due_soon?: boolean;
  email_notify_unpaid?: boolean;
  email_notify_overdue?: boolean;
  email_notify_manager_invoices?: boolean;
  notes: string;
}

const PartnersPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'clients' | 'suppliers'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [isClient, setIsClient] = useState(true);
  const [isSupplier, setIsSupplier] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [filterImportResults, setFilterImportResults] = useState<'all' | 'skipped' | 'imported'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPartnerDetails, setShowPartnerDetails] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [editingPartnerData, setEditingPartnerData] = useState<Partner | null>(null);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [editingContactData, setEditingContactData] = useState<Contact | null>(null);
  const [newContactData, setNewContactData] = useState<NewContact>({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({ type: 'info', message: '', visible: false });
  const toastTimeoutRef = useRef<number | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setToast({ type, message, visible: true });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), timeoutMs);
  };
  
  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title?: string; message?: string; onConfirm?: () => void }>({ open: false });
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupGroups, setDupGroups] = useState<Array<{ by: 'code' | 'name' | 'vat'; key: string; partners: { id: number; name: string; code: string; vat_code?: string }[] }>>([]);
  const [dupSelection, setDupSelection] = useState<Record<string, { primaryId?: number; duplicateIds: number[] }>>({});
  const [dupBy, setDupBy] = useState<'code' | 'name' | 'vat'>('code');
  const [newPartner, setNewPartner] = useState<Partial<Partner>>({
    name: '',
    code: '',
    vat_code: '',
    address: '',
    is_client: true,
    is_supplier: false,
    status: 'active',
    payment_term_days: 30,
    email_notify_due_soon: true,
    email_notify_unpaid: true,
    email_notify_overdue: true,
    email_notify_manager_invoices: true,
    notes: ''
  });
  type NewContact = Partial<Contact & { position?: string; notes?: string; is_primary?: boolean }>;
  const [newContacts, setNewContacts] = useState<NewContact[]>([
    { first_name: '', last_name: '', email: '', phone: '', position: '', notes: '', is_primary: true }
  ]);


  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  
  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page_size: 10000, // Užkrauti visus partnerius
      };
      // Filtravimas pagal tipą
      if (filter === 'clients') {
        params.is_client = true;
      } else if (filter === 'suppliers') {
        params.is_supplier = true;
      }
      
      const response = await api.get('/partners/partners/', { params });
      
      // Backend naudoja pagination
      let partnersData: Partner[] = [];
      let total = 0;
      
      if (response.data.results) {
        partnersData = response.data.results;
        total = response.data.count || 0;
      } else {
        partnersData = Array.isArray(response.data) ? response.data : [];
        total = partnersData.length;
      }
      
      setAllPartners(partnersData);
      setTotalCount(total);
    } catch (error: any) {
      setAllPartners([]);
      setTotalCount(0);
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        showToast('error', 'Nepavyko užkrauti partnerių: ' + (error.response?.data?.detail || error.message || 'Nežinoma klaida'));
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);
  
  // Užkrauti partnerius kai keičiasi filtras
  useEffect(() => {
    fetchPartners();
  }, [filter, fetchPartners]);
  
  // Filtruoti partnerius frontend'e - kaip mokėjimų puslapyje
  const filteredPartners = React.useMemo(() => {
    let result = allPartners;
    
    // Paieška pagal pavadinimą, kodą, PVM kodą
    if (searchQuery.trim()) {
      const searchText = searchQuery.toLowerCase().trim();
      result = result.filter(partner => {
        const name = partner.name?.toLowerCase() || '';
        const code = partner.code?.toLowerCase() || '';
        const vatCode = partner.vat_code?.toLowerCase() || '';
        return name.includes(searchText) || code.includes(searchText) || vatCode.includes(searchText);
      });
    }
    
    return result;
  }, [allPartners, searchQuery]);
  
  // Puslapiavimas iš filtruotų partnerių
  const paginatedPartners = React.useMemo(() => {
    const startIndex = (currentPage - 1) * 100;
    const endIndex = startIndex + 100;
    return filteredPartners.slice(startIndex, endIndex);
  }, [filteredPartners, currentPage]);
  
  // Atnaujinti puslapiavimo informaciją
  useEffect(() => {
    const totalPagesCount = Math.ceil(filteredPartners.length / 100);
    setTotalPages(totalPagesCount);
    // Jei esamas puslapis didesnis nei totalPages, nustatyti į paskutinį
    if (currentPage > totalPagesCount && totalPagesCount > 0) {
      setCurrentPage(totalPagesCount);
    }
  }, [filteredPartners.length, currentPage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('is_client', isClient.toString());
    formData.append('is_supplier', isSupplier.toString());
    formData.append('update_existing', updateExisting.toString());

    try {
      const response = await api.post('/partners/import/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setImportResult(response.data);
      setImportFile(null);
      // Atnaujiname sąrašą
      await fetchPartners();
      showToast('success', 'Importas baigtas');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Importo klaida';
      setImportResult({ success: false, error: msg });
      showToast('error', msg);
    } finally {
      setImporting(false);
    }
  };


  const handleShowDetails = (partner: Partner) => {
    setSelectedPartner(partner);
    setShowPartnerDetails(true);
    setIsEditingPartner(false);
    setEditingContactId(null);
    setEditingContactData(null);
    setNewContactData({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
    setShowAddContactForm(false);
    (async () => {
      try {
        const res = await api.get(`/partners/partners/${partner.id}/`);
        setSelectedPartner(res.data);
        setEditingPartnerData({ ...res.data });
      } catch (e) {
        // ignore
      }
    })();
  };

  const handleStartEdit = () => {
    if (selectedPartner) {
      setEditingPartnerData({ ...selectedPartner });
      setIsEditingPartner(true);
    }
  };

  const handleCancelPartnerEdit = () => {
    setIsEditingPartner(false);
    setEditingPartnerData(null);
    setEditingContactId(null);
    setEditingContactData(null);
    setNewContactData({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
    if (selectedPartner) {
      // Atnaujinti duomenis iš serverio
      (async () => {
        try {
          const res = await api.get(`/partners/partners/${selectedPartner.id}/`);
          setSelectedPartner(res.data);
        } catch (e) {
          // ignore
        }
      })();
    }
  };

  const handleSavePartner = async () => {
    if (!editingPartnerData) return;
    try {
      await api.put(`/partners/partners/${editingPartnerData.id}/`, editingPartnerData);
      const res = await api.get(`/partners/partners/${editingPartnerData.id}/`);
      setSelectedPartner(res.data);
      setEditingPartnerData(null);
      setIsEditingPartner(false);
      await fetchPartners();
      showToast('success', 'Partneris sėkmingai išsaugotas');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 
                     error.response?.data?.detail || 
                     (typeof error.response?.data === 'string' ? error.response?.data : null) ||
                     'Klaida išsaugant partnerį';
      showToast('error', errorMsg);
    }
  };

  const handleCheckVies = async () => {
    if (!editingPartnerData) return;
    const vat = (editingPartnerData.vat_code || '').trim();
    if (!vat) { 
      showToast('info', 'Įveskite PVM kodą'); 
      return; 
    }
    try {
      const res = await api.get('/partners/partners/resolve_name/', { params: { vat_code: vat } });
      const data = res.data;
      if (data.valid && data.name) {
        setEditingPartnerData({
          ...editingPartnerData,
          name: data.name,
          address: data.address || editingPartnerData.address || '',
        });
        showToast('success', 'Duomenys gauti iš VIES');
      } else {
        showToast('info', 'VIES nerado pavadinimo pagal šį PVM kodą');
      }
    } catch (e: any) {
      showToast('error', 'Nepavyko patikrinti internete: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleSetPrimaryContact = async (contactId: number) => {
    if (!selectedPartner) return;
    try {
      await api.patch(`/partners/partners/${selectedPartner.id}/`, { contact_person_id: contactId });
      const res = await api.get(`/partners/partners/${selectedPartner.id}/`);
      setSelectedPartner(res.data);
      if (editingPartnerData) {
        setEditingPartnerData(res.data);
      }
      showToast('success', 'Pirminis kontaktas nustatytas');
    } catch (error: any) {
      showToast('error', 'Nepavyko nustatyti pirminio kontakto');
    }
  };

  const handleStartEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditingContactData({ ...contact });
  };

  const handleCancelEditContact = () => {
    setEditingContactId(null);
    setEditingContactData(null);
  };

  const handleSaveContact = async () => {
    if (!editingContactData || !selectedPartner) return;
    try {
      // Paruošti duomenis API kvietimui - pašalinti partner objektą, jei yra
      const contactDataToSend = {
        partner_id: selectedPartner.id,
        first_name: editingContactData.first_name || '',
        last_name: editingContactData.last_name || '',
        email: editingContactData.email || '',
        phone: editingContactData.phone || '',
        position: editingContactData.position || '',
        notes: editingContactData.notes || ''
      };
      await api.put(`/partners/contacts/${editingContactData.id}/`, contactDataToSend);
      const res = await api.get(`/partners/partners/${selectedPartner.id}/`);
      setSelectedPartner(res.data);
      if (editingPartnerData) {
        setEditingPartnerData(res.data);
      }
      setEditingContactId(null);
      setEditingContactData(null);
      showToast('success', 'Kontaktas sėkmingai išsaugotas');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 
                     error.response?.data?.detail || 
                     (typeof error.response?.data === 'string' ? error.response?.data : null) ||
                     (error.response?.data && Object.keys(error.response.data).length > 0 
                       ? JSON.stringify(error.response.data) 
                       : null) ||
                     error.message || 
                     'Nepavyko išsaugoti kontakto';
      showToast('error', errorMsg);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šį kontaktą?')) return;
    if (!selectedPartner) return;
    try {
      await api.delete(`/partners/contacts/${contactId}/`);
      const res = await api.get(`/partners/partners/${selectedPartner.id}/`);
      setSelectedPartner(res.data);
      if (editingPartnerData) {
        setEditingPartnerData(res.data);
      }
      showToast('success', 'Kontaktas sėkmingai ištrintas');
    } catch (error: any) {
      showToast('error', 'Nepavyko ištrinti kontakto');
    }
  };

  const handleAddContact = async () => {
    if (!selectedPartner) return;
    const hasAny = !!(newContactData.first_name || newContactData.last_name || newContactData.email || newContactData.phone || newContactData.position || newContactData.notes);
    if (!hasAny) {
      showToast('info', 'Užpildykite bent vieną kontakto lauką');
      return;
    }
    try {
      await api.post('/partners/contacts/', {
        partner_id: selectedPartner.id,
        first_name: newContactData.first_name || '',
        last_name: newContactData.last_name || '',
        email: newContactData.email || '',
        phone: newContactData.phone || '',
        position: newContactData.position || '',
        notes: newContactData.notes || ''
      });
      const res = await api.get(`/partners/partners/${selectedPartner.id}/`);
      setSelectedPartner(res.data);
      if (editingPartnerData) {
        setEditingPartnerData(res.data);
      }
      setNewContactData({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
      setShowAddContactForm(false);
      showToast('success', 'Kontaktas sėkmingai pridėtas');
    } catch (error: any) {
      showToast('error', 'Nepavyko pridėti kontakto');
    }
  };

  const fetchDuplicates = async () => {
    setDupLoading(true);
    try {
      const res = await api.get('/partners/partners/duplicates_preview/', { params: { by: dupBy } });
      const groups = res.data?.groups || [];
      setDupGroups(groups);
      // Paruošiame selection state
      const sel: Record<string, { primaryId?: number; duplicateIds: number[] }> = {};
      groups.forEach((g: any) => {
        sel[g.key] = { primaryId: g.partners[0]?.id, duplicateIds: [] };
      });
      setDupSelection(sel);
    } catch (e: any) {
      showToast('error', 'Nepavyko užkrauti dublikatų: ' + (e.response?.data?.error || e.message));
    } finally {
      setDupLoading(false);
    }
  };

  const openDuplicatesModal = async () => {
    setShowDuplicatesModal(true);
    await fetchDuplicates();
  };

  const setPrimaryForCode = (key: string, id: number) => {
    setDupSelection((prev) => ({ ...prev, [key]: { primaryId: id, duplicateIds: (prev[key]?.duplicateIds || []).filter((x) => x !== id) } }));
  };

  const toggleDuplicateForCode = (key: string, id: number) => {
    setDupSelection((prev) => {
      const cur = prev[key] || { primaryId: undefined, duplicateIds: [] };
      const exists = cur.duplicateIds.includes(id);
      const next = exists ? cur.duplicateIds.filter((x) => x !== id) : [...cur.duplicateIds, id];
      return { ...prev, [key]: { primaryId: cur.primaryId, duplicateIds: next } };
    });
  };

  const mergeGroup = async (key: string) => {
    const sel = dupSelection[key];
    if (!sel?.primaryId || !sel.duplicateIds || sel.duplicateIds.length === 0) {
      showToast('info', 'Pasirinkite pirminį partnerį ir bent vieną dublikatą');
      return;
    }
    try {
      await api.post('/partners/partners/duplicates_merge/', {
        primary_id: sel.primaryId,
        duplicate_ids: sel.duplicateIds,
      });
      // Perkrauname grupes po sujungimo
      await fetchDuplicates();
      await fetchPartners();
      showToast('success', 'Sėkmingai sujungta');
    } catch (e: any) {
      showToast('error', 'Nepavyko sujungti: ' + (e.response?.data?.error || e.message));
    }
  };

  const mergeAllAuto = async () => {
    if (!window.confirm('Ar tikrai sujungti VISAS rastas grupes automatiškai? Veiksmas neatšaukiamas.')) return;
    try {
      await api.post('/partners/partners/duplicates_merge_auto/', { by: dupBy });
      await fetchDuplicates();
      await fetchPartners();
      setCurrentPage(1);
      showToast('success', 'Partneris sukurtas');
      showToast('success', 'Visos grupės sujungtos automatiškai');
    } catch (e: any) {
      showToast('error', 'Nepavyko masiškai sujungti: ' + (e.response?.data?.error || e.message));
    }
  };


  const handleDelete = async (partnerId: number, partnerName: string) => {
    if (!window.confirm(`Ar tikrai norite ištrinti partnerį "${partnerName}"?`)) {
      return;
    }

    try {
      await api.delete(`/partners/partners/${partnerId}/`);
      await fetchPartners();
      showToast('success', 'Partneris sėkmingai ištrintas');
    } catch (error: any) {
      showToast('error', error.response?.data?.error || 'Klaida trinant partnerį');
    }
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartner.name || !newPartner.code) {
      showToast('info', 'Pavadinimas ir įmonės kodas yra privalomi');
      return;
    }
    if (!newPartner.is_client && !newPartner.is_supplier) {
      showToast('info', 'Pažymėkite bent vieną tipą: Klientas arba Tiekėjas');
      return;
    }
    try {
      // 1) Sukuriame partnerį be kontaktinio asmens
      const payload: any = {
        name: newPartner.name,
        code: newPartner.code,
        vat_code: newPartner.vat_code || '',
        address: newPartner.address || '',
        is_client: !!newPartner.is_client,
        is_supplier: !!newPartner.is_supplier,
        status: newPartner.status || 'active',
        payment_term_days: newPartner.payment_term_days ?? 30,
        email_notify_due_soon: newPartner.is_client ? (newPartner.email_notify_due_soon !== false) : undefined,
        email_notify_unpaid: newPartner.is_client ? (newPartner.email_notify_unpaid !== false) : undefined,
        email_notify_overdue: newPartner.is_client ? (newPartner.email_notify_overdue !== false) : undefined,
        email_notify_manager_invoices: newPartner.is_supplier ? (newPartner.email_notify_manager_invoices !== false) : undefined,
        notes: newPartner.notes || ''
      };
      const partnerRes = await api.post('/partners/partners/', payload);
      const partnerId = partnerRes.data.id;

      // 2) Sukuriame visus įvestus kontaktus su partner_id
      const createdContacts: number[] = [];
      for (const c of newContacts) {
        const hasAny = !!(c.first_name || c.last_name || c.email || c.phone || c.position || c.notes);
        if (!hasAny) continue;
        const contactPayload = {
          partner_id: partnerId,
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email || '',
          phone: c.phone || '',
          position: c.position || '',
          notes: c.notes || ''
        };
        const contactRes = await api.post('/partners/contacts/', contactPayload);
        createdContacts.push(contactRes.data.id);
      }

      // 3) Jei yra pažymėtas pirminis kontaktas – nustatome partneriui
      const primaryIdx = Math.max(0, newContacts.findIndex((c) => c.is_primary))
      if (createdContacts.length > 0) {
        const primaryContactId = createdContacts[primaryIdx] || createdContacts[0];
        await api.patch(`/partners/partners/${partnerId}/`, { contact_person_id: primaryContactId });
      }

      setShowCreateForm(false);
      setNewPartner({
        name: '', code: '', vat_code: '', address: '',
        is_client: true, is_supplier: false, status: 'active', payment_term_days: 30,
        email_notify_due_soon: true,
        email_notify_unpaid: true,
        email_notify_overdue: true,
        email_notify_manager_invoices: true,
        notes: ''
      });
      setNewContacts([{ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '', is_primary: true }]);
      await fetchPartners();
      setCurrentPage(1);
    } catch (error: any) {
      const data = error?.response?.data;
      let message = 'Klaida kuriant partnerį';
      if (typeof data === 'string') message = data;
      else if (data && typeof data === 'object') {
        const parts: string[] = [];
        Object.keys(data).forEach((k) => {
          const v = (data as any)[k];
          if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
          else if (typeof v === 'string') parts.push(`${k}: ${v}`);
        });
        if (parts.length) message = parts.join('\n');
      }
      showToast('error', message);
    }
  };

  const addContactRow = () => {
    setNewContacts([...newContacts, { first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' }]);
  };
  const removeContactRow = (idx: number) => {
    const next = [...newContacts];
    next.splice(idx, 1);
    if (next.length === 0) next.push({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '', is_primary: true });
    setNewContacts(next);
  };
  const setPrimaryContact = (idx: number) => {
    setNewContacts(newContacts.map((c, i) => ({ ...c, is_primary: i === idx })));
  };

  // Apskaičiuoti statistiką
  const stats = React.useMemo(() => {
    const total = allPartners.length;
    const clients = allPartners.filter(p => p.is_client).length;
    const suppliers = allPartners.filter(p => p.is_supplier).length;
    const active = allPartners.filter(p => p.status === 'active').length;
    return { total, clients, suppliers, active };
  }, [allPartners]);

  return (
    <div className="partners-page">
      <div className="partners-container">
        {toast.visible && (
          <div style={{
            position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', zIndex: 2000,
            backgroundColor: toast.type === 'success' ? '#28a745' : toast.type === 'error' ? '#dc3545' : '#17a2b8',
            color: 'white', padding: '12px 18px', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            maxWidth: '90%', textAlign: 'center'
          }}>
            {toast.message}
          </div>
        )}
        
        {/* Pagrindinis layout: kairė pusė (statistika) + dešinė pusė (sąrašas) */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* Kairė pusė - Paieška ir filtrai */}
          <div style={{ 
            width: '320px', 
            flexShrink: 0,
            position: 'sticky',
            top: '20px'
          }}>
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '12px', 
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
            }}>
              {/* Mygtukas Pridėti partnerį */}
              <button
                className="btn-modern btn-primary"
                onClick={() => setShowCreateForm(true)}
                style={{
                  width: '100%',
                  marginBottom: '12px',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                <span className="btn-icon">➕</span>
                Pridėti partnerį
              </button>
              
              {/* Mažesni mygtukai vienoje eilutėje */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button 
                  className="btn-modern btn-secondary"
                  onClick={() => fetchPartners()}
                  disabled={loading}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '8px 6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🔄</span>
                  <span>Atnaujinti</span>
                </button>
                <button 
                  className="btn-modern btn-secondary"
                  onClick={openDuplicatesModal}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '8px 6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🔍</span>
                  <span>Dublikatai</span>
                </button>
                <button 
                  className="btn-modern btn-secondary"
                  onClick={() => setShowImport(!showImport)}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '8px 6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <span>📥</span>
                  <span>Importuoti</span>
                </button>
              </div>
              
              {/* Paieška */}
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#2c3e50' }}>
                  Paieška
                </h3>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Pavadinimas, kodas, PVM..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 30px 8px 10px',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '13px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#007bff'}
                    onBlur={(e) => e.target.style.borderColor = '#dee2e6'}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '16px',
                        color: '#999',
                        padding: '0',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Išvalyti"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              
              {/* Filtrai */}
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#2c3e50' }}>
                  Filtrai
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => setFilter('all')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      backgroundColor: filter === 'all' ? '#007bff' : '#f8f9fa',
                      color: filter === 'all' ? 'white' : '#495057',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                  >
                    Visi ({stats.total})
                  </button>
                  <button
                    onClick={() => setFilter('clients')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      backgroundColor: filter === 'clients' ? '#3498db' : '#f8f9fa',
                      color: filter === 'clients' ? 'white' : '#495057',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                  >
                    Klientai ({stats.clients})
                  </button>
                  <button
                    onClick={() => setFilter('suppliers')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      backgroundColor: filter === 'suppliers' ? '#f39c12' : '#f8f9fa',
                      color: filter === 'suppliers' ? 'white' : '#495057',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                  >
                    Tiekėjai ({stats.suppliers})
                  </button>
                </div>
              </div>
              
              {/* Statistika apačioje */}
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#2c3e50' }}>
                  Statistika
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '4px' }}>Iš viso partnerių</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#2c3e50' }}>{stats.total}</div>
                  </div>
                  
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '4px' }}>Aktyvūs</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#2ecc71' }}>{stats.active}</div>
                  </div>
                  
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '4px' }}>Klientai</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#3498db' }}>{stats.clients}</div>
                  </div>
                  
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0'
                  }}>
                    <div style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '4px' }}>Tiekėjai</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#f39c12' }}>{stats.suppliers}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Dešinė pusė - Pagrindinis turinys */}
          <div style={{ flex: 1, minWidth: 0 }}>

        {showImport && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h2>Importuoti iš XLSX/CSV failo</h2>
            <form onSubmit={handleImport}>
              <div className="form-group">
                <label htmlFor="importFile">Pasirinkite failą (XLSX arba CSV)</label>
                <input
                  type="file"
                  id="importFile"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={isClient}
                    onChange={(e) => setIsClient(e.target.checked)}
                  />
                  {' '}Pažymėti kaip klientus
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={isSupplier}
                    onChange={(e) => setIsSupplier(e.target.checked)}
                  />
                  {' '}Pažymėti kaip tiekėjus
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                  />
                  {' '}Atnaujinti egzistuojančius (pagal įmonės kodą)
                </label>
              </div>

              <button type="submit" className="button" disabled={importing || !importFile}>
                {importing ? 'Importuojama...' : 'Importuoti'}
              </button>
            </form>

            {importResult && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: importResult.success ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
                <h3>Rezultatai:</h3>
                {importResult.success ? (
                  <>
                    <p><strong>Importuota/Atnaujinta:</strong> {importResult.imported}</p>
                    <p><strong>Praleista:</strong> {importResult.skipped}</p>
                    {importResult.errors > 0 && (
                      <p><strong>Klaidų:</strong> {importResult.errors}</p>
                    )}
                    {importResult.results && importResult.results.length > 0 && (
                      <details style={{ marginTop: '10px' }} open>
                        <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px' }}>
                          Detalūs rezultatai (pirmi {importResult.results.length})
                        </summary>
                        <div style={{ marginTop: '10px', maxHeight: '400px', overflow: 'auto', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
                          <div style={{ marginBottom: '10px' }}>
                            <strong>Filtruoti:</strong>{' '}
                            <button 
                              onClick={() => setFilterImportResults('all')} 
                              style={{ margin: '0 5px', padding: '5px 10px', cursor: 'pointer' }}
                            >
                              Visi
                            </button>
                            <button 
                              onClick={() => setFilterImportResults('skipped')} 
                              style={{ margin: '0 5px', padding: '5px 10px', cursor: 'pointer' }}
                            >
                              Tik praleisti
                            </button>
                            <button 
                              onClick={() => setFilterImportResults('imported')} 
                              style={{ margin: '0 5px', padding: '5px 10px', cursor: 'pointer' }}
                            >
                              Tik importuoti
                            </button>
                          </div>
                          <ul style={{ marginTop: '10px', listStyle: 'none', padding: 0 }}>
                            {importResult.results
                              .filter((result: any) => {
                                if (filterImportResults === 'all') return true;
                                return result.status === filterImportResults;
                              })
                              .map((result: any, idx: number) => (
                                <li 
                                  key={idx} 
                                  style={{ 
                                    fontSize: '12px', 
                                    padding: '5px',
                                    marginBottom: '3px',
                                    backgroundColor: result.status === 'imported' ? '#d4edda' : 
                                                     result.status === 'skipped' ? '#fff3cd' : 
                                                     result.status === 'error' ? '#f8d7da' : '#e9ecef',
                                    borderRadius: '3px'
                                  }}
                                >
                                  <strong>Eilutė {result.row}:</strong> [{result.status}] {result.message}
                                </li>
                              ))}
                          </ul>
                        </div>
                      </details>
                    )}
                  </>
                ) : (
                  <p style={{ color: '#721c24' }}>{importResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}
        
        {loading ? (
          <div className="partners-loading">
            <div className="loading-spinner"></div>
            <p>Kraunama...</p>
          </div>
        ) : (
          <>
            {/* Partnerių kortelės */}
            {paginatedPartners.length === 0 ? (
              <div className="partners-empty-state">
                <div className="empty-state-icon">👥</div>
                <h3>Partnerių nerasta</h3>
                <p>{searchQuery ? 'Pakeiskite paieškos kriterijus' : 'Pradėkite pridėdami naują partnerį'}</p>
                {!searchQuery && (
                  <button 
                    className="btn-modern btn-primary"
                    onClick={() => setShowCreateForm(true)}
                  >
                    Pridėti partnerį
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="partners-grid">
                  {paginatedPartners.map((partner) => (
                    <div 
                      key={partner.id} 
                      className="partner-card"
                      onClick={() => handleShowDetails(partner)}
                    >
                      <div className="partner-card-header">
                        <div className="partner-card-title">
                          <h3>{partner.name}</h3>
                          <div className="partner-badges">
                            {partner.is_client && <span className="badge badge-client">K</span>}
                            {partner.is_supplier && <span className="badge badge-supplier">T</span>}
                            <span className={`badge badge-status ${partner.status === 'active' ? 'active' : 'inactive'}`}>
                              {partner.status === 'active' ? 'Aktyvus' : 'Neaktyvus'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="partner-card-body">
                        <div className="partner-info-row">
                          <span className="info-label">Kodas:</span>
                          <span className="info-value">{partner.code}</span>
                        </div>
                        {partner.vat_code && (
                          <div className="partner-info-row">
                            <span className="info-label">PVM:</span>
                            <span className="info-value">{partner.vat_code}</span>
                          </div>
                        )}
                        {partner.contact_person && (
                          <div className="partner-info-row">
                            <span className="info-label">Kontaktas:</span>
                            <span className="info-value">
                              {`${partner.contact_person.first_name} ${partner.contact_person.last_name}`.trim() || '-'}
                            </span>
                          </div>
                        )}
                        {partner.contact_person?.email && (
                          <div className="partner-info-row">
                            <span className="info-label">El. paštas:</span>
                            <span className="info-value email">{partner.contact_person.email}</span>
                          </div>
                        )}
                        {partner.contact_person?.phone && (
                          <div className="partner-info-row">
                            <span className="info-label">Telefonas:</span>
                            <span className="info-value">{partner.contact_person.phone}</span>
                          </div>
                        )}
                        {partner.contacts_count !== undefined && partner.contacts_count > 0 && (
                          <div className="partner-info-row">
                            <span className="info-label">Kontaktai:</span>
                            <span className="info-value">{partner.contacts_count}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="partner-card-footer">
                        <button 
                          className="btn-card-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowDetails(partner);
                          }}
                        >
                          👁️ Peržiūrėti
                        </button>
                        <button 
                          className="btn-card-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowDetails(partner);
                            handleStartEdit();
                          }}
                        >
                          ✏️ Redaguoti
                        </button>
                        <button 
                          className="btn-card-action btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(partner.id, partner.name);
                          }}
                        >
                          🗑️ Trinti
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Puslapiavimas */}
                {totalPages > 1 && (
                  <div className="partners-pagination">
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      « Ankstesnis
                    </button>
                    <span className="pagination-info">
                      Puslapis {currentPage} iš {totalPages}
                    </span>
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Kitas »
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
          </div>
        </div>
        
        {showPartnerDetails && selectedPartner && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
          }}>
            <div className="card" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Partnerio informacija</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!isEditingPartner ? (
                    <>
                      <button className="button button-secondary" onClick={() => { setShowPartnerDetails(false); setIsEditingPartner(false); }}>Uždaryti</button>
                      <button className="button" onClick={handleStartEdit}>Redaguoti</button>
                    </>
                  ) : (
                    <>
                      <button className="button button-secondary" onClick={handleCancelPartnerEdit}>Atšaukti</button>
                      <button className="button" onClick={handleSavePartner}>Išsaugoti</button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="form-group">
                  <label>Pavadinimas {isEditingPartner && '*'}</label>
                  {!isEditingPartner ? (
                    <div>{selectedPartner.name}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={editingPartnerData?.name || ''}
                        onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, name: e.target.value } : null)}
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
                  )}
                </div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Įmonės kodas {isEditingPartner && '*'}</label>
                    {!isEditingPartner ? (
                      <div>{selectedPartner.code}</div>
                    ) : (
                      <input
                        type="text"
                        value={editingPartnerData?.code || ''}
                        onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, code: e.target.value } : null)}
                        required
                      />
                    )}
                  </div>
                  <div>
                    <label>PVM kodas</label>
                    {!isEditingPartner ? (
                      <div>{selectedPartner.vat_code || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={editingPartnerData?.vat_code || ''}
                        onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, vat_code: e.target.value } : null)}
                      />
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Adresas</label>
                  {!isEditingPartner ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{selectedPartner.address || '-'}</div>
                  ) : (
                    <textarea
                      value={editingPartnerData?.address || ''}
                      onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, address: e.target.value } : null)}
                    />
                  )}
                </div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label>Mokėjimo terminas (dienos)</label>
                    {!isEditingPartner ? (
                      <div>{selectedPartner.payment_term_days ? `${selectedPartner.payment_term_days} d.` : '-'}</div>
                    ) : (
                      <input
                        type="number"
                        value={editingPartnerData?.payment_term_days || 30}
                        onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, payment_term_days: parseInt(e.target.value) || 0 } : null)}
                        min="0"
                      />
                    )}
                  </div>
                  <div>
                    <label>Būsena</label>
                    {!isEditingPartner ? (
                      <div><span className={`badge ${selectedPartner.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{selectedPartner.status_display}</span></div>
                    ) : (
                      <select
                        value={editingPartnerData?.status || 'active'}
                        onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, status: e.target.value } : null)}
                      >
                        <option value="active">Aktyvus</option>
                        <option value="blocked">Užblokuotas</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Tipas</label>
                  {!isEditingPartner ? (
                    <div>
                      {selectedPartner.is_client && <span className="badge badge-info" style={{ marginRight: 6 }}>Klientas</span>}
                      {selectedPartner.is_supplier && <span className="badge badge-info">Tiekėjas</span>}
                      {!selectedPartner.is_client && !selectedPartner.is_supplier && '-'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 16 }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={editingPartnerData?.is_client || false}
                          onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, is_client: e.target.checked } : null)}
                        />
                        {' '}Klientas
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={editingPartnerData?.is_supplier || false}
                          onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, is_supplier: e.target.checked } : null)}
                        />
                        {' '}Tiekėjas
                      </label>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Pastabos</label>
                  {!isEditingPartner ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{selectedPartner.notes || '-'}</div>
                  ) : (
                    <textarea
                      value={editingPartnerData?.notes || ''}
                      onChange={(e) => setEditingPartnerData(editingPartnerData ? { ...editingPartnerData, notes: e.target.value } : null)}
                    />
                  )}
                </div>

                {isEditingPartner && editingPartnerData && editingPartnerData.is_client && (
                  <div className="form-group" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>El. pašto priminimai (tik klientams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editingPartnerData.email_notify_due_soon !== false}
                          onChange={(e) => setEditingPartnerData({ ...editingPartnerData, email_notify_due_soon: e.target.checked })}
                        />
                        <span>Siųsti priminimą apie artėjantį terminą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editingPartnerData.email_notify_unpaid !== false}
                          onChange={(e) => setEditingPartnerData({ ...editingPartnerData, email_notify_unpaid: e.target.checked })}
                        />
                        <span>Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editingPartnerData.email_notify_overdue !== false}
                          onChange={(e) => setEditingPartnerData({ ...editingPartnerData, email_notify_overdue: e.target.checked })}
                        />
                        <span>Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą</span>
                      </label>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Priminimai apie neapmokėtas sąskaitas siunčiami tik klientams. Tiekėjams (vežėjams) šie priminimai netaikomi, nes mes jiems apmokame sąskaitas.
                    </small>
                  </div>
                )}

                {!isEditingPartner && selectedPartner.is_client && (
                  <div className="form-group" style={{ marginTop: '16px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>El. pašto priminimai (tik klientams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>
                          {selectedPartner.email_notify_due_soon !== false ? '✓' : '✗'} Siųsti priminimą apie artėjantį terminą
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>
                          {selectedPartner.email_notify_unpaid !== false ? '✓' : '✗'} Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>
                          {selectedPartner.email_notify_overdue !== false ? '✓' : '✗'} Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą
                        </span>
                      </div>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Priminimai apie neapmokėtas sąskaitas siunčiami tik klientams. Tiekėjams (vežėjams) šie priminimai netaikomi, nes mes jiems apmokame sąskaitas.
                    </small>
                  </div>
                )}

                {isEditingPartner && editingPartnerData && editingPartnerData.is_supplier && (
                  <div className="form-group" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Pranešimai vadybininkui (tik tiekėjams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editingPartnerData.email_notify_manager_invoices !== false}
                          onChange={(e) => setEditingPartnerData({ ...editingPartnerData, email_notify_manager_invoices: e.target.checked })}
                        />
                        <span>Siųsti vadybininkui pranešimą apie tiekėjo sąskaitas, kurias reikia apmokėti</span>
                      </label>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Jei pažymėta, vadybininkui (susieto užsakymo vadybininkui) bus siunčiami pranešimai apie tiekėjo sąskaitas, kurias reikia apmokėti.
                    </small>
                  </div>
                )}

                {!isEditingPartner && selectedPartner.is_supplier && (
                  <div className="form-group" style={{ marginTop: '16px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Pranešimai vadybininkui (tik tiekėjams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>
                          {selectedPartner.email_notify_manager_invoices !== false ? '✓' : '✗'} Siųsti vadybininkui pranešimą apie tiekėjo sąskaitas, kurias reikia apmokėti
                        </span>
                      </div>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Jei pažymėta, vadybininkui (susieto užsakymo vadybininkui) bus siunčiami pranešimai apie tiekėjo sąskaitas, kurias reikia apmokėti.
                    </small>
                  </div>
                )}

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
                  <h3>Kontaktiniai asmenys</h3>
                  {selectedPartner.contacts && selectedPartner.contacts.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {selectedPartner.contacts.map((c) => (
                        <li key={c.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, marginBottom: 8 }}>
                          {editingContactId === c.id && editingContactData ? (
                            <div>
                              <div className="form-group">
                                <label>Vardas</label>
                                <input
                                  type="text"
                                  value={editingContactData.first_name || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, first_name: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>Pavardė</label>
                                <input
                                  type="text"
                                  value={editingContactData.last_name || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, last_name: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>El. paštas</label>
                                <input
                                  type="email"
                                  value={editingContactData.email || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, email: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>Telefonas</label>
                                <input
                                  type="tel"
                                  value={editingContactData.phone || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, phone: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>Pareigos</label>
                                <input
                                  type="text"
                                  value={editingContactData.position || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, position: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>Pastabos</label>
                                <textarea
                                  value={editingContactData.notes || ''}
                                  onChange={(e) => setEditingContactData({ ...editingContactData, notes: e.target.value })}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button className="button" onClick={handleSaveContact}>Išsaugoti</button>
                                <button className="button button-secondary" onClick={handleCancelEditContact}>Atšaukti</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div><strong>{c.first_name} {c.last_name}</strong></div>
                                  <div style={{ fontSize: 12, color: '#555' }}>{c.position || ''}</div>
                                  <div style={{ fontSize: 12 }}>{c.email || '-'}</div>
                                  <div style={{ fontSize: 12 }}>{c.phone || '-'}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {selectedPartner.contact_person?.id === c.id && (
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>Pirminis</span>
                                  )}
                                  {!isEditingPartner && (
                                    <>
                                      <label style={{ fontSize: 12, cursor: 'pointer' }}>
                                        <input
                                          type="radio"
                                          name="primaryContact"
                                          checked={selectedPartner.contact_person?.id === c.id}
                                          onChange={() => handleSetPrimaryContact(c.id)}
                                        />{' '}Pirminis
                                      </label>
                                      <button
                                        className="button button-secondary"
                                        style={{ fontSize: '11px', padding: '4px 8px' }}
                                        onClick={() => handleStartEditContact(c)}
                                      >
                                        Redaguoti
                                      </button>
                                    </>
                                  )}
                                      <button
                                        className="button button-secondary"
                                        style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#dc3545', color: 'white', border: 'none' }}
                                        onClick={() => handleDeleteContact(c.id)}
                                    title="Ištrinti kontaktą"
                                      >
                                        Trinti
                                      </button>
                                </div>
                              </div>
                              {c.notes && <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>{c.notes}</div>}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 13, color: '#666' }}>Kontaktinių asmenų nėra</div>
                  )}
                  
                  {!isEditingPartner && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #e0e0e0', paddingTop: 12 }}>
                      {!showAddContactForm ? (
                        <button
                          type="button"
                          className="button"
                          onClick={() => setShowAddContactForm(true)}
                          style={{ fontSize: '13px', padding: '6px 12px' }}
                        >
                          + Pridėti kontaktą
                        </button>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h4 style={{ margin: 0, fontSize: '14px' }}>Pridėti kontaktą</h4>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                setShowAddContactForm(false);
                                setNewContactData({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
                              }}
                              style={{ fontSize: '11px', padding: '4px 8px' }}
                            >
                              ✕
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>Vardas</label>
                              <input
                                type="text"
                                value={newContactData.first_name || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, first_name: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>Pavardė</label>
                              <input
                                type="text"
                                value={newContactData.last_name || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, last_name: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>El. paštas</label>
                              <input
                                type="email"
                                value={newContactData.email || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>Telefonas</label>
                              <input
                                type="tel"
                                value={newContactData.phone || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>Pareigos</label>
                              <input
                                type="text"
                                value={newContactData.position || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, position: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px' }}
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: '12px', marginBottom: 4 }}>Pastabos</label>
                              <textarea
                                value={newContactData.notes || ''}
                                onChange={(e) => setNewContactData({ ...newContactData, notes: e.target.value })}
                                style={{ fontSize: '13px', padding: '6px', minHeight: '60px' }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button type="button" className="button" onClick={handleAddContact} style={{ fontSize: '13px', padding: '6px 12px' }}>Pridėti</button>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                setShowAddContactForm(false);
                                setNewContactData({ first_name: '', last_name: '', email: '', phone: '', position: '', notes: '' });
                              }}
                              style={{ fontSize: '13px', padding: '6px 12px' }}
                            >
                              Atšaukti
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showDuplicatesModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '95%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>Dublikatai pagal įmonės kodą</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button button-secondary" onClick={() => setShowDuplicatesModal(false)}>Uždaryti</button>
                  <button className="button button-secondary" onClick={fetchDuplicates} disabled={dupLoading}>{dupLoading ? 'Atnaujinama...' : 'Atnaujinti'}</button>
                  <button className="button" onClick={mergeAllAuto} disabled={dupGroups.length === 0}>Sujungti visas grupes automatiškai</button>
                </div>
              </div>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <label>Ieškoti pagal:</label>
                <select value={dupBy} onChange={(e) => setDupBy(e.target.value as any)}>
                  <option value="code">Įmonės kodą</option>
                  <option value="name">Pavadinimą</option>
                  <option value="vat">PVM kodą</option>
                </select>
              </div>
              {dupGroups.length === 0 ? (
                <div style={{ padding: 10, color: '#666' }}>{dupLoading ? 'Kraunama...' : 'Dublikatų nerasta'}</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {dupGroups.map((g) => (
                    <div key={g.key} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <strong>Raktažodis ({g.by}):</strong> {g.key}
                        </div>
                        <button className="button" onClick={() => mergeGroup(g.key)}>Sujungti pažymėtus</button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="table" style={{ fontSize: 13, minWidth: 700 }}>
                          <thead>
                            <tr>
                              <th>Pirminis</th>
                              <th>Pažymėti kaip dublikatus</th>
                              <th>ID</th>
                              <th>Pavadinimas</th>
                              <th>Kodas</th>
                              <th>PVM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.partners.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <input type="radio" name={`primary_${g.key}`} checked={dupSelection[g.key]?.primaryId === p.id} onChange={() => setPrimaryForCode(g.key, p.id)} />
                                </td>
                                <td>
                                  <input type="checkbox" checked={dupSelection[g.key]?.duplicateIds?.includes(p.id) || false} onChange={() => toggleDuplicateForCode(g.key, p.id)} />
                                </td>
                                <td>{p.id}</td>
                                <td>{p.name}</td>
                                <td>{p.code}</td>
                                <td>{p.vat_code || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>Pastaba: pasirinkite vieną pirminį ir bent vieną dublikatą.</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showCreateForm && (
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
          }}>
            <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
              <h2>Naujas partneris</h2>
              <form onSubmit={handleSaveCreate}>
                <div className="form-group">
                  <label>Firmos pavadinimas *</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newPartner.name || ''}
                      onChange={(e) => setNewPartner({...newPartner, name: e.target.value})}
                      required
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={async () => {
                        const vat = (newPartner.vat_code || '').trim();
                        if (!vat) { showToast('info', 'Įveskite PVM kodą'); return; }
                        try {
                          const res = await api.get('/partners/partners/resolve_name/', { params: { vat_code: vat } });
                          const data = res.data;
                          if (data.valid && data.name) {
                            setNewPartner((p) => ({
                              ...p,
                              name: data.name,
                              address: data.address || p.address || '',
                              is_client: true,
                            }));
                          } else {
                            showToast('info', 'VIES nerado pavadinimo pagal šį PVM kodą');
                          }
                        } catch (e: any) {
                          showToast('error', 'Nepavyko patikrinti internete: ' + (e.response?.data?.error || e.message));
                        }
                      }}
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
                    value={newPartner.code || ''}
                    onChange={(e) => setNewPartner({...newPartner, code: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>PVM kodas</label>
                  <input
                    type="text"
                    value={newPartner.vat_code || ''}
                    onChange={(e) => setNewPartner({...newPartner, vat_code: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Adresas</label>
                  <textarea
                    value={newPartner.address || ''}
                    onChange={(e) => setNewPartner({...newPartner, address: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Mokėjimo terminas (dienos)</label>
                  <input
                    type="number"
                    value={newPartner.payment_term_days ?? 30}
                    onChange={(e) => setNewPartner({...newPartner, payment_term_days: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!newPartner.is_client}
                      onChange={(e) => setNewPartner({...newPartner, is_client: e.target.checked})}
                    />
                    {' '}Klientas
                  </label>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!newPartner.is_supplier}
                      onChange={(e) => setNewPartner({...newPartner, is_supplier: e.target.checked})}
                    />
                    {' '}Tiekėjas
                  </label>
                </div>

                <div className="form-group">
                  <label>Būsena</label>
                  <select
                    value={newPartner.status || 'active'}
                    onChange={(e) => setNewPartner({...newPartner, status: e.target.value})}
                  >
                    <option value="active">Aktyvus</option>
                    <option value="blocked">Užblokuotas</option>
                  </select>
                </div>

                {newPartner.is_client && (
                  <div className="form-group" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>El. pašto priminimai (tik klientams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newPartner.email_notify_due_soon !== false}
                          onChange={(e) => setNewPartner({...newPartner, email_notify_due_soon: e.target.checked})}
                        />
                        <span>Siųsti priminimą apie artėjantį terminą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newPartner.email_notify_unpaid !== false}
                          onChange={(e) => setNewPartner({...newPartner, email_notify_unpaid: e.target.checked})}
                        />
                        <span>Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newPartner.email_notify_overdue !== false}
                          onChange={(e) => setNewPartner({...newPartner, email_notify_overdue: e.target.checked})}
                        />
                        <span>Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą</span>
                      </label>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Priminimai apie neapmokėtas sąskaitas siunčiami tik klientams. Tiekėjams (vežėjams) šie priminimai netaikomi, nes mes jiems apmokame sąskaitas.
                    </small>
                  </div>
                )}

                {newPartner.is_supplier && (
                  <div className="form-group" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Pranešimai vadybininkui (tik tiekėjams)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newPartner.email_notify_manager_invoices !== false}
                          onChange={(e) => setNewPartner({...newPartner, email_notify_manager_invoices: e.target.checked})}
                        />
                        <span>Siųsti vadybininkui pranešimą apie tiekėjo sąskaitas, kurias reikia apmokėti</span>
                      </label>
                    </div>
                    <small style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>
                      Pastaba: Jei pažymėta, vadybininkui (susieto užsakymo vadybininkui) bus siunčiami pranešimai apie tiekėjo sąskaitas, kurias reikia apmokėti.
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label>Pastabos</label>
                  <textarea
                    value={newPartner.notes || ''}
                    onChange={(e) => setNewPartner({...newPartner, notes: e.target.value})}
                  />
                </div>

                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <h3>Kontaktiniai asmenys (neprivaloma)</h3>
                  {newContacts.map((c, idx) => (
                    <div key={idx} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, marginBottom: 10 }}>
                      <div className="form-group">
                        <label>Vardas</label>
                        <input type="text" value={c.first_name || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].first_name = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div className="form-group">
                        <label>Pavardė</label>
                        <input type="text" value={c.last_name || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].last_name = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div className="form-group">
                        <label>El. paštas</label>
                        <input type="email" value={c.email || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].email = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div className="form-group">
                        <label>Telefonas</label>
                        <input type="tel" value={c.phone || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].phone = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div className="form-group">
                        <label>Pareigos</label>
                        <input type="text" value={c.position || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].position = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div className="form-group">
                        <label>Pastabos</label>
                        <textarea value={c.notes || ''} onChange={(e) => {
                          const next = [...newContacts]; next[idx].notes = e.target.value; setNewContacts(next);
                        }} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <label>
                          <input type="radio" name="primaryContact" checked={!!c.is_primary} onChange={() => setPrimaryContact(idx)} />{' '}
                          Pirminis
                        </label>
                        <button type="button" className="button button-secondary" onClick={() => removeContactRow(idx)}>
                          Pašalinti
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="button" onClick={addContactRow}>+ Pridėti kontaktą</button>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <button type="submit" className="button">
                    Išsaugoti
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => setShowCreateForm(false)}>
                    Atšaukti
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmState.open && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 2000 }}>
            <div className="card" style={{ width: 420 }}>
              <h3 style={{ marginTop: 0 }}>{confirmState.title || 'Patvirtinkite veiksmą'}</h3>
              <p style={{ margin: '10px 0 20px' }}>{confirmState.message || 'Ar tikrai?'}</p>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="button button-secondary" onClick={() => setConfirmState({ open:false })}>Atšaukti</button>
                <button className="button" onClick={() => confirmState.onConfirm && confirmState.onConfirm()}>Patvirtinti</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnersPage;

