import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import '../../pages/SettingsPage.css';

interface Condition {
  type: string;
  params: Record<string, any>;
}

interface OrderAutoStatusRule {
  id?: number;
  from_status: string;
  to_status: string;
  conditions: Condition[];
  logic_operator: 'AND' | 'OR';
  enabled: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

const ORDER_STATUSES = [
  { value: 'new', label: 'Naujas' },
  { value: 'assigned', label: 'Priskirtas' },
  { value: 'executing', label: 'Vykdomas' },
  { value: 'waiting_for_docs', label: 'Laukiama Dokumentų' },
  { value: 'waiting_for_payment', label: 'Laukiama Apmokėjimo' },
  { value: 'finished', label: 'Baigtas' },
  { value: 'canceled', label: 'Atšauktas' },
  { value: 'closed', label: 'Uždarytas' },
];

const CONDITION_TYPES = [
  // Vežėjo sąlygos
  { value: 'carrier_added', label: 'Atsiranda vežėjas' },
  { value: 'carrier_not_exists', label: 'Vežėjo nėra' },
  { value: 'carrier_in_list', label: 'Vežėjas yra iš sąrašo' },

  // Datos sąlygos (santykinės su šiandiena)
  { value: 'dates_between', label: 'Data tarp pakrovimo ir iškrovimo' },
  { value: 'unloading_passed', label: 'Iškrovimo data praėjo' },
  { value: 'loading_date_is_today', label: 'Pakrovimo data yra šiandien' },
  { value: 'loading_date_passed', label: 'Pakrovimo data praėjo' },
  { value: 'loading_date_upcoming', label: 'Pakrovimo data ateityje' },
  { value: 'unloading_date_is_today', label: 'Iškrovimo data yra šiandien' },
  { value: 'unloading_date_passed', label: 'Iškrovimo data praėjo' },
  { value: 'unloading_date_upcoming', label: 'Iškrovimo data ateityje' },
  { value: 'days_since_created', label: 'Dienų nuo užsakymo sukūrimo' },
  { value: 'overdue_more_than_days', label: 'Uždelstas daugiau nei dienų' },

  // Sąskaitų sąlygos
  { value: 'docs_received_and_invoice_sent', label: 'Dokumentai gauti ir sąskaita išsiųsta' },
  { value: 'invoice_issued', label: 'Sąskaita išrašyta' },
  { value: 'invoice_not_issued', label: 'Sąskaita neišrašyta' },
  { value: 'invoice_received', label: 'Sąskaita gauta' },
  { value: 'invoice_not_received', label: 'Sąskaita negauta' },
  { value: 'invoice_paid', label: 'Sąskaita apmokėta' },
  { value: 'invoice_not_paid', label: 'Sąskaita neapmokėta' },
  { value: 'client_paid', label: 'Klientas apmokėjo' },
  { value: 'carriers_paid', label: 'Visiems vežėjams apmokėta' },

  // Finansinės sąlygos
  { value: 'amount_greater_than', label: 'Užsakymo suma viršija' },
  { value: 'amount_less_than', label: 'Užsakymo suma mažiau' },
  { value: 'profit_margin_greater_than', label: 'Pelno marža viršija %' },
  { value: 'profit_margin_less_than', label: 'Pelno marža mažiau %' },

  // Kategorijų sąlygos
  { value: 'client_in_list', label: 'Klientas yra iš sąrašo' },
  { value: 'order_type', label: 'Užsakymo tipas' },
  { value: 'order_priority', label: 'Užsakymo prioritetas' },
  { value: 'cargo_type', label: 'Krovinio tipas' },

  // Laiko sąlygos
  { value: 'day_of_week', label: 'Savaitės diena' },
  { value: 'business_hours', label: 'Darbo valandos' },
  { value: 'weekend', label: 'Savaitgalis' },

  // Kitos sąlygos
  { value: 'has_attachments', label: 'Turi priedų' },
  { value: 'has_notes', label: 'Turi pastabų' },
  { value: 'requires_special_equipment', label: 'Reikia specialios įrangos' },
  { value: 'international_transport', label: 'Tarptautinis transportas' },
];

const OrderAutoStatusRulesSection: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [rules, setRules] = useState<OrderAutoStatusRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [editingRule, setEditingRule] = useState<OrderAutoStatusRule | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRules = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/settings/order-auto-status-rules/');
      const data = response.data;
      console.log('API Response:', data);
      let rulesArray: OrderAutoStatusRule[] = [];
      if (Array.isArray(data)) {
        rulesArray = data;
      } else if (data && Array.isArray(data.results)) {
        rulesArray = data.results;
      } else if (data && typeof data === 'object') {
        // Handle case where data might be a single object or other structure
        rulesArray = [];
      }
      console.log('Setting rules to:', rulesArray);
      setRules(rulesArray);
    } catch (error: any) {
      console.error('Klaida užkraunant taisykles:', error);
      console.error('Error response:', error.response);

      if (error.response?.status === 401) {
        setMessage({ type: 'error', text: 'Sesija baigėsi. Prašome prisijungti iš naujo.' });
      } else {
        setMessage({ type: 'error', text: 'Klaida užkraunant taisykles: ' + (error.response?.data?.detail || error.message) });
      }
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRules();
    } else {
      setLoading(false);
      setRules([]);
    }
  }, [isAuthenticated, fetchRules]);

  const handleSave = async (rule: OrderAutoStatusRule) => {
    setSaving(true);
    setMessage(null);
    try {
      if (rule.id) {
        await api.put(`/settings/order-auto-status-rules/${rule.id}/`, rule);
      } else {
        await api.post('/settings/order-auto-status-rules/', rule);
      }
      setMessage({ type: 'success', text: 'Taisyklė sėkmingai išsaugota!' });
      setEditingRule(null);
      await fetchRules();
    } catch (error: any) {
      const errorMsg = error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šią taisyklę?')) {
      return;
    }
    try {
      await api.delete(`/settings/order-auto-status-rules/${id}/`);
      setMessage({ type: 'success', text: 'Taisyklė sėkmingai ištrinta!' });
      await fetchRules();
    } catch (error: any) {
      const errorMsg = error.response?.data ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)) : error.message;
      setMessage({ type: 'error', text: 'Klaida šalinant: ' + errorMsg });
    }
  };

  const handleToggleEnabled = async (rule: OrderAutoStatusRule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    await handleSave(updated);
  };

  const handleApplyRules = async () => {
    setApplyingRules(true);
    setMessage(null);

    try {
      console.log('Starting apply rules...');
      console.log('Making request to:', '/settings/order-auto-status-rules/apply-rules/');
      const response = await api.get('/settings/order-auto-status-rules/apply-rules/');
      console.log('Apply rules response received');
      console.log('Response status:', response.status);
      console.log('Response data:', response.data);
      console.log('Full response:', response);

      const data = response.data;

      if (data && typeof data === 'object') {
        setMessage({
          type: 'success',
          text: `Taisyklės pritaikytos! Apdorota: ${data.processed || 0}, Atnaujinta: ${data.updated || 0}, Praleista: ${data.skipped || 0}`
        });
      } else {
        setMessage({
          type: 'success',
          text: 'Taisyklės pritaikytos sėkmingai!'
        });
      }

      // Refresh the rules list
      await fetchRules();
    } catch (error: any) {
      console.error('Apply rules error:', error);
      console.error('Error response:', error.response);
      console.error('Error status:', error.response?.status);
      console.error('Error data:', error.response?.data);

      const errorMsg = error.response?.data?.detail ||
                      (error.response?.data ? JSON.stringify(error.response.data) : error.message);
      console.log('Final error message:', errorMsg);
      setMessage({ type: 'error', text: 'Klaida taikant taisykles: ' + errorMsg });
    } finally {
      setApplyingRules(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="settings-section">
        <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
          Prašome prisijungti, kad galėtumėte valdyti automatinio statusų keitimo taisykles.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div>Kraunama...</div>;
  }

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
          Automatinio statusų keitimo taisyklės
        </h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setEditingRule({
              from_status: 'new',
              to_status: 'assigned',
              conditions: [
                { type: 'carrier_added', params: {} }
              ],
              logic_operator: 'AND',
              enabled: true,
              priority: 0,
            });
          }}
          style={{ padding: '6px 12px', fontSize: '13px' }}
        >
          + Pridėti taisyklę
        </button>
        <button
          type="button"
          className="button button-success"
          onClick={handleApplyRules}
          disabled={applyingRules}
          style={{ padding: '6px 12px', fontSize: '13px', marginLeft: '10px' }}
        >
          {applyingRules ? 'Pritaikoma...' : '🔄 Pritaikyti taisykles dabar'}
        </button>
      </div>

      {message && (
        <div className={`message message-${message.type}`} style={{ marginBottom: '15px' }}>
          {message.text}
        </div>
      )}


      <div style={{ marginTop: '20px' }}>
        {/* New rule form */}
        {editingRule && !editingRule.id && (
          <div
            style={{
              marginBottom: '15px',
              border: '2px solid #28a745',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa',
              boxShadow: '0 0 0 3px rgba(40, 167, 69, 0.1)',
              overflow: 'hidden'
            }}
          >
            <div style={{
              padding: '10px 15px',
              backgroundColor: '#28a745',
              color: 'white',
              borderBottom: '1px solid #1e7e34'
            }}>
              <strong style={{ fontSize: '14px' }}>➕ Nauja taisyklė</strong>
            </div>
            <div style={{ padding: '15px' }}>
              <RuleForm
                rule={editingRule}
                onSave={async (updatedRule) => {
                  await handleSave(updatedRule);
                  setEditingRule(null);
                }}
                onCancel={() => setEditingRule(null)}
                saving={saving}
                showTitle={false}
              />
            </div>
          </div>
        )}

        {!Array.isArray(rules) || rules.length === 0 ? (
          <p style={{ color: '#666', fontSize: '14px' }}>Nėra sukurtų taisyklių. Pridėkite pirmąją taisyklę.</p>
        ) : (
          rules.map((rule) => (
            (editingRule?.id && editingRule.id === rule.id) ? (
              // Edit mode - inline expanded form
              <div
                key={rule.id}
                style={{
                  marginBottom: '15px',
                  border: '2px solid #007bff',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa',
                  boxShadow: '0 0 0 3px rgba(0,123,255,0.1)',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  padding: '10px 15px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  borderBottom: '1px solid #0056b3'
                }}>
                  <strong style={{ fontSize: '14px' }}>✏️ Redaguojama taisyklė</strong>
                </div>
                <div style={{ padding: '15px' }}>
                  <RuleForm
                    rule={editingRule}
                    onSave={async (updatedRule) => {
                      await handleSave(updatedRule);
                      setEditingRule(null);
                    }}
                    onCancel={() => setEditingRule(null)}
                    saving={saving}
                    showTitle={false}
                  />
                </div>
              </div>
            ) : (
              // View mode - compact card
              <div
                key={rule.id}
                className="card-section"
                style={{
                  marginBottom: '15px',
                  padding: '15px',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  backgroundColor: rule.enabled ? '#fff' : '#f8f9fa',
                  opacity: rule.enabled ? 1 : 0.7,
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px' }}>
                        {ORDER_STATUSES.find(s => s.value === rule.from_status)?.label || rule.from_status}
                      </strong>
                      <span style={{ color: '#666' }}>→</span>
                      <strong style={{ fontSize: '14px' }}>
                        {ORDER_STATUSES.find(s => s.value === rule.to_status)?.label || rule.to_status}
                      </strong>
                      {!rule.enabled && (
                        <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>(Išjungta)</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                      <strong>Logika:</strong> {rule.logic_operator === 'AND' ? 'Visos sąlygos (AND)' : 'Bent viena sąlyga (OR)'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                      <strong>Sąlygos ({rule.conditions?.length || 0}):</strong>
                      <ul style={{ marginTop: '4px', paddingLeft: '20px', listStyleType: 'disc' }}>
                        {rule.conditions?.map((cond, idx) => (
                          <li key={idx} style={{ marginBottom: '2px' }}>
                            {CONDITION_TYPES.find(ct => ct.value === cond.type)?.label || cond.type}
                            {cond.params && Object.keys(cond.params).length > 0 && (
                              <span style={{ color: '#999', fontSize: '12px', marginLeft: '5px' }}>
                                ({JSON.stringify(cond.params)})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      Prioritetas: {rule.priority}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setEditingRule(rule);
                      }}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                    >
                      Redaguoti
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleToggleEnabled(rule)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: rule.enabled ? '#ffc107' : '#28a745',
                        color: 'white',
                      }}
                    >
                      {rule.enabled ? 'Išjungti' : 'Įjungti'}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => rule.id && handleDelete(rule.id)}
                      style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#dc3545', color: 'white' }}
                    >
                      Trinti
                    </button>
                  </div>
                </div>
              </div>
            )
          ))
        )}
      </div>

    </div>
  );
};

interface RuleFormProps {
  rule: OrderAutoStatusRule;
  onSave: (rule: OrderAutoStatusRule) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  showTitle?: boolean;
}

const RuleForm: React.FC<RuleFormProps> = ({ rule, onSave, onCancel, saving, showTitle = true }) => {
  const [formData, setFormData] = useState<OrderAutoStatusRule>({
    ...rule,
    conditions: Array.isArray(rule.conditions) ? rule.conditions : []
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.conditions.length === 0) {
      alert('Pridėkite bent vieną sąlygą');
      return;
    }
    await onSave(formData);
  };

  const updateField = (field: keyof OrderAutoStatusRule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addCondition = () => {
    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, { type: 'carrier_added', params: {} }]
    }));
  };

  const removeCondition = (index: number) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index)
    }));
  };

  const updateConditionType = (index: number, type: string) => {
    setFormData(prev => {
      const newConditions = [...prev.conditions];
      newConditions[index] = { ...newConditions[index], type, params: {} };
      return { ...prev, conditions: newConditions };
    });
  };

  const updateConditionParam = (index: number, key: string, value: any) => {
    setFormData(prev => {
      const newConditions = [...prev.conditions];
      newConditions[index] = { 
        ...newConditions[index], 
        params: { ...newConditions[index].params, [key]: value } 
      };
      return { ...prev, conditions: newConditions };
    });
  };

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      border: '1px solid #007bff',
      borderRadius: '4px',
      padding: '8px',
      marginBottom: '10px'
    }}>
      {showTitle && (
        <h4 style={{
          marginTop: 0,
          marginBottom: '8px',
          fontSize: '14px',
          color: '#007bff',
          fontWeight: '600'
        }}>
          {rule.id ? '✏️ Redaguoti taisyklę' : '➕ Nauja taisyklė'}
        </h4>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', marginBottom: '3px', display: 'block', fontWeight: '500' }}>
              Iš statuso *
            </label>
            <select
              value={formData.from_status}
              onChange={(e) => updateField('from_status', e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '3px', height: '32px' }}
            >
              {ORDER_STATUSES.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', marginBottom: '3px', display: 'block', fontWeight: '500' }}>
              Į statusą *
            </label>
            <select
              value={formData.to_status}
              onChange={(e) => updateField('to_status', e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '3px', height: '32px' }}
            >
              {ORDER_STATUSES.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '12px', marginBottom: '3px', display: 'block', fontWeight: '500' }}>
            Logika
          </label>
          <select
            value={formData.logic_operator}
            onChange={(e) => updateField('logic_operator', e.target.value)}
            style={{ width: '150px', padding: '4px 6px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '3px', height: '32px' }}
          >
            <option value="AND">Visi (AND)</option>
            <option value="OR">Bet kuris (OR)</option>
          </select>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600' }}>
              Sąlygos * ({formData.conditions.length})
            </label>
            <span style={{ fontSize: '11px', color: '#666' }}>
              {formData.logic_operator === 'AND' ? 'Visos' : 'Bent viena'}
            </span>
          </div>

          {formData.conditions && formData.conditions.length > 0 ? formData.conditions.map((condition, index) => (
            <div key={index} style={{
              padding: '6px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '3px',
              marginBottom: '6px',
              position: 'relative'
            }}>
              <button
                type="button"
                onClick={() => removeCondition(index)}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '6px',
                  background: 'none',
                  border: 'none',
                  color: '#dc3545',
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: '1'
                }}
              >
                ✕
              </button>

              <div style={{ marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', marginBottom: '2px', display: 'block', fontWeight: '500' }}>Sąlygos tipas</label>
                <select
                  value={condition.type}
                  onChange={(e) => updateConditionType(index, e.target.value)}
                  style={{ width: '100%', padding: '3px 4px', fontSize: '12px', border: '1px solid #ced4da', borderRadius: '3px', height: '28px' }}
                >
                  {CONDITION_TYPES.map(ct => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </select>
              </div>

              {/* Datos sąlygos - santykinės su šiandiena */}

              {condition.type === 'unloading_passed' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Dienų po iškrovimo
                  </label>
                  <input
                    type="number"
                    value={condition.params?.days_after_unloading || 0}
                    onChange={(e) => updateConditionParam(index, 'days_after_unloading', parseInt(e.target.value) || 0)}
                    min="0"
                    style={{ width: '80px', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {condition.type === 'days_since_created' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Dienų skaičius
                  </label>
                  <input
                    type="number"
                    value={condition.params?.days || 0}
                    onChange={(e) => updateConditionParam(index, 'days', parseInt(e.target.value) || 0)}
                    min="0"
                    style={{ width: '80px', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {condition.type === 'overdue_more_than_days' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Uždelstas daugiau nei dienų
                  </label>
                  <input
                    type="number"
                    value={condition.params?.days || 0}
                    onChange={(e) => updateConditionParam(index, 'days', parseInt(e.target.value) || 0)}
                    min="0"
                    style={{ width: '80px', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {/* Finansinės sąlygos */}
              {(condition.type === 'amount_greater_than' ||
                condition.type === 'amount_less_than') && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Suma (€)
                  </label>
                  <input
                    type="number"
                    value={condition.params?.amount || 0}
                    onChange={(e) => updateConditionParam(index, 'amount', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    style={{ width: '100px', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {(condition.type === 'profit_margin_greater_than' ||
                condition.type === 'profit_margin_less_than') && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Pelno marža (%)
                  </label>
                  <input
                    type="number"
                    value={condition.params?.margin || 0}
                    onChange={(e) => updateConditionParam(index, 'margin', parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    step="0.1"
                    style={{ width: '80px', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {/* Sąrašų sąlygos */}
              {(condition.type === 'client_in_list' ||
                condition.type === 'carrier_in_list') && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    ID sąrašas (atskirti kableliais)
                  </label>
                  <input
                    type="text"
                    value={condition.params?.ids?.join(', ') || ''}
                    onChange={(e) => updateConditionParam(index, 'ids', e.target.value.split(',').map(id => id.trim()).filter(id => id))}
                    placeholder="1, 2, 3"
                    style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  />
                </div>
              )}

              {/* Kategorijų sąlygos */}
              {condition.type === 'order_type' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Užsakymo tipas
                  </label>
                  <select
                    value={condition.params?.order_type || ''}
                    onChange={(e) => updateConditionParam(index, 'order_type', e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  >
                    <option value="">Pasirinkite tipą</option>
                    <option value="import">Importas</option>
                    <option value="export">Eksportas</option>
                    <option value="domestic">Vietinis</option>
                    <option value="international">Tarptautinis</option>
                  </select>
                </div>
              )}

              {condition.type === 'order_priority' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Prioritetas
                  </label>
                  <select
                    value={condition.params?.priority || ''}
                    onChange={(e) => updateConditionParam(index, 'priority', e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  >
                    <option value="">Pasirinkite prioritetą</option>
                    <option value="low">Žemas</option>
                    <option value="normal">Normalus</option>
                    <option value="high">Aukštas</option>
                    <option value="urgent">Skubus</option>
                  </select>
                </div>
              )}

              {condition.type === 'cargo_type' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Krovinio tipas
                  </label>
                  <select
                    value={condition.params?.cargo_type || ''}
                    onChange={(e) => updateConditionParam(index, 'cargo_type', e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  >
                    <option value="">Pasirinkite tipą</option>
                    <option value="general">Bendras</option>
                    <option value="dangerous">Pavojingas</option>
                    <option value="perishable">Greitai gendantis</option>
                    <option value="fragile">Trapus</option>
                    <option value="oversized">Nestandartinis</option>
                  </select>
                </div>
              )}

              {/* Laiko sąlygos */}
              {condition.type === 'day_of_week' && (
                <div className="form-group">
                  <label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                    Savaitės diena
                  </label>
                  <select
                    value={condition.params?.day || ''}
                    onChange={(e) => updateConditionParam(index, 'day', e.target.value)}
                    style={{ width: '100%', padding: '4px 8px', fontSize: '13px', border: '1px solid #ced4da', borderRadius: '4px' }}
                  >
                    <option value="">Pasirinkite dieną</option>
                    <option value="1">Pirmadienis</option>
                    <option value="2">Antradienis</option>
                    <option value="3">Trečiadienis</option>
                    <option value="4">Ketvirtadienis</option>
                    <option value="5">Penktadienis</option>
                    <option value="6">Šeštadienis</option>
                    <option value="7">Sekmadienis</option>
                  </select>
                </div>
              )}

              {/* Boolean sąlygos */}
              {(condition.type === 'business_hours' ||
                condition.type === 'weekend' ||
                condition.type === 'has_attachments' ||
                condition.type === 'has_notes' ||
                condition.type === 'requires_special_equipment' ||
                condition.type === 'international_transport') && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={condition.params?.enabled || false}
                      onChange={(e) => updateConditionParam(index, 'enabled', e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '12px' }}>
                      {condition.type === 'business_hours' && 'Tik darbo valandomis (9:00-18:00)'}
                      {condition.type === 'weekend' && 'Savaitgalis'}
                      {condition.type === 'has_attachments' && 'Turi priedų'}
                      {condition.type === 'has_notes' && 'Turi pastabų'}
                      {condition.type === 'requires_special_equipment' && 'Reikia specialios įrangos'}
                      {condition.type === 'international_transport' && 'Tarptautinis transportas'}
                    </span>
                  </label>
                </div>
              )}
            </div>
          )) : (
            <p style={{ color: '#999', fontStyle: 'italic', padding: '10px' }}>Nėra sąlygų. Pridėkite pirmąją sąlygą.</p>
          )}

          <button
            type="button"
            onClick={addCondition}
            className="button button-secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            + Pridėti sąlygą
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '12px', marginBottom: '2px', display: 'block', fontWeight: '500' }}>
                Prioritetas
              </label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => updateField('priority', parseInt(e.target.value) || 0)}
                style={{ width: '60px', padding: '3px 4px', fontSize: '12px', border: '1px solid #ced4da', borderRadius: '3px', height: '26px' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => updateField('enabled', e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
              />
              <span>Įjungta</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '10px' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={saving}
            style={{ padding: '4px 8px', fontSize: '12px', height: '30px' }}
          >
            Atšaukti
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
            style={{ padding: '4px 8px', fontSize: '12px', height: '30px' }}
          >
            {saving ? 'Saugoma...' : 'Išsaugoti'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrderAutoStatusRulesSection;
