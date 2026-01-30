import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './ExpensesPage.css';

interface Statistics {
  total_amount: number;
  total_unpaid: number;
  total_overdue: number;
  count_total: number;
  count_unpaid: number;
  count_overdue: number;
  by_category: Array<{ category__name: string; total: number; count: number }>;
  by_supplier: Array<{ supplier__name: string; total: number; count: number }>;
}

const ExpenseDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Statistics | null>(null);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const response = await api.get('/expenses/invoices/statistics/');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="expense-dashboard-page"><div className="loading">Kraunama...</div></div>;
  }

  return (
    <div className="expense-dashboard-page">
      <div className="expense-dashboard-container">
        <h1>💰 Kitos išlaidos - Statistika</h1>

        {/* Stats Cards */}
        <div className="expense-stats-grid">
          <div className="expense-stat-card expense-stat-card-blue">
            <div className="expense-stat-icon">💵</div>
            <div className="expense-stat-content">
              <div className="expense-stat-label">Iš viso sąskaitų</div>
              <div className="expense-stat-value">{stats?.count_total || 0}</div>
              <div className="expense-stat-sublabel">
                Suma: {Number(stats?.total_amount || 0).toFixed(2)} €
              </div>
            </div>
          </div>

          <div className="expense-stat-card expense-stat-card-orange">
            <div className="expense-stat-icon">⏳</div>
            <div className="expense-stat-content">
              <div className="expense-stat-label">Neapmokėtos</div>
              <div className="expense-stat-value">{stats?.count_unpaid || 0}</div>
              <div className="expense-stat-sublabel">
                Suma: {Number(stats?.total_unpaid || 0).toFixed(2)} €
              </div>
            </div>
          </div>

          <div className="expense-stat-card expense-stat-card-red">
            <div className="expense-stat-icon">⚠️</div>
            <div className="expense-stat-content">
              <div className="expense-stat-label">Vėluojančios</div>
              <div className="expense-stat-value">{stats?.count_overdue || 0}</div>
              <div className="expense-stat-sublabel">
                Suma: {Number(stats?.total_overdue || 0).toFixed(2)} €
              </div>
            </div>
          </div>
        </div>

        {/* By Category */}
        <div className="expense-dashboard-section">
          <h2>📂 Išlaidos pagal kategorijas (Top 10)</h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kategorija</th>
                  <th>Kiekis</th>
                  <th>Suma (€)</th>
                </tr>
              </thead>
              <tbody>
                {stats?.by_category && stats.by_category.length > 0 ? (
                  stats.by_category.map((cat, idx) => (
                    <tr key={idx}>
                      <td>{cat.category__name}</td>
                      <td>{cat.count}</td>
                      <td>{Number(cat.total).toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center' }}>
                      Nėra duomenų
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Supplier */}
        <div className="expense-dashboard-section">
          <h2>🏪 Išlaidos pagal tiekėjus (Top 10)</h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tiekėjas</th>
                  <th>Kiekis</th>
                  <th>Suma (€)</th>
                </tr>
              </thead>
              <tbody>
                {stats?.by_supplier && stats.by_supplier.length > 0 ? (
                  stats.by_supplier.map((sup, idx) => (
                    <tr key={idx}>
                      <td>{sup.supplier__name}</td>
                      <td>{sup.count}</td>
                      <td>{Number(sup.total).toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center' }}>
                      Nėra duomenų
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseDashboardPage;

