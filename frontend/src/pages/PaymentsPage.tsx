import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import PaymentService from '../services/paymentService';
import { formatMoney } from '../utils/formatMoney';
import HTMLPreviewModal, { HTMLPreview } from '../components/common/HTMLPreviewModal';
import AttachmentPreviewModal, { AttachmentPreview } from '../components/common/AttachmentPreviewModal';
import './PaymentsPage.css';

interface Payment {
  id: number;
  amount: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  partner: {
    id: number;
    name: string;
    code: string;
  };
  issue_date: string;
  due_date: string;
  amount_total: string;
  paid_amount: string;
  remaining_amount: string;
  payment_status: string;
  overdue_days: number;
  payments: Payment[];
  invoice_file?: string | null;
  invoice_file_url?: string | null;
}

interface PartnerContact {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
}

const PaymentsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchase'>('sales');
  const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());
  const [editingPayment, setEditingPayment] = useState<{ invoiceId: number; invoiceType: 'sales' | 'purchase' } | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Pavedimu',
    notes: ''
  });
  const [selectedOffsetInvoices, setSelectedOffsetInvoices] = useState<Set<number>>(new Set());
  
  // Puslapiavimas
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [purchaseTotalPages, setPurchaseTotalPages] = useState(1);
  const [salesTotalCount, setSalesTotalCount] = useState(0);
  const [purchaseTotalCount, setPurchaseTotalCount] = useState(0);
  
  // Statistika
  const [statistics, setStatistics] = useState<any>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // Sąskaitos peržiūra
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');
  const [previewInvoiceId, setPreviewInvoiceId] = useState<number | null>(null);
  const [previewInvoiceType, setPreviewInvoiceType] = useState<'sales' | 'purchase' | null>(null);

  // Priminimo siuntimas: pasirinkti kontaktą
  const [reminderModal, setReminderModal] = useState<{ invoice: Invoice } | null>(null);
  const [reminderContacts, setReminderContacts] = useState<PartnerContact[]>([]);
  const [reminderContactLoading, setReminderContactLoading] = useState(false);
  const [selectedReminderContactId, setSelectedReminderContactId] = useState<number | null>(null);
  const [reminderSending, setReminderSending] = useState(false);

  // Kai keičiasi tab'as, grįžti į pirmą puslapį
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);
  
  const fetchStatistics = useCallback(async () => {
    try {
      setStatisticsLoading(true);
      const params: any = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const response = await api.get('/invoices/payments/statistics/', { params });
      setStatistics(response.data);
    } catch (err: any) {
    } finally {
      setStatisticsLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/invoices/payments/unpaid/?type=all&page=${currentPage}&page_size=${pageSize}`);
      setSalesInvoices(response.data.sales_invoices || []);
      setPurchaseInvoices(response.data.purchase_invoices || []);
      
      // Atnaujinti puslapiavimo informaciją
      if (response.data.pagination) {
        setSalesTotalPages(response.data.pagination.sales_total_pages || 1);
        setPurchaseTotalPages(response.data.pagination.purchase_total_pages || 1);
        setSalesTotalCount(response.data.pagination.sales_count || 0);
        setPurchaseTotalCount(response.data.pagination.purchase_count || 0);
      }
    } catch (err: any) {
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => {
    fetchInvoices();
    fetchStatistics();
  }, [fetchInvoices, fetchStatistics]);
  
  // Listen for purchase invoice updates
  useEffect(() => {
    const handlePurchaseInvoiceUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('Purchase invoice updated event received:', customEvent.detail);
      // Atnaujinti sąrašą, kad atsispindėtų pakeitimai (pvz., payment_status)
      // Iškviesti fetchInvoices ir fetchStatistics tiesiogiai, ne per dependencies
      // Padidinti delę, kad užtikrintume, kad backend'as atnaujino duomenis
      setTimeout(() => {
        console.log('Refreshing invoices after purchase invoice update...');
        fetchInvoices();
        fetchStatistics();
      }, 300); // Padidinta delė, kad užtikrintume, kad backend'as atnaujino duomenis
    };
    
    window.addEventListener('purchaseInvoiceUpdated', handlePurchaseInvoiceUpdated);
    
    return () => {
      window.removeEventListener('purchaseInvoiceUpdated', handlePurchaseInvoiceUpdated);
    };
  }, [fetchInvoices, fetchStatistics]);

  const formatCurrency = (amount: string | number) => formatMoney(amount);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('lt-LT');
  };

  const handleViewInvoice = async (invoiceId: number, invoiceType: 'sales' | 'purchase') => {
    try {
      setPreviewInvoiceId(invoiceId);
      setPreviewInvoiceType(invoiceType);
      
      // Purchase invoice'ams - rodyti originalų PDF failą, jei yra
      if (invoiceType === 'purchase') {
        // Rasti invoice iš sąrašo
        const invoice = purchaseInvoices.find(inv => inv.id === invoiceId);
        
        if (invoice && invoice.invoice_file_url) {
          // Rodyti originalų PDF failą naudojant AttachmentPreviewModal (kaip OrderEdit_Finance.tsx)
          setAttachmentPreview({
            filename: `${invoice.invoice_number || invoiceId}.pdf`,
            url: invoice.invoice_file_url
          });
          return;
        } else if (invoice && invoice.invoice_file) {
          // Fallback - jei yra invoice_file, bet nėra URL
          const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
          let baseUrl = apiBaseUrl.replace('/api', '');
          if (!baseUrl || baseUrl === '') {
            baseUrl = window.location.hostname === 'localhost' 
              ? 'http://localhost:8000' 
              : window.location.origin;
          }
          const pdfUrl = `${baseUrl}/${invoice.invoice_file}`;
          setAttachmentPreview({
            filename: `${invoice.invoice_number || invoiceId}.pdf`,
            url: pdfUrl
          });
          return;
        } else {
          alert('Ši pirkimo sąskaita neturi prisegto failo');
          return;
        }
      }
      
      // Sales invoice'ams - HTML preview
      const endpoint = `/invoices/sales/${invoiceId}/preview/`;
      const response = await api.get(endpoint, {
        params: { lang: htmlPreviewLang },
        responseType: 'text'
      });
      
      setHtmlPreview({
        title: `Sąskaita ${invoiceId}`,
        htmlContent: response.data,
        url: undefined // Naudoti htmlContent, ne url
      });
    } catch (err: any) {
      alert('Nepavyko užkrauti sąskaitos peržiūros');
    }
  };

  const handleAddPayment = async (invoiceId: number, invoiceType: 'sales' | 'purchase') => {
    try {
      const amount = parseFloat(paymentForm.amount);
      if (!amount || amount <= 0) {
        alert('Įveskite teisingą sumą');
        return;
      }

      // Jei sudengiame pirkimo sąskaitą su mūsų išrašytomis sąskaitomis
      const requestData: any = {
        invoice_type: invoiceType,
        invoice_id: invoiceId,
        amount: amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        notes: paymentForm.notes
      };

      // Jei sudengiame pirkimo sąskaitą su mūsų išrašytomis sąskaitomis
      if (paymentForm.payment_method === 'Sudengta' && invoiceType === 'purchase' && selectedOffsetInvoices.size > 0) {
        requestData.offset_invoice_ids = Array.from(selectedOffsetInvoices);
      }

      // Naudoti PaymentService
      await PaymentService.addPayment(requestData);

      // Atnaujinti sąrašą
      await fetchInvoices();
      
      // Išvalyti formą
      setPaymentForm({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'Pavedimu',
        notes: ''
      });
      setEditingPayment(null);
      setSelectedOffsetInvoices(new Set());
    } catch (err: any) {
      alert('Klaida pridedant mokėjimą: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm('Ar tikrai norite pašalinti šį mokėjimą?')) {
      return;
    }

    try {
      // Naudoti PaymentService
      await PaymentService.deletePayment(paymentId);
      await fetchInvoices();
    } catch (err: any) {
      alert('Klaida šalinant mokėjimą: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePayFull = (invoice: Invoice, invoiceType: 'sales' | 'purchase') => {
    setPaymentForm({
      amount: invoice.remaining_amount,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'Pavedimu',
      notes: ''
    });
    setEditingPayment({ invoiceId: invoice.id, invoiceType });
  };

  // Priminimo tipas pagal sąskaitos statusą ir datą (tik pardavimo sąskaitoms)
  const getReminderType = (invoice: Invoice): 'due_soon' | 'unpaid' | 'overdue' | null => {
    if (invoice.payment_status === 'paid') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!invoice.due_date) {
      if (invoice.payment_status === 'overdue' || invoice.payment_status === 'partially_paid') return 'overdue';
      return 'unpaid';
    }
    const dueDate = new Date(invoice.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) return 'overdue';
    if (daysUntilDue > 0 && daysUntilDue <= 3 && invoice.payment_status === 'unpaid') return 'due_soon';
    if (invoice.payment_status === 'unpaid') return 'unpaid';
    if (invoice.payment_status === 'overdue' || invoice.payment_status === 'partially_paid') return 'overdue';
    return 'unpaid';
  };

  const openReminderModal = async (invoice: Invoice) => {
    setReminderModal({ invoice });
    setSelectedReminderContactId(null);
    setReminderContacts([]);
    setReminderContactLoading(true);
    try {
      const res = await api.get('/partners/contacts/', { params: { partner: invoice.partner.id } });
      const list = Array.isArray(res.data.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setReminderContacts(list.filter((c: PartnerContact) => c.email && c.email.trim()));
    } catch (_) {
      setReminderContacts([]);
    } finally {
      setReminderContactLoading(false);
    }
  };

  const handleSendReminderFromModal = async () => {
    if (!reminderModal || !selectedReminderContactId) {
      alert('Pasirinkite kontaktą, į kurį siųsti priminimą.');
      return;
    }
    const { invoice } = reminderModal;
    const reminderType = getReminderType(invoice);
    if (!reminderType) {
      alert('Negalima nustatyti priminimo tipo (sąskaita gali būti apmokėta).');
      return;
    }
    setReminderSending(true);
    try {
      const response = await api.post(`/invoices/sales/${invoice.id}/send_reminder/`, {
        reminder_type: reminderType,
        contact_id: selectedReminderContactId
      });
      if (response.data.success) {
        alert('Priminimas sėkmingai išsiųstas.');
        setReminderModal(null);
        setSelectedReminderContactId(null);
      } else {
        alert(response.data.error || 'Nepavyko išsiųsti priminimo.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Nepavyko išsiųsti priminimo';
      alert(msg);
    } finally {
      setReminderSending(false);
    }
  };

  const invoices = activeTab === 'sales' ? salesInvoices : purchaseInvoices;
  
  // Filtruoti sąskaitas pagal įmonės pavadinimą arba sąskaitos numerį ir statusą
  const filteredInvoices = invoices.filter(invoice => {
    // Teksto filtras
    if (filterText.trim()) {
      const searchText = filterText.toLowerCase().trim();
      const partnerName = invoice.partner.name.toLowerCase();
      const invoiceNumber = invoice.invoice_number.toLowerCase();
      if (!partnerName.includes(searchText) && !invoiceNumber.includes(searchText)) {
        return false;
      }
    }
    
    // Statuso filtrai (galima pasirinkti kelis - AND logika: visi pasirinkti filtrai turi būti tenkinami)
    if (statusFilters.size > 0) {
      // Naudoti payment_status kaip pagrindinį šaltinį, bet jei jis neteisingas, apskaičiuoti pagal sumas
      const paidAmount = parseFloat(invoice.paid_amount || '0');
      const totalAmount = parseFloat(invoice.amount_total || '0');
      const remainingAmount = parseFloat(invoice.remaining_amount || '0');
      
      // Jei payment_status yra "paid", naudoti jį kaip pagrindinį (net jei paid_amount dar neatsinaujino)
      let actualStatus = invoice.payment_status;
      
      // Jei payment_status nėra "paid", bet pagal sumas turėtų būti "paid", apskaičiuoti
      if (invoice.payment_status !== 'paid') {
        if (paidAmount >= totalAmount && remainingAmount <= 0.01) {
          actualStatus = 'paid';
        } else if (paidAmount > 0 && remainingAmount > 0.01) {
          actualStatus = 'partially_paid';
        } else if (paidAmount <= 0) {
          actualStatus = 'unpaid';
        }
      }
      
      // Apskaičiuoti overdue_days pagal due_date
      let calculatedOverdueDays = invoice.overdue_days;
      let isOverdue = false;
      let isNotOverdue = false;
      
      if (invoice.due_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(invoice.due_date);
        dueDate.setHours(0, 0, 0, 0);
        
        if (dueDate < today) {
          const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff > 0) {
            calculatedOverdueDays = daysDiff;
            isOverdue = true;
          }
        } else {
          isNotOverdue = true;
        }
        
        // Jei apmokėta, patikrinti ar apmokėta prieš terminą ar po termino
        if (actualStatus === 'paid' && invoice.payments && invoice.payments.length > 0) {
          // Rasti paskutinio mokėjimo datą
          const paymentDates = invoice.payments
            .map(p => new Date(p.payment_date))
            .filter(d => !isNaN(d.getTime()));
          
          if (paymentDates.length > 0) {
            const lastPaymentDate = new Date(Math.max(...paymentDates.map(d => d.getTime())));
            lastPaymentDate.setHours(0, 0, 0, 0);
            
            if (lastPaymentDate > dueDate) {
              // Apmokėta po termino
              isOverdue = true;
              isNotOverdue = false;
            } else {
              // Apmokėta prieš terminą
              isOverdue = false;
              isNotOverdue = true;
            }
          }
        }
      }
      
      // AND logika: visi pasirinkti filtrai turi būti tenkinami
      let allFiltersMatch = true;
      
      statusFilters.forEach((filter) => {
        let filterMatches = false;
        
        if (filter === 'paid' && actualStatus === 'paid') {
          filterMatches = true;
        } else if (filter === 'unpaid' && actualStatus === 'unpaid') {
          filterMatches = true;
        } else if (filter === 'overdue' && isOverdue) {
          filterMatches = true;
        } else if (filter === 'not_overdue' && isNotOverdue) {
          filterMatches = true;
        } else if (filter === 'fully_paid' && actualStatus === 'paid') {
          filterMatches = true;
        } else if (filter === 'partially_paid' && actualStatus === 'partially_paid') {
          filterMatches = true;
        }
        
        // Jei bent vienas filtras neatitinka, visa kombinacija neatitinka
        if (!filterMatches) {
          allFiltersMatch = false;
        }
      });
      
      if (!allFiltersMatch) {
        return false;
      }
    }
    
    return true;
  });

  // Apskaičiuoti pažymėtų sąskaitų sumą
  const selectedInvoicesData = filteredInvoices.filter(inv => selectedInvoices.has(inv.id));
  const selectedTotal = selectedInvoicesData.reduce((sum, inv) => {
    return sum + parseFloat(inv.remaining_amount);
  }, 0);

  const handleToggleInvoice = (invoiceId: number) => {
    setSelectedInvoices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  };

  const handleClearSelection = () => {
    setSelectedInvoices(new Set());
  };

  const handlePaySelected = async () => {
    if (selectedInvoicesData.length === 0) {
      alert('Pasirinkite bent vieną sąskaitą');
      return;
    }

    const paymentDate = prompt('Įveskite mokėjimo datą (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!paymentDate) return;

    const paymentMethod = prompt('Mokėjimo būdas (pvz. Banko pavedimas):', 'Banko pavedimas') || 'Banko pavedimas';
    const notes = prompt('Pastabos (neprivaloma):', '') || '';

    try {
      // Apmokėti kiekvieną pažymėtą sąskaitą pilnai
      for (const invoice of selectedInvoicesData) {
        await api.post('/invoices/payments/add/', {
          invoice_id: invoice.id,
          invoice_type: activeTab,
          amount: parseFloat(invoice.remaining_amount),
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes: notes || `Apmokėta kartu su kitomis sąskaitomis (${selectedInvoicesData.length} vnt.)`
        });
      }
      alert(`Sėkmingai apmokėta ${selectedInvoicesData.length} sąskaitų`);
      setSelectedInvoices(new Set());
      fetchInvoices();
    } catch (err: any) {
      alert('Klaida apmokant sąskaitas: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Kraunama...
      </div>
    );
  }

  return (
    <div className="payments-page">
      <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
        {/* Kairė pusė - Statistika */}
        <div style={{ 
          width: '320px', 
          minWidth: '320px',
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          height: 'fit-content',
          position: 'sticky',
          top: '20px'
        }}>
          {/* Tabai */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setActiveTab('sales')}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'sales' ? '#007bff' : '#f8f9fa',
                  color: activeTab === 'sales' ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                📄 Išrašytos ({salesTotalCount})
              </button>
              <button
                onClick={() => setActiveTab('purchase')}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'purchase' ? '#007bff' : '#f8f9fa',
                  color: activeTab === 'purchase' ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                📥 Gautos ({purchaseTotalCount})
              </button>
            </div>
          </div>
          
          {/* Paieška */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
              Paieška
            </h3>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Įmonė arba sąskaitos numeris..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
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
              {filterText && (
                <button 
                  onClick={() => setFilterText('')}
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
          
          {/* Laikotarpio filtrai */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#495057' }}>
                Nuo datos:
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px', color: '#495057' }}>
                Iki datos:
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  fontSize: '13px'
                }}
              />
            </div>
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              style={{
                width: '100%',
                padding: '6px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                marginTop: '8px'
              }}
            >
              Išvalyti laikotarpį
            </button>
          </div>
          
          {/* Greiti filtrai */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
              Greiti filtrai
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('paid')) {
                    newFilters.delete('paid');
                  } else {
                    newFilters.add('paid');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik pilnai apmokėtas sąskaitas"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('paid') ? '#28a745' : '#f8f9fa',
                  color: statusFilters.has('paid') ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Apmokėta
              </button>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('unpaid')) {
                    newFilters.delete('unpaid');
                  } else {
                    newFilters.add('unpaid');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik neapmokėtas sąskaitas (be mokėjimų)"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('unpaid') ? '#007bff' : '#f8f9fa',
                  color: statusFilters.has('unpaid') ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Neapmokėta
              </button>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('overdue')) {
                    newFilters.delete('overdue');
                  } else {
                    newFilters.add('overdue');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik vėluojančias sąskaitas (praėjęs mokėjimo terminas)"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('overdue') ? '#dc3545' : '#f8f9fa',
                  color: statusFilters.has('overdue') ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Vėluoja
              </button>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('not_overdue')) {
                    newFilters.delete('not_overdue');
                  } else {
                    newFilters.add('not_overdue');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik nevėluojančias sąskaitas (dar nepasibaigęs mokėjimo terminas)"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('not_overdue') ? '#6c757d' : '#f8f9fa',
                  color: statusFilters.has('not_overdue') ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Nevėluoja
              </button>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('fully_paid')) {
                    newFilters.delete('fully_paid');
                  } else {
                    newFilters.add('fully_paid');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik pilnai apmokėtas sąskaitas (sumokėta visa suma)"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('fully_paid') ? '#28a745' : '#f8f9fa',
                  color: statusFilters.has('fully_paid') ? 'white' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Pilnai
              </button>
              <button
                onClick={() => {
                  const newFilters = new Set(statusFilters);
                  if (newFilters.has('partially_paid')) {
                    newFilters.delete('partially_paid');
                  } else {
                    newFilters.add('partially_paid');
                  }
                  setStatusFilters(newFilters);
                }}
                title="Rodo tik dalinai apmokėtas sąskaitas (sumokėta dalis sumos, bet liko likutis)"
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  backgroundColor: statusFilters.has('partially_paid') ? '#ff9800' : '#f8f9fa',
                  color: statusFilters.has('partially_paid') ? '#212529' : '#495057',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                Dalinai
              </button>
            </div>
          </div>
          
          {/* Statistika */}
          {statisticsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Kraunama...</div>
          ) : statistics ? (
            <div>
              {/* Bendroji statistika */}
              <div style={{ 
                marginBottom: '20px', 
                padding: '15px', 
                backgroundColor: 'white', 
                borderRadius: '6px',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                  Bendroji statistika
                </h3>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Neapmokėtų sąskaitų:</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc3545' }}>
                    {statistics.total.unpaid_count} vnt.
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#dc3545', marginTop: '4px' }}>
                    {formatCurrency(statistics.total.unpaid_remaining)}
                  </div>
                </div>
                <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Vėluojančių:</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#ff6b6b' }}>
                    {statistics.total.overdue_count} vnt.
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#ff6b6b', marginTop: '4px' }}>
                    {formatCurrency(statistics.total.overdue_remaining)}
                  </div>
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Balansas:</div>
                  <div style={{ 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    color: parseFloat(statistics.total.net_balance) >= 0 ? '#28a745' : '#dc3545'
                  }}>
                    {formatCurrency(statistics.total.net_balance)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    (Turime gauti - Turime sumokėti)
                  </div>
                </div>
              </div>
              
              {/* Išrašytos sąskaitos */}
              <div style={{ 
                marginBottom: '20px', 
                padding: '15px', 
                backgroundColor: 'white', 
                borderRadius: '6px',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                  📄 Išrašytos sąskaitos
                </h3>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Neapmokėtų:</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#dc3545' }}>
                    {statistics.sales.unpaid_count} vnt. - {formatCurrency(statistics.sales.unpaid_remaining)}
                  </div>
                </div>
                <div style={{ paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Vėluojančių:</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#ff6b6b' }}>
                    {statistics.sales.overdue_count} vnt. - {formatCurrency(statistics.sales.overdue_remaining)}
                  </div>
                </div>
              </div>
              
              {/* Gautos sąskaitos */}
              <div style={{ 
                padding: '15px', 
                backgroundColor: 'white', 
                borderRadius: '6px',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#495057' }}>
                  📥 Gautos sąskaitos
                </h3>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Neapmokėtų:</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#dc3545' }}>
                    {statistics.purchase.unpaid_count} vnt. - {formatCurrency(statistics.purchase.unpaid_remaining)}
                  </div>
                </div>
                <div style={{ paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Vėluojančių:</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#ff6b6b' }}>
                    {statistics.purchase.overdue_count} vnt. - {formatCurrency(statistics.purchase.overdue_remaining)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Nėra duomenų</div>
          )}
        </div>
        
        {/* Dešinė pusė - Sąrašas */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="container">
            {/* Antraštė */}
            <h1 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>💰 Mokėjimų valdymas</h1>

        {/* Pažymėtų sąskaitų informacija ir veiksmai */}
        {selectedInvoices.size > 0 && (
          <div style={{
            marginBottom: '12px',
            padding: '10px 12px',
            backgroundColor: '#e7f3ff',
            borderRadius: '6px',
            border: '1px solid #b3d9ff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#004085' }}>
              ✓ Pažymėta: {selectedInvoices.size} sąskaitos | Likutis: {formatCurrency(selectedTotal)}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handlePaySelected}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >
                Apmokėti pažymėtas
              </button>
              <button
                onClick={handleClearSelection}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >
                Išvalyti pažymėjimus
              </button>
            </div>
          </div>
        )}

        {/* Sąskaitų sąrašas */}
        <div style={{ display: 'grid', gap: '8px' }}>
          {filteredInvoices.length === 0 ? (
            <div style={{ 
              padding: '40px', 
              textAlign: 'center', 
              color: '#666',
              backgroundColor: 'white',
              borderRadius: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              {filterText.trim() ? 'Nerasta sąskaitų pagal paiešką' : 'Nėra neapmokėtų sąskaitų'}
            </div>
          ) : (
            filteredInvoices.map((invoice) => {
              const isSelected = selectedInvoices.has(invoice.id);
              
              // Naudoti payment_status kaip pagrindinį šaltinį, bet jei jis neteisingas, apskaičiuoti pagal sumas
              const paidAmount = parseFloat(invoice.paid_amount || '0');
              const totalAmount = parseFloat(invoice.amount_total || '0');
              const remainingAmount = parseFloat(invoice.remaining_amount || '0');
              
              // Jei payment_status yra "paid", naudoti jį kaip pagrindinį (net jei paid_amount dar neatsinaujino)
              let actualStatus = invoice.payment_status;
              
              // Jei payment_status nėra "paid", bet pagal sumas turėtų būti "paid", apskaičiuoti
              if (invoice.payment_status !== 'paid') {
                if (paidAmount >= totalAmount && remainingAmount <= 0.01) {
                  actualStatus = 'paid';
                } else if (paidAmount > 0 && remainingAmount > 0.01) {
                  actualStatus = 'partially_paid';
                } else if (paidAmount <= 0) {
                  actualStatus = 'unpaid';
                }
              }
              
              // Apskaičiuoti overdue_days pagal due_date, jei jis nėra atnaujintas
              let calculatedOverdueDays = invoice.overdue_days;
              if (invoice.due_date && actualStatus !== 'paid') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDate = new Date(invoice.due_date);
                dueDate.setHours(0, 0, 0, 0);
                if (dueDate < today) {
                  const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (daysDiff > 0) {
                    calculatedOverdueDays = daysDiff;
                  }
                }
              }
              
              const isPaid = actualStatus === 'paid';
              const isPartiallyPaid = actualStatus === 'partially_paid';
              const isOverdue = calculatedOverdueDays > 0 && actualStatus !== 'paid';
              // Pirmiausia tikrinti dalinai apmokėtą, tada vėluojančią
              const statusColor = isPaid ? '#28a745' : isPartiallyPaid ? '#ff9800' : isOverdue ? '#dc3545' : '#007bff';
              const statusText = isPaid ? '✅ APMOKĖTA' : isPartiallyPaid ? '🟡 DALINIS' : isOverdue ? '🔴 VĖLUOJA' : '🔵 NEAPMOKĖTA';
              
              return (
            <div
              key={invoice.id}
              style={{
                backgroundColor: isSelected ? '#f0f8ff' : isPartiallyPaid ? '#ffe0b2' : isOverdue ? '#fff5f5' : 'white',
                borderRadius: '4px',
                padding: '4px 6px',
                boxShadow: isSelected ? '0 2px 6px rgba(0,123,255,0.3)' : isOverdue ? '0 2px 6px rgba(220,53,69,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                borderLeft: `3px solid ${statusColor}`,
                border: isSelected ? '2px solid #007bff' : isOverdue ? '1px solid #ffcccc' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {/* Sąskaitos informacija - stulpeliai */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1.2fr 2fr 1fr 1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'center', marginBottom: '3px' }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleInvoice(invoice.id)}
                  style={{
                    width: '14px',
                    height: '14px',
                    cursor: 'pointer'
                  }}
                />
                {/* Sąskaitos numeris ir statusas */}
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#495057', fontFamily: 'monospace', lineHeight: '1.1', marginBottom: '2px' }}>
                    {invoice.invoice_number}
                  </div>
                  <span style={{
                    fontSize: '8px',
                    fontWeight: '700',
                    color: statusColor,
                    backgroundColor: isPartiallyPaid ? '#ffe0b2' : isOverdue ? '#ffebee' : '#e3f2fd',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    whiteSpace: 'nowrap'
                  }}>
                    {statusText}
                  </span>
                </div>
                {/* Įmonės pavadinimas */}
                <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.1', fontWeight: '500' }}>
                  {invoice.partner.name}
                </div>
                {/* Išrašymo data */}
                <div>
                  <div style={{ fontSize: '8px', color: '#999', marginBottom: '1px', lineHeight: '1.0' }}>Išrašymo data</div>
                  <div style={{ fontSize: '9px', color: '#495057', lineHeight: '1.1' }}>{formatDate(invoice.issue_date)}</div>
                </div>
                {/* Termino data */}
                <div>
                  <div style={{ fontSize: '8px', color: '#999', marginBottom: '1px', lineHeight: '1.0' }}>Termino data</div>
                  <div style={{ fontSize: '9px', color: calculatedOverdueDays > 0 ? '#dc3545' : '#495057', fontWeight: calculatedOverdueDays > 0 ? '600' : '400', lineHeight: '1.1' }}>
                    {formatDate(invoice.due_date)}
                    {calculatedOverdueDays > 0 && (
                      <span style={{ marginLeft: '2px', fontSize: '8px' }}>({calculatedOverdueDays}d)</span>
                    )}
                  </div>
                </div>
                {/* Suma */}
                <div>
                  <div style={{ fontSize: '8px', color: '#999', marginBottom: '1px', lineHeight: '1.0' }}>Suma</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#495057', lineHeight: '1.1' }}>
                    {formatCurrency(invoice.amount_total)}
                  </div>
                </div>
                {/* Apmokėta */}
                <div>
                  <div style={{ fontSize: '8px', color: '#999', marginBottom: '1px', lineHeight: '1.0' }}>Apmokėta</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#28a745', lineHeight: '1.1' }}>
                    {formatCurrency(invoice.paid_amount)}
                  </div>
                </div>
                {/* Likutis */}
                <div>
                  <div style={{ fontSize: '8px', color: '#999', marginBottom: '1px', lineHeight: '1.0' }}>Likutis</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: invoice.remaining_amount !== invoice.amount_total ? '#ff9800' : '#dc3545', lineHeight: '1.1' }}>
                    {formatCurrency(invoice.remaining_amount)}
                  </div>
                </div>
                {/* Mygtukai */}
                <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleViewInvoice(invoice.id, activeTab)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.4',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '36px'
                    }}
                    title="Peržiūrėti sąskaitą"
                  >
                    👁️
                  </button>
                  <button
                    onClick={() => handlePayFull(invoice, activeTab)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.4'
                    }}
                  >
                    Apmokėti pilnai
                  </button>
                  <button
                    onClick={() => setEditingPayment({ invoiceId: invoice.id, invoiceType: activeTab })}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.4'
                    }}
                  >
                    Pridėti
                  </button>
                  {activeTab === 'sales' && !isPaid && (
                    <button
                      onClick={() => openReminderModal(invoice)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#6f42c1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        lineHeight: '1.4',
                        minWidth: '36px'
                      }}
                      title="Siųsti priminimą apie neapmokėtą sąskaitą"
                    >
                      ✉️
                    </button>
                  )}
                </div>
              </div>

              {/* Mokėjimų istorija */}
              {invoice.payments.length > 0 && (
                <div style={{ marginTop: '3px', paddingTop: '3px', borderTop: '1px solid #dee2e6' }}>
                  <div style={{ fontSize: '8px', fontWeight: '600', color: '#666', marginBottom: '2px' }}>Mokėjimų istorija:</div>
                  <div style={{ display: 'grid', gap: '2px' }}>
                    {invoice.payments.map((payment) => (
                      <div
                        key={payment.id}
                        style={{
                          padding: '3px 4px',
                          backgroundColor: 'white',
                          borderRadius: '2px',
                          border: '1px solid #dee2e6',
                          fontSize: '8px',
                          lineHeight: '1.2'
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '3px', alignItems: 'center', marginBottom: payment.notes ? '2px' : '0' }}>
                          <div>
                            <span style={{ fontWeight: '600', color: '#495057' }}>
                              {formatCurrency(payment.amount)}
                            </span>
                          </div>
                          <div style={{ color: '#666' }}>
                            <div style={{ fontSize: '7px', color: '#999', marginBottom: '1px' }}>Apmokėta:</div>
                            <div>{formatDate(payment.payment_date)}</div>
                          </div>
                          <div style={{ color: '#666' }}>
                            <div style={{ fontSize: '7px', color: '#999', marginBottom: '1px' }}>Pakeista:</div>
                            <div>{payment.created_at ? formatDate(payment.created_at) : '-'}</div>
                          </div>
                          <div style={{ color: '#666' }}>
                            {payment.payment_method || '-'}
                          </div>
                          <button
                            onClick={() => handleDeletePayment(payment.id)}
                            style={{
                              padding: '1px 4px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '2px',
                              cursor: 'pointer',
                              fontSize: '7px',
                              lineHeight: '1.1'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                        {payment.notes && (
                          <div style={{ 
                            marginTop: '2px', 
                            paddingTop: '2px', 
                            borderTop: '1px solid #e9ecef',
                            color: '#6c757d',
                            fontSize: '7px',
                            lineHeight: '1.2',
                            wordBreak: 'break-word'
                          }}>
                            {payment.notes.replace(/OFFSET_PAYMENT_IDS:[0-9,]+\.?\s*/g, '')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mokėjimo forma */}
              {editingPayment && editingPayment.invoiceId === invoice.id && (
                <div style={{ marginTop: '6px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#004085' }}>Pridėti mokėjimą:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', lineHeight: '1.2' }}>Suma *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        placeholder="0.00"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          lineHeight: '1.4'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', lineHeight: '1.2' }}>Data *</label>
                      <input
                        type="date"
                        value={paymentForm.payment_date}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          lineHeight: '1.4'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', lineHeight: '1.2' }}>Mokėjimo būdas</label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) => {
                          setPaymentForm({ ...paymentForm, payment_method: e.target.value });
                          if (e.target.value !== 'Sudengta') {
                            setSelectedOffsetInvoices(new Set());
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          lineHeight: '1.4',
                          backgroundColor: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Pasirinkite...</option>
                        <option value="Pavedimu">Pavedimu</option>
                        <option value="Grynais">Grynais</option>
                        <option value="Sudengta">Sudengta</option>
                        <option value="Kortele">Kortele</option>
                        <option value="Kita">Kita</option>
                      </select>
                    </div>
                    {paymentForm.payment_method === 'Sudengta' && editingPayment && editingPayment.invoiceId === invoice.id && (() => {
                      // Jei sudengiame partnerio išrašytą sąskaitą (purchase), rodyti mūsų išrašytas sąskaitas (sales)
                      // Jei sudengiame mūsų išrašytą sąskaitą (sales), rodyti partnerio išrašytas sąskaitas (purchase)
                      const oppositeInvoices = activeTab === 'sales' ? purchaseInvoices : salesInvoices;
                      const offsetInvoices = oppositeInvoices.filter(inv => inv.partner.id === invoice.partner.id);
                      return (
                        <div>
                          <label style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', lineHeight: '1.2' }}>
                            Su kuriomis sąskaitomis sudengta?
                          </label>
                          <div style={{
                            maxHeight: '200px',
                            overflowY: 'auto',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            padding: '8px',
                            backgroundColor: '#f8f9fa'
                          }}>
                            {offsetInvoices.length > 0 ? (
                              offsetInvoices.map(offsetInvoice => (
                                <label
                                  key={offsetInvoice.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '4px 0',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedOffsetInvoices.has(offsetInvoice.id)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedOffsetInvoices);
                                      if (e.target.checked) {
                                        newSet.add(offsetInvoice.id);
                                      } else {
                                        newSet.delete(offsetInvoice.id);
                                      }
                                      setSelectedOffsetInvoices(newSet);
                                    }}
                                  />
                                  <span>
                                    {offsetInvoice.invoice_number} - {formatCurrency(offsetInvoice.amount_total)}
                                    {parseFloat(offsetInvoice.remaining_amount) > 0 && (
                                      <span style={{ color: '#dc3545', marginLeft: '4px' }}>
                                        (Likutis: {formatCurrency(offsetInvoice.remaining_amount)})
                                      </span>
                                    )}
                                  </span>
                                </label>
                              ))
                            ) : (
                              <div style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                                Nėra kitų sąskaitų iš šio partnerio
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div>
                      <label style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', lineHeight: '1.2' }}>Pastabos</label>
                      <input
                        type="text"
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                        placeholder="Pastabos"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          lineHeight: '1.4'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleAddPayment(invoice.id, activeTab)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          lineHeight: '1.4'
                        }}
                      >
                        Išsaugoti
                      </button>
                      <button
                        onClick={() => {
                          setEditingPayment(null);
                          setPaymentForm({
                            amount: '',
                            payment_date: new Date().toISOString().split('T')[0],
                            payment_method: 'Pavedimu',
                            notes: ''
                          });
                          setSelectedOffsetInvoices(new Set());
                        }}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          lineHeight: '1.4'
                        }}
                      >
                        Atšaukti
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
            })
          )}
        </div>
        
        {/* Puslapiavimas */}
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          borderTop: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>
              Puslapis {currentPage} iš {activeTab === 'sales' ? salesTotalPages : purchaseTotalPages}
            </span>
            <span style={{ fontSize: '13px', color: '#666' }}>
              (Iš viso: {activeTab === 'sales' ? salesTotalCount : purchaseTotalCount})
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                padding: '4px 8px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            >
              <option value={25}>25 per puslapį</option>
              <option value={50}>50 per puslapį</option>
              <option value={100}>100 per puslapį</option>
              <option value={200}>200 per puslapį</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: currentPage === 1 ? '#f8f9fa' : 'white',
                color: currentPage === 1 ? '#999' : '#495057',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              « Pirmas
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: currentPage === 1 ? '#f8f9fa' : 'white',
                color: currentPage === 1 ? '#999' : '#495057',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              ‹ Ankstesnis
            </button>
            <button
              onClick={() => setCurrentPage(prev => {
                const maxPage = activeTab === 'sales' ? salesTotalPages : purchaseTotalPages;
                return Math.min(maxPage, prev + 1);
              })}
              disabled={currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages)}
              style={{
                padding: '6px 12px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? '#f8f9fa' : 'white',
                color: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? '#999' : '#495057',
                cursor: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              Kitas ›
            </button>
            <button
              onClick={() => setCurrentPage(activeTab === 'sales' ? salesTotalPages : purchaseTotalPages)}
              disabled={currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages)}
              style={{
                padding: '6px 12px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? '#f8f9fa' : 'white',
                color: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? '#999' : '#495057',
                cursor: currentPage >= (activeTab === 'sales' ? salesTotalPages : purchaseTotalPages) ? 'not-allowed' : 'pointer',
                fontSize: '13px'
              }}
            >
              Paskutinis »
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>
      
      {/* HTML Preview Modal (tik sales invoice'ams) */}
      {htmlPreview && (
        <HTMLPreviewModal
          preview={htmlPreview}
          onClose={() => {
            setHtmlPreview(null);
            setPreviewInvoiceId(null);
            setPreviewInvoiceType(null);
          }}
          onLanguageChange={async (lang) => {
            setHtmlPreviewLang(lang);
            if (previewInvoiceId && previewInvoiceType === 'sales') {
              await handleViewInvoice(previewInvoiceId, 'sales');
            }
          }}
          currentLang={htmlPreviewLang}
          onDownloadPDF={previewInvoiceId && previewInvoiceType === 'sales' ? async () => {
            try {
              const endpoint = `/invoices/sales/${previewInvoiceId}/pdf/`;
              const response = await api.get(endpoint, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob',
              });
              
              const blob = new Blob([response.data], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `saskaita-${previewInvoiceId}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
            } catch (err: any) {
              alert('Nepavyko atsisiųsti PDF');
            }
          } : undefined}
          onSendEmail={previewInvoiceId && previewInvoiceType === 'sales' ? async () => {
            // Atidaryti email modalą - naudoti tą patį, kaip HTML template'e
            const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              try {
                // Iškviesti sendEmail funkciją iš iframe
                (iframe.contentWindow as any).sendEmail?.();
              } catch (e) {
                alert('Nepavyko atidaryti email modalo');
              }
            }
          } : undefined}
        />
      )}
      
      {/* Attachment Preview Modal (purchase invoice'ams) */}
      {attachmentPreview && (
        <AttachmentPreviewModal
          attachment={attachmentPreview}
          onClose={() => {
            setAttachmentPreview(null);
            setPreviewInvoiceId(null);
            setPreviewInvoiceType(null);
          }}
          hideAssignButton={true}
          hideCreateInvoiceButton={true}
          purchaseInvoiceId={previewInvoiceId && previewInvoiceType === 'purchase' ? previewInvoiceId : undefined}
          onSendEmail={previewInvoiceId && previewInvoiceType === 'purchase' ? async () => {
            // Rasti invoice iš sąrašo, kad gautume partner ID
            const invoice = purchaseInvoices.find(inv => inv.id === previewInvoiceId);
            if (!invoice) {
              alert('Nepavyko rasti sąskaitos');
              return;
            }

            // Naudoti tą patį email modalą, kaip ir sales invoice'ams
            // Funkcija iš sales_invoice.html template
            const showEmailPrompt = async (partnerId: number): Promise<string[]> => {
              return new Promise<string[]>(async (resolve) => {
                let contacts: any[] = [];
                if (partnerId) {
                  try {
                    const response = await api.get(`/partners/contacts/`, {
                      params: { partner: partnerId }
                    });
                    contacts = response.data.results || response.data || [];
                  } catch (error) {
                  }
                }
                
                const modal = document.createElement('div');
                modal.style.cssText = `
                  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                  background: rgba(0, 0, 0, 0.5); display: flex;
                  align-items: center; justify-content: center; z-index: 10001;
                `;
                
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                  background: white; padding: 24px; border-radius: 8px;
                  min-width: 500px; max-width: 700px; max-height: 80vh;
                  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                  display: flex; flex-direction: column;
                `;
                
                const selectedEmails = new Map<number, string>();
                const editingEmails = new Set<number>();
                let showNewContactForm = false;
                
                const close = () => { document.body.removeChild(modal); };
                
                const updateModal = () => {
                  let html = `<h3 style="margin: 0 0 16px 0; font-size: 18px;">Siųsti sąskaitą el. paštu</h3>
                              <div id="contactsContainer" style="flex: 1; overflow-y: auto; margin-bottom: 16px; max-height: 400px;">`;
                  
                  contacts.forEach((contact: any) => {
                    const email = selectedEmails.get(contact.id) || contact.email || '';
                    const isChecked = selectedEmails.has(contact.id);
                    const isEditing = editingEmails.has(contact.id);
                    const escapedEmail = (email || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    html += `
                      <div style="border: 1px solid #ddd; border-radius: 3px; padding: 6px 8px; margin-bottom: 4px; background: ${isChecked ? '#f0f8ff' : '#fff'};">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;">
                          <input type="checkbox" id="contact_${contact.id}" ${isChecked ? 'checked' : ''} 
                                 style="cursor: pointer; margin: 0; flex-shrink: 0;" 
                                 data-contact-id="${contact.id}"
                                 data-default-email="${escapedEmail}">
                          <label for="contact_${contact.id}" style="cursor: pointer; margin: 0; font-size: 12px; flex-shrink: 0; white-space: nowrap;">
                            <strong style="font-size: 12px;">${((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() || 'Kontaktinis asmuo'}</strong>
                            ${contact.position ? `<span style="font-size: 11px; color: #666; margin-left: 4px;">• ${contact.position}</span>` : ''}
                          </label>
                          <span style="color: #ccc; margin: 0 4px; flex-shrink: 0;">|</span>
                          ${isEditing ? `
                            <input type="email" id="email_${contact.id}" value="${escapedEmail}" style="flex: 1; min-width: 150px; padding: 4px 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;" data-contact-id="${contact.id}">
                            <button type="button" id="saveEmail_${contact.id}" data-contact-id="${contact.id}" style="padding: 4px 8px; border: none; background: #28a745; color: white; border-radius: 3px; cursor: pointer; font-size: 11px;">✓</button>
                          ` : `
                            <div style="flex: 1; min-width: 150px; padding: 2px 0; font-size: 11px; color: ${email ? '#333' : '#999'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${email || 'Nėra el. pašto'}</div>
                            <button type="button" id="editEmail_${contact.id}" data-contact-id="${contact.id}" style="padding: 4px 8px; border: 1px solid #ddd; background: white; border-radius: 3px; cursor: pointer; font-size: 11px;">✏️</button>
                          `}
                        </div>
                      </div>`;
                  });
                  
                  html += `<div style="margin-top: 8px;">
                            ${!showNewContactForm ? `
                              <button type="button" id="showNewContactBtn" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px dashed #ddd; background: #f9f9f9; border-radius: 3px; cursor: pointer; font-size: 12px; color: #666;">
                                <span style="font-size: 16px;">+</span><span>Pridėti naują kontaktą</span>
                              </button>` : `
                              <div style="border: 1px solid #ddd; border-radius: 3px; padding: 8px; background: #f9f9f9;">
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                  <input type="text" id="newFirstName" placeholder="Vardas" style="flex: 1; padding: 4px 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;">
                                  <input type="text" id="newLastName" placeholder="Pavardė" style="flex: 1; padding: 4px 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                  <input type="email" id="newEmail" placeholder="El. pašto adresas" style="flex: 1; padding: 4px 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 12px;">
                                  <input type="checkbox" id="newEmailCheck" style="cursor: pointer; flex-shrink: 0;"><label for="newEmailCheck" style="cursor: pointer; font-size: 11px; white-space: nowrap;">Siųsti</label>
                                  <button type="button" id="hideNewContactBtn" style="padding: 4px 8px; border: 1px solid #ddd; background: white; border-radius: 3px; cursor: pointer; font-size: 11px;">✕</button>
                                </div>
                              </div>`}
                         </div></div>
                         <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #eee; padding-top: 16px;">
                            <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; font-size: 14px;">Atšaukti</button>
                            <button id="sendBtn" style="padding: 8px 16px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer; font-size: 14px;">Siųsti</button>
                         </div>`;
                  
                  dialog.innerHTML = html;
                  
                  // Event listeners
                  contacts.forEach((contact: any) => {
                    const checkbox = dialog.querySelector(`#contact_${contact.id}`) as HTMLInputElement;
                    if (checkbox) {
                      checkbox.addEventListener('change', (e) => {
                        const target = e.target as HTMLInputElement;
                        const contactId = parseInt(target.dataset.contactId || '0');
                        if (target.checked) {
                          selectedEmails.set(contactId, target.dataset.defaultEmail || '');
                        } else {
                          selectedEmails.delete(contactId);
                        }
                        updateModal();
                      });
                    }
                    
                    const editBtn = dialog.querySelector(`#editEmail_${contact.id}`);
                    if (editBtn) {
                      editBtn.addEventListener('click', () => {
                        editingEmails.add(contact.id);
                        updateModal();
                      });
                    }
                    
                    const saveBtn = dialog.querySelector(`#saveEmail_${contact.id}`);
                    if (saveBtn) {
                      saveBtn.addEventListener('click', () => {
                        const emailInput = dialog.querySelector(`#email_${contact.id}`) as HTMLInputElement;
                        if (emailInput) {
                          selectedEmails.set(contact.id, emailInput.value);
                        }
                        editingEmails.delete(contact.id);
                        updateModal();
                      });
                    }
                  });
                  
                  const showNewContactBtn = dialog.querySelector('#showNewContactBtn');
                  if (showNewContactBtn) {
                    showNewContactBtn.addEventListener('click', () => {
                      showNewContactForm = true;
                      updateModal();
                    });
                  }
                  
                  const hideNewContactBtn = dialog.querySelector('#hideNewContactBtn');
                  if (hideNewContactBtn) {
                    hideNewContactBtn.addEventListener('click', () => {
                      showNewContactForm = false;
                      updateModal();
                    });
                  }
                  
                  const cancelBtn = dialog.querySelector('#cancelBtn');
                  if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                      close();
                      resolve([]);
                    });
                  }
                  
                  const sendBtn = dialog.querySelector('#sendBtn');
                  if (sendBtn) {
                    sendBtn.addEventListener('click', async () => {
                      const emails: string[] = [];
                      selectedEmails.forEach((email) => {
                        if (email) emails.push(email);
                      });
                      
                      const newEmailCheck = dialog.querySelector('#newEmailCheck') as HTMLInputElement;
                      const newEmail = dialog.querySelector('#newEmail') as HTMLInputElement;
                      if (newEmailCheck?.checked && newEmail?.value) {
                        emails.push(newEmail.value);
                        
                        // Pridėti naują kontaktą
                        const newFirstName = (dialog.querySelector('#newFirstName') as HTMLInputElement)?.value || '';
                        const newLastName = (dialog.querySelector('#newLastName') as HTMLInputElement)?.value || '';
                        try {
                          await api.post('/partners/contacts/', {
                            partner: partnerId,
                            email: newEmail.value,
                            first_name: newFirstName,
                            last_name: newLastName
                          });
                        } catch (error) {
                        }
                      }
                      
                      if (emails.length === 0) {
                        alert('Pasirinkite bent vieną el. pašto adresą');
                        return;
                      }
                      
                      close();
                      resolve(emails);
                    });
                  }
                };
                
                modal.appendChild(dialog);
                document.body.appendChild(modal);
                updateModal();
              });
            };

            try {
              const emails = await showEmailPrompt(invoice.partner.id);
              if (emails && emails.length > 0) {
                const response = await api.post(`/invoices/purchase/${previewInvoiceId}/send_email/`, {
                  emails: emails
                });
                if (response.data.success) {
                  alert('Sąskaita sėkmingai išsiųsta paštu');
                } else {
                  alert(response.data.error || 'Nepavyko išsiųsti sąskaitos paštu');
                }
              }
            } catch (error: any) {
              alert(error.response?.data?.error || 'Nepavyko išsiųsti sąskaitos paštu');
            }
          } : undefined}
        />
      )}

      {/* Priminimo siuntimas: pasirinkti kontaktą */}
      {reminderModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001
          }}
          onClick={() => !reminderSending && setReminderModal(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '400px',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              Siųsti priminimą apie neapmokėtą sąskaitą
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
              Sąskaita: <strong>{reminderModal.invoice.invoice_number}</strong> — {reminderModal.invoice.partner.name}
            </p>
            {reminderContactLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Kraunami kontaktai...</div>
            ) : reminderContacts.length === 0 ? (
              <div style={{ padding: '12px', color: '#856404', backgroundColor: '#fff3cd', borderRadius: '4px', marginBottom: '16px' }}>
                Šis partneris neturi kontaktų su el. pašto adresu. Pridėkite kontaktą partnerio kortelėje.
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Pasirinkite gavėją:</div>
                {reminderContacts.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 10px',
                      marginBottom: '4px',
                      borderRadius: '4px',
                      backgroundColor: selectedReminderContactId === c.id ? '#e7f3ff' : '#f8f9fa',
                      cursor: 'pointer',
                      border: selectedReminderContactId === c.id ? '1px solid #007bff' : '1px solid transparent'
                    }}
                  >
                    <input
                      type="radio"
                      name="reminder_contact"
                      checked={selectedReminderContactId === c.id}
                      onChange={() => setSelectedReminderContactId(c.id)}
                      style={{ marginRight: '10px' }}
                    />
                    <span style={{ flex: 1 }}>
                      {(c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email).trim() || 'Kontaktas'}
                      {c.email && <span style={{ color: '#666', fontSize: '12px', marginLeft: '6px' }}>({c.email})</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => !reminderSending && setReminderModal(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: reminderSending ? 'not-allowed' : 'pointer'
                }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={handleSendReminderFromModal}
                disabled={reminderSending || reminderContacts.length === 0 || !selectedReminderContactId}
                style={{
                  padding: '8px 16px',
                  backgroundColor: (reminderSending || reminderContacts.length === 0 || !selectedReminderContactId) ? '#ccc' : '#6f42c1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (reminderSending || reminderContacts.length === 0 || !selectedReminderContactId) ? 'not-allowed' : 'pointer'
                }}
              >
                {reminderSending ? 'Siunčiama...' : 'Siųsti priminimą'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsPage;
