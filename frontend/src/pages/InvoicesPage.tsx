import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
// import OrderDetailsModal from '../components/orders/OrderDetailsModal'; // Naikinimui
import OrderEditModal_NEW from '../components/orders/OrderEditModal_NEW';
import SalesInvoiceModal_NEW from '../components/invoices/SalesInvoiceModal_NEW';
import PurchaseInvoiceModal_NEW from '../components/invoices/PurchaseInvoiceModal_NEW';
// TODO: Seni modalai - bus ištrinti
// import PurchaseInvoiceEditModal from '../components/invoices/PurchaseInvoiceEditModal_OLD';
// import PurchaseInvoiceDetailsModal from '../components/invoices/PurchaseInvoiceDetailsModal_OLD';
import { SkeletonTable } from '../components/common/SkeletonLoader';
import HTMLPreviewModal, { HTMLPreview } from '../components/common/HTMLPreviewModal';
import { useUISettings } from '../hooks/useUISettings';
import './InvoicesPage.css';

// Helper funkcija datos formatavimui
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  
  try {
    // Pašalinti bet kokius tarpus ir neteisingus simbolius
    let cleanDate = dateString.trim();
    
    // Patikrinti, ar yra neteisingas formatas su 3+ skaitmenimis dienos vietoje (pvz., "2025-12-130")
    const dateMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{2,})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      let day = parseInt(dateMatch[3]);
      
      // Jei diena yra didesnė nei 31, tai tikriausiai yra klaida
      // Pavyzdžiui, "2025-12-130" - tai gali būti "13" + "0" (13 diena)
      // Arba "2025-12-110" - tai gali būti "11" + "0" (11 diena)
      if (day > 31) {
        const dayStr = dateMatch[3];
        // Bandyti paimti pirmus 2 skaitmenis (pvz., "130" -> "13", "110" -> "11")
        const firstTwo = parseInt(dayStr.substring(0, 2));
        if (firstTwo <= 31 && firstTwo > 0) {
          day = firstTwo;
        } else {
          // Jei pirmi 2 skaitmenys neteisingi, bandyti paimti paskutinius 2
          const lastTwo = parseInt(dayStr.substring(dayStr.length - 2));
          if (lastTwo <= 31 && lastTwo > 0) {
            day = lastTwo;
          } else {
            // Fallback: paimti pirmus 2 skaitmenis bet kokiu atveju
            day = firstTwo > 0 ? firstTwo : 1;
          }
        }
      }
      
      // Užtikrinti, kad diena būtų tarp 1 ir 31
      if (day < 1 || day > 31) {
        day = 1; // Fallback
      }
      
      cleanDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // Bandyti parsinti datą
    const date = new Date(cleanDate);
    if (isNaN(date.getTime())) {
      // Jei nepavyko, bandyti iš kitų formatų
      const dateParts = cleanDate.split(/[-/]/);
      if (dateParts.length === 3) {
        const year = dateParts[0];
        const month = dateParts[1].padStart(2, '0');
        const day = dateParts[2].padStart(2, '0');
        const newDate = new Date(`${year}-${month}-${day}`);
        if (!isNaN(newDate.getTime())) {
          return newDate.toLocaleDateString('lt-LT');
        }
      }
      return cleanDate; // Jei vis dar nepavyko, grąžinti originalią
    }
    
    return date.toLocaleDateString('lt-LT');
  } catch (e) {
    return dateString; // Jei klaida, grąžinti originalią
  }
};

