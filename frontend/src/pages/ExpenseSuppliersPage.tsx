import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './ExpensesPage.css';

interface ExpenseSupplier {
  id: number;
  name: string;
  code?: string;
  vat_code?: string;
  address?: string;
  email?: string;
  phone?: string;
  bank_account?: string;
  contact_person?: string;
  status: 'active' | 'inactive';
  notes?: string;
  created_at: string;
}

const ExpenseSuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<ExpenseSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<ExpenseSupplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    vat_code: '',
    address: '',
    email: '',
    phone: '',
    bank_account: '',
    contact_person: '',
    status: 'active' as 'active' | 'inactive',
    notes: ''
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/expenses/suppliers/?page_size=1000');
      setSuppliers(Array.isArray(response.data) ? response.data : response.data.results || []);
    } catch (error) {
      console.error('Klaida užkraunant tiekėjus:', error);
      alert('Klaida užkraunant tiekėjus');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await api.put(`/expenses/suppliers/${editingSupplier.id}/`, formData);
      } else {
        await api.post('/expenses/suppliers/', formData);
      }
      fetchSuppliers();
      handleCloseModal();
    } catch (error: any) {
      console.error('Klaida išsaugant tiekėją:', error);
      alert(error.response?.data?.name?.[0] || 'Klaida išsaugant tiekėją');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šį tiekėją?')) return;
    try {
      await api.delete(`/expenses/suppliers/${id}/`);
      fetchSuppliers();
    } catch (error) {
      console.error('Klaida trinant tiekėją:', error);
      alert('Klaida trinant tiekėją');
    }
  };

  const handleEdit = (supplier: ExpenseSupplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      code: supplier.code || '',
      vat_code: supplier.vat_code || '',
      address: supplier.address || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      bank_account: supplier.bank_account || '',
      contact_person: supplier.contact_person || '',
      status: supplier.status,
      notes: supplier.notes || ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      code: '',
      vat_code: '',
      address: '',
      email: '',
      phone: '',
      bank_account: '',
      contact_person: '',
      status: 'active',
      notes: ''
    });
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         supplier.vat_code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || supplier.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="partners-page">
      <div className="page-header">
        <h1>🏪 Tiekėjai (Kitos išlaidos)</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Naujas tiekėjas
        </button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Ieškoti pagal pavadinimą, kodą, PVM kodą..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="filter-select"
        >
          <option value="all">Visi statusai</option>
          <option value="active">Aktyvūs</option>
          <option value="inactive">Neaktyvūs</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Kraunama...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pavadinimas</th>
                <th>Kodas</th>
                <th>PVM kodas</th>
                <th>Kontaktinis asmuo</th>
                <th>Telefonas</th>
                <th>El. paštas</th>
                <th>Statusas</th>
                <th>Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>
                    Nerasta tiekėjų
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(supplier => (
                  <tr key={supplier.id}>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{supplier.code || '-'}</td>
                    <td>{supplier.vat_code || '-'}</td>
                    <td>{supplier.contact_person || '-'}</td>
                    <td>{supplier.phone || '-'}</td>
                    <td>{supplier.email || '-'}</td>
                    <td>
                      <span className={`badge ${supplier.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                        {supplier.status === 'active' ? 'Aktyvus' : 'Neaktyvus'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(supplier)}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(supplier.id)}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSupplier ? 'Redaguoti tiekėją' : 'Naujas tiekėjas'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Pavadinimas *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Kodas</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>PVM kodas</label>
                  <input
                    type="text"
                    value={formData.vat_code}
                    onChange={(e) => setFormData({ ...formData, vat_code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Kontaktinis asmuo</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefonas</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>El. paštas</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Adresas</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Banko sąskaita</label>
                  <input
                    type="text"
                    value={formData.bank_account}
                    onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Statusas</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  >
                    <option value="active">Aktyvus</option>
                    <option value="inactive">Neaktyvus</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Pastabos</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Atšaukti
                </button>
                <button type="submit" className="btn-primary">
                  {editingSupplier ? 'Išsaugoti' : 'Sukurti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseSuppliersPage;

