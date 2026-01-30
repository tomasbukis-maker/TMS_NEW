import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import './ExpensesPage.css';

interface ExpenseSupplier {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

interface ExpenseCategory {
  id: number;
  name: string;
  is_active: boolean;
}

interface ExpenseInvoice {
  id: number;
  invoice_number: string;
  supplier: number;
  supplier_name?: string;
  category: number;
  category_name?: string;
  amount_net: string;
  vat_amount: string;
  amount_total: string;
  currency: string;
  issue_date: string;
  due_date?: string;
  payment_date?: string;
  payment_status: 'unpaid' | 'paid' | 'overdue';
  payment_method?: string;
  invoice_file?: string;
  notes?: string;
  created_at: string;
}

const ExpenseInvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<ExpenseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<ExpenseSupplier[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ExpenseInvoice | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'overdue'>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    invoice_number: '',
    supplier: '',
    category: '',
    amount_net: '',
    vat_amount: '',
    amount_total: '',
    currency: 'EUR',
    issue_date: '',
    due_date: '',
    payment_date: '',
    payment_status: 'unpaid' as 'unpaid' | 'paid' | 'overdue',
    payment_method: '',
    notes: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invoicesRes, suppliersRes, categoriesRes] = await Promise.all([
        api.get('/expenses/invoices/?page_size=1000'),
        api.get('/expenses/suppliers/?page_size=1000'),
        api.get('/expenses/categories/?page_size=1000')
      ]);
      setInvoices(Array.isArray(invoicesRes.data) ? invoicesRes.data : invoicesRes.data.results || []);
      setSuppliers(Array.isArray(suppliersRes.data) ? suppliersRes.data : suppliersRes.data.results || []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : categoriesRes.data.results || []);
    } catch (error) {
      console.error('Klaida užkraunant duomenis:', error);
      alert('Klaida užkraunant duomenis');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) data.append(key, value);
      });
      if (selectedFile) {
        data.append('invoice_file', selectedFile);
      }

      if (editingInvoice) {
        await api.put(`/expenses/invoices/${editingInvoice.id}/`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await api.post('/expenses/invoices/', data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      fetchData();
      handleCloseModal();
    } catch (error: any) {
      console.error('Klaida išsaugant sąskaitą:', error);
      alert(error.response?.data?.invoice_number?.[0] || 'Klaida išsaugant sąskaitą');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šią sąskaitą?')) return;
    try {
      await api.delete(`/expenses/invoices/${id}/`);
      fetchData();
    } catch (error) {
      console.error('Klaida trinant sąskaitą:', error);
      alert('Klaida trinant sąskaitą');
    }
  };

  const handleEdit = (invoice: ExpenseInvoice) => {
    setEditingInvoice(invoice);
    setFormData({
      invoice_number: invoice.invoice_number,
      supplier: invoice.supplier.toString(),
      category: invoice.category.toString(),
      amount_net: invoice.amount_net,
      vat_amount: invoice.vat_amount,
      amount_total: invoice.amount_total,
      currency: invoice.currency,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date || '',
      payment_date: invoice.payment_date || '',
      payment_status: invoice.payment_status,
      payment_method: invoice.payment_method || '',
      notes: invoice.notes || ''
    });
    setSelectedFile(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingInvoice(null);
    setFormData({
      invoice_number: '',
      supplier: '',
      category: '',
      amount_net: '',
      vat_amount: '',
      amount_total: '',
      currency: 'EUR',
      issue_date: '',
      due_date: '',
      payment_date: '',
      payment_status: 'unpaid',
      payment_method: '',
      notes: ''
    });
    setSelectedFile(null);
  };

  const calculateTotal = () => {
    const net = parseFloat(formData.amount_net) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    setFormData({ ...formData, amount_total: (net + vat).toFixed(2) });
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.category_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.payment_status === statusFilter;
    const matchesSupplier = supplierFilter === 'all' || invoice.supplier.toString() === supplierFilter;
    const matchesCategory = categoryFilter === 'all' || invoice.category.toString() === categoryFilter;
    return matchesSearch && matchesStatus && matchesSupplier && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return 'badge-success';
      case 'unpaid': return 'badge-warning';
      case 'overdue': return 'badge-danger';
      default: return 'badge-secondary';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Apmokėta';
      case 'unpaid': return 'Neapmokėta';
      case 'overdue': return 'Vėluojanti';
      default: return status;
    }
  };

  return (
    <div className="invoices-page">
      <div className="page-header">
        <h1>💵 Išlaidų sąskaitos</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Nauja sąskaita
        </button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Ieškoti pagal numerį, tiekėją, kategoriją..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="filter-select"
        >
          <option value="all">Visi statusai</option>
          <option value="unpaid">Neapmokėtos</option>
          <option value="paid">Apmokėtos</option>
          <option value="overdue">Vėluojančios</option>
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">Visi tiekėjai</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">Visos kategorijos</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Kraunama...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sąskaitos Nr.</th>
                <th>Tiekėjas</th>
                <th>Kategorija</th>
                <th>Suma</th>
                <th>Išrašymo data</th>
                <th>Apmokėjimo data</th>
                <th>Statusas</th>
                <th>Failas</th>
                <th>Veiksmai</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '20px' }}>
                    Nerasta sąskaitų
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.invoice_number}</strong></td>
                    <td>{invoice.supplier_name || `#${invoice.supplier}`}</td>
                    <td>{invoice.category_name || `#${invoice.category}`}</td>
                    <td>{parseFloat(invoice.amount_total).toFixed(2)} {invoice.currency}</td>
                    <td>{new Date(invoice.issue_date).toLocaleDateString('lt-LT')}</td>
                    <td>{invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString('lt-LT') : '-'}</td>
                    <td>
                      <span className={`badge ${getStatusBadge(invoice.payment_status)}`}>
                        {getStatusText(invoice.payment_status)}
                      </span>
                    </td>
                    <td>
                      {invoice.invoice_file ? (
                        <a href={invoice.invoice_file} target="_blank" rel="noopener noreferrer" className="file-link">
                          📄
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      <button className="btn-edit" onClick={() => handleEdit(invoice)}>✏️</button>
                      <button className="btn-delete" onClick={() => handleDelete(invoice.id)}>🗑️</button>
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
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingInvoice ? 'Redaguoti sąskaitą' : 'Nauja sąskaita'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Sąskaitos numeris *</label>
                  <input
                    type="text"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Tiekėjas *</label>
                  <select
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    required
                  >
                    <option value="">Pasirinkite tiekėją</option>
                    {suppliers.filter(s => s.status === 'active').map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Kategorija *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  >
                    <option value="">Pasirinkite kategoriją</option>
                    {categories.filter(c => c.is_active).map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Suma be PVM *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount_net}
                    onChange={(e) => setFormData({ ...formData, amount_net: e.target.value })}
                    onBlur={calculateTotal}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>PVM suma *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vat_amount}
                    onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
                    onBlur={calculateTotal}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Galutinė suma *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount_total}
                    onChange={(e) => setFormData({ ...formData, amount_total: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Valiuta</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Išrašymo data *</label>
                  <input
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Apmokėjimo terminas</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Apmokėjimo data</label>
                  <input
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Apmokėjimo statusas</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                  >
                    <option value="unpaid">Neapmokėta</option>
                    <option value="paid">Apmokėta</option>
                    <option value="overdue">Vėluojanti</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Apmokėjimo būdas</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  >
                    <option value="">Pasirinkite</option>
                    <option value="bank_transfer">Banko pavedimu</option>
                    <option value="cash">Grynaisiais</option>
                    <option value="card">Kortele</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Sąskaitos failas (PDF, JPG, PNG)</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {editingInvoice?.invoice_file && (
                    <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                      Dabartinis failas: <a href={editingInvoice.invoice_file} target="_blank" rel="noopener noreferrer">Peržiūrėti</a>
                    </small>
                  )}
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
                  {editingInvoice ? 'Išsaugoti' : 'Sukurti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseInvoicesPage;

