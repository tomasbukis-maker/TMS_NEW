import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useModule } from '../context/ModuleContext';
import { formatMoney } from '../utils/formatMoney';
import ExpenseDashboardPage from './ExpenseDashboardPage';
import './DashboardPage_NEW.css';

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

type PeriodType = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'last7' | 'last14' | 'last30' | 'last_month' | 'last_quarter' | 'last_year' | 'all' | 'custom';
type FilterBy = 'issue_date' | 'due_date' | 'payment_date' | 'created_at' | 'order_date' | 'loading_date' | 'unloading_date';

const DashboardPage_NEW: React.FC = () => {
  const { t } = useTranslation();
  const { activeModule } = useModule();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientsOverdue, setClientsOverdue] = useState<any[]>([]);
  const [carriersOverdue, setCarriersOverdue] = useState<any[]>([]);
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [filterBy, setFilterBy] = useState<FilterBy>('issue_date');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [compareWithPrevious, setCompareWithPrevious] = useState<boolean>(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const formatCurrency = useCallback((amount: string | number) => formatMoney(amount), []);

  const formatDate = useCallback((dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('lt-LT', { day: '2-digit', month: '2-digit' });
  }, []);

  const getDateRange = useCallback((period: PeriodType): { from: string | null; to: string | null } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        return {
          from: today.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Pirmadienis
        return {
          from: weekStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: monthStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
      }
      case 'quarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
        return {
          from: quarterStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
      }
      case 'year': {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        return {
          from: yearStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        };
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
        return {
          from: `${y}-01-01`,
          to: `${y}-12-31`,
        };
      }
      case 'custom':
        return {
          from: customDateFrom || null,
          to: customDateTo || null,
        };
      case 'all':
      default:
        return { from: null, to: null };
    }
  }, [customDateFrom, customDateTo]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const dateRange = getDateRange(periodType);
      
      const params: any = {
        filter_by: filterBy,
      };

      // Backend palaiko 'all' arba tikslius rėžius (date_from/date_to) arba mėnesį (year/month)
      if (periodType === 'all') {
        params.period_type = 'all';
      } else if (dateRange.from && dateRange.to) {
        // Tikslius rėžiai: šiandien, savaitė, mėnuo, ketvirtis, metai, custom – užsakymų kiekis ir kt. atitinka pasirinktą periodą
        params.period_type = 'month';
        params.date_from = dateRange.from;
        params.date_to = dateRange.to;
      } else {
        const fromDate = new Date(dateRange.from || new Date());
        params.period_type = 'month';
        params.year = fromDate.getFullYear();
        params.month = fromDate.getMonth() + 1;
      }

      const [statsRes, clientsRes, carriersRes] = await Promise.all([
        api.get('/dashboard/statistics/', { params }),
        api.get('/dashboard/clients-overdue/'),
        api.get('/dashboard/carriers-overdue/')
      ]);

      setStats(statsRes.data);
      setClientsOverdue(clientsRes.data.clients || []);
      setCarriersOverdue(carriersRes.data.carriers || []);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error('Klaida užkraunant duomenis:', err);
      console.error('Error details:', err.response?.data);
    } finally {
      setLoading(false);
    }
  }, [periodType, filterBy, getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (activeModule === 'expenses') {
    return <ExpenseDashboardPage />;
  }

  if (loading) {
    return (
      <div className="dashboard-new-container">
        <div className="dashboard-loading">
          <div className="spinner"></div>
          <p>Kraunama...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="dashboard-new-container">
        <div className="dashboard-error">
          <p>Nepavyko užkrauti statistikos</p>
          <button onClick={handleRefresh} className="btn-primary">Bandyti dar kartą</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-new-container">
      {/* Period Selection */}
      <div className="dashboard-period-selector">
        <div className="period-header">
          <button onClick={handleRefresh} className="btn-refresh" title="Atnaujinti">
            🔄 Atnaujinti
          </button>
          <span className="last-refresh">
            Paskutinis atnaujinimas: {lastRefresh.toLocaleTimeString('lt-LT')}
          </span>
        </div>
        <div className="period-quick-buttons">
          <button
            className={`period-btn ${periodType === 'today' ? 'active' : ''}`}
            onClick={() => setPeriodType('today')}
          >
            Šiandien
          </button>
          <button
            className={`period-btn ${periodType === 'week' ? 'active' : ''}`}
            onClick={() => setPeriodType('week')}
          >
            Ši savaitė
          </button>
          <button
            className={`period-btn ${periodType === 'month' ? 'active' : ''}`}
            onClick={() => setPeriodType('month')}
          >
            Šis mėnuo
          </button>
          <button
            className={`period-btn ${periodType === 'quarter' ? 'active' : ''}`}
            onClick={() => setPeriodType('quarter')}
          >
            Šis ketvirtis
          </button>
          <button
            className={`period-btn ${periodType === 'year' ? 'active' : ''}`}
            onClick={() => setPeriodType('year')}
          >
            Šie metai
          </button>
          <button
            className={`period-btn ${periodType === 'last7' ? 'active' : ''}`}
            onClick={() => setPeriodType('last7')}
          >
            Paskutinės 7 d.
          </button>
          <button
            className={`period-btn ${periodType === 'last14' ? 'active' : ''}`}
            onClick={() => setPeriodType('last14')}
          >
            Paskutinės 14 d.
          </button>
          <button
            className={`period-btn ${periodType === 'last30' ? 'active' : ''}`}
            onClick={() => setPeriodType('last30')}
          >
            Paskutiniai 30 d.
          </button>
          <button
            className={`period-btn ${periodType === 'last_month' ? 'active' : ''}`}
            onClick={() => setPeriodType('last_month')}
          >
            Praeitas mėnuo
          </button>
          <button
            className={`period-btn ${periodType === 'last_quarter' ? 'active' : ''}`}
            onClick={() => setPeriodType('last_quarter')}
          >
            Praeitas ketvirtis
          </button>
          <button
            className={`period-btn ${periodType === 'last_year' ? 'active' : ''}`}
            onClick={() => setPeriodType('last_year')}
          >
            Praeiti metai
          </button>
          <button
            className={`period-btn ${periodType === 'all' ? 'active' : ''}`}
            onClick={() => setPeriodType('all')}
          >
            Viso laikotarpio
          </button>
          <button
            className={`period-btn ${periodType === 'custom' ? 'active' : ''}`}
            onClick={() => setPeriodType('custom')}
          >
            Pasirinkti datas
          </button>
        </div>

        {periodType === 'custom' && (
          <div className="custom-date-range">
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="date-input"
              placeholder="Nuo"
            />
            <span>—</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="date-input"
              placeholder="Iki"
            />
          </div>
        )}

        <div className="period-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={compareWithPrevious}
              onChange={(e) => setCompareWithPrevious(e.target.checked)}
            />
            <span>Palyginti su ankstesniu laikotarpiu</span>
          </label>
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterBy)}
            className="filter-select"
          >
            <option value="issue_date">Pagal išrašymo datą</option>
            <option value="due_date">Pagal mokėjimo terminą</option>
            <option value="payment_date">Pagal apmokėjimo datą</option>
            <option value="created_at">Pagal sukūrimo datą</option>
            <option value="order_date">Pagal užsakymo datą</option>
            <option value="loading_date">Pagal pakrovimo datą</option>
            <option value="unloading_date">Pagal iškrovimo datą</option>
          </select>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="dashboard-metrics-grid">
        <div className="metric-card metric-profit">
          <div className="metric-header">
            <span className="metric-icon">💰</span>
            <span className="metric-label">Pelnas</span>
          </div>
          <div className="metric-value">
            {stats.finance ? formatCurrency(stats.finance.monthly_profit) : '0.00 €'}
          </div>
          {stats.finance && (
            <div className="metric-details">
              <div>Pajamos: {formatCurrency(stats.finance.monthly_revenue)}</div>
              <div>Išlaidos: {formatCurrency(stats.finance.monthly_expenses)}</div>
            </div>
          )}
        </div>

        <div
          className="metric-card metric-warning"
          onClick={() => navigate('/invoices?status=overdue')}
        >
          <div className="metric-header">
            <span className="metric-icon">⚠️</span>
            <span className="metric-label">Vėluojančios</span>
          </div>
          <div className="metric-value">
            {(stats.invoices?.overdue_sales?.count || 0) + (stats.invoices?.overdue_purchase?.count || 0)}
          </div>
          <div className="metric-details">
            Išrašytos: {stats.invoices?.overdue_sales?.count || 0} | Gautos: {stats.invoices?.overdue_purchase?.count || 0}
          </div>
        </div>

        <div
          className="metric-card metric-info"
          onClick={() => navigate('/orders')}
        >
          <div className="metric-header">
            <span className="metric-icon">📋</span>
            <span className="metric-label">Užsakymai</span>
          </div>
          <div className="metric-value">
            {stats.orders?.total ?? 0}
          </div>
          <div className="metric-details">
            Nauji: {stats.orders?.new ?? 0} | Priskirti: {stats.orders?.assigned ?? 0} | Vykdomi: {stats.orders?.executing ?? 0} | Laukia: {(stats.orders?.waiting_for_docs ?? 0) + (stats.orders?.waiting_for_payment ?? 0)} | Baigti: {stats.orders?.finished ?? 0} | Uždaryti: {stats.orders?.closed ?? 0} | Atšaukti: {stats.orders?.canceled ?? 0}
          </div>
          <div className="metric-hint">Viso užsakymų</div>
        </div>

        <div
          className="metric-card metric-warning"
          onClick={() => navigate('/invoices?status=unpaid')}
        >
          <div className="metric-header">
            <span className="metric-icon">📄</span>
            <span className="metric-label">Neapmokėtos</span>
          </div>
          <div className="metric-value">
            {stats.invoices.unpaid_sales.count + stats.invoices.unpaid_purchase.count}
          </div>
          <div className="metric-details">
            Išrašytos: {stats.invoices.unpaid_sales.count} | Gautos: {stats.invoices.unpaid_purchase.count}
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {stats.alerts && stats.alerts.length > 0 && (
        <div className="dashboard-alerts">
          <div className="section-header">
            <h2>⚠️ Skubūs pranešimai ({stats.alerts.length})</h2>
          </div>
          <div className="alerts-grid">
            {stats.alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`alert-item alert-${alert.type || 'info'}`}
                onClick={() => navigate(alert.link)}
              >
                <span>{alert.message}</span>
                <span className="alert-arrow">→</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="dashboard-content-grid">
        {/* Left Column - Finances & Invoices */}
        <div className="dashboard-column">
          {/* Finances */}
          {stats.finance && (
            <div className="dashboard-section">
              <div className="section-header">
                <h2>💰 Finansai</h2>
              </div>
              <div className="section-content">
                <div className="finance-item">
                  <span className="finance-label">Pinigų srautas:</span>
                  <span className={`finance-value ${stats.finance.cash_flow.startsWith('-') ? 'negative' : 'positive'}`}>
                    {formatCurrency(stats.finance.cash_flow)}
                  </span>
                </div>
                <div className="finance-item">
                  <span className="finance-label">Apmokėtos išrašytos:</span>
                  <span className="finance-value positive">
                    {formatCurrency(stats.finance.paid_revenue)}
                  </span>
                </div>
                <div className="finance-item">
                  <span className="finance-label">Neapmokėtos išrašytos:</span>
                  <span className="finance-value negative">
                    {formatCurrency(stats.finance.unpaid_revenue)}
                  </span>
                </div>
                <div className="finance-item">
                  <span className="finance-label">Apmokėtos gautos:</span>
                  <span className="finance-value positive">
                    {formatCurrency(stats.finance.paid_expenses)}
                  </span>
                </div>
                <div className="finance-item">
                  <span className="finance-label">Neapmokėtos gautos:</span>
                  <span className="finance-value negative">
                    {formatCurrency(stats.finance.unpaid_expenses)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Invoices */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>📄 Sąskaitos</h2>
            </div>
            <div className="invoices-grid">
              <div className="invoice-card invoice-paid">
                <div className="invoice-label">Išrašytos apmokėtos</div>
                <div className="invoice-count">{stats.invoices.paid_sales.count}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.paid_sales.total)}</div>
              </div>
              <div className="invoice-card invoice-unpaid">
                <div className="invoice-label">Išrašytos neapmokėtos</div>
                <div className="invoice-count">{stats.invoices.unpaid_sales.count}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.unpaid_sales.total)}</div>
              </div>
              <div className="invoice-card invoice-partially-paid">
                <div className="invoice-label">Išrašytos dalinai apmokėtos</div>
                <div className="invoice-count">{stats.invoices.partially_paid_sales?.count ?? 0}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.partially_paid_sales?.total ?? '0')}</div>
              </div>
              <div className="invoice-card invoice-overdue">
                <div className="invoice-label">Išrašytos vėluojančios</div>
                <div className="invoice-count">{stats.invoices.overdue_sales.count}</div>
                {stats.invoices.overdue_sales.oldest_invoices && stats.invoices.overdue_sales.oldest_invoices.length > 0 && (
                  <div className="invoice-detail">
                    Seniausia: {formatDate(stats.invoices.overdue_sales.oldest_invoices[0].due_date)}
                  </div>
                )}
              </div>
              <div className="invoice-card invoice-paid">
                <div className="invoice-label">Gautos apmokėtos</div>
                <div className="invoice-count">{stats.invoices.paid_purchase.count}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.paid_purchase.total)}</div>
              </div>
              <div className="invoice-card invoice-unpaid">
                <div className="invoice-label">Gautos neapmokėtos</div>
                <div className="invoice-count">{stats.invoices.unpaid_purchase.count}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.unpaid_purchase.total)}</div>
              </div>
              <div className="invoice-card invoice-partially-paid">
                <div className="invoice-label">Gautos dalinai apmokėtos</div>
                <div className="invoice-count">{stats.invoices.partially_paid_purchase?.count ?? 0}</div>
                <div className="invoice-amount">{formatCurrency(stats.invoices.partially_paid_purchase?.total ?? '0')}</div>
              </div>
              <div className="invoice-card invoice-overdue">
                <div className="invoice-label">Gautos vėluojančios</div>
                <div className="invoice-count">{stats.invoices.overdue_purchase.count}</div>
                {stats.invoices.overdue_purchase.oldest_invoices && stats.invoices.overdue_purchase.oldest_invoices.length > 0 && (
                  <div className="invoice-detail">
                    Seniausia: {formatDate(stats.invoices.overdue_purchase.oldest_invoices[0].due_date)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column - Orders & Carriers */}
        <div className="dashboard-column">
          {/* Orders Tracking */}
          {stats.orders_tracking && (
            <div className="dashboard-section">
              <div className="section-header">
                <h2>📋 Užsakymų sekimas</h2>
              </div>
              <div className="section-content">
                <div
                  className="tracking-item tracking-warning"
                  onClick={() => navigate('/orders?status=new,assigned,executing')}
                >
                  <span>⚠️ Be vežėjų</span>
                  <span className="tracking-count">{stats.orders_tracking?.without_carriers ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-info"
                  onClick={() => navigate('/orders?status=finished')}
                >
                  <span>ℹ️ Be sąskaitų</span>
                  <span className="tracking-count">{stats.orders_tracking?.finished_without_invoices ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-error"
                  onClick={() => navigate('/orders')}
                >
                  <span>⚠️ Su vėluojančiomis</span>
                  <span className="tracking-count">{stats.orders_tracking?.with_overdue_invoices ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-info"
                  onClick={() => navigate('/orders')}
                >
                  <span>📦 Be krovinių</span>
                  <span className="tracking-count">{stats.orders_tracking?.without_cargo ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-info"
                  onClick={() => navigate('/orders')}
                >
                  <span>🛣️ Be maršruto</span>
                  <span className="tracking-count">{stats.orders_tracking?.without_route ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-info"
                  onClick={() => navigate('/orders')}
                >
                  <span>💰 Be kainos klientui</span>
                  <span className="tracking-count">{stats.orders_tracking?.without_client_price ?? 0}</span>
                </div>
                <div
                  className="tracking-item tracking-info"
                  onClick={() => navigate('/orders')}
                >
                  <span>💰 Be kainos vežėjui</span>
                  <span className="tracking-count">{stats.orders_tracking?.without_carrier_price ?? 0}</span>
                </div>
              </div>
              <div className="upcoming-orders">
                <div className="subsection-header">📅 Artimiausi užsakymai (7d.)</div>
                {stats.orders_tracking?.upcoming && stats.orders_tracking.upcoming.length > 0 ? (
                  <div className="upcoming-list">
                    {stats.orders_tracking.upcoming.map((order: any) => (
                      <div
                        key={order.id}
                        className="upcoming-item"
                        onClick={() => navigate(`/orders?order_id=${order.id}`)}
                      >
                        <div className="upcoming-number">{order.order_number}</div>
                        <div className="upcoming-route">
                          {order.route_from || '-'} → {order.route_to || '-'}
                        </div>
                        {(order.loading_date || order.unloading_date) && (
                          <div className="upcoming-dates">
                            {order.loading_date && `Pakrovimas: ${formatDate(order.loading_date)}`}
                            {order.loading_date && order.unloading_date && ' • '}
                            {order.unloading_date && `Iškrovimas: ${formatDate(order.unloading_date)}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-empty-hint">Nėra artimiausiu užsakymų per 7 dienas</div>
                )}
              </div>
            </div>
          )}

          {/* Carriers Tracking */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>🚚 Vežėjų sekimas</h2>
            </div>
            <div className="section-content">
              <div
                className="tracking-item tracking-info"
                onClick={() => navigate('/orders?status=finished')}
              >
                <span>ℹ️ Be sąskaitų</span>
                <span className="tracking-count">{stats.carriers_tracking?.without_invoices?.count ?? 0}</span>
              </div>
              <div
                className="tracking-item tracking-warning"
                onClick={() => navigate('/orders')}
              >
                <span>⚠️ Su vėluojančiomis</span>
                <span className="tracking-count">{stats.carriers_tracking?.with_overdue?.count ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Clients & Carriers with Overdue */}
        <div className="dashboard-column">
          {/* Clients with Overdue - visada rodoma */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>👥 Klientai su vėluojančiomis ({clientsOverdue.length})</h2>
            </div>
            <div className="overdue-list">
              {clientsOverdue.length === 0 ? (
                <div className="dashboard-empty-hint">Nėra klientų su vėluojančiomis sąskaitomis</div>
              ) : (
                clientsOverdue.slice(0, 10).map((client) => (
                  <div
                    key={client.id}
                    className="overdue-item"
                    onClick={() => navigate(`/partners/${client.id}`)}
                  >
                    <div className="overdue-name">{client.name}</div>
                    <div className="overdue-details">
                      <span>{client.overdue_count || 0} vėluojančios</span>
                      <span className="overdue-amount">{formatCurrency(client.overdue_total || '0')}</span>
                    </div>
                    {client.oldest_overdue_date && (
                      <div className="overdue-date">
                        Seniausia: {formatDate(client.oldest_overdue_date)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Carriers with Overdue - visada rodoma */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>🚚 Vežėjai su vėluojančiomis ({carriersOverdue.length})</h2>
            </div>
            <div className="overdue-list">
              {carriersOverdue.length === 0 ? (
                <div className="dashboard-empty-hint">Nėra vežėjų su vėluojančiomis sąskaitomis</div>
              ) : (
                carriersOverdue.slice(0, 10).map((carrier) => (
                  <div
                    key={carrier.id}
                    className="overdue-item"
                    onClick={() => navigate(`/partners/${carrier.id}`)}
                  >
                    <div className="overdue-name">{carrier.name}</div>
                    <div className="overdue-details">
                      <span>{carrier.overdue_count || 0} vėluojančios</span>
                      <span className="overdue-amount">{formatCurrency(carrier.overdue_total || '0')}</span>
                    </div>
                    {carrier.oldest_overdue_date && (
                      <div className="overdue-date">
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

export default DashboardPage_NEW;
