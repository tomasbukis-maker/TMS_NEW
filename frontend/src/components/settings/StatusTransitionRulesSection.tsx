import React, { useState, useEffect, useRef } from 'react';
import StatusTransitionRuleService, {
  StatusTransitionRule,
  CreateStatusTransitionRuleRequest,
} from '../../services/statusTransitionRuleService';

const StatusTransitionRulesSection: React.FC = () => {
  const [rules, setRules] = useState<StatusTransitionRule[]>([]); // Visada masyvas
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<StatusTransitionRule | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<string>('order');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({
    type: 'info',
    message: '',
    visible: false,
  });
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string, timeoutMs = 3500) => {
    setToast({ type, message, visible: true });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), timeoutMs);
  };

  const entityTypeLabels: Record<string, string> = {
    order: 'Užsakymas',
    sales_invoice: 'Pardavimo sąskaita',
    purchase_invoice: 'Pirkimo sąskaita',
    order_carrier: 'Užsakymo vežėjas',
    order_cost: 'Užsakymo išlaida',
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await StatusTransitionRuleService.getAllRules();
      // Užtikrinti, kad visada būtų masyvas
      const rulesArray = Array.isArray(data) ? data : (data && typeof data === 'object' && 'results' in data ? (data as any).results : []);
      setRules(Array.isArray(rulesArray) ? rulesArray : []);
    } catch (error: any) {
      console.error('Failed to fetch rules:', error);
      showToast('error', 'Nepavyko užkrauti taisyklių');
      setRules([]); // Nustatyti tuščią masyvą, jei klaida
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSave = async (ruleData: CreateStatusTransitionRuleRequest) => {
    try {
      if (editingRule) {
        await StatusTransitionRuleService.updateRule(editingRule.id, ruleData);
        showToast('success', 'Taisyklė sėkmingai atnaujinta');
      } else {
        await StatusTransitionRuleService.createRule(ruleData);
        showToast('success', 'Taisyklė sėkmingai sukurta');
      }
      setEditingRule(null);
      setShowAddForm(false);
      await fetchRules();
    } catch (error: any) {
      console.error('Failed to save rule:', error);
      showToast('error', error.response?.data?.error || 'Nepavyko išsaugoti taisyklės');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Ar tikrai norite ištrinti šią taisyklę?')) {
      return;
    }
    try {
      await StatusTransitionRuleService.deleteRule(id);
      showToast('success', 'Taisyklė sėkmingai ištrinta');
      await fetchRules();
    } catch (error: any) {
      console.error('Failed to delete rule:', error);
      showToast('error', 'Nepavyko ištrinti taisyklės');
    }
  };

  const filteredRules = Array.isArray(rules) ? rules.filter((rule) => rule.entity_type === selectedEntityType) : [];

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Statusų perėjimų taisyklės</h2>

      {toast.visible && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: toast.type === 'success' ? '#28a745' : toast.type === 'error' ? '#dc3545' : '#17a2b8',
            color: 'white',
            borderRadius: '4px',
            zIndex: 10000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {toast.message}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          Objekto tipas:
        </label>
        <select
          value={selectedEntityType}
          onChange={(e) => setSelectedEntityType(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            minWidth: '200px',
          }}
        >
          {Object.entries(entityTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Kraunama...</p>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingRule(null);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              + Pridėti taisyklę
            </button>
          </div>

          {showAddForm && !editingRule && (
            <RuleForm
              entityType={selectedEntityType as any}
              onSave={handleSave}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {editingRule && (
            <RuleForm
              entityType={editingRule.entity_type}
              rule={editingRule}
              onSave={handleSave}
              onCancel={() => setEditingRule(null)}
            />
          )}

          <div style={{ marginTop: '20px' }}>
            {filteredRules.length === 0 ? (
              <p style={{ color: '#666' }}>Nėra taisyklių šiam objektų tipui</p>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Dabartinis statusas</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Leistini kiti statusai</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Aktyvus</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '12px' }}>{rule.current_status}</td>
                      <td style={{ padding: '12px' }}>
                        {rule.allowed_next_statuses.length > 0 ? (
                          <span>{rule.allowed_next_statuses.join(', ')}</span>
                        ) : (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>Nėra leistinų perėjimų</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {rule.is_active ? (
                          <span style={{ color: '#28a745', fontWeight: '600' }}>✓ Aktyvus</span>
                        ) : (
                          <span style={{ color: '#999' }}>Neaktyvus</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => setEditingRule(rule)}
                          style={{
                            padding: '4px 8px',
                            marginRight: '8px',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Redaguoti
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Ištrinti
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Instrukcijos sekcija */}
          <div
            style={{
              marginTop: '40px',
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', color: '#495057' }}>
              📖 Kaip naudotis statusų perėjimų taisyklėmis?
            </h3>
            
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
              <p style={{ marginTop: 0, marginBottom: '12px' }}>
                <strong>Kas tai yra?</strong> Statusų perėjimų taisyklės nustato, kokie statusų pakeitimai yra leistini sistemoje.
                Pavyzdžiui, užsakymas negali pereiti tiesiai iš "Naujas" į "Baigtas" - reikia eiti per tarpinius statusus.
              </p>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Kaip pridėti naują taisyklę:</strong>
                <ol style={{ margin: 0, paddingLeft: '20px' }}>
                  <li>Spustelėkite <strong>"+ Pridėti taisyklę"</strong></li>
                  <li>Pasirinkite <strong>Objekto tipą</strong> (pvz., Užsakymas, Pardavimo sąskaita)</li>
                  <li>Įveskite <strong>Dabartinį statusą</strong> (iš kurio statuso keičiama)</li>
                  <li>Pridėkite <strong>Leistinus kitus statusus</strong> (į kuriuos galima pereiti)</li>
                  <li>Išsaugokite</li>
                </ol>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Kaip redaguoti taisyklę:</strong>
                <ol style={{ margin: 0, paddingLeft: '20px' }}>
                  <li>Raskite taisyklę lentelėje</li>
                  <li>Spustelėkite <strong>"Redaguoti"</strong></li>
                  <li>Pakeiskite leistinus statusus (pridėkite arba pašalinkite)</li>
                  <li>Išsaugokite</li>
                </ol>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Svarbu žinoti:</strong>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li><strong>Vienas statusas - viena taisyklė:</strong> Kiekvienam objektų tipui ir statusui gali būti tik viena taisyklė</li>
                  <li><strong>Tuščias sąrašas = jokių perėjimų:</strong> Jei leistini statusai tušti, iš to statuso negalima pereiti į jokį kitą</li>
                  <li><strong>Aktyvus/Neaktyvus:</strong> Neaktyvi taisyklė nebus naudojama, bet bus išsaugota</li>
                  <li><strong>Eiliškumas:</strong> Nustato taisyklių tvarką (mažesnis skaičius = aukščiau)</li>
                </ul>
              </div>

              <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                <strong style={{ display: 'block', marginBottom: '5px' }}>💡 Pavyzdys:</strong>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  Jei norite leisti užsakymui pereiti iš "Naujas" tiesiai į "Baigtas", raskite taisyklę su dabartiniu statusu "new",
                  spustelėkite "Redaguoti" ir pridėkite "finished" į leistinų statusų sąrašą.
                </p>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#d1ecf1', borderRadius: '4px', border: '1px solid #bee5eb' }}>
                <strong style={{ display: 'block', marginBottom: '5px' }}>⚠️ Dėmesio:</strong>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  Pakeitus taisykles, jos įsigalioja iš karto. Jei ištrysite taisyklę, bus neįmanoma pereiti iš to statuso į kitus
                  (nebent yra kitos taisyklės).
                </p>
              </div>

              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e7f3ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                <strong style={{ display: 'block', marginBottom: '12px', fontSize: '15px' }}>📋 Galimi statusai pagal objektų tipus:</strong>
                
                <div style={{ marginBottom: '15px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#0056b3' }}>Užsakymas (order):</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>new</code> - Naujas užsakymas</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>assigned</code> - Priskirtas užsakymas</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>executing</code> - Vykdomas užsakymas</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>waiting_for_docs</code> - Laukiama dokumentų</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>finished</code> - Baigtas užsakymas (sąskaitos išrašymo galima)</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>canceled</code> - Atšauktas užsakymas</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#0056b3' }}>Pardavimo sąskaita (sales_invoice):</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>unpaid</code> - Neapmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>partially_paid</code> - Dalinai apmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>paid</code> - Apmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>overdue</code> - Vėluojanti sąskaita</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#0056b3' }}>Pirkimo sąskaita (purchase_invoice):</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>unpaid</code> - Neapmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>partially_paid</code> - Dalinai apmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>paid</code> - Apmokėta sąskaita</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>overdue</code> - Vėluojanti sąskaita</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#0056b3' }}>Užsakymo vežėjas (order_carrier):</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>not_paid</code> - Neapmokėta</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>partially_paid</code> - Dalinai apmokėta</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>paid</code> - Apmokėta</li>
                  </ul>
                </div>

                <div style={{ marginBottom: '0' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: '#0056b3' }}>Užsakymo išlaida (order_cost):</strong>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>new</code> - Nauja išlaida</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>in_progress</code> - Vykdoma išlaida</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>completed</code> - Užbaigta išlaida</li>
                    <li><code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>cancelled</code> - Atšaukta išlaida</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface RuleFormProps {
  entityType: 'order' | 'sales_invoice' | 'purchase_invoice' | 'order_carrier' | 'order_cost';
  rule?: StatusTransitionRule;
  onSave: (data: CreateStatusTransitionRuleRequest) => void;
  onCancel: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ entityType, rule, onSave, onCancel }) => {
  const [currentStatus, setCurrentStatus] = useState(rule?.current_status || '');
  const [allowedStatuses, setAllowedStatuses] = useState<string[]>(rule?.allowed_next_statuses || []);
  const [newStatus, setNewStatus] = useState('');
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [order, setOrder] = useState(rule?.order || 0);
  const [description, setDescription] = useState(rule?.description || '');

  const handleAddStatus = () => {
    if (newStatus.trim() && !allowedStatuses.includes(newStatus.trim())) {
      setAllowedStatuses([...allowedStatuses, newStatus.trim()]);
      setNewStatus('');
    }
  };

  const handleRemoveStatus = (status: string) => {
    setAllowedStatuses(allowedStatuses.filter((s) => s !== status));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      entity_type: entityType,
      current_status: currentStatus,
      allowed_next_statuses: allowedStatuses,
      is_active: isActive,
      order,
      description,
    });
  };

  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        marginBottom: '20px',
        border: '1px solid #dee2e6',
      }}
    >
      <h3 style={{ marginTop: 0 }}>{rule ? 'Redaguoti taisyklę' : 'Nauja taisyklė'}</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Dabartinis statusas: *
          </label>
          <input
            type="text"
            value={currentStatus}
            onChange={(e) => setCurrentStatus(e.target.value)}
            required
            disabled={!!rule}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Leistini kiti statusai:
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddStatus();
                }
              }}
              placeholder="Įveskite statusą ir paspauskite Enter"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              onClick={handleAddStatus}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Pridėti
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {allowedStatuses.map((status) => (
              <span
                key={status}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {status}
                <button
                  type="button"
                  onClick={() => handleRemoveStatus(status)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: 0,
                    marginLeft: '4px',
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Aktyvus</span>
          </label>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Eiliškumas:
          </label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(parseInt(e.target.value, 10) || 0)}
            style={{
              width: '100px',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Aprašymas:
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Išsaugoti
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Atšaukti
          </button>
        </div>
      </form>
    </div>
  );
};

export default StatusTransitionRulesSection;
