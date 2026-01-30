import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import InvoiceSettingsForm from '../components/settings/InvoiceSettingsForm';
import OrderSettingsForm from '../components/settings/OrderSettingsForm';
import ExpeditionSettingsForm from '../components/settings/ExpeditionSettingsForm';
import WarehouseExpeditionSettingsForm from '../components/settings/WarehouseExpeditionSettingsForm';
import CostExpeditionSettingsForm from '../components/settings/CostExpeditionSettingsForm';
import NotificationSettingsForm from '../components/settings/NotificationSettingsForm';
import UISettingsForm from '../components/settings/UISettingsForm';
import EmailTemplatesForm from '../components/settings/EmailTemplatesForm';
import RouteContactsSection from '../components/settings/RouteContactsSection';
import AutocompleteSuggestionsSection from '../components/settings/AutocompleteSuggestionsSection';
import BankImportInteractiveSection from '../components/settings/BankImportInteractiveSection';
import DataExportSection from '../components/settings/DataExportSection';
import DataImportSection_NEW from '../components/settings/DataImportSection_NEW';
import PaymentImportSection from '../components/settings/PaymentImportSection';
import SenderManagementSection from '../components/settings/SenderManagementSection';
import StatusTransitionRulesSection from '../components/settings/StatusTransitionRulesSection';
import OrderAutoStatusRulesSection from '../components/settings/OrderAutoStatusRulesSection';
import './SettingsPage.css';

interface InvoiceSettings {
  id: number;
  default_vat_rate: string;
  default_payment_term_days: number;
  invoice_prefix_sales: string;
  invoice_number_width: number;
  invoice_footer_text: string;
  auto_numbering: boolean;
  last_invoice_number?: string | null;
  next_invoice_number?: string;
  next_invoice_number_edit?: string;
  default_display_options?: {
    show_order_type?: boolean;
    show_cargo_info?: boolean;
    show_cargo_weight?: boolean;
    show_cargo_ldm?: boolean;
    show_cargo_dimensions?: boolean;
    show_cargo_properties?: boolean;
    show_carriers?: boolean;
    show_carrier_name?: boolean;
    show_carrier_route?: boolean;
    show_carrier_dates?: boolean;
    show_prices?: boolean;
    show_my_price?: boolean;
    show_other_costs?: boolean;
  };
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface ObligationItem {
  text: string;
  text_en?: string;
  text_ru?: string;
}

interface OrderSettings {
  id: number;
  order_prefix?: string;
  order_number_width: number;
  auto_numbering: boolean;
  my_price_percentage?: number;
  payment_terms?: string;
  payment_terms_en?: string;
  payment_terms_ru?: string;
  carrier_obligations?: ObligationItem[];
  client_obligations?: ObligationItem[];
  last_order_number?: string | null;
  next_order_number?: string;
  next_order_number_edit?: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface ExpeditionSettings {
  id: number;
  expedition_prefix: string;
  expedition_number_width: number;
  auto_numbering: boolean;
  payment_terms?: string;
  payment_terms_en?: string;
  payment_terms_ru?: string;
  carrier_obligations?: ObligationItem[];
  client_obligations?: ObligationItem[];
  notes: string;
  last_expedition_number?: string | null;
  next_expedition_number?: string | null;
  next_expedition_number_edit?: string;
  created_at?: string;
  updated_at?: string;
}

interface WarehouseExpeditionSettings {
  id: number;
  expedition_prefix: string;
  expedition_number_width: number;
  auto_numbering: boolean;
  last_warehouse_number?: string | null;
  next_warehouse_number?: string | null;
  next_warehouse_number_edit?: string;
  created_at?: string;
  updated_at?: string;
}

interface CostExpeditionSettings {
  id: number;
  expedition_prefix: string;
  expedition_number_width: number;
  auto_numbering: boolean;
  payment_terms?: string;
  payment_terms_en?: string;
  payment_terms_ru?: string;
  carrier_obligations?: ObligationItem[];
  client_obligations?: ObligationItem[];
  last_cost_number?: string | null;
  next_cost_number?: string | null;
  next_cost_number_edit?: string;
  created_at?: string;
  updated_at?: string;
}

interface NotificationSettings {
  id: number;
  // SMTP nustatymai
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  smtp_username: string;
  smtp_password?: string;
  smtp_from_email: string;
  smtp_from_name: string;
  // IMAP nustatymai
  imap_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  imap_use_starttls: boolean;
  imap_username: string;
  imap_password?: string;
  imap_folder: string;
  imap_sync_interval_minutes: number;
  // Automatiniai el. laiškų pranešimai - SĄSKAITOS
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
  // El. laiškų pasirašymas ir pranešimai
  email_signature: string;
  email_auto_generated_notice: string;
  email_contact_manager_notice: string;
  // Testavimo režimas el. laiškams
  email_test_mode: boolean;
  email_test_recipient: string;
  // UI pranešimų nustatymai
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
  created_at?: string;
  updated_at?: string;
}

interface ImportResult {
  total_transactions?: number;
  matched_count?: number;
  unmatched_count?: number;
  results?: Array<{
    date: string;
    amount: string;
    description: string;
    matched: boolean;
    invoice_number?: string;
  }>;
  success?: boolean;
  error?: string;
}



const SettingsPage: React.FC = () => {
  const location = useLocation();
  
  // Jei atidaryta iš /bank-import, automatiškai parinkti bank-import sekciją
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({
    'ui-nustatymai': true,
    'numeracijos': true,
    'komunikacijos': true,
    'duomenu-valdymas': true,
    'sistema': true
  });

  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  const [activeSection, setActiveSection] = useState<'ui-settings' | 'invoice' | 'orders' | 'expedition' | 'warehouse-expedition' | 'cost-expedition' | 'bank-import' | 'data-import' | 'data-export' | 'email' | 'email-templates' | 'notifications' | 'sender-management' | 'autocomplete' | 'route-contacts' | 'test-data' | 'payment-import' | 'status-transition-rules' | 'order-auto-status-rules'>(() => {
    if (location.pathname === '/bank-import') {
      return 'bank-import';
    }
    return 'invoice';
  });
  
  // Atnaujinti activeSection, jei keičiasi URL
  useEffect(() => {
    if (location.pathname === '/bank-import') {
      setActiveSection('bank-import');
    }
  }, [location.pathname]);
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Bank Import state
  const [bankImportFile, setBankImportFile] = useState<File | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bankImportLoading, setBankImportLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bankImportResult, setBankImportResult] = useState<ImportResult | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bankImportToast, setBankImportToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({ type: 'info', message: '', visible: false });
  const bankImportToastTimeoutRef = useRef<number | null>(null);

