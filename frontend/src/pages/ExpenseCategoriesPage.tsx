import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './ExpensesPage.css';

interface ExpenseCategory {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

const ExpenseCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get('/expenses/categories/?page_size=1000');
      setCategories(Array.isArray(response.data) ? response.data : response.data.results || []);
    } catch (error) {
      console.error('Klaida užkraunant kategorijas:', error);
      alert('Klaida užkraunant kategorijas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await api.put(`/expenses/categories/${editingCategory.id}/`, formData);
      } else {
        await api.post('/expenses/categories/', formData);
      }
      fetchCategories();
      handleCloseModal();
    } catch (error: any) {
      console.error('Klaida išsaugant kategoriją:', error);
      alert(error.response?.data?.name?.[0] || 'Klaida išsaugant kategoriją');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šią kategoriją?')) return;
    try {
      await api.delete(`/expenses/categories/${id}/`);
      fetchCategories();
    } catch (error) {
      console.error('Klaida trinant kategoriją:', error);
      alert('Klaida trinant kategoriją');
    }
  };

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      is_active: category.is_active
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      is_active: true
    });
  };

  const filteredCategories = categories.filter(category => {
    const matchesSearch = category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         category.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && category.is_active) ||
                         (statusFilter === 'inactive' && !category.is_active);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="partners-page">
      <div className="page-header">
        <h1>📂 Išlaidų kategorijos</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Nauja kategorija
        </button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Ieškoti pagal pavadinimą ar aprašymą..."
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
          <option value="active">Aktyvios</option>
          <option value="inactive">Neaktyvios</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Kraunama...</div>
      ) : (
        <div className="cards-container">
          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Nerasta kategorijų
            </div>
          ) : (
            filteredCategories.map(category => (
              <div key={category.id} className="card">
                <div className="card-header">
                  <h3>{category.name}</h3>
                  <span className={`badge ${category.is_active ? 'badge-success' : 'badge-secondary'}`}>
                    {category.is_active ? 'Aktyvi' : 'Neaktyvi'}
                  </span>
                </div>
                {category.description && (
                  <div className="card-body">
                    <p style={{ fontSize: '13px', color: '#666', margin: '8px 0' }}>
                      {category.description}
                    </p>
                  </div>
                )}
                <div className="card-footer">
                  <small style={{ color: '#999' }}>
                    Sukurta: {new Date(category.created_at).toLocaleDateString('lt-LT')}
                  </small>
                  <div>
                    <button
                      className="btn-edit"
                      onClick={() => handleEdit(category)}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(category.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Redaguoti kategoriją' : 'Nauja kategorija'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Pavadinimas *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="pvz., Kuras, Telekomunikacijos, Padangų montavimas"
                />
              </div>
              <div className="form-group">
                <label>Aprašymas</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Papildoma informacija apie kategoriją..."
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  Aktyvi kategorija
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Atšaukti
                </button>
                <button type="submit" className="btn-primary">
                  {editingCategory ? 'Išsaugoti' : 'Sukurti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseCategoriesPage;

