import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useModule } from '../context/ModuleContext';
import { formatMoney } from '../utils/formatMoney';
import ExpenseDashboardPage from './ExpenseDashboardPage';
import './DashboardPage.css';

type PeriodType = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'last7' | 'last14' | 'last30' | 'last_month' | 'last_quarter' | 'last_year' | 'all' | 'custom';

interface DashboardStats {
  invoices: {
    unpaid_sales: { count: number; total: string; oldest_invoices?: any[] };
    paid_sales: { count: number; total: string };
    partially_paid_sales: { count: number; total: string; oldest_invoices?: any[] };
    unpaid_purchase: { count: number; total: string; oldest_invoices?: any[] };
    paid_purchase: { count: number; total: string };
    partially_paid_purchase: { count: number; total: string; oldest_invoices?: any[] };
    overdue_sales: { count: number; oldest_invoices?: any[] };
    overdue_purchase: { count: number; oldest_invoices?: any[] };
  };
  orders: {
    total?: number;
    new: number;
    assigned?: number;
    executing?: number;
    waiting_for_docs?: number;
    waiting_for_payment?: number;
    finished: number;
    closed?: number;
    canceled?: number;
    unfinished: number;
  };
  clients: { new_this_month: number };
  finance?: {
    monthly_profit: string;
    monthly_revenue: string;
    monthly_expenses: string;
    cash_flow: string;
    paid_revenue: string;
    unpaid_revenue: string;
    paid_expenses: string;
    unpaid_expenses: string;
  };
  orders_tracking?: {
    without_carriers: number;
    finished_without_invoices: number;
    with_overdue_invoices: number;
    without_cargo: number;
    without_route: number;
    without_client_price: number;
    without_carrier_price: number;
    upcoming: any[];
  };
  carriers_tracking?: {
    without_invoices: { count: number; list: any[] };
    with_overdue: { count: number; list: any[] };
  };
  alerts?: any[];
}

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { activeModule } = useModule();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientsOverdue, setClientsOverdue] = useState<any[]>([]);
  const [carriersOverdue, setCarriersOverdue] = useState<any[]>([]);
  const [periodType, setPeriodType] = useState<PeriodType>('all');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const navigate = useNavigate();

  const getDateRange = useCallback((period: PeriodType): { from: string | null; to: string | null } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (period) {
      case 'today':
        return { from: today.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        return { from: weekStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: monthStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'quarter': {
        const q = Math.floor(today.getMonth() / 3);
        const quarterStart = new Date(today.getFullYear(), q * 3, 1);
        return { from: quarterStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'year': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        return { from: yearStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'last7': {
        const from = new Date(today);
        from.setDate(today.getDate() - 6);
        return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'last14': {
        const from = new Date(today);
        from.setDate(today.getDate() - 13);
        return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'last30': {
        const from = new Date(today);
        from.setDate(today.getDate() - 29);
        return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      }
      case 'last_month': {
        const y = today.getFullYear(), m = today.getMonth();
        const first = new Date(y, m - 1, 1);
        const last = new Date(y, m, 0);
        return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
      }
      case 'last_quarter': {
        const q = Math.floor(today.getMonth() / 3);
        const startM = q === 0 ? 9 : (q - 1) * 3;
        const startY = q === 0 ? today.getFullYear() - 1 : today.getFullYear();
        const first = new Date(startY, startM, 1);
        const last = new Date(startY, startM + 3, 0);
        return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
      }
      case 'last_year': {
        const y = today.getFullYear() - 1;
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      }
      case 'custom':
        return { from: customDateFrom || null, to: customDateTo || null };
      case 'all':
      default:
        return { from: null, to: null };
    }
  }, [customDateFrom, customDateTo]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const dateRange = getDateRange(periodType);
        const params: Record<string, string> = {};
        if (periodType === 'all') {
          params.period_type = 'all';
        } else if (dateRange.from && dateRange.to) {
          params.period_type = 'month';
          params.date_from = dateRange.from;
          params.date_to = dateRange.to;
        } else {
          const fromDate = new Date(dateRange.from || new Date());
          params.period_type = 'month';
          params.year = String(fromDate.getFullYear());
          params.month = String(fromDate.getMonth() + 1);
        }
        const [statsRes, clientsRes, carriersRes] = await Promise.all([
          api.get('/dashboard/statistics/', { params }),
          api.get('/dashboard/clients-overdue/'),
          api.get('/dashboard/carriers-overdue/')
        ]);
        setStats(statsRes.data);
        setClientsOverdue(clientsRes.data.clients || []);
        setCarriersOverdue(carriersRes.data.carriers || []);
      } catch (err: any) {
        console.error('Klaida užkraunant duomenis:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [periodType, getDateRange]);

  const formatCurrency = (amount: string | number) => formatMoney(amount);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('lt-LT', { day: '2-digit', month: '2-digit' });
  };

  if (activeModule === 'expenses') {
    return <ExpenseDashboardPage />;
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Kraunama...
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Nepavyko užkrauti statistikos
      </div>
    );
  }

  return (
    <div style={{ padding: '10px', maxWidth: '100%', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Laikotarpio pasirinkimas */}
      <div style={{
        marginBottom: '10px',
        padding: '8px 12px',
        backgroundColor: 'white',
        borderRadius: '6px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#495057' }}>Laikotarpis:</span>
        {(['today', 'week', 'month', 'quarter', 'year', 'last7', 'last14', 'last30', 'last_month', 'last_quarter', 'last_year', 'all', 'custom'] as PeriodType[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodType(p)}
            style={{
              padding: '4px 10px',
              fontSize: '10px',
              fontWeight: '600',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: periodType === p ? '#007bff' : 'white',
              color: periodType === p ? 'white' : '#495057',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {p === 'today' ? 'Šiandien' : p === 'week' ? 'Ši savaitė' : p === 'month' ? 'Šis mėnuo' : p === 'quarter' ? 'Šis ketvirtis' : p === 'year' ? 'Šie metai' : p === 'last7' ? 'Paskutinės 7 d.' : p === 'last14' ? 'Paskutinės 14 d.' : p === 'last30' ? 'Paskutiniai 30 d.' : p === 'last_month' ? 'Praeitas mėnuo' : p === 'last_quarter' ? 'Praeitas ketvirtis' : p === 'last_year' ? 'Praeiti metai' : p === 'all' ? 'Viso laikotarpio' : 'Pasirinkti datas'}
          </button>
        ))}
        {periodType === 'custom' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} style={{ padding: '2px 6px', fontSize: '10px' }} />
            <span>—</span>
            <input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} style={{ padding: '2px 6px', fontSize: '10px' }} />
          </span>
        )}
      </div>

      {/* Viršutinė greitosios statistikos eilutė */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '8px',
        marginBottom: '10px'
      }}>
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #28a745',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
        >
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>💰 Pelnas</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#28a745' }}>
            {stats.finance ? formatCurrency(stats.finance.monthly_profit) : formatMoney(0)}
          </div>
          {stats.finance && (
            <div style={{ fontSize: '8px', color: '#999', marginTop: '4px', lineHeight: '1.3' }}>
              Pajamos: {formatCurrency(stats.finance.monthly_revenue)}<br/>
              Išlaidos: {formatCurrency(stats.finance.monthly_expenses)}
            </div>
          )}
        </div>

        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #dc3545',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={() => navigate('/invoices?status=overdue')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
        >
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>⚠️ Vėluojančios</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#dc3545' }}>
            {stats.invoices.overdue_sales.count + stats.invoices.overdue_purchase.count}
          </div>
          <div style={{ fontSize: '8px', color: '#999', marginTop: '4px' }}>
            Išrašytos: {stats.invoices.overdue_sales.count} | Gautos: {stats.invoices.overdue_purchase.count}
          </div>
        </div>

        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #007bff',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={() => navigate('/orders')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
        >
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>📋 Užsakymai</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#007bff' }}>
            {stats.orders.total ?? 0}
          </div>
          <div style={{ fontSize: '8px', color: '#999', marginTop: '4px' }}>
            Nauji: {stats.orders.new} | Priskirti: {stats.orders.assigned ?? 0} | Vykdomi: {stats.orders.executing ?? 0} | Laukia: {(stats.orders.waiting_for_docs ?? 0) + (stats.orders.waiting_for_payment ?? 0)} | Baigti: {stats.orders.finished} | Uždaryti: {stats.orders.closed ?? 0} | Atšaukti: {stats.orders.canceled ?? 0}
          </div>
          <div style={{ fontSize: '7px', color: '#aaa', marginTop: '2px' }}>
            Viso užsakymų
          </div>
        </div>

        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #ffc107',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={() => navigate('/invoices?status=unpaid')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
        >
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>📄 Neapmokėtos</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#ffc107' }}>
            {stats.invoices.unpaid_sales.count + stats.invoices.unpaid_purchase.count}
          </div>
          <div style={{ fontSize: '8px', color: '#999', marginTop: '4px' }}>
            Išrašytos: {stats.invoices.unpaid_sales.count} | Gautos: {stats.invoices.unpaid_purchase.count}
          </div>
        </div>

        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderLeft: '4px solid #17a2b8',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={() => navigate('/partners?is_client=true')}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
        >
          <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>👥 Klientai</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#17a2b8' }}>
            {stats.clients.new_this_month}
          </div>
          <div style={{ fontSize: '8px', color: '#999', marginTop: '4px' }}>
            Nauji šį mėnesį
          </div>
        </div>
      </div>

      {/* Pranešimai */}
      {stats.alerts && stats.alerts.length > 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '6px', 
          padding: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '10px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '8px', color: '#495057', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚠️</span>
            <span>SKUBŪS PRANEŠIMAI</span>
            <span style={{ fontSize: '9px', color: '#999', fontWeight: 'normal' }}>({stats.alerts.length})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
            {stats.alerts.map((alert, idx) => (
              <div
                key={idx}
                onClick={() => navigate(alert.link)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  backgroundColor: alert.type === 'error' ? '#fee' : alert.type === 'warning' ? '#fff3cd' : '#d1ecf1',
                  color: alert.type === 'error' ? '#721c24' : alert.type === 'warning' ? '#856404' : '#0c5460',
                  cursor: 'pointer',
                  border: `1px solid ${alert.type === 'error' ? '#f5c6cb' : alert.type === 'warning' ? '#ffeaa7' : '#bee5eb'}`,
                  fontSize: '10px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateX(2px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontWeight: '500', flex: 1 }}>{alert.message}</span>
                <span style={{ fontSize: '9px', opacity: 0.7 }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagrindinė informacija - 3 stulpeliai */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
        gap: '10px'
      }}>
        {/* Kairė pusė - Finansai ir Sąskaitos */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* Finansai */}
          {stats.finance && (
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '6px', 
              padding: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💰</span>
                <span>FINANSAI</span>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '6px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <span style={{ color: '#666' }}>Pinigų srautas:</span>
                  <span style={{ fontWeight: '700', color: stats.finance.cash_flow.startsWith('-') ? '#dc3545' : '#28a745', fontSize: '12px' }}>
                    {formatCurrency(stats.finance.cash_flow)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '4px 6px' }}>
                  <span style={{ color: '#666' }}>Apmokėtos išrašytos:</span>
                  <span style={{ fontWeight: '600', color: '#28a745' }}>
                    {formatCurrency(stats.finance.paid_revenue)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '4px 6px' }}>
                  <span style={{ color: '#666' }}>Neapmokėtos išrašytos:</span>
                  <span style={{ fontWeight: '600', color: '#dc3545' }}>
                    {formatCurrency(stats.finance.unpaid_revenue)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '4px 6px' }}>
                  <span style={{ color: '#666' }}>Apmokėtos gautos:</span>
                  <span style={{ fontWeight: '600', color: '#28a745' }}>
                    {formatCurrency(stats.finance.paid_expenses)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '4px 6px' }}>
                  <span style={{ color: '#666' }}>Neapmokėtos gautos:</span>
                  <span style={{ fontWeight: '600', color: '#dc3545' }}>
                    {formatCurrency(stats.finance.unpaid_expenses)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sąskaitos */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '6px', 
            padding: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📄</span>
              <span>SĄSKAITOS</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '8px', backgroundColor: '#d4edda', borderRadius: '4px', border: '1px solid #c3e6cb' }}>
                <div style={{ fontSize: '9px', color: '#155724', marginBottom: '4px', fontWeight: '600' }}>Išrašytos apmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#155724' }}>
                  {stats.invoices.paid_sales.count}
                </div>
                <div style={{ fontSize: '9px', color: '#155724', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.paid_sales.total)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
                <div style={{ fontSize: '9px', color: '#856404', marginBottom: '4px', fontWeight: '600' }}>Išrašytos neapmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#856404' }}>
                  {stats.invoices.unpaid_sales.count}
                </div>
                <div style={{ fontSize: '9px', color: '#856404', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.unpaid_sales.total)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#cce5ff', borderRadius: '4px', border: '1px solid #b8daff' }}>
                <div style={{ fontSize: '9px', color: '#004085', marginBottom: '4px', fontWeight: '600' }}>Išrašytos dalinai apmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#004085' }}>
                  {stats.invoices.partially_paid_sales?.count ?? 0}
                </div>
                <div style={{ fontSize: '9px', color: '#004085', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.partially_paid_sales?.total ?? '0')}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #f5c6cb' }}>
                <div style={{ fontSize: '9px', color: '#721c24', marginBottom: '4px', fontWeight: '600' }}>Išrašytos vėluojančios</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#721c24' }}>
                  {stats.invoices.overdue_sales.count}
                </div>
                {stats.invoices.overdue_sales.oldest_invoices && stats.invoices.overdue_sales.oldest_invoices.length > 0 && (
                  <div style={{ fontSize: '8px', color: '#721c24', marginTop: '2px' }}>
                    Seniausia: {formatDate(stats.invoices.overdue_sales.oldest_invoices[0].due_date)}
                  </div>
                )}
              </div>
              <div style={{ padding: '8px', backgroundColor: '#d4edda', borderRadius: '4px', border: '1px solid #c3e6cb' }}>
                <div style={{ fontSize: '9px', color: '#155724', marginBottom: '4px', fontWeight: '600' }}>Gautos apmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#155724' }}>
                  {stats.invoices.paid_purchase.count}
                </div>
                <div style={{ fontSize: '9px', color: '#155724', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.paid_purchase.total)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
                <div style={{ fontSize: '9px', color: '#856404', marginBottom: '4px', fontWeight: '600' }}>Gautos neapmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#856404' }}>
                  {stats.invoices.unpaid_purchase.count}
                </div>
                <div style={{ fontSize: '9px', color: '#856404', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.unpaid_purchase.total)}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#cce5ff', borderRadius: '4px', border: '1px solid #b8daff' }}>
                <div style={{ fontSize: '9px', color: '#004085', marginBottom: '4px', fontWeight: '600' }}>Gautos dalinai apmokėtos</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#004085' }}>
                  {stats.invoices.partially_paid_purchase?.count ?? 0}
                </div>
                <div style={{ fontSize: '9px', color: '#004085', marginTop: '2px' }}>
                  {formatCurrency(stats.invoices.partially_paid_purchase?.total ?? '0')}
                </div>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #f5c6cb' }}>
                <div style={{ fontSize: '9px', color: '#721c24', marginBottom: '4px', fontWeight: '600' }}>Gautos vėluojančios</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#721c24' }}>
                  {stats.invoices.overdue_purchase.count}
                </div>
                {stats.invoices.overdue_purchase.oldest_invoices && stats.invoices.overdue_purchase.oldest_invoices.length > 0 && (
                  <div style={{ fontSize: '8px', color: '#721c24', marginTop: '2px' }}>
                    Seniausia: {formatDate(stats.invoices.overdue_purchase.oldest_invoices[0].due_date)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Seniausios neapmokėtos sąskaitos */}
          {((stats.invoices.unpaid_sales.oldest_invoices && stats.invoices.unpaid_sales.oldest_invoices.length > 0) || 
            (stats.invoices.unpaid_purchase.oldest_invoices && stats.invoices.unpaid_purchase.oldest_invoices.length > 0)) && (
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '6px', 
              padding: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⏰</span>
                <span>SENIAUSIOS NEAPMOKĖTOS</span>
              </div>
              <div style={{ display: 'grid', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                {stats.invoices.unpaid_sales.oldest_invoices?.slice(0, 3).map((inv: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => navigate(`/invoices?invoice_number=${inv.invoice_number}`)}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '4px',
                      border: '1px solid #ffeaa7',
                      cursor: 'pointer',
                      fontSize: '9px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffeaa7';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff3cd';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#856404', fontFamily: 'monospace' }}>
                      {inv.invoice_number}
                    </div>
                    <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
                      {inv.partner_name} • {formatCurrency(inv.amount_total)}
                    </div>
                    {inv.due_date && (
                      <div style={{ fontSize: '8px', color: '#dc3545', marginTop: '2px' }}>
                        Terminas: {formatDate(inv.due_date)}
                      </div>
                    )}
                  </div>
                ))}
                {stats.invoices.unpaid_purchase.oldest_invoices?.slice(0, 3).map((inv: any, idx: number) => (
                  <div
                    key={`p-${idx}`}
                    onClick={() => navigate(`/invoices?invoice_number=${inv.invoice_number}`)}
                    style={{
                      padding: '6px 8px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '4px',
                      border: '1px solid #ffeaa7',
                      cursor: 'pointer',
                      fontSize: '9px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffeaa7';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff3cd';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#856404', fontFamily: 'monospace' }}>
                      {inv.invoice_number}
                    </div>
                    <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
                      {inv.partner_name} • {formatCurrency(inv.amount_total)}
                    </div>
                    {inv.due_date && (
                      <div style={{ fontSize: '8px', color: '#dc3545', marginTop: '2px' }}>
                        Terminas: {formatDate(inv.due_date)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Vidurys - Užsakymai */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* Užsakymų sekimas */}
          {stats.orders_tracking && (
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '6px', 
              padding: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span>
                <span>UŽSAKYMŲ SEKIMAS</span>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div 
                  onClick={() => navigate('/orders?status=new,assigned,executing')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '4px',
                    border: '1px solid #ffeaa7',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffeaa7';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff3cd';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#856404', fontWeight: '600' }}>⚠️ Be vežėjų</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#856404' }}>
                    {stats.orders_tracking.without_carriers}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders?status=finished')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>ℹ️ Be sąskaitų</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.orders_tracking.finished_without_invoices}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#f8d7da', 
                    borderRadius: '4px',
                    border: '1px solid #f5c6cb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5c6cb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8d7da';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#721c24', fontWeight: '600' }}>⚠️ Su vėluojančiomis</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#721c24' }}>
                    {stats.orders_tracking.with_overdue_invoices}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>📦 Be krovinių</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.orders_tracking.without_cargo ?? 0}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>🛣️ Be maršruto</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.orders_tracking.without_route ?? 0}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>💰 Be kainos klientui</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.orders_tracking.without_client_price ?? 0}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>💰 Be kainos vežėjui</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.orders_tracking.without_carrier_price ?? 0}
                  </span>
                </div>
              </div>
              {stats.orders_tracking.upcoming && stats.orders_tracking.upcoming.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '6px', color: '#666' }}>
                    📅 Artimiausi užsakymai (7d.)
                  </div>
                  <div style={{ display: 'grid', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                    {stats.orders_tracking.upcoming.map((order: any) => (
                      <div
                        key={order.id}
                        onClick={() => navigate(`/orders?order_id=${order.id}`)}
                        style={{
                          padding: '6px 8px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px',
                          border: '1px solid #dee2e6',
                          cursor: 'pointer',
                          fontSize: '9px',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#e9ecef';
                          e.currentTarget.style.transform = 'translateX(2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <div style={{ fontWeight: '600', color: '#495057', fontFamily: 'monospace', marginBottom: '2px' }}>
                          {order.order_number}
                        </div>
                        <div style={{ fontSize: '8px', color: '#6c757d' }}>
                          {order.route_from || '-'} → {order.route_to || '-'}
                        </div>
                        {(order.loading_date || order.unloading_date) && (
                          <div style={{ fontSize: '8px', color: '#999', marginTop: '2px' }}>
                            {order.loading_date && `Pakrovimas: ${formatDate(order.loading_date)}`}
                            {order.loading_date && order.unloading_date && ' • '}
                            {order.unloading_date && `Iškrovimas: ${formatDate(order.unloading_date)}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vežėjų sekimas */}
          {stats.carriers_tracking && (
            <div style={{ 
              backgroundColor: 'white', 
              borderRadius: '6px', 
              padding: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🚚</span>
                <span>VEŽĖJŲ SEKIMAS</span>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <div 
                  onClick={() => navigate('/orders?status=finished')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#d1ecf1', 
                    borderRadius: '4px',
                    border: '1px solid #bee5eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bee5eb';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1ecf1';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#0c5460', fontWeight: '600' }}>ℹ️ Be sąskaitų</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0c5460' }}>
                    {stats.carriers_tracking.without_invoices.count}
                  </span>
                </div>
                <div 
                  onClick={() => navigate('/orders')}
                  style={{ 
                    padding: '8px', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '4px',
                    border: '1px solid #ffeaa7',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffeaa7';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff3cd';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#856404', fontWeight: '600' }}>⚠️ Su vėluojančiomis</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#856404' }}>
                    {stats.carriers_tracking.with_overdue.count}
                  </span>
                </div>
              </div>
              {stats.carriers_tracking.with_overdue.list && stats.carriers_tracking.with_overdue.list.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600', marginBottom: '6px', color: '#666' }}>
                    Vėluojančių sąrašas
                  </div>
                  <div style={{ display: 'grid', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                    {stats.carriers_tracking.with_overdue.list.slice(0, 5).map((carrier: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => navigate(`/orders?order_id=${carrier.order_id}`)}
                        style={{
                          padding: '4px 6px',
                          backgroundColor: '#fff3cd',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '9px',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#ffeaa7';
                          e.currentTarget.style.transform = 'translateX(2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#fff3cd';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <div style={{ fontWeight: '600', color: '#856404', fontFamily: 'monospace' }}>
                          {carrier.order_number}
                        </div>
                        <div style={{ fontSize: '8px', color: '#666' }}>
                          {carrier.carrier_name}
                          {carrier.overdue_days !== undefined && carrier.overdue_days > 0 && (
                            <span style={{ color: '#dc3545', marginLeft: '4px' }}>
                              ({carrier.overdue_days}d)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dešinė pusė - Klientai ir Vežėjai su vėluojančiomis (visada rodoma) */}
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* Klientai su vėluojančiomis */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '6px', 
            padding: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>👥</span>
              <span>KLIENTAI SU VĖLUOJANČIOMIS</span>
              <span style={{ fontSize: '9px', color: '#999', fontWeight: 'normal' }}>({clientsOverdue.length})</span>
            </div>
            <div style={{ display: 'grid', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
              {clientsOverdue.length === 0 ? (
                <div style={{ padding: '12px', color: '#6c757d', fontSize: '11px', textAlign: 'center' }}>Nėra klientų su vėluojančiomis sąskaitomis</div>
              ) : (
                clientsOverdue.slice(0, 10).map((client) => (
                  <div
                    key={client.id}
                    onClick={() => navigate(`/partners/${client.id}`)}
                    style={{
                      padding: '8px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '4px',
                      border: '1px solid #ffc107',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '10px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffeaa7';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff3cd';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#856404', marginBottom: '4px' }}>
                      {client.name}
                    </div>
                    <div style={{ fontSize: '9px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{client.overdue_count || 0} vėluojančios</span>
                      <span style={{ fontWeight: '700', color: '#dc3545' }}>
                        {formatCurrency(client.overdue_total || '0')}
                      </span>
                    </div>
                    {client.oldest_overdue_date && (
                      <div style={{ fontSize: '8px', color: '#999', marginTop: '2px' }}>
                        Seniausia: {formatDate(client.oldest_overdue_date)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Vežėjai su vėluojančiomis */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '6px', 
            padding: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '10px', color: '#495057', borderBottom: '1px solid #eee', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🚚</span>
              <span>VEŽĖJAI SU VĖLUOJANČIOMIS</span>
              <span style={{ fontSize: '9px', color: '#999', fontWeight: 'normal' }}>({carriersOverdue.length})</span>
            </div>
            <div style={{ display: 'grid', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
              {carriersOverdue.length === 0 ? (
                <div style={{ padding: '12px', color: '#6c757d', fontSize: '11px', textAlign: 'center' }}>Nėra vežėjų su vėluojančiomis sąskaitomis</div>
              ) : (
                carriersOverdue.slice(0, 10).map((carrier) => (
                  <div
                    key={carrier.id}
                    onClick={() => navigate(`/partners/${carrier.id}`)}
                    style={{
                      padding: '8px',
                      backgroundColor: '#fff3cd',
                      borderRadius: '4px',
                      border: '1px solid #ffc107',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '10px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ffeaa7';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff3cd';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#856404', marginBottom: '4px' }}>
                      {carrier.name}
                    </div>
                    <div style={{ fontSize: '9px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{carrier.overdue_count || 0} vėluojančios</span>
                      <span style={{ fontWeight: '700', color: '#dc3545' }}>
                        {formatCurrency(carrier.overdue_total || '0')}
                      </span>
                    </div>
                    {carrier.oldest_overdue_date && (
                      <div style={{ fontSize: '8px', color: '#999', marginTop: '2px' }}>
                        Seniausia: {formatDate(carrier.oldest_overdue_date)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