  // Test Data state
  const [testDataCount, setTestDataCount] = useState(100);
  const [testDataLoading, setTestDataLoading] = useState(false);
  const [testDataDeleting, setTestDataDeleting] = useState(false);
  const [testDataProgress, setTestDataProgress] = useState({ elapsed: 0, estimated: 0 });
  const testDataTimerRef = useRef<number | null>(null);
  const testDataStartTimeRef = useRef<number | null>(null);
  
  const showBankImportToast = (type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setBankImportToast({ type, message, visible: true });
    if (bankImportToastTimeoutRef.current !== null) {
      window.clearTimeout(bankImportToastTimeoutRef.current);
    }
    bankImportToastTimeoutRef.current = window.setTimeout(() => setBankImportToast((t) => ({ ...t, visible: false })), timeoutMs);
  };
  
  useEffect(() => {
    return () => {
      if (bankImportToastTimeoutRef.current) {
        window.clearTimeout(bankImportToastTimeoutRef.current);
      }
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBankImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBankImportFile(e.target.files[0]);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBankImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankImportFile) return;

    setBankImportLoading(true);
    const formData = new FormData();
    formData.append('file', bankImportFile);

    try {
      const response = await api.post('/invoices/bank/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setBankImportResult(response.data);
      showBankImportToast('success', 'Banko išrašas sėkmingai importuotas');
    } catch (error: any) {
      showBankImportToast('error', error.response?.data?.error || 'Klaida importuojant failą');
    } finally {
      setBankImportLoading(false);
    }
  };

  // Test Data handlers
  const handleGenerateTestData = async () => {
    if (!window.confirm(`Ar tikrai norite sukurti ${testDataCount} testinių užsakymų?`)) {
      return;
    }

    setTestDataLoading(true);
    setMessage(null);
    setTestDataProgress({ elapsed: 0, estimated: 0 });
    
    // Pradėti laiko sekimą
    testDataStartTimeRef.current = Date.now();
    
    // Apytikris laikas pagal užsakymų skaičių (apytikriai 0.05-0.1s per užsakymą)
    const estimatedSeconds = Math.ceil(testDataCount * 0.1);
    setTestDataProgress({ elapsed: 0, estimated: estimatedSeconds });
    
    // Timer - atnaujinti laiką kas sekundę
    testDataTimerRef.current = window.setInterval(() => {
      if (testDataStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - testDataStartTimeRef.current) / 1000);
        setTestDataProgress(prev => ({ ...prev, elapsed }));
      }
    }, 1000);

    try {
      const response = await api.post('/core/test-data/generate/', { count: testDataCount });
      
      // Sustabdyti timer
      if (testDataTimerRef.current) {
        clearInterval(testDataTimerRef.current);
        testDataTimerRef.current = null;
      }
      
      const actualTime = testDataStartTimeRef.current ? Math.floor((Date.now() - testDataStartTimeRef.current) / 1000) : 0;
      
      setMessage({
        type: 'success',
        text: response.data.message || `Sukurta ${response.data.stats?.orders || 0} užsakymų ir ${response.data.stats?.invoices || 0} sąskaitų per ${actualTime}s`
      });
      
      if (response.data.errors && response.data.errors.length > 0) {
        setMessage({
          type: 'error',
          text: `Sukurta, bet buvo klaidų: ${response.data.errors.join(', ')}`
        });
      }
    } catch (error: any) {
      // Sustabdyti timer
      if (testDataTimerRef.current) {
        clearInterval(testDataTimerRef.current);
        testDataTimerRef.current = null;
      }
      
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Klaida generuojant testinius duomenis'
      });
    } finally {
      setTestDataLoading(false);
      setTestDataProgress({ elapsed: 0, estimated: 0 });
      testDataStartTimeRef.current = null;
    }
  };

  const handleDeleteTestData = async () => {
    if (!window.confirm('⚠️ DĖMESYS: Bus ištrinti VISI testiniai duomenys (užsakymai ir sąskaitos su "[TEST_DATA]" žyma).\n\nAr tikrai tęsti?')) {
      return;
    }

    setTestDataDeleting(true);
    setMessage(null);

    try {
      const response = await api.post('/core/test-data/delete/');
      setMessage({
        type: 'success',
        text: response.data.message || `Ištrinta ${response.data.stats?.orders_deleted || 0} užsakymų ir ${response.data.stats?.invoices_deleted || 0} sąskaitų`
      });
      
      if (response.data.errors && response.data.errors.length > 0) {
        setMessage({
          type: 'error',
          text: `Ištrinta, bet buvo klaidų: ${response.data.errors.join(', ')}`
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Klaida trinant testinius duomenis'
      });
    } finally {
      setTestDataDeleting(false);
    }
  };
  
  // Cleanup timer komponento išmontavimo metu
  useEffect(() => {
    return () => {
      if (testDataTimerRef.current) {
        clearInterval(testDataTimerRef.current);
        testDataTimerRef.current = null;
      }
    };
  }, []);

  // Invoice Settings
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    id: 0,
    default_vat_rate: '21.00',
    default_payment_term_days: 30,
    invoice_prefix_sales: 'LOG',
    invoice_number_width: 7,
    invoice_footer_text: '',
    auto_numbering: true,
    default_display_options: {
      show_order_type: true,
      show_cargo_info: true,
      show_cargo_weight: true,
      show_cargo_ldm: true,
      show_cargo_dimensions: true,
      show_cargo_properties: true,
      show_carriers: true,
      show_carrier_name: true,
      show_carrier_route: true,
      show_carrier_dates: true,
      show_prices: true,
      show_my_price: true,
      show_other_costs: true,
    },
    notes: '',
  });

  // Order Settings
  const [orderSettings, setOrderSettings] = useState<OrderSettings>({
    id: 0,
    order_prefix: '',
    order_number_width: 3,
    auto_numbering: true,
    my_price_percentage: 15.00,
    payment_terms: '',
    payment_terms_en: '',
    payment_terms_ru: '',
    carrier_obligations: [],
    client_obligations: [],
    notes: '',
  });

  // Expedition Settings
  const [expeditionSettings, setExpeditionSettings] = useState<ExpeditionSettings>({
    id: 0,
    expedition_prefix: 'E',
    expedition_number_width: 5,
    auto_numbering: true,
    payment_terms: '',
    payment_terms_en: '',
    payment_terms_ru: '',
    carrier_obligations: [],
    client_obligations: [],
    notes: '',
    last_expedition_number: null,
    next_expedition_number: null,
  });

  // Warehouse Expedition Settings
  const [warehouseExpeditionSettings, setWarehouseExpeditionSettings] = useState<WarehouseExpeditionSettings>({
    id: 0,
    expedition_prefix: 'WH-',
    expedition_number_width: 5,
    auto_numbering: true,
    last_warehouse_number: null,
    next_warehouse_number: null,
  });

  // Cost Expedition Settings
  const [costExpeditionSettings, setCostExpeditionSettings] = useState<CostExpeditionSettings>({
    id: 0,
    expedition_prefix: 'COST-',
    expedition_number_width: 5,
    auto_numbering: true,
    payment_terms: '',
    payment_terms_en: '',
    payment_terms_ru: '',
    carrier_obligations: [],
    client_obligations: [],
    last_cost_number: null,
    next_cost_number: null,
  });

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    id: 0,
    smtp_enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_use_tls: true,
    smtp_username: '',
    smtp_from_email: '',
    smtp_from_name: '',
    imap_enabled: false,
    imap_host: '',
    imap_port: 993,
    imap_use_ssl: true,
    imap_use_starttls: false,
    imap_username: '',
    imap_password: '',
    imap_folder: 'INBOX',
    imap_sync_interval_minutes: 5,
    // SĄSKAITOS
    email_notify_due_soon_enabled: false,
    email_notify_due_soon_days_before: 3,
    email_notify_due_soon_recipient: 'client',
    email_notify_due_soon_min_amount: 0,
    email_notify_unpaid_enabled: false,
    email_notify_unpaid_interval_days: 7,
    email_notify_unpaid_recipient: 'client',
    email_notify_unpaid_min_amount: 0,
    email_notify_overdue_enabled: false,
    email_notify_overdue_min_days: 1,
    email_notify_overdue_max_days: 365,
    email_notify_overdue_interval_days: 7,
    email_notify_overdue_recipient: 'client',
    email_notify_overdue_min_amount: 0,
    overdue_reminder_mode: 'automatic',
    // UŽSAKYMAI
    email_notify_new_order_enabled: false,
    email_notify_new_order_recipient: 'manager',
    email_notify_order_status_changed_enabled: false,
    email_notify_order_status_changed_recipient: 'manager',
    // EKSPEDICIJOS
    email_notify_new_expedition_enabled: false,
    email_notify_new_expedition_recipient: 'manager',
    email_notify_expedition_status_changed_enabled: false,
    email_notify_expedition_status_changed_recipient: 'manager',
    // MOKĖJIMAI
    email_notify_payment_received_enabled: false,
    email_notify_payment_received_recipient: 'manager',
    email_notify_payment_received_min_amount: 0,
    email_notify_partial_payment_enabled: false,
    email_notify_partial_payment_recipient: 'manager',
    // KRITINĖS SĄSKAITOS
    email_notify_high_amount_invoice_enabled: false,
    email_notify_high_amount_threshold: 10000,
    email_notify_high_amount_recipient: 'manager',
    email_signature: 'TMS Sistema',
    email_auto_generated_notice: 'Šis laiškas sugeneruotas automatiškai. Į jį atsakyti nereikia.',
    email_contact_manager_notice: 'Kilus neaiškumams kreipkitės į vadybininką.',
    email_test_mode: false,
    email_test_recipient: 'info@hotmail.lt',
    toast_duration_ms: 3500,
    toast_position: 'center',
    toast_enable_sound: false,
    toast_success_color: '#28a745',
    toast_error_color: '#dc3545',
    toast_info_color: '#17a2b8',
    notes: '',
  });

  useEffect(() => {
    fetchInvoiceSettings();
    fetchOrderSettings();
    fetchExpeditionSettings();
    fetchWarehouseExpeditionSettings();
    fetchCostExpeditionSettings();
    fetchNotificationSettings();
  }, []);

  const fetchInvoiceSettings = async () => {
    try {
      const response = await api.get('/settings/invoice/current/');
      const data = response.data;
      // Užtikrinti, kad default_display_options turi visas reikalingas vertes
      if (!data.default_display_options) {
        data.default_display_options = {
          show_order_type: true,
          show_cargo_info: true,
          show_cargo_weight: true,
          show_cargo_ldm: true,
          show_cargo_dimensions: true,
          show_cargo_properties: true,
          show_carriers: true,
          show_carrier_name: true,
          show_carrier_route: true,
          show_carrier_dates: true,
          show_prices: true,
          show_my_price: true,
          show_other_costs: true,
        };
      }
      setInvoiceSettings(data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Nėra nustatymų, naudosime numatytąsias vertes
      } else {
        // Error handling - silent fail
      }
    }
  };

  const handleSaveInvoiceSettings = async (settings: InvoiceSettings) => {
    setSaving(true);
    setMessage(null);
    
    try {
      // Pašalinti read_only laukus prieš siuntimą
      const { id, created_at, updated_at, last_invoice_number, next_invoice_number, ...dataToSend } = settings;
      await api.put('/settings/invoice/current/', dataToSend);
      setMessage({ type: 'success', text: 'Sąskaitų nustatymai išsaugoti sėkmingai!' });
      // Atnaujinti duomenis po išsaugojimo
      await fetchInvoiceSettings();
      // Išvalyti next_invoice_number_edit po išsaugojimo
      setInvoiceSettings(prev => ({ ...prev, next_invoice_number_edit: undefined }));
    } catch (error: any) {
      const errorMsg = error.response?.data 
        ? (typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data))
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const fetchOrderSettings = async () => {
    try {
      const response = await api.get('/settings/orders/current/');
      const data = response.data;
      // Užtikrinti, kad visi laukai būtų teisingai užkrauti
      setOrderSettings({
        id: data.id || 0,
        order_prefix: data.order_prefix || '',
        order_number_width: data.order_number_width || 3,
        auto_numbering: data.auto_numbering !== undefined ? data.auto_numbering : true,
        my_price_percentage: data.my_price_percentage || 15.00,
        payment_terms: data.payment_terms || '',
        payment_terms_en: data.payment_terms_en || '',
        payment_terms_ru: data.payment_terms_ru || '',
        carrier_obligations: Array.isArray(data.carrier_obligations) ? data.carrier_obligations : [],
        client_obligations: Array.isArray(data.client_obligations) ? data.client_obligations : [],
        notes: data.notes || '',
        last_order_number: data.last_order_number,
        next_order_number: data.next_order_number,
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // naudosime numatytąsias
      } else {
        // Error handling - silent fail
      }
    }
  };

  const fetchExpeditionSettings = async () => {
    try {
      const response = await api.get('/settings/expedition/current/');
      const data = response.data || {};
      setExpeditionSettings({
        id: data.id || 0,
        expedition_prefix: data.expedition_prefix || 'E',
        expedition_number_width: data.expedition_number_width || 5,
        auto_numbering: data.auto_numbering !== undefined ? data.auto_numbering : true,
        payment_terms: data.payment_terms || '',
        payment_terms_en: data.payment_terms_en || '',
        payment_terms_ru: data.payment_terms_ru || '',
        carrier_obligations: data.carrier_obligations || [],
        client_obligations: data.client_obligations || [],
        notes: data.notes || '',
        last_expedition_number: data.last_expedition_number || null,
        next_expedition_number: data.next_expedition_number || null,
        next_expedition_number_edit: '',
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // nėra ekspedicijų nustatymų – naudoti numatytąsias
      }
    }
  };

  const fetchWarehouseExpeditionSettings = async () => {
    try {
      const response = await api.get('/settings/warehouse-expedition/current/');
      const data = response.data || {};
      setWarehouseExpeditionSettings({
        id: data.id || 0,
        expedition_prefix: data.expedition_prefix || 'WH-',
        expedition_number_width: data.expedition_number_width || 5,
        auto_numbering: data.auto_numbering !== undefined ? data.auto_numbering : true,
        last_warehouse_number: data.last_warehouse_number || null,
        next_warehouse_number: data.next_warehouse_number || null,
        next_warehouse_number_edit: '',
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // nėra sandėlių ekspedicijų nustatymų – naudoti numatytąsias
      }
    }
  };

  const fetchCostExpeditionSettings = async () => {
    try {
      const response = await api.get('/settings/cost-expedition/current/');
      const data = response.data || {};
      setCostExpeditionSettings({
        id: data.id || 0,
        expedition_prefix: data.expedition_prefix || 'COST-',
        expedition_number_width: data.expedition_number_width || 5,
        auto_numbering: data.auto_numbering !== undefined ? data.auto_numbering : true,
        payment_terms: data.payment_terms || '',
        payment_terms_en: data.payment_terms_en || '',
        payment_terms_ru: data.payment_terms_ru || '',
        carrier_obligations: data.carrier_obligations || [],
        client_obligations: data.client_obligations || [],
        last_cost_number: data.last_cost_number || null,
        next_cost_number: data.next_cost_number || null,
        next_cost_number_edit: '',
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // nėra išlaidų nustatymų – naudoti numatytąsias
      }
    }
  };

  const handleSaveOrderSettings = async (settings: OrderSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const {
        id,
        created_at,
        updated_at,
        last_order_number,
        next_order_number,
        ...dataToSend
      } = settings as any;
      if (!dataToSend.carrier_obligations) dataToSend.carrier_obligations = [];
      if (!dataToSend.client_obligations) dataToSend.client_obligations = [];
      await api.put('/settings/orders/current/', dataToSend);
      setMessage({ type: 'success', text: 'Užsakymų nustatymai išsaugoti sėkmingai!' });
      await fetchOrderSettings();
      setOrderSettings(prev => ({ ...prev, next_order_number_edit: undefined }));
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };
 
   const handleSaveExpeditionSettings = async (settings: ExpeditionSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const {
        id,
        created_at,
        updated_at,
        last_expedition_number,
        next_expedition_number,
        ...payload
      } = settings as any;

      if (!payload.next_expedition_number_edit) {
        payload.next_expedition_number_edit = '';
      }
      if (!payload.carrier_obligations) payload.carrier_obligations = [];
      if (!payload.client_obligations) payload.client_obligations = [];

      await api.put('/settings/expedition/current/', payload);
      setMessage({ type: 'success', text: 'Ekspedicijos nustatymai išsaugoti sėkmingai!' });
      await fetchExpeditionSettings();
      setExpeditionSettings(prev => ({ ...prev, next_expedition_number_edit: '' }));
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWarehouseExpeditionSettings = async (settings: WarehouseExpeditionSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const {
        id,
        created_at,
        updated_at,
        ...payload
      } = settings as any;

      await api.put('/settings/warehouse-expedition/current/', payload);
      setMessage({ type: 'success', text: 'Sandėlių ekspedicijos nustatymai išsaugoti sėkmingai!' });
      await fetchWarehouseExpeditionSettings();
      setWarehouseExpeditionSettings(prev => ({ ...prev, next_warehouse_number_edit: '' }));
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCostExpeditionSettings = async (settings: CostExpeditionSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const {
        id,
        created_at,
        updated_at,
        ...payload
      } = settings as any;

      await api.put('/settings/cost-expedition/current/', payload);
      setMessage({ type: 'success', text: 'Išlaidų numeravimo nustatymai išsaugoti sėkmingai!' });
      await fetchCostExpeditionSettings();
      setCostExpeditionSettings(prev => ({ ...prev, next_cost_number_edit: '' }));
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const response = await api.get('/settings/notifications/current/');
      const data = response.data || {};
      setNotificationSettings((prev) => ({
        ...prev,
        ...data,
        // Užtikrinti, kad visi SMTP/IMAP laukai būtų išsaugoti
        smtp_enabled: data.smtp_enabled ?? prev.smtp_enabled ?? false,
        smtp_host: data.smtp_host ?? prev.smtp_host ?? '',
        smtp_port: data.smtp_port ?? prev.smtp_port ?? 587,
        smtp_use_tls: data.smtp_use_tls ?? prev.smtp_use_tls ?? true,
        smtp_username: data.smtp_username ?? prev.smtp_username ?? '',
        smtp_from_email: data.smtp_from_email ?? prev.smtp_from_email ?? '',
        smtp_from_name: data.smtp_from_name ?? prev.smtp_from_name ?? '',
        imap_enabled: data.imap_enabled ?? prev.imap_enabled ?? false,
        imap_host: data.imap_host ?? prev.imap_host ?? '',
        imap_port: data.imap_port ?? prev.imap_port ?? 993,
        imap_use_ssl: data.imap_use_ssl ?? prev.imap_use_ssl ?? true,
        imap_use_starttls: data.imap_use_starttls ?? prev.imap_use_starttls ?? false,
        imap_username: data.imap_username ?? prev.imap_username ?? '',
        imap_folder: data.imap_folder ?? prev.imap_folder ?? 'INBOX',
        imap_sync_interval_minutes: data.imap_sync_interval_minutes ?? prev.imap_sync_interval_minutes ?? 5,
        imap_password: '', // Visada tuščias, nes jis nėra grąžinamas iš backend'o
        overdue_reminder_mode: data.overdue_reminder_mode ?? prev.overdue_reminder_mode ?? 'automatic',
      }));
    } catch (error: any) {
      if (error.response?.status === 404) {
        // naudosime numatytąsias
      } else {
        // Error handling - silent fail
        console.error('Error fetching notification settings:', error);
      }
    }
  };

  const handleSaveNotificationSettings = async (settings: NotificationSettings) => {
    setSaving(true);
    setMessage(null);
    try {
      const { id, created_at, updated_at, smtp_password, imap_password, ...dataToSend } = settings as any;
      // Jei slaptažodis nėra nurodytas arba tuščias, nepridėti
      if (smtp_password && smtp_password.trim() !== '') {
        dataToSend.smtp_password = smtp_password;
      }
      if (imap_password && imap_password.trim() !== '') {
        dataToSend.imap_password = imap_password;
      }
      await api.put('/settings/notifications/current/', dataToSend);
      setMessage({ type: 'success', text: 'Pranešimų nustatymai išsaugoti sėkmingai!' });
      await fetchNotificationSettings();
    } catch (error: any) {
      const errorMsg = error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const categories = [
    {
      key: 'ui-nustatymai',
      label: '🎨 UI nustatymai',
      items: [
        { key: 'ui-settings', label: 'Statusų spalvos' },
        { key: 'status-transition-rules', label: 'Statusų perėjimų taisyklės' },
        { key: 'order-auto-status-rules', label: 'Automatinio statusų keitimo taisyklės' }
      ]
    },
    {
      key: 'numeracijos',
      label: '📋 Numeracijos nustatymai',
      items: [
        { key: 'invoice', label: 'Sąskaitų nustatymai' },
        { key: 'orders', label: 'Užsakymų nustatymai' },
        { key: 'expedition', label: 'Ekspedicijos nustatymai' },
        { key: 'warehouse-expedition', label: 'Sandėlių nustatymai' },
        { key: 'cost-expedition', label: 'Pap. išlaidų nustatymai' }
      ]
    },
    {
      key: 'komunikacijos',
      label: '📧 Komunikacijos',
      items: [
        { key: 'email', label: 'El. pašto nustatymai' },
        { key: 'email-templates', label: 'El. laiškų šablonai' },
        { key: 'notifications', label: 'Pranešimai' },
        { key: 'sender-management', label: 'Siuntėjų valdymas' }
      ]
    },
    {
      key: 'duomenu-valdymas',
      label: '💾 Duomenų valdymas',
      items: [
        { key: 'bank-import', label: 'Banko importas' },
        { key: 'data-export', label: 'Duomenų eksportas' },
        { key: 'data-import', label: 'Duomenų importas' },
        { key: 'payment-import', label: 'Mokėjimų importavimas' }
      ]
    },
    {
      key: 'sistema',
      label: '⚙️ Sistema',
      items: [
        { key: 'autocomplete', label: 'Autocomplete pasiūlymai' },
        { key: 'route-contacts', label: 'Siuntėjų/Gavėjų valdymas' },
        { key: 'test-data', label: 'Testiniai duomenys' }
      ]
    }
  ];

  return (
    <div className="page">
      <div className="container settings-container">
        <div className="settings-layout">
          {/* Sidebar */}
          <div className="settings-sidebar">
            {categories.map((category) => (
              <div key={category.key} className="settings-category">
          <button
                  className="settings-category-header"
                  onClick={() => toggleCategory(category.key)}
          >
                  <span>{category.label}</span>
                  <span className="category-arrow">
                    {expandedCategories[category.key] ? '▼' : '▶'}
                  </span>
          </button>
                {expandedCategories[category.key] && (
                  <div className="settings-category-items">
                    {category.items.map((item) => (
          <button
                        key={item.key}
                        className={`settings-category-item ${activeSection === item.key ? 'active' : ''}`}
                        onClick={() => setActiveSection(item.key as any)}
          >
                        {item.label}
          </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>

          {/* Content */}
          <div className="settings-content">

        {/* UI Settings Section */}
        {activeSection === 'ui-settings' && (
          <UISettingsForm />
        )}

        {/* Message */}
        {message && (
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Invoice Settings Section */}
        {activeSection === 'invoice' && (
          <InvoiceSettingsForm
            invoiceSettings={invoiceSettings}
            onUpdate={setInvoiceSettings}
            onSave={handleSaveInvoiceSettings}
            onMessage={setMessage}
            saving={saving}
                      />
        )}

        {/* Order Settings Section */}
        {activeSection === 'orders' && (
          <OrderSettingsForm
            orderSettings={orderSettings}
            onUpdate={setOrderSettings}
            onSave={handleSaveOrderSettings}
            onMessage={setMessage}
            saving={saving}
          />
        )}

        {/* Expedition Settings Section */}
        {activeSection === 'expedition' && (
          <ExpeditionSettingsForm
            expeditionSettings={expeditionSettings}
            onUpdate={setExpeditionSettings}
            onSave={handleSaveExpeditionSettings}
            saving={saving}
          />
        )}

        {/* Warehouse Expedition Settings Section */}
        {activeSection === 'warehouse-expedition' && (
          <WarehouseExpeditionSettingsForm
            warehouseSettings={warehouseExpeditionSettings}
            onUpdate={setWarehouseExpeditionSettings}
            onSave={handleSaveWarehouseExpeditionSettings}
            saving={saving}
          />
        )}

        {/* Cost Expedition Settings Section */}
        {activeSection === 'cost-expedition' && (
          <CostExpeditionSettingsForm
            costSettings={costExpeditionSettings}
            onUpdate={setCostExpeditionSettings}
            onSave={handleSaveCostExpeditionSettings}
            saving={saving}
          />
        )}

        {/* Notification Settings Section */}
        {activeSection === 'email' && (
          <NotificationSettingsForm
            notificationSettings={notificationSettings}
            onUpdate={setNotificationSettings}
            onSave={handleSaveNotificationSettings}
            saving={saving}
            mode="email"
          />
        )}

        {/* Email Templates Section */}
        {activeSection === 'email-templates' && (
          <EmailTemplatesForm />
        )}

        {/* UI Notification Settings Section */}
        {activeSection === 'notifications' && (
          <NotificationSettingsForm
            notificationSettings={notificationSettings}
            onUpdate={setNotificationSettings}
            onSave={handleSaveNotificationSettings}
            saving={saving}
            mode="notifications"
                      />
        )}

        {activeSection === 'sender-management' && (
          <SenderManagementSection />
        )}

        {/* Old Invoice Settings Section - REMOVED - now using InvoiceSettingsForm component */}

        {/* Order Settings Section - REMOVED - now using OrderSettingsForm component */}

        {/* Bank Import Section - INTERACTIVE MODE */}
        {activeSection === 'bank-import' && (
          <BankImportInteractiveSection />
        )}

        {/* Data Import Section */}
        {activeSection === 'data-import' && (
          // eslint-disable-next-line react/jsx-pascal-case
          <DataImportSection_NEW />
        )}

        {/* Data Export Section */}
        {activeSection === 'data-export' && (
          <DataExportSection />
        )}

        {/* Payment Import Section */}
        {activeSection === 'payment-import' && (
          <PaymentImportSection />
        )}

        {/* Notification Settings Section */}
        {/* Autocomplete Suggestions Section */}
        {activeSection === 'autocomplete' && (
          <AutocompleteSuggestionsSection />
        )}

        {/* Route Contacts Section */}
        {activeSection === 'route-contacts' && (
          <RouteContactsSection />
        )}

        {/* Notification Settings Section - REMOVED - now using NotificationSettingsForm component */}

        {/* PVM Rate Form Modal - REMOVED - now using PvmRateFormModal component */}

        {/* Test Data Section */}
        {activeSection === 'test-data' && (
          <div className="settings-section">
            <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>Testinių duomenų valdymas</h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
              Generuojami testiniai duomenys su įvairiomis variacijomis: užsakymai su visais laukais,
              sąskaitos su skirtingomis būsenomis (vėluojančios, apmokėtos, neapmokėtos).
              Naudojami esami partneriai, vežėjai ir vadybininkai iš duomenų bazės.
            </p>
            
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '15px' }}>Generuoti testinius duomenis</h3>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
                  Užsakymų skaičius:
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={testDataCount}
                  onChange={(e) => setTestDataCount(parseInt(e.target.value) || 100)}
                  style={{ width: '150px', padding: '6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </div>
              <button
                type="button"
                className="button"
                onClick={handleGenerateTestData}
                disabled={testDataLoading}
                style={{ backgroundColor: '#28a745', color: 'white', marginBottom: '15px' }}
              >
                {testDataLoading ? 'Generuojama...' : 'Sukurti testinius duomenis'}
              </button>
              
              {/* Progress bar su laiku */}
              {testDataLoading && (
                <div style={{ 
                  marginTop: '15px', 
                  padding: '15px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '10px',
                    fontSize: '14px'
                  }}>
                    <span style={{ fontWeight: 'bold', color: '#495057' }}>
                      Eiga: {testDataProgress.elapsed}s
                    </span>
                    {testDataProgress.estimated > 0 && (
                      <span style={{ color: '#6c757d', fontSize: '12px' }}>
                        Apytikris laikas: ~{testDataProgress.estimated}s
                      </span>
                    )}
                  </div>
                  
                  {/* Progress bar */}
                  <div style={{
                    width: '100%',
                    height: '20px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: testDataProgress.estimated > 0 
                        ? `${Math.min(100, (testDataProgress.elapsed / testDataProgress.estimated) * 100)}%`
                        : '0%',
                      height: '100%',
                      backgroundColor: '#28a745',
                      transition: 'width 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>
                      {testDataProgress.estimated > 0 
                        ? `${Math.min(100, Math.round((testDataProgress.elapsed / testDataProgress.estimated) * 100))}%`
                        : '0%'}
                    </div>
                  </div>
                  
                  <div style={{ 
                    marginTop: '8px', 
                    fontSize: '12px', 
                    color: '#6c757d',
                    textAlign: 'center'
                  }}>
                    Kuriami {testDataCount} užsakymai...
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '15px', color: '#dc3545' }}>Ištrinti testinius duomenis</h3>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                ⚠️ DĖMESYS: Bus ištrinti VISI testiniai duomenys (užsakymai ir sąskaitos su "[TEST_DATA]" žyma).
                Esami duomenys nebus paveikti.
              </p>
              <button
                type="button"
                className="button"
                onClick={handleDeleteTestData}
                disabled={testDataDeleting}
                style={{ backgroundColor: '#dc3545', color: 'white' }}
              >
                {testDataDeleting ? 'Ištrinama...' : 'Ištrinti testinius duomenis'}
              </button>
            </div>
          </div>
        )}

        {/* Status Transition Rules Section */}
        {activeSection === 'status-transition-rules' && (
          <StatusTransitionRulesSection />
        )}

        {/* Order Auto Status Settings Section - DEPRECATED */}
        {/* Pašalinta - naudojama tik OrderAutoStatusRulesSection */}

        {/* Order Auto Status Rules Section */}
        {activeSection === 'order-auto-status-rules' && (
          <OrderAutoStatusRulesSection />
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