// Tooltip komponentas sąskaitos sumai su informacija ir papildomomis išlaidomis
const InvoiceAmountTooltip: React.FC<{ 
  invoice: SalesInvoice;
  children: React.ReactNode;
}> = ({ invoice, children }) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Patikrinti, ar yra susijęs užsakymas ir papildomos išlaidos
  const relatedOrder = invoice.related_order;
  const otherCosts = relatedOrder?.other_costs || [];
  const hasOtherCosts = otherCosts.length > 0;

  // Skaičiuoti, kiek liko iki termino apmokėti
  const getDaysUntilDue = (): string => {
    // PIRMA patikrinti, ar sąskaita apmokėta
    if (invoice.payment_status === 'paid') {
      return t('orders.tooltips.paid');
    }
    
    if (!invoice.due_date) {
      return t('orders.tooltips.no_invoice');
    }
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dueDate = new Date(invoice.due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff < 0) {
        return t('orders.tooltips.overdue', { days: Math.abs(daysDiff) });
      } else if (daysDiff === 0) {
        return t('orders.tooltips.due_today');
      } else {
        return t('orders.tooltips.days_left', { days: daysDiff });
      }
    } catch (e) {
      return '-';
    }
  };

  useEffect(() => {
    if (showTooltip && containerRef.current) {
      // Pirmiausia nustatyti pradinę poziciją
      const containerRect = containerRef.current.getBoundingClientRect();
      const initialTop = containerRect.bottom + 5;
      const initialLeft = containerRect.left + (containerRect.width / 2);
      setTooltipPosition({ top: initialTop, left: initialLeft });
      
      // Tada atnaujinti poziciją, kai tooltip'as jau atvaizduotas
      const updatePosition = () => {
        if (containerRef.current && tooltipRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const tooltipRect = tooltipRef.current.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          // Apskaičiuoti poziciją
          let top = containerRect.bottom + 5;
          let left = containerRect.left + (containerRect.width / 2);
          
          // Patikrinti, ar telpa žemiau
          if (top + tooltipRect.height > viewportHeight - 10) {
            // Jei netelpa žemiau, rodyti viršuje
            top = containerRect.top - tooltipRect.height - 5;
            if (top < 10) {
              // Jei netelpa viršuje, rodyti viduryje ekrano
              top = Math.max(10, (viewportHeight - tooltipRect.height) / 2);
            }
          }
          
          // Patikrinti horizontalų pozicionavimą
          if (left + tooltipRect.width / 2 > viewportWidth - 10) {
            left = viewportWidth - tooltipRect.width / 2 - 10;
          }
          if (left - tooltipRect.width / 2 < 10) {
            left = tooltipRect.width / 2 + 10;
          }
          
          setTooltipPosition({ top, left });
        }
      };
      
      // Palaukti, kol tooltip'as bus atvaizduotas
      setTimeout(updatePosition, 10);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setTooltipPosition(null);
    }
  }, [showTooltip]);

  // Rodyti tooltip tik jei yra susijęs užsakymas
  if (!relatedOrder) {
    return <>{children}</>;
  }

  return (
    <div 
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ cursor: 'help' }}>
        {children}
      </div>
      {showTooltip && tooltipPosition && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateX(-50%)',
            padding: '10px 12px',
            backgroundColor: '#333',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '11px',
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            maxWidth: '300px',
            whiteSpace: 'normal',
            minWidth: '200px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 'bold', borderBottom: '1px solid #555', paddingBottom: '4px' }}>
            Sąskaitos informacija:
          </div>
          <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
            <div><strong>Sąskaitos numeris:</strong> {invoice.invoice_number}</div>
            <div><strong>Išrašymo data:</strong> {formatDate(invoice.issue_date)}</div>
            <div><strong>Terminas apmokėti:</strong> {getDaysUntilDue()}</div>
          </div>
          {hasOtherCosts && (
            <>
              <div style={{ marginTop: '8px', marginBottom: '6px', fontWeight: 'bold', borderTop: '1px solid #555', borderBottom: '1px solid #555', paddingTop: '4px', paddingBottom: '4px' }}>
                Papildomos išlaidos:
              </div>
              {otherCosts.map((cost, idx) => (
                <div key={idx} style={{ marginBottom: idx < otherCosts.length - 1 ? '6px' : '0', lineHeight: '1.4' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{cost.description || 'Nenurodyta'}</div>
                  <div>{parseFloat(String(cost.amount || 0)).toFixed(2)} EUR</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Tooltip komponentas pirkimo sąskaitos sumai su informacija
const PurchaseInvoiceAmountTooltip: React.FC<{ 
  invoice: PurchaseInvoice;
  children: React.ReactNode;
}> = ({ invoice, children }) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Skaičiuoti, kiek liko iki termino apmokėti
  const getDaysUntilDue = (): string => {
    // PIRMA patikrinti, ar sąskaita apmokėta
    if (invoice.payment_status === 'paid') {
      return t('orders.tooltips.paid');
    }
    
    if (!invoice.due_date) {
      return t('orders.tooltips.no_invoice');
    }
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dueDate = new Date(invoice.due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff < 0) {
        return t('orders.tooltips.overdue', { days: Math.abs(daysDiff) });
      } else if (daysDiff === 0) {
        return t('orders.tooltips.due_today');
      } else {
        return t('orders.tooltips.days_left', { days: daysDiff });
      }
    } catch (e) {
      return '-';
    }
  };

  useEffect(() => {
    if (showTooltip && containerRef.current) {
      // Pirmiausia nustatyti pradinę poziciją
      const containerRect = containerRef.current.getBoundingClientRect();
      const initialTop = containerRect.bottom + 5;
      const initialLeft = containerRect.left + (containerRect.width / 2);
      setTooltipPosition({ top: initialTop, left: initialLeft });
      
      // Tada atnaujinti poziciją, kai tooltip'as jau atvaizduotas
      const updatePosition = () => {
        if (containerRef.current && tooltipRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const tooltipRect = tooltipRef.current.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          // Apskaičiuoti poziciją
          let top = containerRect.bottom + 5;
          let left = containerRect.left + (containerRect.width / 2);
          
          // Patikrinti, ar telpa žemiau
          if (top + tooltipRect.height > viewportHeight - 10) {
            // Jei netelpa žemiau, rodyti viršuje
            top = containerRect.top - tooltipRect.height - 5;
            if (top < 10) {
              // Jei netelpa viršuje, rodyti viduryje ekrano
              top = Math.max(10, (viewportHeight - tooltipRect.height) / 2);
            }
          }
          
          // Patikrinti horizontalų pozicionavimą
          if (left + tooltipRect.width / 2 > viewportWidth - 10) {
            left = viewportWidth - tooltipRect.width / 2 - 10;
          }
          if (left - tooltipRect.width / 2 < 10) {
            left = tooltipRect.width / 2 + 10;
          }
          
          setTooltipPosition({ top, left });
        }
      };
      
      // Palaukti, kol tooltip'as bus atvaizduotas
      setTimeout(updatePosition, 10);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    } else {
      setTooltipPosition(null);
    }
  }, [showTooltip]);

  return (
    <div 
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ cursor: 'help' }}>
        {children}
      </div>
      {showTooltip && tooltipPosition && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateX(-50%)',
            padding: '10px 12px',
            backgroundColor: '#333',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '11px',
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            maxWidth: '300px',
            whiteSpace: 'normal',
            minWidth: '200px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 'bold', borderBottom: '1px solid #555', paddingBottom: '4px' }}>
            Sąskaitos informacija:
          </div>
          <div style={{ marginBottom: '6px', lineHeight: '1.5' }}>
            <div><strong>Suma be PVM:</strong> {parseFloat(invoice.amount_net || '0').toFixed(2)} €</div>
            <div><strong>Suma su PVM:</strong> {parseFloat(invoice.amount_total || invoice.amount_net || '0').toFixed(2)} €</div>
            <div><strong>Gavimo data:</strong> {formatDate(invoice.received_date)}</div>
            <div><strong>Terminas apmokėti:</strong> {getDaysUntilDue()}</div>
          </div>
        </div>
      )}
    </div>
  );
};

interface Partner {
  id: number;
  name: string;
  code?: string;
}

interface OtherCost {
  description: string;
  amount: number;
}

interface Order {
  id: number;
  order_number: string;
  client?: Partner;
  client_price_net?: string | number | null;
  calculated_client_price_net?: string | number | null;
  vat_rate?: string | number | null;
  other_costs?: OtherCost[];
}

interface ExpenseCategory {
  id: number;
  name: string;
}

interface InvoiceItem {
  description: string;
  amount_net: number;
  vat_amount: number;
  amount_total: number;
  vat_rate: number;
  visible?: boolean; // Ar rodoma HTML peržiūroje
}

interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
}

interface SalesInvoice {
  id: number;
  invoice_number: string;
  invoice_type: 'pre_invoice' | 'final' | 'credit' | 'proforma';
  invoice_type_display?: string;
  partner: Partner;
  partner_id?: number;
  related_order: Order | null;
  related_order_id?: number | null;
  related_orders?: any[]; // Pridėta
  credit_invoice?: number | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  vat_rate_article?: string;
  amount_total?: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  overdue_days?: number;
  notes: string;
  invoice_items?: InvoiceItem[];
  manual_lines?: Array<{ description: string; amount_net: string | number; vat_rate?: string | number; vat_rate_article?: string }>;
  display_options?: {
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
  created_at?: string;
  updated_at?: string;
}

interface PurchaseInvoice {
  id: number;
  invoice_number: string | null;
  received_invoice_number: string;
  partner: Partner;
  partner_id?: number;
  related_order: Order | null;
  related_order_id?: number | null;
  related_orders?: Array<{ id: number; order_number: string; order_date?: string; amount_net?: string | null }>; // ManyToMany relationship
  expense_category: ExpenseCategory | null;
  expense_category_id?: number | null;
  payment_status: 'unpaid' | 'paid' | 'overdue' | 'partially_paid';
  payment_status_display?: string;
  amount_net: string;
  vat_rate: string;
  amount_total?: string;
  issue_date: string;
  received_date: string | null;
  due_date: string;
  payment_date: string | null;
  invoice_file?: string | null;
  invoice_file_url?: string | null;
  overdue_days?: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

// Helper funkcija, kuri tikrina, ar pirkimo sąskaita turi susijusį užsakymą
const hasRelatedOrder = (invoice: PurchaseInvoice): boolean => {
  return !!(invoice.related_order || invoice.related_order_id || (invoice.related_orders && invoice.related_orders.length > 0));
};

// Helper funkcija, kuri grąžina susijusio užsakymo informaciją
const getRelatedOrderInfo = (invoice: PurchaseInvoice): string | null => {
  if (invoice.related_order) {
    return invoice.related_order.order_number || `#${invoice.related_order.id}`;
  }
  if (invoice.related_order_id) {
    return `#${invoice.related_order_id}`;
  }
  if (invoice.related_orders && invoice.related_orders.length > 0) {
    if (invoice.related_orders.length === 1) {
      return invoice.related_orders[0].order_number || `#${invoice.related_orders[0].id}`;
    }
    return `${invoice.related_orders.length} užsakymai`;
  }
  return null;
};

const InvoicesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { getInvoiceColor } = useUISettings();
  const [activeTab, setActiveTab] = useState<'sales' | 'purchase'>('sales');
  
  // Sales invoices state
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesCurrentPage, setSalesCurrentPage] = useState(1);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [salesTotalCount, setSalesTotalCount] = useState<number | null>(null);
  const [purchaseCurrentPage, setPurchaseCurrentPage] = useState(1);
  const [purchaseTotalPages, setPurchaseTotalPages] = useState(1);
  const [purchaseTotalCount, setPurchaseTotalCount] = useState<number | null>(null);
  const [userSettingsLoaded, setUserSettingsLoaded] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('invoicesPageSize');
    if (saved) return parseInt(saved, 10);
    return 100;
  });
  const salesFiltersInitial = {
    payment_status: '',
    invoice_type: '',
    partner_id: '',
    issue_date_from: '',
    issue_date_to: '',
    due_date_from: '',
    due_date_to: '',
    search: '',
  };
  const purchaseFiltersInitial = {
    payment_status: '',
    partner_id: '',
    expense_category_id: '',
    issue_date_from: '',
    issue_date_to: '',
    due_date_from: '',
    due_date_to: '',
    search: '',
  };
  const salesPrevFiltersRef = useRef(salesFiltersInitial);
  const purchasePrevFiltersRef = useRef(purchaseFiltersInitial);
  const prevPageSizeRef = useRef(pageSize);
  const [salesFilters, setSalesFilters] = useState(salesFiltersInitial);
  const [showSalesFilters, setShowSalesFilters] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<HTMLPreview | null>(null);
  const [htmlPreviewInvoiceId, setHtmlPreviewInvoiceId] = useState<number | null>(null);
  const [htmlPreviewLang, setHtmlPreviewLang] = useState<string>('lt');

  const fetchHtmlPreview = async (id: number, lang: string = 'lt') => {
    try {
      const { api } = await import('../services/api');
      const response = await api.get(`/invoices/sales/${id}/preview/`, {
        params: { lang },
        responseType: 'text',
      });
      setHtmlPreview({
        title: `Sąskaita ${id}`,
        htmlContent: response.data
      });
      setHtmlPreviewInvoiceId(id);
      setHtmlPreviewLang(lang);
    } catch (error: any) {
      showToast('error', 'Nepavyko atidaryti peržiūros');
    }
  };
  // Unified modal state
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [currentSalesInvoice, setCurrentSalesInvoice] = useState<SalesInvoice | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [currentPurchaseInvoice, setCurrentPurchaseInvoice] = useState<PurchaseInvoice | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [selectedPartnerName, setSelectedPartnerName] = useState('');
  
  // Purchase invoices state
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseFilters, setPurchaseFilters] = useState(purchaseFiltersInitial);
  const [showPurchaseFilters, setShowPurchaseFilters] = useState(false);
  
  // Order details modal state
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  
  // TODO: purchaseFormData - galbūt dar naudojamas kitur, paliekame kol kas
  const [purchaseFormData, setPurchaseFormData] = useState({
    partner_id: '',
    related_order_id: '',
    order_carrier_id: '', // ID užsakymo vežėjo, jei sąskaita kuriama iš vežėjo
    expense_category_id: '',
    received_invoice_number: '',
    payment_status: 'unpaid',
    amount_net: '',
    vat_rate: '21.00',
    issue_date: new Date().toISOString().split('T')[0],
    received_date: new Date().toISOString().split('T')[0],
    due_date: (() => {
      const issueDate = new Date();
      const due = new Date(issueDate);
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      return due.toISOString().split('T')[0];
    })(),
    payment_date: '',
    invoice_file: null as File | null,
    notes: '',
  });
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [expenseCategorySearch, setExpenseCategorySearch] = useState('');
  const [filteredExpenseCategories, setFilteredExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showExpenseCategoryDropdown, setShowExpenseCategoryDropdown] = useState(false);
  const [selectedExpenseCategoryName, setSelectedExpenseCategoryName] = useState('');

  // PVM Rates
  const [pvmRates, setPvmRates] = useState<PVMRate[]>([]);

  // Invoice settings (for default display_options and next number hint)
  const [invoiceSettings, setInvoiceSettings] = useState<{
    last_invoice_number?: string | null;
    next_invoice_number?: string;
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
  } | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({ type: 'info', message: '', visible: false });
  const toastTimeoutRef = useRef<number | null>(null);
  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setToast({ type, message, visible: true });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), timeoutMs);
  }, []);
  
  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title?: string; message?: string; onConfirm?: () => void }>({ open: false });

  // Function to open order details modal
  const handleOpenOrderDetails = useCallback(async (orderId: number | string) => {
    try {
      setShowOrderDetails(true);
      // Užkrauti užsakymą iš API
      const response = await api.get(`/orders/orders/${orderId}/`);
      setSelectedOrderForDetails(response.data);
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Klaida užkraunant užsakymą');
      setShowOrderDetails(false);
    }
  }, [showToast]);

  // Fetch invoice settings
  const fetchPvmRates = useCallback(async () => {
    try {
      const response = await api.get('/settings/pvm-rates/?is_active=true');
      setPvmRates(response.data.results || response.data || []);
    } catch (error) {
    }
  }, []);

  const fetchInvoiceSettings = useCallback(async () => {
    try {
      const response = await api.get('/settings/invoice/current/');
      setInvoiceSettings(response.data);
    } catch (error) {
    }
  }, []);

  // Fetch PVM rates

  // Fetch sales invoices
  const fetchSalesInvoices = useCallback(async () => {
    setSalesLoading(true);
    try {
      const params: any = {
        page_size: pageSize,
        page: salesCurrentPage,
      };
      if (salesFilters.payment_status) params.payment_status = salesFilters.payment_status;
      if (salesFilters.invoice_type) params.invoice_type = salesFilters.invoice_type;
      if (salesFilters.partner_id) params.partner = salesFilters.partner_id;
      if (salesFilters.issue_date_from) params.issue_date__gte = salesFilters.issue_date_from;
      if (salesFilters.issue_date_to) params.issue_date__lte = salesFilters.issue_date_to;
      if (salesFilters.due_date_from) params.due_date__gte = salesFilters.due_date_from;
      if (salesFilters.due_date_to) params.due_date__lte = salesFilters.due_date_to;
      if (salesFilters.search) params.search = salesFilters.search;
      
      params.ordering = '-issue_date,-created_at';
      const response = await api.get('/invoices/sales/', { params });
      
      if (response.data.results && Array.isArray(response.data.results)) {
        setSalesInvoices(response.data.results);
        if (response.data.count !== undefined) {
          setSalesTotalCount(response.data.count);
          const totalPages = Math.ceil(response.data.count / pageSize);
          setSalesTotalPages(totalPages > 0 ? totalPages : 1);
        } else {
          setSalesTotalCount(response.data.results.length);
          setSalesTotalPages(1);
        }
      } else if (Array.isArray(response.data)) {
        setSalesInvoices(response.data);
        setSalesTotalCount(response.data.length);
        setSalesTotalPages(1);
      } else {
        setSalesInvoices([]);
        setSalesTotalCount(0);
        setSalesTotalPages(1);
      }
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Klaida užkraunant pardavimo sąskaitas');
      setSalesInvoices([]);
      setSalesTotalCount(null);
    } finally {
      setSalesLoading(false);
    }
  }, [salesFilters, pageSize, salesCurrentPage, showToast]);

  // Fetch purchase invoices
  const fetchPurchaseInvoices = useCallback(async () => {
    setPurchaseLoading(true);
    try {
      const params: any = {
        page_size: pageSize,
        page: purchaseCurrentPage,
      };
      if (purchaseFilters.payment_status) params.payment_status = purchaseFilters.payment_status;
      if (purchaseFilters.partner_id) params.partner = purchaseFilters.partner_id;
      if (purchaseFilters.expense_category_id) params.expense_category = purchaseFilters.expense_category_id;
      if (purchaseFilters.issue_date_from) params.issue_date__gte = purchaseFilters.issue_date_from;
      if (purchaseFilters.issue_date_to) params.issue_date__lte = purchaseFilters.issue_date_to;
      if (purchaseFilters.due_date_from) params.due_date__gte = purchaseFilters.due_date_from;
      if (purchaseFilters.due_date_to) params.due_date__lte = purchaseFilters.due_date_to;
      if (purchaseFilters.search) params.search = purchaseFilters.search;
      
      params.ordering = '-issue_date,-created_at';
      const response = await api.get('/invoices/purchase/', { params });
      
      if (response.data.results && Array.isArray(response.data.results)) {
        setPurchaseInvoices(response.data.results);
        if (response.data.count !== undefined) {
          setPurchaseTotalCount(response.data.count);
          const totalPages = Math.ceil(response.data.count / pageSize);
          setPurchaseTotalPages(totalPages > 0 ? totalPages : 1);
        } else {
          setPurchaseTotalCount(response.data.results.length);
          setPurchaseTotalPages(1);
        }
      } else if (Array.isArray(response.data)) {
        setPurchaseInvoices(response.data);
        setPurchaseTotalCount(response.data.length);
        setPurchaseTotalPages(1);
      } else {
        setPurchaseInvoices([]);
        setPurchaseTotalCount(0);
        setPurchaseTotalPages(1);
      }
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Klaida užkraunant pirkimo sąskaitas');
      setPurchaseInvoices([]);
      setPurchaseTotalCount(null);
    } finally {
      setPurchaseLoading(false);
    }
  }, [purchaseFilters, pageSize, purchaseCurrentPage, showToast]);

  // Search partners (clients)

  // Search suppliers

  // Search partners
  const searchPartners = useCallback(async (query: string) => {
    if (!query || query === selectedPartnerName) {
      setPartners([]);
      return;
    }

    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, is_client: true, page_size: 20 }
      });
      const results = response.data.results || response.data;
      setPartners(results.filter((p: Partner) => p.name.toLowerCase().includes(query.toLowerCase())));
    } catch (error) {
    }
  }, [selectedPartnerName]);

  // Search suppliers
  const searchSuppliers = useCallback(async (query: string) => {
    if (!query || query === selectedSupplierName) {
      setSuppliers([]);
      return;
    }

    try {
      const response = await api.get('/partners/partners/', {
        params: { search: query, is_supplier: true, page_size: 20 }
      });
      const results = response.data.results || response.data;
      setSuppliers(results.filter((p: Partner) => p.name.toLowerCase().includes(query.toLowerCase())));
    } catch (error) {
    }
  }, [selectedSupplierName]);

  // Fetch expense categories
  useEffect(() => {
    const fetchExpenseCategories = async () => {
      try {
        const response = await api.get('/invoices/expense-categories/');
        const results = response.data.results || response.data;
        setExpenseCategories(results);
      } catch (error) {
      }
    };
    fetchExpenseCategories();
  }, []);

  const ensureExpenseCategoryExists = async (categoryName: string): Promise<number | null> => {
    if (!categoryName || categoryName.trim() === '') return null;

    // Patikrinti ar jau egzistuoja
    const existing = expenseCategories.find(cat =>
      cat.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
    );
    if (existing) {
      return existing.id;
    }

    // Bandyti sukurti naują
    try {
      const response = await api.post('/invoices/expense-categories/', {
        name: categoryName.trim(),
        description: ''
      });
      const newCategory = response.data;

      // Pridėti į sąrašą
      setExpenseCategories(prev => [...prev, newCategory]);

      return newCategory.id;
    } catch (error: any) {
      // Jei kategorija jau egzistuoja (unique constraint), bandyti gauti iš servery
      if (error.response?.status === 400 || error.response?.status === 409) {
        try {
          const response = await api.get('/invoices/expense-categories/', {
            params: { search: categoryName.trim() }
          });
          const categories = response.data.results || response.data || [];
          const found = categories.find((cat: ExpenseCategory) =>
            cat.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
          );
          if (found) {
            setExpenseCategories(prev => {
              if (!prev.find(c => c.id === found.id)) {
                return [...prev, found];
              }
              return prev;
            });
            return found.id;
          }
        } catch (err) {
        }
      }
      return null;
    }
  };

  // Fetch orders for selection
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await api.get('/orders/orders/', { params: { page_size: 50 } });
        const results = response.data.results || response.data;
        setOrders(results);
      } catch (error) {
      }
    };
    fetchOrders();
    fetchInvoiceSettings();
    fetchPvmRates();
  }, [fetchInvoiceSettings, fetchPvmRates]);

  useEffect(() => {
    if (partnerSearch && partnerSearch !== selectedPartnerName) {
      const timeoutId = setTimeout(() => searchPartners(partnerSearch), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setPartners([]);
    }
  }, [partnerSearch, selectedPartnerName, searchPartners]);

  useEffect(() => {
    if (supplierSearch && supplierSearch !== selectedSupplierName) {
      const timeoutId = setTimeout(() => searchSuppliers(supplierSearch), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuppliers([]);
    }
  }, [supplierSearch, selectedSupplierName, searchSuppliers]);

  // Gauti UserSettings ir nustatyti pageSize (jei nėra localStorage)
  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        const response = await api.get('/settings/user/my_settings/');
        if (response.data && response.data.items_per_page) {
          const savedPageSize = localStorage.getItem('invoicesPageSize');
          // Jei nėra localStorage, naudoti UserSettings
          if (!savedPageSize) {
            const userPageSize = response.data.items_per_page;
            setPageSize(userPageSize);
            localStorage.setItem('invoicesPageSize', userPageSize.toString());
          }
        }
        setUserSettingsLoaded(true);
      } catch (error) {
        // Ignoruoti klaidas
        setUserSettingsLoaded(true);
      }
    };
    fetchUserSettings();
  }, []);

  // Reset currentPage į 1, kai keičiasi filtrai arba pageSize
  useEffect(() => {
    const salesFiltersChanged = JSON.stringify(salesPrevFiltersRef.current) !== JSON.stringify(salesFilters);
    const purchaseFiltersChanged = JSON.stringify(purchasePrevFiltersRef.current) !== JSON.stringify(purchaseFilters);
    const pageSizeChanged = prevPageSizeRef.current !== pageSize;
    
    if (salesFiltersChanged || pageSizeChanged) {
      setSalesCurrentPage(1);
    }
    if (purchaseFiltersChanged || pageSizeChanged) {
      setPurchaseCurrentPage(1);
    }
    
    salesPrevFiltersRef.current = salesFilters;
    purchasePrevFiltersRef.current = purchaseFilters;
    prevPageSizeRef.current = pageSize;
  }, [salesFilters, purchaseFilters, pageSize]);

  useEffect(() => {
    if (activeTab === 'sales') {
      fetchSalesInvoices();
    } else {
      fetchPurchaseInvoices();
    }
  }, [activeTab, fetchSalesInvoices, fetchPurchaseInvoices]);


  useEffect(() => {
    if (supplierSearch && supplierSearch !== selectedSupplierName) {
      const timeoutId = setTimeout(() => searchSuppliers(supplierSearch), 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuppliers([]);
    }
  }, [supplierSearch, selectedSupplierName, searchSuppliers]);

  // Filter expense categories based on search
  useEffect(() => {
    if (expenseCategorySearch && expenseCategorySearch !== selectedExpenseCategoryName) {
      const filtered = expenseCategories.filter(cat => 
        cat.name.toLowerCase().includes(expenseCategorySearch.toLowerCase())
      );
      setFilteredExpenseCategories(filtered);
      setShowExpenseCategoryDropdown(true);
    } else {
      setFilteredExpenseCategories([]);
      setShowExpenseCategoryDropdown(false);
    }
  }, [expenseCategorySearch, selectedExpenseCategoryName, expenseCategories]);



  // TODO: resetPurchaseForm - galbūt dar naudojamas, paliekame kol kas
  const resetPurchaseForm = () => {
    setPurchaseFormData({
      partner_id: '',
      related_order_id: '',
      order_carrier_id: '',
      expense_category_id: '',
      received_invoice_number: '',
      payment_status: 'unpaid',
      amount_net: '',
      vat_rate: '21.00',
      issue_date: new Date().toISOString().split('T')[0],
      received_date: new Date().toISOString().split('T')[0],
      due_date: (() => {
        const issueDate = new Date();
        const due = new Date(issueDate);
        // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
        due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
        return due.toISOString().split('T')[0];
      })(),
      payment_date: '',
      invoice_file: null,
      notes: '',
    });
    setSelectedSupplierName('');
    setSupplierSearch('');
    setSelectedExpenseCategoryName('');
    setExpenseCategorySearch('');
  };




  // Handle URL parameters for quick invoice creation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    
    // Patikrinti ar reikia nustatyti tab'ą
    const tab = params.get('tab');
    if (tab === 'sales' || tab === 'purchase') {
      setActiveTab(tab);
    }
    
    // Patikrinti ar reikia atidaryti pardavimo sąskaitą
    const salesId = params.get('sales_id');
    if (salesId) {
      setActiveTab('sales');
      api.get(`/invoices/sales/${salesId}/`).then(response => {
        const invoice = response.data;
        setCurrentSalesInvoice(invoice);
        setShowSalesModal(true);
      }).catch(err => {
        alert('Klaida užkraunant pardavimo sąskaitą');
      });
      // Išvalyti URL
      navigate('/invoices', { replace: true });
      return;
    }
    
    // Patikrinti ar reikia atidaryti pirkimo sąskaitą
    const purchaseId = params.get('purchase_id');
    if (purchaseId) {
      setActiveTab('purchase');
      api.get(`/invoices/purchase/${purchaseId}/`).then(response => {
        const invoice = response.data;
        setCurrentPurchaseInvoice(invoice);
        setShowPurchaseModal(true);
      }).catch(err => {
        alert('Klaida užkraunant pirkimo sąskaitą');
      });
      // Išvalyti URL
      navigate('/invoices', { replace: true });
      return;
    }
    
    // Patikrinti ar reikia atidaryti pirkimo sąskaitos formą iš užsakymo
    if (params.get('create_purchase') === 'true') {
      const orderCarrierId = params.get('order_carrier_id');
      const orderId = params.get('order_id');
      const partnerId = params.get('partner_id');
      const amountNet = params.get('amount_net');
      
      if (orderCarrierId && partnerId) {
        setActiveTab('purchase');
        // Atidaryti modalą su nauju modalu (create mode)
        // Modalas pats užkraus duomenis pagal initial props
        setCurrentPurchaseInvoice(null); // Create mode
        setShowPurchaseModal(true);
        
        // Išvalyti URL po trumpo delay, kad modalas turėtų laiko užkrauti duomenis
        setTimeout(() => {
        navigate('/invoices', { replace: true });
        }, 200);
      }
    }
  }, [location.search, navigate]);
  

  useEffect(() => {
    if (purchaseFormData.issue_date && !purchaseFormData.due_date) {
      const issue = new Date(purchaseFormData.issue_date);
      const due = new Date(issue);
      // Teisingas būdas pridėti dienas - naudoti setTime su milisekundėmis
      due.setTime(due.getTime() + (30 * 24 * 60 * 60 * 1000));
      setPurchaseFormData(prev => ({ ...prev, due_date: due.toISOString().split('T')[0] }));
    }
  }, [purchaseFormData.issue_date, purchaseFormData.due_date]);

  const handleEditSalesInvoice = async (invoice: SalesInvoice) => {
    // Gauti pilną invoice objektą su visais duomenis iš backend (įskaitant related_orders)
    try {
      const response = await api.get(`/invoices/sales/${invoice.id}/`);
      const fullInvoice = response.data;
      setCurrentSalesInvoice(fullInvoice);
      setShowSalesModal(true);
    } catch (error: any) {
      showToast('error', 'Klaida užkraunant sąskaitos duomenis: ' + (error.response?.data?.detail || error.message));
      return;
    }
  };

  const handleEditPurchaseInvoice = async (invoice: PurchaseInvoice) => {
    // Gauti pilną invoice objektą su visais duomenis iš backend
    try {
      const response = await api.get(`/invoices/purchase/${invoice.id}/`);
      const fullInvoice = response.data;
      setCurrentPurchaseInvoice(fullInvoice);
      setShowPurchaseModal(true);
    } catch (error: any) {
      showToast('error', 'Klaida užkraunant sąskaitos duomenis: ' + (error.response?.data?.detail || error.message));
      return;
    }
  };


  const handleViewSalesInvoice = async (invoice: SalesInvoice) => {
    try {
      // Gauti pilną sąskaitos serializer'į (ne list serializer'į)
      const response = await api.get(`/invoices/sales/${invoice.id}/`);
      setCurrentSalesInvoice(response.data);
      setShowSalesModal(true);
    } catch (error: any) {
      showToast('error', 'Nepavyko užkrauti sąskaitos detalių');
      // Fallback - naudoti sąrašo duomenis
      setCurrentSalesInvoice(invoice);
      setShowSalesModal(true);
    }
  };

  const handleViewPurchaseInvoice = async (invoice: PurchaseInvoice) => {
    try {
      // Gauti pilną sąskaitos serializer'į (ne list serializer'į)
      const response = await api.get(`/invoices/purchase/${invoice.id}/`);
      setCurrentPurchaseInvoice(response.data);
      setShowPurchaseModal(true);
    } catch (error: any) {
      showToast('error', 'Nepavyko užkrauti sąskaitos detalių');
      // Fallback - naudoti sąrašo duomenis
      setCurrentPurchaseInvoice(invoice);
      setShowPurchaseModal(true);
    }
  };

  const handleDeleteSalesInvoice = async (invoice: SalesInvoice) => {
    let confirmMessage = `Ar tikrai norite ištrinti pardavimo sąskaitą ${invoice.invoice_number}?`;
    
    // Jei sąskaita turi susijusį užsakymą, pridėti informaciją
    if (invoice.related_order || invoice.related_order_id) {
      const orderInfo = invoice.related_order?.order_number || `#${invoice.related_order_id || invoice.related_order?.id}`;
      confirmMessage = `Ar tikrai norite ištrinti pardavimo sąskaitą ${invoice.invoice_number}?\n\n⚠️ Ši pardavimo sąskaita turi susijusį užsakymą: ${orderInfo}\n\nUžsakymas nebus ištrintas, bet ryšys su pardavimo sąskaita bus pašalintas.`;
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      await api.delete(`/invoices/sales/${invoice.id}/`);
      showToast('success','Pardavimo sąskaita sėkmingai ištrinta.');
      fetchSalesInvoices();
      // Pranešti OrdersPage, kad reikia atnaujinti užsakymų sąrašą
      window.dispatchEvent(new CustomEvent('salesInvoiceDeleted', { detail: { invoiceId: invoice.id } }));
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error','Klaida trinant pardavimo sąskaitą: ' + (details?.error || details ? JSON.stringify(details) : error.message));
    }
  };

  const handleDeletePurchaseInvoice = async (invoice: PurchaseInvoice) => {
    let confirmMessage = `Ar tikrai norite ištrinti pirkimo sąskaitą ${invoice.received_invoice_number}?`;
    
    // Jei sąskaita turi susijusį užsakymą, pridėti informaciją
    const orderInfo = getRelatedOrderInfo(invoice);
    if (orderInfo) {
      confirmMessage = `Ar tikrai norite ištrinti pirkimo sąskaitą ${invoice.received_invoice_number}?\n\n⚠️ Ši pirkimo sąskaita turi susijusį užsakymą: ${orderInfo}\n\nUžsakymas nebus ištrintas, bet ryšys su pirkimo sąskaita bus pašalintas.`;
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      await api.delete(`/invoices/purchase/${invoice.id}/`);
      showToast('success','Pirkimo sąskaita sėkmingai ištrinta.');
      fetchPurchaseInvoices();
    } catch (error: any) {
      const details = error.response?.data;
      showToast('error','Klaida trinant pirkimo sąskaitą: ' + (details?.error || details ? JSON.stringify(details) : error.message));
    }
  };

  // Helper funkcija, kuri nustato, ar teksto spalva turėtų būti tamsi ar šviesi
  const getContrastTextColor = (backgroundColor: string): string => {
    // Pašalinti # ir konvertuoti į RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Apskaičiuoti ryškumą (luminance)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Jei ryškumas > 0.5, naudoti tamsų tekstą, kitu atveju - šviesų
    return luminance > 0.5 ? '#000' : '#fff';
  };

  const getReminderType = (invoice: SalesInvoice | PurchaseInvoice): string | null => {
    // Priminimai siunčiami tik pardavimo sąskaitoms
    if (!('invoice_type' in invoice)) {
      return null;
    }
    
    // Jei sąskaita jau apmokėta, negalime nustatyti tipo
    if (invoice.payment_status === 'paid') {
      return null;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Jei nėra due_date, nustatyti pagal statusą
    if (!invoice.due_date) {
      if (invoice.payment_status === 'overdue') {
        return 'overdue';
      } else if (invoice.payment_status === 'partially_paid') {
        return 'overdue';
      } else {
        return 'unpaid';
      }
    }
    
    // Parsinti due_date
    let dueDate: Date | null = null;
    try {
      dueDate = new Date(invoice.due_date);
      dueDate.setHours(0, 0, 0, 0);
    } catch (e) {
      // Jei nepavyko parsinti, nustatyti pagal statusą
      if (invoice.payment_status === 'overdue') {
        return 'overdue';
      } else if (invoice.payment_status === 'partially_paid') {
        return 'overdue';
      } else {
        return 'unpaid';
      }
    }
    
    // Skaičiuoti dienas iki termino arba po termino
    const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Vėluojama apmokėti - terminas jau praėjo
    if (daysUntilDue < 0) {
      return 'overdue';
    }
    
    // Artėja terminas - dar nepasiekė, bet arti (3 dienos prieš terminą)
    if (daysUntilDue > 0 && daysUntilDue <= 3 && invoice.payment_status === 'unpaid') {
      return 'due_soon';
    }
    
    // Neapmokėta sąskaita - terminas šiandien arba jau praėjo, bet statusas unpaid
    if (invoice.payment_status === 'unpaid') {
      return 'unpaid';
    }
    
    // Vėluojama apmokėti - statusas overdue arba partially_paid
    if (invoice.payment_status === 'overdue' || invoice.payment_status === 'partially_paid') {
      return 'overdue';
    }
    
    // Default - unpaid
    return 'unpaid';
  };
  

  const getReminderButtonText = (reminderType: string | null): string => {
    switch (reminderType) {
      case 'due_soon':
        return 'Siųsti priminimą - artėja terminas';
      case 'unpaid':
        return 'Siųsti priminimą - neapmokėta';
      case 'overdue':
        return 'Siųsti priminimą - vėluojama';
      default:
        return 'Siųsti priminimą';
    }
  };

  const handleSendReminder = async (invoice: SalesInvoice | PurchaseInvoice, reminderType?: string | null) => {
    // Priminimai siunčiami tik pardavimo sąskaitoms
    if (!('invoice_type' in invoice)) {
      showToast('error', 'Priminimai siunčiami tik pardavimo sąskaitoms');
      return;
    }
    
    // Nustatyti priminimo tipą, jei nenurodytas
    if (!reminderType) {
      reminderType = getReminderType(invoice);
    }
    
    if (!reminderType) {
      showToast('error', 'Pardavimo sąskaita jau apmokėta arba negalima nustatyti priminimo tipo');
      return;
    }
    
    try {
      const response = await api.post(`/invoices/sales/${invoice.id}/send_reminder/`, {
        reminder_type: reminderType
      });
        if (response.data.success) {
          showToast('success', 'Priminimas sėkmingai išsiųstas');
        } else {
          showToast('error', response.data.error || 'Nepavyko išsiųsti priminimo');
        }
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message || 'Nepavyko išsiųsti priminimo';
        showToast('error', errorMsg);
    }
  };

  // Komponentas mokėjimo statusui su hover efektu
  const PaymentStatusBadge: React.FC<{ invoice: SalesInvoice | PurchaseInvoice }> = ({ invoice }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const status = invoice.payment_status;
    const statuses: { [key: string]: { text: string; colorKey: 'paid' | 'not_paid' | 'partially_paid' | 'overdue' } } = {
      unpaid: { text: 'Neapmokėta', colorKey: 'not_paid' },
      paid: { text: 'Apmokėta', colorKey: 'paid' },
      overdue: { text: 'Vėluoja', colorKey: 'overdue' },
      partially_paid: { text: 'Dalinis apmokėjimas', colorKey: 'partially_paid' },
    };
    const statusInfo = statuses[status] || { text: status, colorKey: 'not_paid' as const };
    const backgroundColor = getInvoiceColor(statusInfo.colorKey);
    const textColor = getContrastTextColor(backgroundColor);
    
    // Tik pardavimo sąskaitoms ir tik kai statusas nėra "paid"
    const isSalesInvoice = 'invoice_type' in invoice;
    // Rodyti mygtuką, jei statusas yra 'unpaid', 'partially_paid' arba 'overdue'
    const canSendReminder = isSalesInvoice && (status === 'unpaid' || status === 'partially_paid' || status === 'overdue');
    const showReminderButton = canSendReminder && isHovered;
    
    // Nustatyti priminimo tipą pagal būseną
    const reminderType = isSalesInvoice ? getReminderType(invoice) : null;
    
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Sustabdyti event propagation, kad neatsidarytų sąskaitos detalės
      if (reminderType) {
        handleSendReminder(invoice, reminderType);
      }
    };
    
    if (showReminderButton) {
    return (
        <button
          onClick={handleClick}
          style={{
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
          }}
        onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0056b3';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#007bff';
            setIsHovered(false);
          }}
        >
          Siųsti priminimą
        </button>
      );
            }
    
    return (
        <span 
          className="badge" 
          style={{ 
            backgroundColor, 
            color: textColor,
          cursor: canSendReminder ? 'pointer' : 'default',
        }}
        onMouseEnter={() => {
          if (canSendReminder) {
            setIsHovered(true);
          }
        }}
        onMouseLeave={() => setIsHovered(false)}
        >
          {statusInfo.text}
        </span>
    );
  };

  const getPaymentStatusBadge = (invoice: SalesInvoice | PurchaseInvoice) => {
    return <PaymentStatusBadge invoice={invoice} />;
  };

  const clearSalesFilters = () => {
    setSalesFilters({
      payment_status: '',
      invoice_type: '',
      partner_id: '',
      issue_date_from: '',
      issue_date_to: '',
      due_date_from: '',
      due_date_to: '',
      search: '',
    });
    setPartnerSearch('');
    setSelectedPartnerName('');
    setPartners([]);
  };

  const clearPurchaseFilters = () => {
    setPurchaseFilters({
      payment_status: '',
      partner_id: '',
      expense_category_id: '',
      issue_date_from: '',
      issue_date_to: '',
      due_date_from: '',
      due_date_to: '',
      search: '',
    });
    setSupplierSearch('');
    setSelectedSupplierName('');
    setSuppliers([]);
    setExpenseCategorySearch('');
    setSelectedExpenseCategoryName('');
    setFilteredExpenseCategories([]);
    setShowExpenseCategoryDropdown(false);
  };


  return (
    <div className="page">
      <div className="container">
        {toast.visible && (
          <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', zIndex:2000,
            backgroundColor: toast.type==='success' ? '#28a745' : toast.type==='error' ? '#dc3545' : '#17a2b8', color:'#fff', padding:'12px 18px', borderRadius:8, boxShadow:'0 6px 20px rgba(0,0,0,0.25)', maxWidth:'90%', textAlign:'center' }}>
            {toast.message}
          </div>
        )}
        {confirmState.open && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}>
            <div className="card" style={{ width:420 }}>
              <h3 style={{ marginTop:0 }}>{confirmState.title || 'Patvirtinkite veiksmą'}</h3>
              <p style={{ margin:'10px 0 20px' }}>{confirmState.message || 'Ar tikrai?'}</p>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="button button-secondary" onClick={() => setConfirmState({ open:false })}>Atšaukti</button>
                <button className="button" onClick={() => confirmState.onConfirm && confirmState.onConfirm()}>Patvirtinti</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '15px', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {activeTab === 'sales' && salesTotalCount !== null && (
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                Rodyti {salesInvoices.length} {salesTotalCount !== salesInvoices.length ? `iš ${salesTotalCount}` : ''} sąskaitų
              </div>
            )}
            {activeTab === 'purchase' && purchaseTotalCount !== null && (
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                Rodyti {purchaseInvoices.length} {purchaseTotalCount !== purchaseInvoices.length ? `iš ${purchaseTotalCount}` : ''} sąskaitų
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <label style={{ fontSize: '14px', color: '#666' }}>Rezultatų puslapyje:</label>
              <input
                type="number"
                min="10"
                max="1000"
                step="10"
                value={pageSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 100;
                  const clampedValue = Math.min(Math.max(value, 10), 1000);
                  setPageSize(clampedValue);
                  localStorage.setItem('invoicesPageSize', clampedValue.toString());
                }}
                style={{
                  width: '72px',
                  padding: '6px 8px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  textAlign: 'center'
                }}
              />
            </div>
              <button
                onClick={() => {
                  if (activeTab === 'sales') {
                    fetchSalesInvoices();
                  } else {
                    fetchPurchaseInvoices();
                  }
                }}
                disabled={activeTab === 'sales' ? salesLoading : purchaseLoading}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: '#f8f9fa',
                  color: '#333',
                  cursor: (activeTab === 'sales' ? salesLoading : purchaseLoading) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  opacity: (activeTab === 'sales' ? salesLoading : purchaseLoading) ? 0.6 : 1
                }}
                title="Atnaujinti sąrašą"
              >
              🔄
              </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (activeTab === 'sales') {
                  setCurrentSalesInvoice(null); // null = create mode
                  setShowSalesModal(true);
                } else {
                  setCurrentPurchaseInvoice(null); // null = create mode
                  setShowPurchaseModal(true);
                }
              }}
            >
              + Nauja
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="invoice-tabs">
          <button
            className={`tab ${activeTab === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveTab('sales')}
          >
            Pardavimo sąskaitos
          </button>
          <button
            className={`tab ${activeTab === 'purchase' ? 'active' : ''}`}
            onClick={() => setActiveTab('purchase')}
          >
            Pirkimo sąskaitos
          </button>
        </div>

        {/* Sales Invoices */}
        {activeTab === 'sales' && (
          <>
            {/* Filters */}
            <div className="filters-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                <button
                  className="filters-toggle-btn"
                  onClick={() => setShowSalesFilters(!showSalesFilters)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <span className="filters-toggle-icon">{showSalesFilters ? '▼' : '▶'}</span>
                </button>
                {Object.values(salesFilters).some(v => v) && (
                  <span className="filters-active-badge">Aktyvūs filtrai</span>
                )}
                {Object.values(salesFilters).some(v => v) && (
                  <button className="filters-clear-btn" onClick={clearSalesFilters} title="Išvalyti visus filtrus">
                      🗑️ Išvalyti
                  </button>
                )}
                </div>
                <div className="quick-filters" style={{ display: 'flex', gap: '8px', flex: '1 1 auto', overflowX: 'auto', padding: '4px 0', flexWrap: 'nowrap', borderTop: 'none', minWidth: 0 }}>
                  <button
                    className={`quick-filter-btn ${!salesFilters.payment_status && !salesFilters.issue_date_from && !salesFilters.issue_date_to ? 'active' : ''}`}
                    onClick={() => {
                      setSalesFilters({
                        ...salesFilters,
                        payment_status: '',
                        issue_date_from: '',
                        issue_date_to: '',
                      });
                    }}
                  >
                    🌐 Visi
                  </button>
                  <button
                    className={`quick-filter-btn ${salesFilters.issue_date_from === new Date().toISOString().split('T')[0] && salesFilters.issue_date_to === new Date().toISOString().split('T')[0] ? 'active' : ''}`}
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setSalesFilters({ ...salesFilters, issue_date_from: today, issue_date_to: today, payment_status: '' });
                    }}
                  >
                    📅 Šiandien
                  </button>
                  <button
                    className={`quick-filter-btn ${(() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                      return salesFilters.issue_date_from === firstDay && salesFilters.issue_date_to === lastDay;
                    })() ? 'active' : ''}`}
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                      setSalesFilters({ ...salesFilters, issue_date_from: firstDay, issue_date_to: lastDay, payment_status: '' });
                    }}
                  >
                    📆 Šis mėnuo
                  </button>
                  <button
                    className={`quick-filter-btn ${salesFilters.payment_status === 'unpaid' ? 'active' : ''}`}
                    onClick={() => {
                      setSalesFilters({ ...salesFilters, payment_status: 'unpaid', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    💰 Neapmokėtos
                  </button>
                  <button
                    className={`quick-filter-btn ${salesFilters.payment_status === 'overdue' ? 'active' : ''}`}
                    onClick={() => {
                      setSalesFilters({ ...salesFilters, payment_status: 'overdue', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    ⚠️ Vėluojančios
                  </button>
                  <button
                    className={`quick-filter-btn ${salesFilters.payment_status === 'paid' ? 'active' : ''}`}
                    onClick={() => {
                      setSalesFilters({ ...salesFilters, payment_status: 'paid', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    ✅ Apmokėtos
                  </button>
                </div>
              </div>
              
              {showSalesFilters && (
                <div className="filters-panel">
                  <div className="filters-grid">
                    <div className="filter-field">
                      <label>Mokėjimo statusas</label>
                      <select
                        value={salesFilters.payment_status}
                        onChange={(e) => setSalesFilters({ ...salesFilters, payment_status: e.target.value })}
                      >
                        <option value="">Visi</option>
                        <option value="unpaid">Neapmokėta</option>
                        <option value="paid">Apmokėta</option>
                        <option value="overdue">Vėluoja</option>
                        <option value="partially_paid">Dalinis apmokėjimas</option>
                      </select>
                    </div>
                    
                    <div className="filter-field">
                      <label>Sąskaitos tipas</label>
                      <select
                        value={salesFilters.invoice_type}
                        onChange={(e) => setSalesFilters({ ...salesFilters, invoice_type: e.target.value })}
                      >
                        <option value="">Visi</option>
                        <option value="pre_invoice">Pro forma sąskaita</option>
                        <option value="final">Galutinė sąskaita</option>
                        <option value="credit">Kreditinė sąskaita</option>
                        <option value="proforma">Proforma</option>
                      </select>
                    </div>
                    
                    <div className="filter-field">
                      <label>Išrašymo data nuo</label>
                      <input
                        type="date"
                        value={salesFilters.issue_date_from}
                        onChange={(e) => setSalesFilters({ ...salesFilters, issue_date_from: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Išrašymo data iki</label>
                      <input
                        type="date"
                        value={salesFilters.issue_date_to}
                        onChange={(e) => setSalesFilters({ ...salesFilters, issue_date_to: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Mokėjimo terminas nuo</label>
                      <input
                        type="date"
                        value={salesFilters.due_date_from}
                        onChange={(e) => setSalesFilters({ ...salesFilters, due_date_from: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Mokėjimo terminas iki</label>
                      <input
                        type="date"
                        value={salesFilters.due_date_to}
                        onChange={(e) => setSalesFilters({ ...salesFilters, due_date_to: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Paieška</label>
                      <input
                        type="text"
                        placeholder="Sąskaitos numeris, partneris..."
                        value={salesFilters.search}
                        onChange={(e) => setSalesFilters({ ...salesFilters, search: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sales Invoices Table */}
            {salesLoading ? (
              <SkeletonTable rows={10} columns={8} />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('invoices.table.number')}</th>
                    <th>{t('invoices.table.type')}</th>
                    <th>{t('invoices.table.client')}</th>
                    <th>{t('invoices.table.amount')}</th>
                    <th>{t('invoices.table.issue_date')}</th>
                    <th>{t('invoices.table.due_date')}</th>
                    <th>{t('invoices.table.payment_status')}</th>
                    <th>{t('invoices.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {salesInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center' }}>
                        {t('invoices.table.no_sales_invoices')}
                      </td>
                    </tr>
                  ) : (
                    salesInvoices.map((invoice, index) => {
                      // Mėnesių spalvų paletė (12 skirtingų spalvų)
                      const monthColors = [
                        '#3498db', // Sausis - mėlyna
                        '#e74c3c', // Vasaris - raudona
                        '#2ecc71', // Kovas - žalia
                        '#f39c12', // Balandis - oranžinė
                        '#9b59b6', // Gegužė - violetinė
                        '#1abc9c', // Birželis - turkiz
                        '#e67e22', // Liepa - tamsi oranžinė
                        '#34495e', // Rugpjūtis - pilka
                        '#16a085', // Rugsėjis - tamsi turkiz
                        '#c0392b', // Spalis - tamsi raudona
                        '#8e44ad', // Lapkritis - tamsi violetinė
                        '#2980b9'  // Gruodis - tamsi mėlyna
                      ];
                      
                      // Nustatyti mėnesio spalvą pagal sąskaitos datą
                      let currentMonth = new Date().getMonth(); // Default to current month
                      if (invoice.issue_date) {
                        try {
                          const date = new Date(invoice.issue_date);
                          if (!isNaN(date.getTime())) {
                            currentMonth = date.getMonth(); // 0-11
                          }
                        } catch (e) {
                          // If date parsing fails, use current month
                        }
                      }
                      const monthColor = monthColors[currentMonth];
                      
                      // Jei nėra susijusio užsakymo, naudoti geltoną spalvą, kitu atveju - mėnesio spalvą
                      const borderLeftColor = !invoice.related_order && !invoice.related_order_id 
                        ? '#ffc107' 
                        : monthColor;
                      
                      return (
                      <tr 
                        key={invoice.id}
                        onClick={() => handleViewSalesInvoice(invoice)}
                        style={{ 
                          cursor: 'pointer',
                          backgroundColor: !invoice.related_order && !invoice.related_order_id ? '#fff9e6' : 'transparent'
                        }}
                        title={!invoice.related_order && !invoice.related_order_id ? 'Ši pardavimo sąskaita neturi susijusio užsakymo' : ''}
                      >
                        <td style={{ 
                          paddingLeft: '12px',
                          borderLeft: `8px solid ${borderLeftColor}`,
                          position: 'relative'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div>{invoice.invoice_number}</div>
                            {(invoice.related_order || invoice.related_order_id) && (
                              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                {invoice.related_order?.order_number || `#${invoice.related_order_id || invoice.related_order?.id}`}
                              </div>
                            )}
                            {!invoice.related_order && !invoice.related_order_id && (
                              <span style={{ marginLeft: '0px', color: '#ff9800', fontSize: '11px', marginTop: '2px' }} title="Neturi susijusio užsakymo">⚠️</span>
                            )}
                          </div>
                        </td>
                        <td>{invoice.invoice_type_display}</td>
                        <td>{invoice.partner.name}</td>
                        <td>
                          <InvoiceAmountTooltip invoice={invoice}>
                          {(() => {
                            const vatRate = parseFloat(invoice.vat_rate || '0');
                            const amountTotal = invoice.amount_total ? parseFloat(invoice.amount_total) : parseFloat(invoice.amount_net);
                            const pvmLabel = vatRate > 0 ? t('invoices.table.with_vat') : t('invoices.table.without_vat');
                            return `${amountTotal.toFixed(2)} € ${pvmLabel}`;
                          })()}
                          </InvoiceAmountTooltip>
                        </td>
                        <td>{formatDate(invoice.issue_date)}</td>
                        <td>
                          {(() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            // Parsinti due_date
                            let dueDate: Date | null = null;
                            if (invoice.due_date) {
                              try {
                                dueDate = new Date(invoice.due_date);
                                dueDate.setHours(0, 0, 0, 0);
                              } catch (e) {
                              }
                            }
                            
                            // Parsinti payment_date
                            let paymentDate: Date | null = null;
                            if (invoice.payment_date) {
                              try {
                                paymentDate = new Date(invoice.payment_date);
                                paymentDate.setHours(0, 0, 0, 0);
                              } catch (e) {
                              }
                            }
                            
                            const isPaid = invoice.payment_status === 'paid';
                            
                            if (isPaid) {
                              // Apmokėta - tiesiog rodyti datą be papildomų detalių
                              return formatDate(invoice.due_date);
                            } else if (!isPaid && dueDate) {
                              // Neapmokėta - patikrinti, ar veluojama ar dar liko laiko
                              const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                              if (daysDiff < 0) {
                                // Vėluojama
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#dc3545', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.overdue', { days: Math.abs(daysDiff) })}
                                    </span>
                                  </div>
                                );
                              } else if (daysDiff > 0) {
                                // Dar liko laiko
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#ffc107', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.days_left', { days: daysDiff })}
                                    </span>
                                  </div>
                                );
                              } else {
                                // Šiandien terminas
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#ffc107', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.due_today')}
                                    </span>
                                  </div>
                                );
                              }
                            } else {
                              // Jei nėra datos, tiesiog rodyti
                              return formatDate(invoice.due_date);
                            }
                          })()}
                        </td>
                        <td>{getPaymentStatusBadge(invoice)}</td>
                        <td onClick={(e) => e.stopPropagation()} style={{ width: '150px', minWidth: '150px' }}>
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            gap: '3px'
                          }}>
                            {/* Pirma eilutė: Peržiūrėti + PDF */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '3px',
                              width: '100%'
                            }}>
                              <button
                                className="btn btn-sm btn-info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchHtmlPreview(invoice.id, i18n.language);
                                }}
                                style={{ 
                                  padding: '4px 8px', 
                                  fontSize: '10px', 
                                  backgroundColor: '#17a2b8', 
                                  border: '1px solid #17a2b8',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  color: 'white',
                                  flex: '1',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s ease',
                                  boxSizing: 'border-box'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#138496';
                                  e.currentTarget.style.borderColor = '#117a8b';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#17a2b8';
                                  e.currentTarget.style.borderColor = '#17a2b8';
                                }}
                                title="Peržiūrėti HTML"
                              >
                                👁️
                              </button>
                              <button
                                className="btn btn-sm btn-info"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const { api } = await import('../services/api');
                                    const res = await api.get(`/invoices/sales/${invoice.id}/pdf/`, { 
                                      params: { lang: i18n.language },
                                      responseType: 'blob' 
                                    });
                                    const blob = new Blob([res.data], { type: 'application/pdf' });
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `${invoice.invoice_number}.pdf`;
                                    link.style.display = 'none';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    setTimeout(() => URL.revokeObjectURL(url), 100);
                                  } catch (e: any) {
                                    showToast('error','Nepavyko parsisiųsti PDF: ' + (e.response?.data || e.message || 'Nežinoma klaida'));
                                  }
                                }}
                                style={{ 
                                  padding: '4px 8px', 
                                  fontSize: '10px', 
                                  backgroundColor: '#28a745', 
                                  border: '1px solid #28a745',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  color: 'white',
                                  flex: '1',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s ease',
                                  boxSizing: 'border-box'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#218838';
                                  e.currentTarget.style.borderColor = '#1e7e34';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#28a745';
                                  e.currentTarget.style.borderColor = '#28a745';
                                }}
                                title="Parsisiųsti PDF"
                              >
                                📄
                              </button>
                            </div>
                            {/* Antra eilutė: Užsakymas (jei yra) + Redaguoti + Trinti */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '3px',
                              width: '100%'
                            }}>
                              {(invoice.related_order || invoice.related_order_id) ? (
                                <>
                                  <button
                                    className="btn btn-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const orderId = invoice.related_order?.id || invoice.related_order_id;
                                      if (orderId) {
                                        handleOpenOrderDetails(orderId);
                                      }
                                    }}
                                    style={{ 
                                      padding: '4px 8px', 
                                      fontSize: '10px',
                                      backgroundColor: '#6c757d',
                                      border: '1px solid #6c757d',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      color: 'white',
                                      flex: '1',
                                      fontWeight: '500',
                                      whiteSpace: 'nowrap',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#5a6268';
                                      e.currentTarget.style.borderColor = '#545b62';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#6c757d';
                                      e.currentTarget.style.borderColor = '#6c757d';
                                    }}
                                    title="Atidaryti susijusį užsakymą"
                                  >
                                    📋
                                  </button>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditSalesInvoice(invoice);
                                    }}
                                    style={{ 
                                      padding: '4px 8px', 
                                      fontSize: '10px',
                                      backgroundColor: '#007bff',
                                      border: '1px solid #007bff',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      color: 'white',
                                      flex: '1',
                                      fontWeight: '500',
                                      whiteSpace: 'nowrap',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#0056b3';
                                      e.currentTarget.style.borderColor = '#004085';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#007bff';
                                      e.currentTarget.style.borderColor = '#007bff';
                                    }}
                                    title="Redaguoti sąskaitą"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSalesInvoice(invoice);
                                    }}
                                    style={{ 
                                      padding: '4px 8px', 
                                      fontSize: '10px', 
                                      backgroundColor: '#dc3545', 
                                      border: '1px solid #dc3545',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      color: 'white',
                                      flex: '1',
                                      fontWeight: '500',
                                      whiteSpace: 'nowrap',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#c82333';
                                      e.currentTarget.style.borderColor = '#bd2130';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#dc3545';
                                      e.currentTarget.style.borderColor = '#dc3545';
                                    }}
                                    title="Ištrinti sąskaitą"
                                  >
                                    🗑️
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditSalesInvoice(invoice);
                                    }}
                                    style={{ 
                                      padding: '4px 8px', 
                                      fontSize: '10px',
                                      backgroundColor: '#007bff',
                                      border: '1px solid #007bff',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      color: 'white',
                                      flex: '1',
                                      fontWeight: '500',
                                      whiteSpace: 'nowrap',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#0056b3';
                                      e.currentTarget.style.borderColor = '#004085';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#007bff';
                                      e.currentTarget.style.borderColor = '#007bff';
                                    }}
                                    title="Redaguoti sąskaitą"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSalesInvoice(invoice);
                                    }}
                                    style={{ 
                                      padding: '4px 8px', 
                                      fontSize: '10px', 
                                      backgroundColor: '#dc3545', 
                                      border: '1px solid #dc3545',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      color: 'white',
                                      flex: '1',
                                      fontWeight: '500',
                                      whiteSpace: 'nowrap',
                                      transition: 'all 0.2s ease',
                                      boxSizing: 'border-box'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#c82333';
                                      e.currentTarget.style.borderColor = '#bd2130';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#dc3545';
                                      e.currentTarget.style.borderColor = '#dc3545';
                                    }}
                                    title="Ištrinti sąskaitą"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          
          {/* Puslapiavimas - Sales */}
          {salesTotalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              marginTop: '20px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <button
                className="button"
                onClick={() => setSalesCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={salesCurrentPage === 1}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  opacity: salesCurrentPage === 1 ? 0.5 : 1,
                  cursor: salesCurrentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Ankstesnis
              </button>
              
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666', marginRight: '5px' }}>
                  Puslapis:
                </span>
                {(() => {
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
                  
                  const pageNumbers = getPageNumbers(salesCurrentPage, salesTotalPages);
                  
                  return pageNumbers.map((page, index) => {
                    if (page === '...') {
                      return (
                        <span key={`ellipsis-${index}`} style={{ padding: '0 4px', fontSize: '14px', color: '#666' }}>
                          ...
                        </span>
                      );
                    }
                    
                    const pageNum = page as number;
                    const isActive = pageNum === salesCurrentPage;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setSalesCurrentPage(pageNum)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          backgroundColor: isActive ? '#007bff' : 'white',
                          color: isActive ? 'white' : '#333',
                          cursor: 'pointer',
                          minWidth: '40px',
                          fontWeight: isActive ? 'bold' : 'normal'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  });
                })()}
              </div>
              
              <button
                className="button"
                onClick={() => setSalesCurrentPage(prev => Math.min(salesTotalPages, prev + 1))}
                disabled={salesCurrentPage === salesTotalPages}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  opacity: salesCurrentPage === salesTotalPages ? 0.5 : 1,
                  cursor: salesCurrentPage === salesTotalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Kitas →
              </button>
            </div>
          )}
        </>
      )}

      {/* Purchase Invoices */}
        {activeTab === 'purchase' && (
          <>
            {/* Filters */}
            <div className="filters-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                <button
                  className="filters-toggle-btn"
                  onClick={() => setShowPurchaseFilters(!showPurchaseFilters)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <span className="filters-toggle-icon">{showPurchaseFilters ? '▼' : '▶'}</span>
                </button>
                {Object.values(purchaseFilters).some(v => v) && (
                  <span className="filters-active-badge">Aktyvūs filtrai</span>
                )}
                {Object.values(purchaseFilters).some(v => v) && (
                  <button className="filters-clear-btn" onClick={clearPurchaseFilters} title="Išvalyti visus filtrus">
                      🗑️ Išvalyti
                  </button>
                )}
                </div>
                <div className="quick-filters" style={{ display: 'flex', gap: '8px', flex: '1 1 auto', overflowX: 'auto', padding: '4px 0', flexWrap: 'nowrap', borderTop: 'none', minWidth: 0 }}>
                  <button
                    className={`quick-filter-btn ${!purchaseFilters.payment_status && !purchaseFilters.issue_date_from && !purchaseFilters.issue_date_to ? 'active' : ''}`}
                    onClick={() => {
                      setPurchaseFilters({
                        ...purchaseFilters,
                        payment_status: '',
                        issue_date_from: '',
                        issue_date_to: '',
                      });
                    }}
                  >
                    🌐 Visi
                  </button>
                  <button
                    className={`quick-filter-btn ${purchaseFilters.issue_date_from === new Date().toISOString().split('T')[0] && purchaseFilters.issue_date_to === new Date().toISOString().split('T')[0] ? 'active' : ''}`}
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setPurchaseFilters({ ...purchaseFilters, issue_date_from: today, issue_date_to: today, payment_status: '' });
                    }}
                  >
                    📅 Šiandien
                  </button>
                  <button
                    className={`quick-filter-btn ${(() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                      return purchaseFilters.issue_date_from === firstDay && purchaseFilters.issue_date_to === lastDay;
                    })() ? 'active' : ''}`}
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                      setPurchaseFilters({ ...purchaseFilters, issue_date_from: firstDay, issue_date_to: lastDay, payment_status: '' });
                    }}
                  >
                    📆 Šis mėnuo
                  </button>
                  <button
                    className={`quick-filter-btn ${purchaseFilters.payment_status === 'unpaid' ? 'active' : ''}`}
                    onClick={() => {
                    setPurchaseFilters({ ...purchaseFilters, payment_status: 'unpaid', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    💸 Neapmokėtos
                  </button>
                  <button
                    className={`quick-filter-btn ${purchaseFilters.payment_status === 'overdue' ? 'active' : ''}`}
                    onClick={() => {
                    setPurchaseFilters({ ...purchaseFilters, payment_status: 'overdue', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    ⚠️ Vėluojančios
                  </button>
                  <button
                    className={`quick-filter-btn ${purchaseFilters.payment_status === 'paid' ? 'active' : ''}`}
                    onClick={() => {
                    setPurchaseFilters({ ...purchaseFilters, payment_status: 'paid', issue_date_from: '', issue_date_to: '' });
                    }}
                  >
                    ✅ Apmokėtos
                  </button>
                </div>
              </div>
              
              {showPurchaseFilters && (
                <div className="filters-panel">
                  <div className="filters-grid">
                    <div className="filter-field">
                      <label>Mokėjimo statusas</label>
                      <select
                        value={purchaseFilters.payment_status}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, payment_status: e.target.value })}
                      >
                        <option value="">Visi</option>
                        <option value="unpaid">Neapmokėta</option>
                        <option value="paid">Apmokėta</option>
                        <option value="overdue">Vėluoja</option>
                        <option value="partially_paid">Dalinis apmokėjimas</option>
                      </select>
                    </div>
                    
                    <div className="filter-field">
                      <label>Išlaidų kategorija</label>
                      <select
                        value={purchaseFilters.expense_category_id}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, expense_category_id: e.target.value })}
                      >
                        <option value="">Viskas</option>
                        {expenseCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="filter-field">
                      <label>Išrašymo data nuo</label>
                      <input
                        type="date"
                        value={purchaseFilters.issue_date_from}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, issue_date_from: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Išrašymo data iki</label>
                      <input
                        type="date"
                        value={purchaseFilters.issue_date_to}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, issue_date_to: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Mokėjimo terminas nuo</label>
                      <input
                        type="date"
                        value={purchaseFilters.due_date_from}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, due_date_from: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Mokėjimo terminas iki</label>
                      <input
                        type="date"
                        value={purchaseFilters.due_date_to}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, due_date_to: e.target.value })}
                      />
                    </div>
                    
                    <div className="filter-field">
                      <label>Paieška</label>
                      <input
                        type="text"
                        placeholder="Sąskaitos numeris, tiekėjas..."
                        value={purchaseFilters.search}
                        onChange={(e) => setPurchaseFilters({ ...purchaseFilters, search: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Purchase Invoices Table */}
            {purchaseLoading ? (
              <SkeletonTable rows={10} columns={8} />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tiekėjo sąskaitos numeris</th>
                    <th>Tiekėjas</th>
                    <th>Suma</th>
                    <th>Gavimo data</th>
                    <th>Mokėjimo terminas</th>
                    <th>Mokėjimo statusas</th>
                    <th>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center' }}>
                        Pirkimo sąskaitų nerasta
                      </td>
                    </tr>
                  ) : (
                    purchaseInvoices.map((invoice, index) => {
                      // Mėnesių spalvų paletė (12 skirtingų spalvų)
                      const monthColors = [
                        '#3498db', // Sausis - mėlyna
                        '#e74c3c', // Vasaris - raudona
                        '#2ecc71', // Kovas - žalia
                        '#f39c12', // Balandis - oranžinė
                        '#9b59b6', // Gegužė - violetinė
                        '#1abc9c', // Birželis - turkiz
                        '#e67e22', // Liepa - tamsi oranžinė
                        '#34495e', // Rugpjūtis - pilka
                        '#16a085', // Rugsėjis - tamsi turkiz
                        '#c0392b', // Spalis - tamsi raudona
                        '#8e44ad', // Lapkritis - tamsi violetinė
                        '#2980b9'  // Gruodis - tamsi mėlyna
                      ];
                      
                      // Nustatyti mėnesio spalvą pagal sąskaitos datą (naudoti received_date arba issue_date)
                      const invoiceDate = invoice.received_date || invoice.issue_date;
                      let currentMonth = new Date().getMonth(); // Default to current month
                      if (invoiceDate) {
                        try {
                          const date = new Date(invoiceDate);
                          if (!isNaN(date.getTime())) {
                            currentMonth = date.getMonth(); // 0-11
                          }
                        } catch (e) {
                          // If date parsing fails, use current month
                        }
                      }
                      const monthColor = monthColors[currentMonth];
                      
                      // Jei nėra susijusio užsakymo, naudoti geltoną spalvą, kitu atveju - mėnesio spalvą
                      const hasOrder = hasRelatedOrder(invoice);
                      const borderLeftColor = !hasOrder 
                        ? '#ffc107' 
                        : monthColor;
                      
                      const orderInfo = getRelatedOrderInfo(invoice);
                      
                      return (
                      <tr 
                        key={invoice.id}
                        onClick={() => handleViewPurchaseInvoice(invoice)}
                        style={{ 
                          cursor: 'pointer',
                          backgroundColor: !hasOrder ? '#fff9e6' : 'transparent'
                        }}
                        title={!hasOrder ? 'Ši pirkimo sąskaita neturi susijusio užsakymo' : ''}
                      >
                        <td style={{ 
                          paddingLeft: '12px',
                          borderLeft: `8px solid ${borderLeftColor}`,
                          position: 'relative'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div>{invoice.received_invoice_number}</div>
                            {orderInfo && (
                              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                {orderInfo}
                              </div>
                            )}
                            {!hasOrder && (
                              <span style={{ marginLeft: '0px', color: '#ff9800', fontSize: '11px', marginTop: '2px' }} title="Neturi susijusio užsakymo">⚠️</span>
                            )}
                          </div>
                        </td>
                        <td>{invoice.partner.name}</td>
                        <td>
                          <PurchaseInvoiceAmountTooltip invoice={invoice}>
                          {(() => {
                            const amountNet = parseFloat(invoice.amount_net || '0');
                            return `${amountNet.toFixed(2)} € (be PVM)`;
                          })()}
                          </PurchaseInvoiceAmountTooltip>
                        </td>
                        <td>{formatDate(invoice.received_date)}</td>
                        <td>
                          {(() => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            // Parsinti due_date
                            let dueDate: Date | null = null;
                            if (invoice.due_date) {
                              try {
                                dueDate = new Date(invoice.due_date);
                                dueDate.setHours(0, 0, 0, 0);
                              } catch (e) {
                              }
                            }
                            
                            // Parsinti payment_date
                            let paymentDate: Date | null = null;
                            if (invoice.payment_date) {
                              try {
                                paymentDate = new Date(invoice.payment_date);
                                paymentDate.setHours(0, 0, 0, 0);
                              } catch (e) {
                              }
                            }
                            
                            const isPaid = invoice.payment_status === 'paid';
                            
                            if (isPaid) {
                              // Apmokėta - tiesiog rodyti datą be papildomų detalių
                              return formatDate(invoice.due_date);
                            } else if (!isPaid && dueDate) {
                              // Neapmokėta - patikrinti, ar veluojama ar dar liko laiko
                              const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                              if (daysDiff < 0) {
                                // Vėluojama
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#dc3545', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.overdue', { days: Math.abs(daysDiff) })}
                                    </span>
                                  </div>
                                );
                              } else if (daysDiff > 0) {
                                // Dar liko laiko
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#ffc107', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.days_left', { days: daysDiff })}
                                    </span>
                                  </div>
                                );
                              } else {
                                // Šiandien terminas
                                return (
                                  <div>
                                    {formatDate(invoice.due_date)}
                                    <span style={{ color: '#ffc107', marginLeft: '8px', fontWeight: '500' }}>
                                      {t('invoices.table.due_today')}
                                    </span>
                                  </div>
                                );
                              }
                            } else {
                              // Jei nėra datos, tiesiog rodyti
                              return formatDate(invoice.due_date);
                            }
                          })()}
                        </td>
                        <td>{getPaymentStatusBadge(invoice)}</td>
                        <td onClick={(e) => e.stopPropagation()} style={{ width: '150px', minWidth: '150px' }}>
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            gap: '3px'
                          }}>
                            {/* Pirma eilutė: Užsakymas (jei yra) + Redaguoti */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '3px',
                              width: '100%'
                            }}>
                              {hasRelatedOrder(invoice) ? (
                                <button
                                  className="btn btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Jei yra related_orders, atidaryti pirmąjį; kitu atveju - related_order
                                    const orderId = (invoice.related_orders && invoice.related_orders.length > 0) 
                                      ? invoice.related_orders[0].id 
                                      : (invoice.related_order?.id || invoice.related_order_id);
                                    if (orderId) {
                                      handleOpenOrderDetails(orderId);
                                    }
                                  }}
                                  style={{ 
                                    padding: '4px 8px', 
                                    fontSize: '10px',
                                    backgroundColor: '#6c757d',
                                    border: '1px solid #6c757d',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    color: 'white',
                                    flex: '1',
                                    fontWeight: '500',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s ease',
                                    boxSizing: 'border-box'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#5a6268';
                                    e.currentTarget.style.borderColor = '#545b62';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#6c757d';
                                    e.currentTarget.style.borderColor = '#6c757d';
                                  }}
                                  title="Atidaryti susijusį užsakymą"
                                >
                                  📋
                                </button>
                              ) : (
                                <div style={{ flex: '1' }}></div>
                              )}
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditPurchaseInvoice(invoice);
                                }}
                                style={{ 
                                  padding: '4px 8px', 
                                  fontSize: '10px',
                                  backgroundColor: '#007bff',
                                  border: '1px solid #007bff',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  color: 'white',
                                  flex: '1',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s ease',
                                  boxSizing: 'border-box'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#0056b3';
                                  e.currentTarget.style.borderColor = '#004085';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#007bff';
                                  e.currentTarget.style.borderColor = '#007bff';
                                }}
                                title="Redaguoti sąskaitą"
                              >
                                ✏️
                              </button>
                            </div>
                            {/* Antra eilutė: Trinti + tuščias */}
                            <div style={{ 
                              display: 'flex', 
                              gap: '3px',
                              width: '100%'
                            }}>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePurchaseInvoice(invoice);
                                }}
                                style={{ 
                                  padding: '4px 8px', 
                                  fontSize: '10px', 
                                  backgroundColor: '#dc3545', 
                                  border: '1px solid #dc3545',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  color: 'white',
                                  flex: '1',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s ease',
                                  boxSizing: 'border-box'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#c82333';
                                  e.currentTarget.style.borderColor = '#bd2130';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#dc3545';
                                  e.currentTarget.style.borderColor = '#dc3545';
                                }}
                                title="Ištrinti sąskaitą"
                              >
                                🗑️
                              </button>
                              <div style={{ flex: '1' }}></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          
          {/* Puslapiavimas - Purchase */}
          {purchaseTotalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              marginTop: '20px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <button
                className="button"
                onClick={() => setPurchaseCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={purchaseCurrentPage === 1}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  opacity: purchaseCurrentPage === 1 ? 0.5 : 1,
                  cursor: purchaseCurrentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                ← Ankstesnis
              </button>
              
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666', marginRight: '5px' }}>
                  Puslapis:
                </span>
                {(() => {
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
                  
                  const pageNumbers = getPageNumbers(purchaseCurrentPage, purchaseTotalPages);
                  
                  return pageNumbers.map((page, index) => {
                    if (page === '...') {
                      return (
                        <span key={`ellipsis-${index}`} style={{ padding: '0 4px', fontSize: '14px', color: '#666' }}>
                          ...
                        </span>
                      );
                    }
                    
                    const pageNum = page as number;
                    const isActive = pageNum === purchaseCurrentPage;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPurchaseCurrentPage(pageNum)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          backgroundColor: isActive ? '#007bff' : 'white',
                          color: isActive ? 'white' : '#333',
                          cursor: 'pointer',
                          minWidth: '40px',
                          fontWeight: isActive ? 'bold' : 'normal'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  });
                })()}
              </div>
              
              <button
                className="button"
                onClick={() => setPurchaseCurrentPage(prev => Math.min(purchaseTotalPages, prev + 1))}
                disabled={purchaseCurrentPage === purchaseTotalPages}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  opacity: purchaseCurrentPage === purchaseTotalPages ? 0.5 : 1,
                  cursor: purchaseCurrentPage === purchaseTotalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Kitas →
              </button>
            </div>
          )}
        </>
      )}

      {/* Sales Invoice Modal (NEW - unified view/edit/create) */}
        <SalesInvoiceModal_NEW
          isOpen={showSalesModal}
          onClose={() => {
            setShowSalesModal(false);
            setCurrentSalesInvoice(null);
          }}
          invoice={currentSalesInvoice}
          onSave={() => {
            fetchSalesInvoices();
          }}
          onDelete={(invoice) => {
            handleDeleteSalesInvoice(invoice);
          }}
          onInvoiceUpdate={(updatedInvoice) => {
            setCurrentSalesInvoice(updatedInvoice);
            fetchSalesInvoices();
          }}
          showToast={showToast}
          invoiceSettings={invoiceSettings}
        />

        {/* Purchase Invoice Form Modal */}
        {/* Purchase Invoice Modal (NEW) */}
        <PurchaseInvoiceModal_NEW
          invoice={currentPurchaseInvoice}
          isOpen={showPurchaseModal}
          onClose={() => {
            setShowPurchaseModal(false);
            setCurrentPurchaseInvoice(null);
          }}
          onSave={() => {
            fetchPurchaseInvoices();
          }}
          onInvoiceUpdate={(updatedInvoice) => {
            // Atnaujinti currentPurchaseInvoice, jei modalas dar atidarytas
            if (currentPurchaseInvoice && updatedInvoice.id === currentPurchaseInvoice.id) {
              setCurrentPurchaseInvoice(updatedInvoice);
            }
            fetchPurchaseInvoices();
          }}
          onDelete={(invoice) => {
            handleDeletePurchaseInvoice(invoice);
            setShowPurchaseModal(false);
            setCurrentPurchaseInvoice(null);
          }}
          showToast={showToast}
        />

        {/* TODO: Seni modalai - pašalinti */}
        {/* <PurchaseInvoiceEditModal ... /> */}
        {/* <PurchaseInvoiceDetailsModal ... /> */}


        {/* Order Details Modal - Naikinimui */}
        {/*
        <OrderDetailsModal
          order={selectedOrderForDetails}
          isOpen={showOrderDetails}
          onClose={() => {
            setShowOrderDetails(false);
            setSelectedOrderForDetails(null);
          }}
          showToast={showToast}
        />
        */}

        {showOrderDetails && (
          <OrderEditModal_NEW
            order={selectedOrderForDetails as any}
            isOpen={showOrderDetails}
            onClose={() => {
              setShowOrderDetails(false);
              setSelectedOrderForDetails(null);
            }}
            onSave={(order: any) => {
              setShowOrderDetails(false);
              setSelectedOrderForDetails(null);
              // Galbūt reikia atnaujinti sąskaitų sąrašą jei kas nors pasikeitė užsakyme
              fetchSalesInvoices();
              fetchPurchaseInvoices();
            }}
            showToast={showToast}
          />
        )}
        
        {/* HTML Preview Modal */}
      <HTMLPreviewModal
        preview={htmlPreview}
        onClose={() => {
          setHtmlPreview(null);
          setHtmlPreviewInvoiceId(null);
        }}
        onLanguageChange={async (lang) => {
          if (htmlPreviewInvoiceId) {
            await fetchHtmlPreview(htmlPreviewInvoiceId, lang);
          }
        }}
        currentLang={htmlPreviewLang}
        onDownloadPDF={htmlPreview && htmlPreviewInvoiceId ? async () => {
            try {
              const response = await api.get(`/invoices/sales/${htmlPreviewInvoiceId}/pdf/`, {
                params: { lang: htmlPreviewLang },
                responseType: 'blob',
              });
              
              const blob = new Blob([response.data], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = blobUrl;
              link.download = `saskaita-${htmlPreviewInvoiceId}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(blobUrl);
              showToast('success', 'PDF sėkmingai atsisiųstas');
            } catch (error: any) {
              showToast('error', 'Nepavyko atsisiųsti PDF');
            }
          } : undefined}
          onSendEmail={htmlPreview && htmlPreviewInvoiceId ? async () => {
            // Atidaryti email modalą - naudoti tą patį, kaip HTML template'e
            const iframe = document.querySelector('.html-preview-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              try {
                // Iškviesti sendEmail funkciją iš iframe
                (iframe.contentWindow as any).sendEmail?.();
              } catch (e) {
                showToast('error', 'Nepavyko atidaryti email modalo');
              }
            }
          } : undefined}
        />
      </div>
    </div>
  );
};

export default InvoicesPage;
