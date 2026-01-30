import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../../services/api';
import '../../pages/SettingsPage.css';

interface RoleOption {
  id: number;
  name: string;
  description?: string;
}

interface UserItem {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  position?: string;
  is_active: boolean;
  role?: {
    id: number;
    name: string;
    description?: string;
  } | null;
  created_at?: string;
}

interface UserFormState {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  position?: string;
  role_id: number | null;
  is_active: boolean;
  password?: string;
  password_confirm?: string;
}

interface UserManagementSectionProps {
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

const emptyForm: UserFormState = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  position: '',
  role_id: null,
  is_active: true,
  password: '',
  password_confirm: '',
};

const UserManagementSection: React.FC<UserManagementSectionProps> = ({ onMessage }) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/auth/users/'),
        api.get('/auth/roles/'),
      ]);
      const usersData = Array.isArray(usersRes.data)
        ? usersRes.data
        : Array.isArray(usersRes.data?.results)
          ? usersRes.data.results
          : [];
      const rolesData = Array.isArray(rolesRes.data)
        ? rolesRes.data
        : Array.isArray(rolesRes.data?.results)
          ? rolesRes.data.results
          : [];
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Nepavyko įkelti vartotojų sąrašo.';
      onMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const filteredUsers = useMemo<UserItem[]>(() => {
    if (!Array.isArray(users)) return [];
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((user) =>
      [user.username, user.email, user.first_name, user.last_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
    );
  }, [users, search]);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEditModal = (user: UserItem) => {
    setModalMode('edit');
    setSelectedUser(user);
    setForm({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      position: user.position || '',
      role_id: user.role?.id ?? null,
      is_active: user.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setSelectedUser(null);
    setForm({ ...emptyForm });
  };

  const handleFormChange = (field: keyof UserFormState, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    onMessage(null);

    try {
      if (modalMode === 'create') {
        if (!form.password || !form.password_confirm) {
          onMessage({ type: 'error', text: 'Prašome įvesti slaptažodį ir jo patvirtinimą.' });
          setSaving(false);
          return;
        }
      }
      
      if (modalMode === 'create') {
        await api.post('/auth/users/', {
          username: form.username,
          email: form.email || undefined,
          first_name: form.first_name || undefined,
          last_name: form.last_name || undefined,
          phone: form.phone || undefined,
          position: form.position || undefined,
          role_id: form.role_id ?? null,
          password: form.password,
          password_confirm: form.password_confirm,
        });
        onMessage({ type: 'success', text: 'Vartotojas sėkmingai sukurtas.' });
      } else if (selectedUser) {
        const payload: any = {
          username: form.username,
          role_id: form.role_id ?? null,
          is_active: form.is_active,
          email: form.email || '',
          first_name: form.first_name || '',
          last_name: form.last_name || '',
          phone: form.phone || '',
          position: form.position || '',
        };

        await api.put(`/auth/users/${selectedUser.id}/`, payload);
        onMessage({ type: 'success', text: 'Vartotojo informacija atnaujinta.' });
      }
      await fetchInitialData();
      closeModal();
    } catch (error: any) {
      const errorMsg = error.response?.data;
      if (typeof errorMsg === 'string') {
        onMessage({ type: 'error', text: errorMsg });
      } else if (errorMsg?.password) {
        onMessage({ type: 'error', text: Array.isArray(errorMsg.password) ? errorMsg.password.join(', ') : String(errorMsg.password) });
      } else {
        onMessage({ type: 'error', text: error.message || 'Nepavyko išsaugoti vartotojo.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: UserItem) => {
    if (!window.confirm(`Ar tikrai norite pašalinti vartotoją ${user.username}?`)) {
      return;
    }
    onMessage(null);
    try {
      await api.delete(`/auth/users/${user.id}/`);
      onMessage({ type: 'success', text: 'Vartotojas pašalintas.' });
      await fetchInitialData();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Nepavyko pašalinti vartotojo.';
      onMessage({ type: 'error', text: errorMsg });
    }
  };

  return (
    <div className="user-management">
      <div className="user-management-header">
        <div>
          <h2>Vartotojų valdymas</h2>
          <p>Peržiūrėkite, kurkite ir redaguokite sistemos vartotojus.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          + Naujas vartotojas
        </button>
      </div>

      <div className="user-management-toolbar">
        <input
          type="text"
          placeholder="Paieška pagal vardą, el. paštą ar slapyvardį..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Kraunama...</p>
      ) : (
        <div className="user-table-wrapper">
          <table className="user-table">
            <thead>
              <tr>
                <th>Vartotojas</th>
                <th>El. paštas</th>
                <th>Rolė</th>
                <th>Būsena</th>
                <th>Sukurta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <span className="username">{user.username}</span>
                      {(user.first_name || user.last_name) && (
                        <span className="sub">{`${user.first_name || ''} ${user.last_name || ''}`.trim()}</span>
                      )}
                    </div>
                  </td>
                  <td>{user.email || '—'}</td>
                  <td>{user.role?.name || 'Be rolės'}</td>
                  <td>
                    <span className={`status-chip ${user.is_active ? 'active' : 'inactive'}`}>
                      {user.is_active ? 'Aktyvus' : 'Neaktyvus'}
                    </span>
                  </td>
                  <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
                  <td className="actions">
                    <button className="btn btn-secondary" onClick={() => openEditModal(user)}>
                      Redaguoti
                    </button>
                    <button className="btn btn-danger subtle" onClick={() => handleDelete(user)}>
                      Šalinti
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '16px' }}>
                    Vartotojų nerasta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{modalMode === 'create' ? 'Sukurti naują vartotoją' : `Redaguoti ${selectedUser?.username}`}</h3>
              <button className="modal-close" onClick={closeModal} disabled={saving}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body user-form">
              <div className="form-grid columns-2 compact">
                <div className="form-field">
                  <label>Vartotojo vardas *</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => handleFormChange('username', e.target.value)}
                    required
                    disabled={modalMode === 'edit'}
                  />
                </div>
                <div className="form-field">
                  <label>El. paštas</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Vardas</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => handleFormChange('first_name', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Pavardė</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => handleFormChange('last_name', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Telefonas</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Pareigos</label>
                  <input
                    type="text"
                    value={form.position || ''}
                    onChange={(e) => handleFormChange('position', e.target.value)}
                    placeholder="pvz., Vadybininkas, Direktorius"
                  />
                </div>
                <div className="form-field">
                  <label>Rolė</label>
                  <select
                    value={form.role_id ?? ''}
                    onChange={(e) =>
                      handleFormChange('role_id', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Be rolės</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                {modalMode === 'edit' && (
                  <div className="form-field">
                    <label>Aktyvus</label>
                    <select
                      value={form.is_active ? 'true' : 'false'}
                      onChange={(e) => handleFormChange('is_active', e.target.value === 'true')}
                    >
                      <option value="true">Taip</option>
                      <option value="false">Ne</option>
                    </select>
                  </div>
                )}

                {modalMode === 'create' && (
                  <>
                    <div className="form-field">
                      <label>Slaptažodis *</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => handleFormChange('password', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Pakartokite slaptažodį *</label>
                      <input
                        type="password"
                        value={form.password_confirm}
                        onChange={(e) => handleFormChange('password_confirm', e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>
                  Atšaukti
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saugoma...' : modalMode === 'create' ? 'Sukurti' : 'Išsaugoti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementSection;

