import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { format } from 'date-fns';
import lt from 'date-fns/locale/lt';
import './MailPage.css';
import { api, partnersApi, contactsApi } from '../services/api';
import AttachmentPreviewModal, { AttachmentPreview } from '../components/common/AttachmentPreviewModal';

interface MailAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  file: string;
  download_url?: string;
  has_purchase_invoice?: boolean;
  purchase_invoice_info?: {
    id: number;
    received_invoice_number: string;
    partner_name?: string;
  };
}

interface MailTag {
  id: number;
  name: string;
  color: string;
}

interface MailMessage {
  id: number;
  subject: string;
  sender: string;
  sender_display?: string;
  sender_email?: string;
  sender_status?: 'trusted' | 'advertising' | 'default';
  recipients: string;
  recipients_display?: string;
  cc: string;
  cc_display?: string;
  bcc: string;
  bcc_display?: string;
  date: string;
  folder: string;
  status: 'new' | 'linked' | 'ignored' | 'task';
  status_display?: string;
  snippet: string;
  body_plain: string;
  body_html: string;
  attachments: MailAttachment[];
  tags: {
    id: number;
    tag: MailTag;
  }[];
  matches?: {
    orders?: string[];
    sales_invoices?: string[];
    purchase_invoices?: string[];
    expeditions?: string[];
  } | null;
  matched_sales_invoices?: Array<{
    id: number;
    invoice_number: string;
    partner: { name: string };
    amount_total: string;
  }>;
  matched_purchase_invoices?: Array<{
    id: number;
    received_invoice_number: string;
    partner: { name: string };
    amount_total: string;
  }>;
  ocr_results?: {
    [filename: string]: {
      document_type?: string;
      extracted_data?: {
        invoice_number?: string;
        order_number?: string;
        expedition_number?: string;
        amounts?: string[];
        dates?: string[];
      };
      error?: string;
    };
  };

}

const extractEmailFromSender = (sender?: string) => {
  if (!sender) {
    return '';
  }
  const angleMatch = sender.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return angleMatch[1].trim().toLowerCase();
  }
  const simpleMatch = sender.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return simpleMatch ? simpleMatch[0].toLowerCase() : '';
};

const getTrustedSenderLabel = (display?: string, fallback?: string) => {
  const source = display || fallback || '';
  if (!source) {
    return 'Nežinomas siuntėjas';
  }
  const angleIndex = source.indexOf('<');
  if (angleIndex >= 0) {
    return source.slice(0, angleIndex).trim() || source.trim();
  }
  return source.trim();
};

interface MailSyncState {
  id: number;
  folder: string;
  last_synced_at: string | null;
  last_uid: string;
  status: string;
  message: string;
}

interface EmailLog {
  id: number;
  email_type: 'reminder' | 'order' | 'invoice' | 'expedition' | 'custom';
  email_type_display: string;
  subject: string;
  recipient_email: string;
  recipient_name: string;
  related_order_id: number | null;
  related_invoice_id: number | null;
  related_expedition_id: number | null;
  related_partner_id: number | null;
  status: 'pending' | 'sent' | 'failed';
  status_display: string;
  sent_at: string | null;
  error_message: string;
  body_text: string;
  body_html: string;
  sent_by: number | null;
  sent_by_username: string | null;
  created_at: string;
  updated_at: string;
}

interface EmailStatistics {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  by_type: Array<{ email_type: string; count: number }>;
  by_day: Array<{ day: string; count: number }>;
  last_7_days: number;
  last_24h: number;
}

const DEFAULT_PAGE_SIZE = 10;

const MailPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'linked' | 'unlinked' | 'sent' | 'statistics' | 'promotional'>('linked');
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MailMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const currentRequestRef = useRef<string | null>(null); // Sekti aktyvią užklausą
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<MailSyncState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [advertisingConfirm, setAdvertisingConfirm] = useState<{
    visible: boolean;
    senderName: string;
    onConfirm: () => void;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | MailMessage['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [updatingMessage, setUpdatingMessage] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteContext, setDeleteContext] = useState<{
    mode: 'single' | 'bulk';
    ids: number[];
    subjects: string[];
    extra?: number;
  } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [manualOrderNumber, setManualOrderNumber] = useState('');
  const [manualExpeditionNumber, setManualExpeditionNumber] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [senderActionLoading, setSenderActionLoading] = useState<Record<number, boolean>>({});

  // Kontaktų pridėjimo funkcionalumas
  const [addContactModal, setAddContactModal] = useState<{
    visible: boolean;
    email: string;
    senderName: string;
  } | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  // Cache saugomas localStorage, kad išliktų po puslapio perkrovimo
  const [emailExistsCache, setEmailExistsCache] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('mailEmailExistsCache');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Išsiųstų laiškų state'ai
  const [sentEmails, setSentEmails] = useState<EmailLog[]>([]);
  const [sentEmailsLoading, setSentEmailsLoading] = useState(false);
  const [sentEmailsPage, setSentEmailsPage] = useState(1);
  const [sentEmailsPageSize, setSentEmailsPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('sentEmailsPageSize');
    return saved ? parseInt(saved, 10) : DEFAULT_PAGE_SIZE;
  });
  const [sentEmailsTotal, setSentEmailsTotal] = useState(0);
  const [sentEmailsFilter, setSentEmailsFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');
  const [sentEmailsTypeFilter, setSentEmailsTypeFilter] = useState<string>('all');
  
  // Statistikos state'ai
  const [statistics, setStatistics] = useState<EmailStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  
  // Išsiųsto laiško detalių modalas
  const [selectedSentEmail, setSelectedSentEmail] = useState<EmailLog | null>(null);
  
  // Cache'as užsakymų ir ekspedicijų numeriams (useRef, kad nesukeltų re-render'ų)
  const orderNumbersCacheRef = useRef<Record<number, string>>({});
  const expeditionNumbersCacheRef = useRef<Record<number, string>>({});
  
  // State tik UI atnaujinimui
  const [, setCacheUpdate] = useState(0);

  const statusLabelMap: Record<MailMessage['status'], string> = useMemo(
    () => ({
      new: 'Naujas',
      linked: 'Skaitytas',
      ignored: 'Ignoruotas',
      task: 'Užduotis',
    }),
    []
  );

  const totalAttachmentCount = useMemo(() =>
    messages.reduce((acc, msg) => acc + (msg.attachments?.length || 0), 0),
  [messages]);

  const unreadCount = useMemo(() =>
    messages.filter((msg) => msg.status === 'new').length,
  [messages]);

  const fetchSyncState = useCallback(async () => {
    try {
      const response = await api.get('/mail/sync-state/', { params: { folder: 'INBOX' } });
      if (Array.isArray(response.data) && response.data.length > 0) {
        setSyncState(response.data[0]);
      } else if (response.data?.results?.length) {
        setSyncState(response.data.results[0]);
      } else {
        setSyncState(null);
      }
    } catch (err: any) {
      console.warn('Nepavyko gauti sinchronizacijos būsenos', err);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    const requestId = `req_${Date.now()}_${Math.random()}`; // Unikalus užklausos ID
    const currentTab = activeTab; // Išsaugome dabartinį tab'ą užklausos pradžioje

    // Nustatome šią užklausą kaip aktyvią
    currentRequestRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, any> = {
        page: currentPage,
        page_size: DEFAULT_PAGE_SIZE,
        ordering: '-date',
      };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      // Naudoti atskirus endpoint'us pagal activeTab
      let endpoint = '/mail/messages/';
      if (currentTab === 'linked') {
        endpoint = '/mail/messages/linked/';
      } else if (currentTab === 'unlinked') {
        endpoint = '/mail/messages/unlinked/';
      } else if (currentTab === 'promotional') {
        endpoint = '/mail/messages/promotional/';
      }

      console.log(`🚀 Starting request ${requestId} for tab: ${currentTab}, endpoint: ${endpoint}`);

      const response = await api.get(endpoint, { params });

      // Patikriname ar ši užklausa vis dar yra aktyvi
      if (currentRequestRef.current !== requestId) {
        console.log(`⏹️ Request ${requestId} cancelled - newer request active`);
        return;
      }

      if (currentTab !== activeTab) {
        console.log(`🔄 Tab changed during request. Was: ${currentTab}, Now: ${activeTab}`);
        return; // Ignoruojame jei tab'as pasikeitė
      }

      if (response.data?.results) {
        setMessages(response.data.results);
        const count = response.data.count ?? response.data.results.length;
        setTotalCount(count);
        setTotalPages(Math.max(1, Math.ceil(count / DEFAULT_PAGE_SIZE)));
        console.log(`✅ Successfully loaded ${response.data.results.length} messages for tab: ${currentTab}`);
      } else if (Array.isArray(response.data)) {
        setMessages(response.data);
        setTotalCount(response.data.length);
        setTotalPages(Math.max(1, Math.ceil(response.data.length / DEFAULT_PAGE_SIZE)));
        console.log(`✅ Successfully loaded ${response.data.length} messages for tab: ${currentTab}`);
      } else {
        setMessages([]);
        setTotalCount(0);
        setTotalPages(1);
        console.log(`✅ Successfully loaded 0 messages for tab: ${currentTab}`);
      }

    } catch (err: any) {
      // Patikriname ar ši užklausa vis dar yra aktyvi
      if (currentRequestRef.current !== requestId) {
        console.log(`⏹️ Request ${requestId} cancelled in error handler`);
        return;
      }

      if (currentTab !== activeTab) {
        console.log(`🔄 Tab changed during error handling. Was: ${currentTab}, Now: ${activeTab}`);
        return;
      }

      console.error(`❌ Error loading messages for tab ${currentTab}:`, err);

      if (err.response?.status === 404 && currentPage > 1) {
        setError('Puslapis nerastas, grįžtame atgal');
        setCurrentPage((prev) => Math.max(1, prev - 1));
        setTotalPages(Math.max(1, currentPage - 1));
      } else {
        setError(err.response?.data?.detail || err.message || 'Nepavyko užkrauti laiškų');
      }
      setMessages([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      // Patikriname ar ši užklausa vis dar yra aktyvi
      if (currentRequestRef.current === requestId && currentTab === activeTab) {
        setLoading(false);
      }
    }
  }, [currentPage, statusFilter, searchQuery, activeTab]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    fetchSyncState();
  }, [fetchSyncState]);

  // Kontaktų funkcionalumas
  const checkEmailExistsInContacts = useCallback(async (email: string): Promise<boolean> => {
    try {
      const response = await contactsApi.getContacts({ search: email, page_size: 1 });
      return response.data.count > 0;
    } catch (error) {
      console.error('Klaida tikrinant kontaktus:', error);
      return false;
    }
  }, []);

  const searchPartners = useCallback(async (query: string) => {
    setPartnersLoading(true);
    try {
      const params: any = { page_size: 20 };
      if (query && query.trim()) {
        params.search = query.trim();
      }
      const response = await partnersApi.getPartners(params);
      // DRF grąžina paginuotus rezultatus su 'results' lauku arba tiesiog array
      const data = response.data;
      const partnersList = Array.isArray(data) ? data : (data.results || []);
      setPartners(partnersList);
    } catch (error: any) {
      console.error('Klaida ieškant partnerių:', error);
      setPartners([]);
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  const handleAddContact = useCallback(async (message: MailMessage) => {
    const email = extractEmailFromSender(message.sender_email || message.sender);
    if (!email) {
      setMessage({ type: 'error', text: 'Nepavyko išgauti el. pašto adreso iš siuntėjo.' });
      return;
    }

    // Patikrinti cache arba iš naujo
    let exists = emailExistsCache[email];
    if (exists === undefined) {
      exists = await checkEmailExistsInContacts(email);
      setEmailExistsCache(prev => ({ ...prev, [email]: exists }));
    }

    if (exists) {
      setMessage({ type: 'info', text: `El. pašto adresas "${email}" jau egzistuoja kontaktų bazėje.` });
      return;
    }

    const senderName = getTrustedSenderLabel(message.sender_display, message.sender);
    setAddContactModal({ visible: true, email, senderName });
    setPartnerSearch('');
    setSelectedPartnerId(null);
    setPartners([]); // Iš pradžių nėra rezultatų - laukiama įvesties
  }, [checkEmailExistsInContacts, emailExistsCache]);

  // Išsaugoti emailExistsCache į localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mailEmailExistsCache', JSON.stringify(emailExistsCache));
    } catch (error) {
      console.warn('Nepavyko išsaugoti emailExistsCache į localStorage:', error);
    }
  }, [emailExistsCache]);

  // Periodiškai patikrinti cache validumą (kas 30 sekundžių)
  useEffect(() => {
    const interval = setInterval(async () => {
      // Patikrinti keletą cache reikšmių, kurios buvo pažymėtos kaip "egzistuoja"
      const emailsToCheck = Object.keys(emailExistsCache).filter(email => emailExistsCache[email] === true).slice(0, 3);

      for (const email of emailsToCheck) {
        try {
          const exists = await checkEmailExistsInContacts(email);
          if (exists !== emailExistsCache[email]) {
            console.log(`Cache neatitinka realybės email ${email}: cache=${emailExistsCache[email]}, realybė=${exists}`);
            setEmailExistsCache(prev => ({ ...prev, [email]: exists }));
          }
        } catch (error) {
          console.warn(`Nepavyko patikrinti cache email ${email}:`, error);
        }
      }
    }, 30000); // Kas 30 sekundžių

    return () => clearInterval(interval);
  }, [emailExistsCache, checkEmailExistsInContacts]);

  // Patikrinti, ar reikia rodyti kontaktų pridėjimo mygtuką šiam laiškui
  const shouldShowAddContactButton = useCallback(async (message: MailMessage): Promise<boolean> => {
    const email = extractEmailFromSender(message.sender_email || message.sender);
    if (!email) return false;

    const exists = await checkEmailExistsInContacts(email);
    return !exists;
  }, [checkEmailExistsInContacts]);

  const handleCreateContact = useCallback(async () => {
    if (!addContactModal || !selectedPartnerId) {
      setMessage({ type: 'error', text: 'Pasirinkite partnerį.' });
      return;
    }

    setAddingContact(true);
    try {
      await contactsApi.createContact({
        partner_id: selectedPartnerId,
        email: addContactModal.email,
        first_name: '',
        last_name: '',
        notes: `Automatiškai pridėtas iš el. laiško (siuntėjas: ${addContactModal.senderName})`,
        is_trusted: true,  // Automatiškai pažymėti kaip patikimą siuntėją
        is_advertising: false
      });

      // Atnaujiname cache, kad mygtukas "Add Contact" neberodytų šiam email
      setEmailExistsCache(prev => ({ ...prev, [addContactModal.email]: true }));

      setMessage({
        type: 'success',
        text: `Kontaktas "${addContactModal.email}" sėkmingai pridėtas prie partnerio.`
      });
      setAddContactModal(null);
    } catch (error: any) {
      console.error('Klaida kuriant kontaktą:', error);
      setMessage({
        type: 'error',
        text: `Nepavyko pridėti kontakto: ${error.response?.data?.detail || error.response?.data?.error || error.message}`
      });
    } finally {
      setAddingContact(false);
    }
  }, [addContactModal, selectedPartnerId]);

  // Partnerių paieška pagal įvestį (debounced)
  useEffect(() => {
    if (addContactModal?.visible && partnerSearch.trim().length >= 1) {
      const timeoutId = setTimeout(() => {
        searchPartners(partnerSearch.trim());
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (addContactModal?.visible && partnerSearch.trim().length === 0) {
      // Išvalyti rezultatus, kai nėra teksto
      setPartners([]);
    }
  }, [partnerSearch, addContactModal?.visible, searchPartners]);

  const performAdvertisingClassification = useCallback(
    async (message: MailMessage, normalizedEmail: string) => {
      setSenderActionLoading((prev) => ({ ...prev, [message.id]: true }));
      try {
        const listResponse = await api.get('/partners/contacts/', {
          params: { search: normalizedEmail, page_size: 1 },
        });
        const listPayload = Array.isArray(listResponse.data)
          ? listResponse.data
          : listResponse.data?.results || [];
        let senderId: number | null = null;
        if (listPayload.length > 0) {
          senderId = listPayload[0].id;
        }

        if (senderId) {
          await api.post(`/partners/contacts/${senderId}/advertising/`);
        } else {
          await api.post('/partners/contacts/', {
            email: normalizedEmail,
            first_name: message.sender_display || message.sender || '',
            last_name: '',
            is_trusted: false,
            is_advertising: true,
          });
        }

        await fetchMessages();
        setMessage({
          type: 'success',
          text: `Siuntėjas "${message.sender_display || message.sender || normalizedEmail}" pažymėtas kaip reklaminis ir jo laiškai ištrinti.`
        });
        setTimeout(() => setMessage(null), 5000);
      } catch (err: any) {
        console.error('Klaida atnaujinant siuntėjo statusą:', err);
        setError('Nepavyko atnaujinti siuntėjo statuso');
      } finally {
        setSenderActionLoading((prev) => {
          const { [message.id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [fetchMessages]
  );

  const handleSenderClassification = useCallback(
    async (message: MailMessage, classification: 'trusted' | 'advertising') => {
      const normalizedEmail = extractEmailFromSender(message.sender_display || message.sender);
      if (!normalizedEmail) {
        return;
      }

      // Patvirtinimas prieš pažymint kaip reklaminį (išrina laiškus)
      if (classification === 'advertising') {
        const senderName = message.sender_display || message.sender || normalizedEmail;
        setAdvertisingConfirm({
          visible: true,
          senderName,
          onConfirm: () => {
            setAdvertisingConfirm(null);
            // Rekursyviai iškviesti funkciją be patvirtinimo
            performAdvertisingClassification(message, normalizedEmail);
          }
        });
        return;
      }

      setSenderActionLoading((prev) => ({ ...prev, [message.id]: true }));
      try {
        const listResponse = await api.get('/partners/contacts/', {
          params: { search: normalizedEmail, page_size: 1 },
        });
        const listPayload = Array.isArray(listResponse.data)
          ? listResponse.data
          : listResponse.data?.results || [];
        let senderId: number | null = null;
        if (listPayload.length > 0) {
          senderId = listPayload[0].id;
        }

        if (senderId) {
          await api.post(`/partners/contacts/${senderId}/trust/`);
        } else {
          await api.post('/partners/contacts/', {
            email: normalizedEmail,
            first_name: message.sender_display || message.sender || '',
            last_name: '',
            is_trusted: true,
            is_advertising: false,
          });
        }

        await fetchMessages();
        setMessage({
          type: 'success',
          text: `Siuntėjas "${message.sender_display || message.sender || normalizedEmail}" pažymėtas kaip patikimas.`
        });
        setTimeout(() => setMessage(null), 3000);
      } catch (err: any) {
        console.error('Klaida atnaujinant siuntėjo statusą:', err);
        setError('Nepavyko atnaujinti siuntėjo statuso');
      } finally {
        setSenderActionLoading((prev) => {
          const { [message.id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [fetchMessages, performAdvertisingClassification]
  );

  // Užkrauti išsiųstus laiškus
  const fetchSentEmails = useCallback(async () => {
    setSentEmailsLoading(true);
    try {
      const params: any = {
        page: sentEmailsPage,
        page_size: sentEmailsPageSize,
      };
      if (sentEmailsFilter !== 'all') {
        params.status = sentEmailsFilter;
      }
      if (sentEmailsTypeFilter !== 'all') {
        params.email_type = sentEmailsTypeFilter;
      }
      const response = await api.get('/mail/email-logs/', { params });
      const data = response.data;
      const emails = Array.isArray(data) ? data : (data.results || []);
      setSentEmails(emails);
      setSentEmailsTotal(data.count || (Array.isArray(data) ? data.length : 0));
      
      // Užkrauti užsakymų ir ekspedicijų numerius
      const orderIds = emails.filter((e: EmailLog) => e.related_order_id).map((e: EmailLog) => e.related_order_id!);
      const expeditionIds = emails.filter((e: EmailLog) => e.related_expedition_id).map((e: EmailLog) => e.related_expedition_id!);
      
      // Užkrauti užsakymų numerius
      for (const orderId of orderIds) {
        if (!orderNumbersCacheRef.current[orderId]) {
          api.get(`/orders/orders/${orderId}/`)
            .then(orderResponse => {
              const orderNumber = orderResponse.data.order_number;
              if (orderNumber) {
                orderNumbersCacheRef.current[orderId] = orderNumber;
                setCacheUpdate(prev => prev + 1); // Trigger re-render
              }
            })
            .catch(() => {
              // Ignoruoti klaidas
            });
        }
      }
      
      // Užkrauti ekspedicijų numerius
      for (const expeditionId of expeditionIds) {
        if (!expeditionNumbersCacheRef.current[expeditionId]) {
          api.get(`/orders/carriers/${expeditionId}/`)
            .then(expeditionResponse => {
              const expeditionNumber = expeditionResponse.data.expedition_number;
              if (expeditionNumber) {
                expeditionNumbersCacheRef.current[expeditionId] = expeditionNumber;
                setCacheUpdate(prev => prev + 1); // Trigger re-render
              }
            })
            .catch(() => {
              // Ignoruoti klaidas
            });
        }
      }
    } catch (err: any) {
      console.error('Klaida užkraunant išsiųstus laiškus:', err);
      setSentEmails([]);
    } finally {
      setSentEmailsLoading(false);
    }
  }, [sentEmailsPage, sentEmailsPageSize, sentEmailsFilter, sentEmailsTypeFilter]);

  // Užkrauti statistiką
  const fetchStatistics = useCallback(async () => {
    setStatisticsLoading(true);
    try {
      const response = await api.get('/mail/email-logs/statistics/');
      setStatistics(response.data);
    } catch (err: any) {
      console.error('Klaida užkraunant statistiką:', err);
      setStatistics(null);
    } finally {
      setStatisticsLoading(false);
    }
  }, []);

  // Užkrauti duomenis pagal aktyvų tab'ą
  useEffect(() => {
    if (activeTab === 'sent') {
      fetchSentEmails();
    } else if (activeTab === 'statistics') {
      fetchStatistics();
    } else {
      // Resetinti puslapį ir rezultatą, kai keičiamas tab
      setCurrentPage(1);
      setTotalCount(0);
      setMessages([]);
    }
  }, [activeTab, fetchSentEmails, fetchStatistics]);

  // Užkrauti išsiųstus laiškus, kai pasikeičia filtrai arba page size
  useEffect(() => {
    if (activeTab === 'sent') {
      setSentEmailsPage(1);
    }
  }, [sentEmailsFilter, sentEmailsTypeFilter, sentEmailsPageSize, activeTab]);
  
  // Išsaugoti page size į localStorage
  useEffect(() => {
    if (sentEmailsPageSize !== DEFAULT_PAGE_SIZE) {
      localStorage.setItem('sentEmailsPageSize', sentEmailsPageSize.toString());
    } else {
      localStorage.removeItem('sentEmailsPageSize');
    }
  }, [sentEmailsPageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => messages.some((msg) => msg.id === id)));
  }, [messages]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await api.post('/mail/messages/sync/', { limit: 50 });
      if (response.data?.status !== 'ok') {
        const message = response.data?.message || 'Sinchronizacijos klaida';
        setError(message);
      }
      await fetchSyncState();
      await fetchMessages();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Sinchronizacijos klaida');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = useCallback((value: string) => {
    try {
      return format(new Date(value), 'yyyy-MM-dd HH:mm', { locale: lt });
    } catch {
      return value;
    }
  }, []);

  const effectiveTotalPages = Math.max(1, totalPages);
  
  const sentEmailsTotalPages = useMemo(() => Math.max(1, Math.ceil(sentEmailsTotal / sentEmailsPageSize)), [sentEmailsTotal, sentEmailsPageSize]);

  const renderedBody = useMemo(() => {
    if (!selectedMessage) return null;
    if (selectedMessage.body_html) {
      // Išvalome pavojingus HTML elementus kurie gali paveikti layout'ą
      let cleanedHtml = selectedMessage.body_html;

      // Pašaliname tik struktūrinius tag'us, bet paliekame jų turinį
      cleanedHtml = cleanedHtml.replace(/<html[^>]*>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<\/html>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<head[^>]*>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<\/head>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<body[^>]*>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<\/body>/gi, '');

      // Pašaliname meta viewport tag'ą kuris gali pakeisti scaling'ą
      cleanedHtml = cleanedHtml.replace(/<meta[^>]*viewport[^>]*>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/gi, '');

      // Pašaliname @media queries kurios gali paveikti responsive behavior
      cleanedHtml = cleanedHtml.replace(/@media[^{]*{[^}]*}/gi, '');

      return (
        <div
          className="mail-body mail-body-html"
          dangerouslySetInnerHTML={{ __html: cleanedHtml }}
        />
      );
    }
    if (selectedMessage.body_plain) {
      return <pre className="mail-body mail-body-plain">{selectedMessage.body_plain}</pre>;
    }
    return <div className="mail-body mail-body-empty">Laiško turinys nerastas.</div>;
  }, [selectedMessage]);

  const refreshSingleMessage = useCallback((updated: MailMessage) => {
    setMessages((prev) => prev.map((msg) => (msg.id === updated.id ? updated : msg)));
    setSelectedMessage(updated);
  }, []);

  const updateMessageStatus = useCallback(
    async (status: MailMessage['status']) => {
      if (!selectedMessage || updatingMessage) return;
      setUpdatingMessage(true);
      setError(null);
      try {
        const response = await api.patch(`/mail/messages/${selectedMessage.id}/`, { status });
        refreshSingleMessage(response.data);
      } catch (err: any) {
        const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Nepavyko atnaujinti laiško būsenos.';
        setError(errMsg);
      } finally {
        setUpdatingMessage(false);
      }
    },
    [refreshSingleMessage, selectedMessage, updatingMessage]
  );

  const performDeleteMessage = useCallback(async () => {
    if (!deleteContext || deletingMessage) {
      return;
    }
    setDeletingMessage(true);
    setError(null);
    try {
      for (const id of deleteContext.ids) {
        await api.delete(`/mail/messages/${id}/`);
      }
      setMessages((prev) => prev.filter((msg) => !deleteContext.ids.includes(msg.id)));
      setSelectedIds((prev) => prev.filter((id) => !deleteContext.ids.includes(id)));
      setTotalCount((prev) => Math.max(0, prev - deleteContext.ids.length));
      if (selectedMessage && deleteContext.ids.includes(selectedMessage.id)) {
        setSelectedMessage(null);
      }
      if (messages.length - deleteContext.ids.length <= 0 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      }
    } catch (err: any) {
      const errMsg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        'Nepavyko ištrinti laiško.';
      setError(errMsg);
    } finally {
      setDeletingMessage(false);
      setConfirmDeleteOpen(false);
      setDeleteContext(null);
    }
  }, [currentPage, deleteContext, deletingMessage, messages.length, selectedMessage]);

  const openDeleteConfirm = useCallback(
    (message?: MailMessage) => {
      const target = message || selectedMessage;
      if (!target) {
        return;
      }
      setDeleteContext({
        mode: 'single',
        ids: [target.id],
        subjects: [target.subject || '(be temos)'],
      });
      setConfirmDeleteOpen(true);
    },
    [selectedMessage]
  );

  const openBulkDeleteConfirm = useCallback(() => {
    if (!selectedIds.length) {
      return;
    }
    const matched = messages.filter((msg) => selectedIds.includes(msg.id));
    const subjects = matched.slice(0, 5).map((msg) => msg.subject || '(be temos)');
    const extra = matched.length > subjects.length ? matched.length - subjects.length : undefined;
    setDeleteContext({
      mode: selectedIds.length > 1 ? 'bulk' : 'single',
      ids: [...selectedIds],
      subjects,
      extra,
    });
    setConfirmDeleteOpen(true);
  }, [messages, selectedIds]);

  const cancelDelete = useCallback(() => {
    setConfirmDeleteOpen(false);
    setDeleteContext(null);
  }, []);

  const toggleMessageSelection = useCallback((id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (messages.length === 0) {
      return;
    }
    if (selectedIds.length === messages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(messages.map((msg) => msg.id));
    }
  }, [messages, selectedIds.length]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    const subject = selectedMessage.subject ? `Re: ${selectedMessage.subject}` : '';
    const mailto = `mailto:${encodeURIComponent(selectedMessage.sender)}?subject=${encodeURIComponent(subject)}`;
    window.location.href = mailto;
  }, [selectedMessage]);

  const handleManualAssign = useCallback(async () => {
    if (!selectedMessage || assigning) return;
    
    const orderNum = manualOrderNumber.trim();
    const expNum = manualExpeditionNumber.trim();
    
    if (!orderNum && !expNum) {
      setError('Įveskite užsakymo numerį arba ekspedicijos numerį');
      return;
    }
    
    setAssigning(true);
    setError(null);
    try {
      const response = await api.post(`/mail/messages/${selectedMessage.id}/assign/`, {
        order_number: orderNum || undefined,
        expedition_number: expNum || undefined,
      });
      refreshSingleMessage(response.data);
      setManualOrderNumber('');
      setManualExpeditionNumber('');
      // Išvalyti error (sėkmės pranešimas nereikalingas, nes error išvalomas)
      setError(null);
      // Atnaujinti sąrašą
      await fetchMessages();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Nepavyko priskirti laiško';
      setError(errMsg);
    } finally {
      setAssigning(false);
    }
  }, [selectedMessage, manualOrderNumber, manualExpeditionNumber, assigning, refreshSingleMessage, fetchMessages]);

  const handleAttachmentAssignSuccess = useCallback(
    async (updated?: MailMessage) => {
      if (updated) {
        refreshSingleMessage(updated);
      }
      await fetchMessages();
    },
    [fetchMessages, refreshSingleMessage]
  );

  return (
    <>
      {/* Advertising Confirm Modal */}
      {advertisingConfirm?.visible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAdvertisingConfirm(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#dc2626' }}>
              ⚠️ ĮSPĖJIMAS
            </h3>
            <p style={{ marginBottom: '20px', lineHeight: '1.5' }}>
              Ar tikrai norite pažymėti <strong>"{advertisingConfirm.senderName}"</strong> kaip reklaminį siuntėją?
              <br /><br />
              <strong style={{ color: '#dc2626' }}>Bus IŠTRINTI VISI laiškai nuo šio siuntėjo!</strong>
              <br />
              <em>Šis veiksmas neatstatomas.</em>
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAdvertisingConfirm(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                  cursor: 'pointer',
                }}
              >
                Atšaukti
              </button>
              <button
                onClick={advertisingConfirm.onConfirm}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Patvirtinti ir ištrinti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {addContactModal?.visible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAddContactModal(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              width: '95%',
              maxHeight: '80vh',
              overflow: 'hidden',
              boxShadow: '0 20px 25px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#2563eb', fontSize: '20px' }}>
              👤 Pridėti kontaktą
            </h3>
            <p style={{ marginBottom: '20px', lineHeight: '1.5', color: '#6b7280', fontSize: '14px' }}>
              Pridėti el. pašto adresą <strong>"{addContactModal.email}"</strong> prie partnerio kontaktų.
              <br />
              Iš siuntėjo: <em>{addContactModal.senderName}</em>
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
                Ieškoti partnerio:
              </label>
              <input
                type="text"
                placeholder="Pradėkite vesti partnerio pavadinimą..."
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!partnerSearch.trim() ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '16px',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  Pradėkite vesti partnerio pavadinimą...
                </div>
              ) : (
                <div style={{
                  flex: 1,
                  overflow: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb'
                }}>
                {partnersLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                    Ieškoma...
                  </div>
                ) : partners.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                    Partnerių nerasta pagal "{partnerSearch}"
                  </div>
                ) : (
                  partners.map((partner) => (
                    <div
                      key={partner.id}
                      onClick={() => setSelectedPartnerId(partner.id)}
                      style={{
                        padding: '10px 12px',
                        border: `1px solid ${selectedPartnerId === partner.id ? '#2563eb' : '#e5e7eb'}`,
                        borderRadius: '4px',
                        marginBottom: '4px',
                        cursor: 'pointer',
                        backgroundColor: selectedPartnerId === partner.id ? '#eff6ff' : 'white',
                        fontSize: '14px',
                      }}
                    >
                      <div style={{ fontWeight: '500', color: '#1f2937' }}>
                        {partner.name}
                      </div>
                      {partner.code && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Kodas: {partner.code}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setAddContactModal(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                  cursor: 'pointer',
                }}
                disabled={addingContact}
              >
                Atšaukti
              </button>
              <button
                onClick={handleCreateContact}
                disabled={!selectedPartnerId || addingContact}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: selectedPartnerId ? '#2563eb' : '#d1d5db',
                  color: 'white',
                  cursor: selectedPartnerId && !addingContact ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                }}
              >
                {addingContact ? 'Pridedama...' : 'Pridėti kontaktą'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page mail-page">
      <div className="container">
        <div className="mail-strip">
          <div className="mail-strip-actions">
            <button
              className="mail-strip-button"
              onClick={handleSync}
              disabled={syncing}
              title="Sinchronizuoja naujus laiškus iš IMAP serverio"
            >
              {syncing ? 'Sinchronizuojama...' : 'Sinchronizuoti dabar'}
            </button>
          </div>

          <div className="mail-strip-status">
            <span className={`mail-strip-dot ${syncState?.status === 'error' ? 'error' : 'success'}`} />
            <span className="mail-strip-title">
              {syncState?.status === 'error' ? 'Sinchronizacijos klaida' : 'Sinchronizacija pasirengusi'}
            </span>
          </div>

          <div className="mail-strip-meta">
            <div className="mail-strip-item">
              <span className="label">Paskutinį kartą:</span>
              <span>{syncState?.last_synced_at ? formatDate(syncState.last_synced_at) : 'Dar nevykdyta'}</span>
            </div>
            {syncState?.message && (
              <div className="mail-strip-item message">{syncState.message}</div>
            )}
          </div>
        </div>

        {/* Tabai */}
        <div className="mail-tabs" style={{ 
          display: 'flex', 
          gap: '0', 
          borderBottom: '2px solid #dee2e6',
          marginBottom: '20px',
          backgroundColor: '#f8f9fa',
          justifyContent: 'flex-start',
          width: '100%'
        }}>
          <button
            className={`mail-tab ${activeTab === 'linked' ? 'active' : ''}`}
            onClick={() => { setActiveTab('linked'); setCurrentPage(1); }}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'linked' ? '3px solid #007bff' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'linked' ? '600' : '400',
              color: activeTab === 'linked' ? '#007bff' : '#6c757d',
              transition: 'all 0.2s'
            }}
          >
            Susieti laiškai
          </button>
          <button
            className={`mail-tab ${activeTab === 'unlinked' ? 'active' : ''}`}
            onClick={() => { setActiveTab('unlinked'); setCurrentPage(1); }}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'unlinked' ? '3px solid #007bff' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'unlinked' ? '600' : '400',
              color: activeTab === 'unlinked' ? '#007bff' : '#6c757d',
              transition: 'all 0.2s'
            }}
          >
            Nesusieti laiškai
          </button>
          <button
            className={`mail-tab ${activeTab === 'promotional' ? 'active' : ''}`}
            onClick={() => { setActiveTab('promotional'); setCurrentPage(1); }}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'promotional' ? '3px solid #007bff' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'promotional' ? '600' : '400',
              color: activeTab === 'promotional' ? '#007bff' : '#6c757d',
              transition: 'all 0.2s'
            }}
          >
            Reklamos
          </button>
          <button
            className={`mail-tab ${activeTab === 'sent' ? 'active' : ''}`}
            onClick={() => { setActiveTab('sent'); setCurrentPage(1); }}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'sent' ? '3px solid #007bff' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'sent' ? '600' : '400',
              color: activeTab === 'sent' ? '#007bff' : '#6c757d',
              transition: 'all 0.2s'
            }}
          >
            Išsiųsti laiškai
          </button>
          <button
            className={`mail-tab ${activeTab === 'statistics' ? 'active' : ''}`}
            onClick={() => { setActiveTab('statistics'); setCurrentPage(1); }}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === 'statistics' ? '3px solid #007bff' : '3px solid transparent',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'statistics' ? '600' : '400',
              color: activeTab === 'statistics' ? '#007bff' : '#6c757d',
              transition: 'all 0.2s'
            }}
          >
            Statistika
          </button>
        </div>

        {error && <div className="mail-strip-error">{error}</div>}

        {message && (
          <div className={`mail-strip-${message.type}`}>
            {message.text}
          </div>
        )}

        {(activeTab === 'linked' || activeTab === 'unlinked' || activeTab === 'promotional') && (
          <div className="mail-layout">
          <div className="mail-list-panel">
            <div className="mail-filters">
              <div className="mail-summary">
                <span>Rodyta: {messages.length} / {totalCount}</span>
                <span>Naujų: {unreadCount}</span>
                <span>Priedų: {totalAttachmentCount}</span>
                {selectedIds.length > 0 && <span>Pažymėta: {selectedIds.length}</span>}
                <div className="mail-search" style={{ marginLeft: 'auto' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Paieška pagal temą, siuntėją..."
                  />
                  {searchQuery && (
                    <button className="clear-btn" onClick={() => setSearchQuery('')}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="mail-filter-group">
                <span className="label">Būsena:</span>
                <button
                  className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  Visi
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'new' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('new')}
                >
                  Nauji
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'linked' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('linked')}
                >
                  Skaityti
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'task' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('task')}
                >
                  Užduotys
                </button>
                <button
                  className={`filter-btn ${statusFilter === 'ignored' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ignored')}
                >
                  Ignoruoti
                </button>
              </div>
              <div className="mail-filter-actions">
                <button
                  className="mail-action-button"
                  onClick={() => selectedMessage && updateMessageStatus('linked')}
                  disabled={!selectedMessage || updatingMessage}
                  title="Pažymėti pasirinktą kaip skaitytą"
                >
                  {updatingMessage ? 'Žymima...' : '✓ Pažymėti kaip skaitytą'}
                </button>
                <button
                  className="mail-action-button"
                  onClick={() => openDeleteConfirm()}
                  disabled={!selectedMessage || deletingMessage}
                  title="Ištrinti pasirinktą laišką"
                >
                  {deletingMessage ? 'Trinama...' : '🗑️ Ištrinti'}
                </button>
                <button
                  className="mail-action-button"
                  onClick={handleToggleSelectAll}
                  disabled={messages.length === 0}
                >
                  {messages.length > 0 && selectedIds.length === messages.length
                    ? 'Nuimti pažymėjimą'
                    : 'Pažymėti visus'}
                </button>
                {selectedIds.length > 0 && (
                  <button className="mail-action-button" onClick={handleClearSelection}>
                    Išvalyti pažymėjimą
                  </button>
                )}
                <button
                  className="mail-action-button danger"
                  onClick={openBulkDeleteConfirm}
                  disabled={selectedIds.length === 0 || deletingMessage}
                  title="Ištrinti pažymėtus laiškus"
                >
                  {deletingMessage ? 'Trinama...' : `🗑️ Ištrinti pažymėtus (${selectedIds.length})`}
                </button>
              </div>
            </div>

            <div className="mail-list">
              {loading ? (
                <div className="mail-empty">Kraunama...</div>
              ) : messages.length === 0 ? (
                <div className="mail-empty">Laiškų nerasta.</div>
              ) : (
                messages.map((message) => {
                  const isSelected = selectedMessage?.id === message.id;
                  const isChecked = selectedIds.includes(message.id);
                  return (
                    <div
                      key={message.id}
                      className={`mail-list-item ${isSelected ? 'selected' : ''} ${
                        isChecked ? 'bulk-selected' : ''
                      }`}
                      onClick={() => {
                        setSelectedMessage(message);
                        // Automatiškai pažymėti kaip skaitytą po 3 sekundžių
                        if (message.status === 'new') {
                          setTimeout(async () => {
                            try {
                              await api.patch(`/mail/messages/${message.id}/`, { status: 'linked' });
                              // Atnaujinti laišką sąraše
                              setMessages(prev => prev.map(msg =>
                                msg.id === message.id ? { ...msg, status: 'linked', status_display: 'Skaitytas' } : msg
                              ));
                              // Atnaujinti pasirinktą laišką
                              setSelectedMessage(prev => prev ? { ...prev, status: 'linked', status_display: 'Skaitytas' } : null);
                            } catch (err) {
                              console.error('Nepavyko automatiškai pažymėti laiško kaip skaityto:', err);
                            }
                          }, 3000); // 3 sekundės
                        }
                      }}
                    >
                      <div className="mail-item-select">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleMessageSelection(message.id);
                          }}
                        />
                      </div>
                      <div className="mail-item-content">
                        <div className="mail-item-header">
                          <div className="mail-item-subject">{message.subject || '(Be temos)'}</div>
                          <div className="mail-item-date">{formatDate(message.date)}</div>
                        </div>
                        <div className="mail-item-meta">
                          <div className="mail-item-sender">
                            <span
                              className="sender-label"
                              title={message.sender_email || message.sender_display || message.sender || 'Nežinomas siuntėjas'}
                            >
                              {message.sender_status === 'trusted'
                                ? getTrustedSenderLabel(message.sender_display, message.sender)
                                : message.sender_display || message.sender || 'Nežinomas siuntėjas'}
                            </span>
                            <div className="sender-actions">
                              {message.sender_status !== 'trusted' && (
                                <button
                                  type="button"
                                  className="sender-action trusted"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSenderClassification(message, 'trusted');
                                  }}
                                  disabled={!!senderActionLoading[message.id]}
                                  title="Padaryti patikimu siuntėju"
                                >
                                  💚
                                </button>
                              )}
                              {message.sender_status !== 'advertising' && (
                                <button
                                  type="button"
                                  className="sender-action advertising"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSenderClassification(message, 'advertising');
                                  }}
                                  disabled={!!senderActionLoading[message.id]}
                                  title="Padaryti reklaminiu siuntėju"
                                >
                                  🚫
                                </button>
                              )}
                              {(() => {
                                const email = extractEmailFromSender(message.sender_email || message.sender);
                                const exists = emailExistsCache[email];
                                return exists !== true ? (
                                  <button
                                    type="button"
                                    className="sender-action add-contact"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleAddContact(message);
                                    }}
                                    disabled={!!senderActionLoading[message.id]}
                                    title="Pridėti kontaktą"
                                  >
                                    👤
                                  </button>
                                ) : null;
                              })()}
                            </div>
                          </div>
                          <div className="mail-item-meta-right">
                            {message.attachments?.length ? (
                              <span className="mail-attachment-count" title="Priedai">
                                📎 {message.attachments.length}
                              </span>
                            ) : null}
                            <span className={`mail-item-status status-${message.status}`}>
                              {message.status_display || statusLabelMap[message.status]}
                            </span>
                            <button
                              type="button"
                              className="mail-item-delete"
                              title="Ištrinti laišką"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteConfirm(message);
                              }}
                              disabled={deletingMessage}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        {message.matches && (
                          <div className="mail-item-matches">
                            {message.matches.orders?.length ? (
                              <span className="mail-match-chip orders" title="Sutapo su užsakymo numeriu">
                                Užs.: {message.matches.orders.join(', ')}
                              </span>
                            ) : null}
                            {message.matches.sales_invoices?.length ? (
                              <span className="mail-match-chip sales" title="Sutapo su pardavimo sąskaitos numeriu">
                                Pard.: {message.matches.sales_invoices.join(', ')}
                              </span>
                            ) : null}
                            {message.matches.purchase_invoices?.length ? (
                              <span className="mail-match-chip purchase" title="Sutapo su gaunamos sąskaitos numeriu">
                                Pirk.: {message.matches.purchase_invoices.join(', ')}
                              </span>
                            ) : null}
                            {message.matches.expeditions?.length ? (
                              <span className="mail-match-chip expedition" title="Sutapo su ekspedicijos numeriu">
                                Eksp.: {message.matches.expeditions.join(', ')}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {effectiveTotalPages > 1 && (() => {
              // Helper funkcija puslapių numeriams su "..."
              // Formatas: 1 ... 3 4 5 ... 7
              const getPageNumbers = (current: number, total: number): (number | string)[] => {
                if (total <= 5) {
                  return Array.from({ length: total }, (_, i) => i + 1);
                }
                
                const pages: (number | string)[] = [];
                pages.push(1);
                
                if (current <= 3) {
                  for (let i = 2; i <= 4; i++) {
                    pages.push(i);
                  }
                  if (total > 5) {
                    pages.push('...');
                    pages.push(total);
                  }
                } else if (current >= total - 2) {
                  if (total > 5) {
                    pages.push('...');
                  }
                  for (let i = total - 3; i <= total; i++) {
                    pages.push(i);
                  }
                } else {
                  pages.push('...');
                  for (let i = current - 1; i <= current + 1; i++) {
                    pages.push(i);
                  }
                  pages.push('...');
                  pages.push(total);
                }
                
                return pages;
              };
              
              const pageNumbers = getPageNumbers(currentPage, effectiveTotalPages);
              
              return (
                <div className="mail-pagination" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      backgroundColor: '#fff',
                      cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage <= 1 ? 0.5 : 1
                    }}
                  >
                    ← Ankstesnis
                  </button>
                  
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {pageNumbers.map((page, index) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${index}`} style={{ padding: '0 4px', fontSize: '14px', color: '#666' }}>
                            ...
                          </span>
                        );
                      }
                      
                      const pageNum = page as number;
                      const isActive = pageNum === currentPage;
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '14px',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            backgroundColor: isActive ? '#007bff' : '#fff',
                            color: isActive ? '#fff' : '#333',
                            cursor: 'pointer',
                            minWidth: '40px',
                            fontWeight: isActive ? 'bold' : 'normal'
                          }}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    disabled={currentPage >= effectiveTotalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(effectiveTotalPages, prev + 1))}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      border: '1px solid #dee2e6',
                      borderRadius: '4px',
                      backgroundColor: '#fff',
                      cursor: currentPage >= effectiveTotalPages ? 'not-allowed' : 'pointer',
                      opacity: currentPage >= effectiveTotalPages ? 0.5 : 1
                    }}
                  >
                    Sekantis →
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="mail-details-panel">
            {selectedMessage ? (
              <div className="mail-details">
                <header className="mail-details-header">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`status-badge status-${selectedMessage.status}`}>
                      {selectedMessage.status_display || statusLabelMap[selectedMessage.status]}
                    </span>
                    <h2 style={{ margin: 0 }}>{selectedMessage.subject || '(Be temos)'}</h2>
                    {selectedMessage.tags.map((tagRelation) => (
                      <span
                        key={tagRelation.id}
                        className="mail-tag"
                        style={{ backgroundColor: tagRelation.tag.color || '#6b7280' }}
                      >
                        {tagRelation.tag.name}
                      </span>
                    ))}
                  </div>
                  <div className="mail-details-meta">
                    <div>
                      <span className="label">Siuntėjas:</span> {selectedMessage.sender_display || selectedMessage.sender || 'Nežinomas siuntėjas'}
                    </div>
                    <div>
                      <span className="label">Gauta:</span> {formatDate(selectedMessage.date)}
                    </div>
                    {selectedMessage.recipients && (
                      <div>
                        <span className="label">Gavėjai:</span> {selectedMessage.recipients_display || selectedMessage.recipients}
                      </div>
                    )}
                    {selectedMessage.cc && (
                      <div>
                        <span className="label">Kopija:</span> {selectedMessage.cc_display || selectedMessage.cc}
                      </div>
                    )}
                    {selectedMessage.bcc && (
                      <div>
                        <span className="label">Nematoma kopija:</span> {selectedMessage.bcc_display || selectedMessage.bcc}
                      </div>
                    )}
                  </div>
                  {selectedMessage.matches && (
                    <div className="mail-details-matches">
                      {selectedMessage.matches.orders?.length ? (
                        <div>
                          <span className="label">Užsakymo numeriai:</span> {selectedMessage.matches.orders.join(', ')}
                        </div>
                      ) : null}
                      {selectedMessage.matches.sales_invoices?.length ? (
                        <div>
                          <span className="label">Pardavimo sąskaitos:</span> {selectedMessage.matches.sales_invoices.join(', ')}
                        </div>
                      ) : null}
                      {selectedMessage.matches.purchase_invoices?.length ? (
                        <div>
                          <span className="label">Gaunamos sąskaitos:</span> {selectedMessage.matches.purchase_invoices.join(', ')}
                        </div>
                      ) : null}
                      {selectedMessage.matches.expeditions?.length ? (
                        <div>
                          <span className="label">Ekspedicijos numeriai:</span> {selectedMessage.matches.expeditions.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Sąskaitų susiejimai */}
                  {(selectedMessage.matched_sales_invoices?.length || selectedMessage.matched_purchase_invoices?.length) ? (
                    <div className="mail-details-matches">
                      <div style={{ marginTop: '8px', padding: '4px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                        <span className="label" style={{ color: '#28a745' }}>💰 Susietos sąskaitos:</span>
                      </div>
                      {selectedMessage.matched_sales_invoices?.map((invoice) => (
                        <div key={invoice.id} style={{ marginLeft: '12px', marginTop: '4px' }}>
                          <span style={{ fontWeight: '500', color: '#28a745' }}>
                            📄 Pardavimo sąskaita {invoice.invoice_number}
                          </span>
                          <span style={{ marginLeft: '8px', color: '#666' }}>
                            {invoice.partner.name} - {invoice.amount_total}€
                          </span>
                        </div>
                      ))}
                      {selectedMessage.matched_purchase_invoices?.map((invoice) => (
                        <div key={invoice.id} style={{ marginLeft: '12px', marginTop: '4px' }}>
                          <span style={{ fontWeight: '500', color: '#28a745' }}>
                            📄 Pirkimo sąskaita {invoice.received_invoice_number}
                          </span>
                          <span style={{ marginLeft: '8px', color: '#666' }}>
                            {invoice.partner.name} - {invoice.amount_total}€
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedMessage.ocr_results && Object.keys(selectedMessage.ocr_results).length > 0 && (
                    <div className="mail-details-ocr" style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#495057' }}>
                        🤖 OCR atpažinimo rezultatai:
                      </div>
                      {Object.entries(selectedMessage.ocr_results).map(([filename, result]) => (
                        <div key={filename} style={{ marginBottom: '8px', padding: '6px', backgroundColor: 'white', borderRadius: '3px', border: '1px solid #dee2e6' }}>
                          <div style={{ fontSize: '11px', fontWeight: '500', marginBottom: '4px', color: '#007bff' }}>
                            📄 {filename}
                          </div>
                          {result.error ? (
                            <div style={{ color: '#dc3545', fontSize: '11px' }}>
                              ❌ {result.error}
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#495057' }}>
                              {result.document_type && (
                                <div>📋 <strong>Tipas:</strong> {result.document_type}</div>
                              )}
                              {result.extracted_data?.invoice_number && (
                                <div>🔢 <strong>Sąskaita:</strong> {result.extracted_data.invoice_number}</div>
                              )}
                              {result.extracted_data?.order_number && (
                                <div>📦 <strong>Užsakymas:</strong> {result.extracted_data.order_number}</div>
                              )}
                              {result.extracted_data?.expedition_number && (
                                <div>🚚 <strong>Ekspedicija:</strong> {result.extracted_data.expedition_number}</div>
                              )}
                              {result.extracted_data?.amounts && result.extracted_data.amounts.length > 0 && (
                                <div>💰 <strong>Sumos:</strong> {result.extracted_data.amounts.join(', ')}</div>
                              )}
                              {result.extracted_data?.dates && result.extracted_data.dates.length > 0 && (
                                <div>📅 <strong>Datos:</strong> {result.extracted_data.dates.join(', ')}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </header>

                {selectedMessage.attachments?.length > 0 && (
                  <section className="mail-attachments" style={{ marginTop: '4px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap' }}>Priedai:</span>
                      {selectedMessage.attachments.map((attachment) => {
                        const url = attachment.download_url || attachment.file;
                        const hasInvoice = attachment.has_purchase_invoice || attachment.purchase_invoice_info;
                        const invoiceInfo = attachment.purchase_invoice_info;
                        
                        return (
                          <div key={attachment.id} style={{ position: 'relative', display: 'inline-flex' }}>
                            <button
                              type="button"
                              className="mail-attachment-button"
                              onClick={() =>
                                setAttachmentPreview({
                                  filename: attachment.filename,
                                  url: url || '',
                                  id: attachment.id,
                                })
                              }
                              style={{ 
                                fontSize: '10px', 
                                padding: '2px 6px',
                                backgroundColor: hasInvoice ? '#d4edda' : (url ? '#e7f3ff' : '#f8f9fa'),
                                border: `1px solid ${hasInvoice ? '#28a745' : (url ? '#b3d9ff' : '#dee2e6')}`,
                                borderRadius: '4px',
                                color: hasInvoice ? '#155724' : (url ? '#004085' : '#868e96'),
                                cursor: url ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              disabled={!url}
                              title={attachment.filename}
                            >
                              {hasInvoice && <span style={{ fontSize: '10px', flexShrink: 0 }}>✅</span>}
                              <span style={{ flexShrink: 0 }}>📎</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {attachment.filename}
                              </span>
                              <span className="attachment-size" style={{ flexShrink: 0 }}>
                                ({Math.round(attachment.size / 1024)} KB)
                              </span>
                            </button>
                            {hasInvoice && invoiceInfo?.received_invoice_number && (
                              <span 
                                style={{ 
                                  fontSize: '8px', 
                                  color: '#28a745',
                                  marginLeft: '4px',
                                  whiteSpace: 'nowrap',
                                  fontWeight: '500'
                                }}
                                title={`Suvesta sąskaita: ${invoiceInfo.received_invoice_number}${invoiceInfo.partner_name ? ` (${invoiceInfo.partner_name})` : ''}`}
                              >
                                ({invoiceInfo.received_invoice_number})
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="mail-details-actions">
                  {selectedMessage.status !== 'new' && (
                    <button
                      className="mail-action-button"
                      onClick={() => updateMessageStatus('new')}
                      disabled={updatingMessage}
                    >
                      {updatingMessage ? 'Atnaujinama...' : 'Pažymėti kaip naują'}
                    </button>
                  )}
                  {selectedMessage.status === 'new' && (
                    <button
                      className="mail-action-button"
                      onClick={() => updateMessageStatus('linked')}
                      disabled={updatingMessage}
                    >
                      {updatingMessage ? 'Atnaujinama...' : 'Pažymėti kaip skaitytą'}
                    </button>
                  )}
                  <button
                    className={`mail-action-button ${selectedMessage.status === 'task' ? 'active' : ''}`}
                    onClick={() => updateMessageStatus('task')}
                    disabled={updatingMessage}
                  >
                    {updatingMessage && selectedMessage.status !== 'task' ? 'Atnaujinama...' : 'Pažymėti kaip užduotį'}
                  </button>
                  <button
                    className={`mail-action-button ${selectedMessage.status === 'ignored' ? 'active' : ''}`}
                    onClick={() => updateMessageStatus('ignored')}
                    disabled={updatingMessage}
                  >
                    {updatingMessage && selectedMessage.status !== 'ignored' ? 'Atnaujinama...' : 'Ignoruoti'}
                  </button>
                  <button className="mail-action-button" onClick={handleReply}>
                    Atsakyti
                  </button>
                  <button
                    className="mail-action-button danger"
                    onClick={() => openDeleteConfirm()}
                    disabled={deletingMessage}
                  >
                    {deletingMessage ? 'Trinama...' : 'Ištrinti'}
                  </button>
                </div>

                {/* Rankinis priskyrimas prie užsakymo arba ekspedicijos */}
                {(!selectedMessage.matches || 
                  (!selectedMessage.matches.orders?.length && !selectedMessage.matches.expeditions?.length)) && (
                  <section className="mail-manual-assign" style={{
                    marginTop: '6px',
                    padding: '6px 10px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #dee2e6'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        Rankinis priskyrimas:
                      </span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: '1', minWidth: 0 }}>
                        <label style={{ fontSize: '10px', fontWeight: '500', whiteSpace: 'nowrap', marginRight: '2px' }}>
                          Užsakymo nr:
                        </label>
                        <input
                          type="text"
                          value={manualOrderNumber}
                          onChange={(e) => setManualOrderNumber(e.target.value)}
                          placeholder="pvz., 2025-001"
                          style={{
                            flex: '0 0 120px',
                            padding: '3px 6px',
                            fontSize: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '3px'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: '1', minWidth: 0 }}>
                        <label style={{ fontSize: '10px', fontWeight: '500', whiteSpace: 'nowrap', marginRight: '2px' }}>
                          Ekspedicijos nr:
                        </label>
                        <input
                          type="text"
                          value={manualExpeditionNumber}
                          onChange={(e) => setManualExpeditionNumber(e.target.value)}
                          placeholder="pvz., EXP-2025-001"
                          style={{
                            flex: '0 0 120px',
                            padding: '3px 6px',
                            fontSize: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '3px'
                          }}
                        />
                      </div>
                      <button
                        className="mail-action-button"
                        onClick={handleManualAssign}
                        disabled={assigning || (!manualOrderNumber.trim() && !manualExpeditionNumber.trim())}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        {assigning ? 'Priskiriama...' : 'Priskirti'}
                      </button>
                    </div>
                  </section>
                )}

                <section className="mail-details-body">{renderedBody}</section>
              </div>
            ) : (
              <div className="mail-placeholder">Pasirinkite laišką iš sąrašo, kad pamatytumėte detales.</div>
            )}
          </div>
        </div>
        )}

        {activeTab === 'sent' && (
          <div className="mail-layout">
            <div className="mail-list-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
            <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
              <h3 style={{ margin: 0, flex: '1 1 auto' }}>Išsiųsti laiškai</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', marginRight: '4px' }}>Statusas:</label>
                <select
                  value={sentEmailsFilter}
                  onChange={(e) => {
                    setSentEmailsFilter(e.target.value as any);
                    setSentEmailsPage(1);
                  }}
                  style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                >
                  <option value="all">Visi</option>
                  <option value="sent">Išsiųsti</option>
                  <option value="failed">Klaida</option>
                  <option value="pending">Laukiama</option>
                </select>
                <label style={{ fontSize: '13px', marginLeft: '12px', marginRight: '4px' }}>Tipas:</label>
                <select
                  value={sentEmailsTypeFilter}
                  onChange={(e) => {
                    setSentEmailsTypeFilter(e.target.value);
                    setSentEmailsPage(1);
                  }}
                  style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                >
                  <option value="all">Visi</option>
                  <option value="reminder">Priminimas</option>
                  <option value="order">Užsakymas</option>
                  <option value="invoice">Sąskaita</option>
                  <option value="expedition">Ekspedicija</option>
                  <option value="custom">Kitas</option>
                </select>
                <label style={{ fontSize: '13px', marginLeft: '12px', marginRight: '4px' }}>Per puslapį:</label>
                <select
                  value={sentEmailsPageSize}
                  onChange={(e) => {
                    setSentEmailsPageSize(parseInt(e.target.value, 10));
                    setSentEmailsPage(1);
                  }}
                  style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="40">40</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>
            
            {sentEmailsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d', flex: '1' }}>Kraunama...</div>
            ) : sentEmails.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d', flex: '1' }}>Išsiųstų laiškų nėra</div>
            ) : (
              <>
                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6c757d', flexShrink: 0 }}>
                  Rodyta: {sentEmails.length} / {sentEmailsTotal}
                </div>
                <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', overflow: 'auto', flex: '1', minHeight: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Data</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Tipas</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Tema</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Gavėjas</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Kas išsiuntė</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Susieti objektai</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Statusas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sentEmails.map((email) => {
                        const relatedObjects: string[] = [];
                        if (email.related_order_id) {
                          const orderNumber = orderNumbersCacheRef.current[email.related_order_id];
                          relatedObjects.push(`Užsakymas ${orderNumber || `#${email.related_order_id}`}`);
                        }
                        if (email.related_invoice_id) {
                          relatedObjects.push(`Sąskaita #${email.related_invoice_id}`);
                        }
                        if (email.related_expedition_id) {
                          const expeditionNumber = expeditionNumbersCacheRef.current[email.related_expedition_id];
                          relatedObjects.push(`Ekspedicija ${expeditionNumber || `#${email.related_expedition_id}`}`);
                        }
                        
                        return (
                          <tr key={email.id} style={{ borderBottom: '1px solid #dee2e6', cursor: 'pointer' }} onClick={() => setSelectedSentEmail(email)}>
                            <td style={{ padding: '10px' }}>{formatDate(email.created_at)}</td>
                            <td style={{ padding: '10px' }}>{email.email_type_display}</td>
                            <td style={{ padding: '10px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={email.subject}>{email.subject}</td>
                            <td style={{ padding: '10px' }}>
                              {email.recipient_name ? (
                                <div>
                                  <div style={{ fontWeight: '500' }}>{email.recipient_name}</div>
                                  <div style={{ fontSize: '11px', color: '#6c757d' }}>{email.recipient_email}</div>
                                </div>
                              ) : (
                                email.recipient_email
                              )}
                            </td>
                            <td style={{ padding: '10px', fontSize: '12px', color: '#6c757d' }}>
                              {email.sent_by_username || '-'}
                            </td>
                            <td style={{ padding: '10px', fontSize: '12px' }}>
                              {relatedObjects.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {relatedObjects.map((obj, idx) => (
                                    <span key={idx} style={{ 
                                      padding: '2px 6px', 
                                      backgroundColor: '#e9ecef', 
                                      borderRadius: '4px',
                                      fontSize: '11px'
                                    }}>{obj}</span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: '#6c757d' }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: email.status === 'sent' ? '#28a745' : email.status === 'failed' ? '#dc3545' : '#ffc107',
                                color: '#fff'
                              }}>
                                {email.status_display}
                              </span>
                              {email.error_message && (
                                <div style={{ fontSize: '10px', color: '#dc3545', marginTop: '4px' }} title={email.error_message}>
                                  ⚠️ {email.error_message.length > 30 ? email.error_message.substring(0, 30) + '...' : email.error_message}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {sentEmailsTotalPages > 1 && (() => {
                  // Helper funkcija puslapių numeriams su "..."
                  const getPageNumbers = (current: number, total: number): (number | string)[] => {
                    if (total <= 7) {
                      return Array.from({ length: total }, (_, i) => i + 1);
                    }
                    
                    const pages: (number | string)[] = [];
                    
                    if (current <= 4) {
                      for (let i = 1; i <= 5; i++) {
                        pages.push(i);
                      }
                      pages.push('...');
                      pages.push(total);
                    } else if (current >= total - 3) {
                      pages.push(1);
                      pages.push('...');
                      for (let i = total - 4; i <= total; i++) {
                        pages.push(i);
                      }
                    } else {
                      pages.push(1);
                      pages.push('...');
                      for (let i = current - 1; i <= current + 1; i++) {
                        pages.push(i);
                      }
                      pages.push('...');
                      pages.push(total);
                    }
                    
                    return pages;
                  };
                  
                  const pageNumbers = getPageNumbers(sentEmailsPage, sentEmailsTotalPages);
                  
                  return (
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                      <button
                        onClick={() => setSentEmailsPage(p => Math.max(1, p - 1))}
                        disabled={sentEmailsPage === 1}
                        style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px', cursor: sentEmailsPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: sentEmailsPage === 1 ? '#f8f9fa' : '#fff', opacity: sentEmailsPage === 1 ? 0.5 : 1 }}
                      >
                        ← Ankstesnis
                      </button>
                      
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {pageNumbers.map((page, index) => {
                          if (page === '...') {
                            return (
                              <span key={`ellipsis-${index}`} style={{ padding: '0 4px', fontSize: '13px', color: '#666' }}>
                                ...
                              </span>
                            );
                          }
                          
                          const pageNum = page as number;
                          const isActive = pageNum === sentEmailsPage;
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setSentEmailsPage(pageNum)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '13px',
                                border: '1px solid #ced4da',
                                borderRadius: '4px',
                                backgroundColor: isActive ? '#007bff' : '#fff',
                                color: isActive ? '#fff' : '#333',
                                cursor: 'pointer',
                                minWidth: '40px',
                                fontWeight: isActive ? 'bold' : 'normal'
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={() => setSentEmailsPage(p => Math.min(sentEmailsTotalPages, p + 1))}
                        disabled={sentEmailsPage >= sentEmailsTotalPages}
                        style={{ padding: '6px 12px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px', cursor: sentEmailsPage >= sentEmailsTotalPages ? 'not-allowed' : 'pointer', backgroundColor: sentEmailsPage >= sentEmailsTotalPages ? '#f8f9fa' : '#fff', opacity: sentEmailsPage >= sentEmailsTotalPages ? 0.5 : 1 }}
                      >
                        Sekantis →
                      </button>
                    </div>
                  );
                })()}
              </>
            )}
            </div>
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="mail-layout">
            <div className="mail-list-panel" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px' }}>Statistika</h3>
            
            {statisticsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>Kraunama...</div>
            ) : !statistics ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>Nepavyko užkrauti statistikos</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                  <div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>Iš viso</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#212529' }}>{statistics.total}</div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#d4edda', borderRadius: '8px', border: '1px solid #c3e6cb' }}>
                    <div style={{ fontSize: '12px', color: '#155724', marginBottom: '4px' }}>Išsiųsti</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#155724' }}>{statistics.sent}</div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#f8d7da', borderRadius: '8px', border: '1px solid #f5c6cb' }}>
                    <div style={{ fontSize: '12px', color: '#721c24', marginBottom: '4px' }}>Klaida</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#721c24' }}>{statistics.failed}</div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeaa7' }}>
                    <div style={{ fontSize: '12px', color: '#856404', marginBottom: '4px' }}>Laukiama</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#856404' }}>{statistics.pending}</div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#d1ecf1', borderRadius: '8px', border: '1px solid #bee5eb' }}>
                    <div style={{ fontSize: '12px', color: '#0c5460', marginBottom: '4px' }}>Paskutinės 24 val.</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#0c5460' }}>{statistics.last_24h}</div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#d1ecf1', borderRadius: '8px', border: '1px solid #bee5eb' }}>
                    <div style={{ fontSize: '12px', color: '#0c5460', marginBottom: '4px' }}>Paskutinės 7 dienos</div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#0c5460' }}>{statistics.last_7_days}</div>
                  </div>
                </div>
                
                {/* Paaiškinimai */}
                <div style={{ 
                marginTop: '40px', 
                padding: '20px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px', 
                border: '1px solid #dee2e6' 
              }}>
                <h4 style={{ marginTop: 0, marginBottom: '16px', color: '#212529' }}>Paaiškinimai</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <strong style={{ color: '#212529' }}>Iš viso:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      Visų išsiųstų el. laiškų skaičius sistemoje. Skaičiuojami visi laiškai, kurie buvo bandyti išsiųsti per TMS sistemą (sėkmingai išsiųsti, su klaida arba dar laukiantys siuntimo).
                    </p>
                  </div>
                  
                  <div>
                    <strong style={{ color: '#155724' }}>Išsiųsti:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      Sėkmingai išsiųstų el. laiškų skaičius. Tai laiškai, kurie buvo sėkmingai pristatyti gavėjams per SMTP serverį. Skaičius atsiranda, kai el. laiškas sėkmingai išsiunčiamas ir gavėjas gauna laišką.
                    </p>
                  </div>
                  
                  <div>
                    <strong style={{ color: '#721c24' }}>Klaida:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      Nepavyko išsiųsti el. laiškų skaičius. Tai laiškai, kurių siuntimas nepavyko dėl įvairių priežasčių (pvz., neteisingas gavėjo el. pašto adresas, SMTP serverio klaida, tinklo problemos). Klaidos informacija saugoma kiekvieno laiško įraše.
                    </p>
                  </div>
                  
                  <div>
                    <strong style={{ color: '#856404' }}>Laukiama:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      El. laiškų, kurie dar nėra išsiųsti, skaičius. Tai laiškai, kurie buvo sukurti sistemoje, bet dar nebuvo bandyti išsiųsti (pvz., laukia eilėje arba buvo sukurti, bet siuntimas dar nevykdytas).
                    </p>
                  </div>
                  
                  <div>
                    <strong style={{ color: '#0c5460' }}>Paskutinės 24 val.:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      Išsiųstų el. laiškų skaičius per paskutines 24 valandas. Skaičiuojami tik sėkmingai išsiųsti laiškai nuo dabartinio laiko atėmus 24 valandas.
                    </p>
                  </div>
                  
                  <div>
                    <strong style={{ color: '#0c5460' }}>Paskutinės 7 dienos:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#6c757d', fontSize: '14px', lineHeight: '1.5' }}>
                      Išsiųstų el. laiškų skaičius per paskutines 7 dienas. Skaičiuojami tik sėkmingai išsiųsti laiškai nuo dabartinio laiko atėmus 7 dienas. Tai leidžia matyti el. laiškų siuntimo aktyvumą per savaitę.
                    </p>
                  </div>
                </div>
                
                <div style={{ 
                  marginTop: '20px', 
                  padding: '12px', 
                  backgroundColor: '#e7f3ff', 
                  borderRadius: '4px', 
                  border: '1px solid #b3d9ff' 
                }}>
                  <strong style={{ color: '#004085', display: 'block', marginBottom: '8px' }}>Kaip atsiranda šie skaičiai?</strong>
                  <p style={{ margin: 0, color: '#004085', fontSize: '13px', lineHeight: '1.5' }}>
                    Visi el. laiškai, kurie siunčiami per TMS sistemą (užsakymai, sąskaitos, ekspedicijos, priminimai), automatiškai įrašomi į el. laiškų istoriją. 
                    Kiekvienas laiškas gauna statusą: <strong>sent</strong> (išsiųstas), <strong>failed</strong> (klaida) arba <strong>pending</strong> (laukiama). 
                    Statistika apskaičiuojama pagal šiuos įrašus ir atnaujinama realiu laiku.
                  </p>
                </div>
              </div>
              </>
            )}
            </div>
          </div>
        )}

        {(activeTab === 'linked' || activeTab === 'unlinked' || activeTab === 'promotional') && confirmDeleteOpen && deleteContext && (
          <div className="mail-confirm-overlay">
            <div className="mail-confirm-dialog">
              <h3>
                {deleteContext.mode === 'bulk'
                  ? `Ištrinti ${deleteContext.ids.length} laiškus?`
                  : 'Ištrinti laišką?'}
              </h3>
              {deleteContext.mode === 'bulk' ? (
                <p>
                  Ar tikrai norite ištrinti {deleteContext.ids.length} pasirinktus laiškus?
                  {deleteContext.subjects.length > 0 && (
                    <>
                      <br />
                      <br />
                      {deleteContext.subjects.map((subject, index) => (
                        <React.Fragment key={index}>
                          • {subject}
                          <br />
                        </React.Fragment>
                      ))}
                      {deleteContext.extra && deleteContext.extra > 0 && (
                        <span>… ir dar {deleteContext.extra}</span>
                      )}
                    </>
                  )}
                </p>
              ) : (
                <p>
                  Ar tikrai norite ištrinti laišką „{deleteContext.subjects[0]}“? Šis veiksmas pašalins
                  laišką iš sistemos.
                </p>
              )}
              <div className="mail-confirm-actions">
                <button className="mail-action-button" onClick={cancelDelete} disabled={deletingMessage}>
                  Atšaukti
                </button>
                <button className="mail-action-button danger" onClick={performDeleteMessage} disabled={deletingMessage}>
                  {deletingMessage ? 'Trinama...' : 'Taip, ištrinti'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {selectedSentEmail && (
        <div className="mail-confirm-overlay" onClick={() => setSelectedSentEmail(null)}>
          <div className="mail-confirm-dialog" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Išsiųsto laiško detalės</h3>
              <button
                onClick={() => setSelectedSentEmail(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6c757d',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px 20px', marginBottom: '16px', fontSize: '14px' }}>
              <div style={{ fontWeight: '600', color: '#495057' }}>Data:</div>
              <div>{formatDate(selectedSentEmail.created_at)}</div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Tipas:</div>
              <div>{selectedSentEmail.email_type_display}</div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Tema:</div>
              <div>{selectedSentEmail.subject}</div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Gavėjas:</div>
              <div>
                {selectedSentEmail.recipient_name && (
                  <div style={{ marginBottom: '4px' }}>{selectedSentEmail.recipient_name}</div>
                )}
                <div style={{ color: '#6c757d' }}>{selectedSentEmail.recipient_email}</div>
              </div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Kas išsiuntė:</div>
              <div>{selectedSentEmail.sent_by_username || '-'}</div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Išsiųsta:</div>
              <div>{selectedSentEmail.sent_at ? formatDate(selectedSentEmail.sent_at) : '-'}</div>
              
              <div style={{ fontWeight: '600', color: '#495057' }}>Statusas:</div>
              <div>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  backgroundColor: selectedSentEmail.status === 'sent' ? '#28a745' : selectedSentEmail.status === 'failed' ? '#dc3545' : '#ffc107',
                  color: '#fff'
                }}>
                  {selectedSentEmail.status_display}
                </span>
              </div>
              
              {(selectedSentEmail.related_order_id || selectedSentEmail.related_invoice_id || selectedSentEmail.related_expedition_id) && (
                <>
                  <div style={{ fontWeight: '600', color: '#495057' }}>Susieti objektai:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedSentEmail.related_order_id && (
                      <span style={{ padding: '4px 8px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '12px' }}>
                        Užsakymas {orderNumbersCacheRef.current[selectedSentEmail.related_order_id] || `#${selectedSentEmail.related_order_id}`}
                      </span>
                    )}
                    {selectedSentEmail.related_invoice_id && (
                      <span style={{ padding: '4px 8px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '12px' }}>
                        Sąskaita #{selectedSentEmail.related_invoice_id}
                      </span>
                    )}
                    {selectedSentEmail.related_expedition_id && (
                      <span style={{ padding: '4px 8px', backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '12px' }}>
                        Ekspedicija {expeditionNumbersCacheRef.current[selectedSentEmail.related_expedition_id] || `#${selectedSentEmail.related_expedition_id}`}
                      </span>
                    )}
                  </div>
                </>
              )}
              
              {selectedSentEmail.error_message && (
                <>
                  <div style={{ fontWeight: '600', color: '#dc3545' }}>Klaida:</div>
                  <div style={{ color: '#dc3545', backgroundColor: '#f8d7da', padding: '8px', borderRadius: '4px', fontSize: '13px' }}>
                    {selectedSentEmail.error_message}
                  </div>
                </>
              )}
            </div>
            
            {selectedSentEmail.body_text && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
                <div style={{ fontWeight: '600', marginBottom: '12px', color: '#495057' }}>Turinys:</div>
                <div style={{ 
                  backgroundColor: '#f8f9fa', 
                  padding: '12px', 
                  borderRadius: '4px', 
                  fontSize: '13px',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>
                  {selectedSentEmail.body_text}
                </div>
              </div>
            )}
            
            {selectedSentEmail.body_html && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
                <div style={{ fontWeight: '600', marginBottom: '12px', color: '#495057' }}>Turinys (HTML):</div>
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }} dangerouslySetInnerHTML={{
                  __html: (() => {
                    let cleaned = selectedSentEmail.body_html;
                    cleaned = cleaned.replace(/<html[^>]*>[\s\S]*?<\/html>/gi, '');
                    cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
                    cleaned = cleaned.replace(/<body[^>]*>/gi, '');
                    cleaned = cleaned.replace(/<\/body>/gi, '');
                    cleaned = cleaned.replace(/<\/html>/gi, '');
                    cleaned = cleaned.replace(/<meta[^>]*viewport[^>]*>/gi, '');
                    cleaned = cleaned.replace(/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/gi, '');
                    cleaned = cleaned.replace(/@media[^{]*{[^}]*}/gi, '');
                    return cleaned;
                  })()
                }} />
              </div>
            )}
          </div>
        </div>
      )}

      <AttachmentPreviewModal
        attachment={attachmentPreview}
        onClose={() => setAttachmentPreview(null)}
        mailMessageId={selectedMessage?.id}
        relatedOrderNumber={selectedMessage?.matches?.orders?.[0] || undefined}
        onAssignSuccess={handleAttachmentAssignSuccess}
        onInvoiceCreated={() => {
          // Atnaujinti laiško duomenis, kad matytųsi, ar attachment'as jau suvestas
          if (selectedMessage?.id) {
            api.get(`/mail/messages/${selectedMessage.id}/`)
              .then(response => {
                const updatedMessage = response.data;
                setMessages(prev => prev.map(msg => 
                  msg.id === updatedMessage.id ? updatedMessage : msg
                ));
                if (selectedMessage.id === updatedMessage.id) {
                  setSelectedMessage(updatedMessage);
                }
              })
              .catch(err => console.error('Nepavyko atnaujinti laiško:', err));
          }
        }}
      />
    </div>
    </>
  );
};

export default MailPage;

