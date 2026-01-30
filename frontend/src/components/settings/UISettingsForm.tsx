import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface UISettings {
  id: number;
  status_colors: {
    invoices?: {
      paid?: string;
      not_paid?: string;
      partially_paid?: string;
      overdue?: string;
    };
    expeditions?: {
      new?: string;
      in_progress?: string;
      completed?: string;
      cancelled?: string;
    };
    orders?: {
      new?: string;
      assigned?: string;
      executing?: string;
      waiting_for_docs?: string;
      waiting_for_payment?: string;
      finished?: string;
      canceled?: string;
      closed?: string;
    };
    payment_colors?: {
      no_invoice?: string;
      unpaid?: string;
      partially_paid?: string;
      paid?: string;
    };
  };
  notes: string;
  created_at?: string;
  updated_at?: string;
}

interface UISettingsFormProps {
  onSave?: () => void;
}

const UISettingsForm: React.FC<UISettingsFormProps> = ({ onSave }) => {
  const [settings, setSettings] = useState<UISettings>({
    id: 0,
      status_colors: {
        invoices: {
          paid: '#28a745',
          not_paid: '#dc3545',
          partially_paid: '#ffc107',
          overdue: '#fd7e14',
        },
        expeditions: {
          new: '#17a2b8',
          in_progress: '#007bff',
          completed: '#28a745',
          cancelled: '#dc3545',
        },
        orders: {
          new: '#17a2b8',
          assigned: '#ffc107',
          executing: '#007bff',
          waiting_for_docs: '#ffc107',
          finished: '#28a745',
          canceled: '#dc3545',
        },
        payment_colors: {
          no_invoice: '#000000',
          unpaid: '#dc3545',
          partially_paid: '#ffc107',
          paid: '#28a745',
        },
      },
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings/ui/current/');
      const data = response.data;
      
      // Užtikrinti, kad visi status_colors būtų užpildyti
      const statusColors = data.status_colors || {};
      
      setSettings({
        id: data.id || 0,
        status_colors: {
          invoices: {
            paid: statusColors.invoices?.paid || '#28a745',
            not_paid: statusColors.invoices?.not_paid || '#dc3545',
            partially_paid: statusColors.invoices?.partially_paid || '#ffc107',
            overdue: statusColors.invoices?.overdue || '#fd7e14',
          },
          expeditions: {
            new: statusColors.expeditions?.new || '#17a2b8',
            in_progress: statusColors.expeditions?.in_progress || '#007bff',
            completed: statusColors.expeditions?.completed || '#28a745',
            cancelled: statusColors.expeditions?.cancelled || '#dc3545',
          },
          orders: {
            new: statusColors.orders?.new || '#17a2b8',
            assigned: statusColors.orders?.assigned || '#ffc107',
            executing: statusColors.orders?.executing || '#007bff',
            waiting_for_docs: statusColors.orders?.waiting_for_docs || '#ffc107',
            waiting_for_payment: statusColors.orders?.waiting_for_payment || '#ffc107',
            finished: statusColors.orders?.finished || '#28a745',
            canceled: statusColors.orders?.canceled || '#dc3545',
            closed: statusColors.orders?.closed || '#28a745',
          },
          payment_colors: {
            no_invoice: statusColors.payment_colors?.no_invoice || '#000000',
            unpaid: statusColors.payment_colors?.unpaid || '#dc3545',
            partially_paid: statusColors.payment_colors?.partially_paid || '#ffc107',
            paid: statusColors.payment_colors?.paid || '#28a745',
          },
        },
        notes: data.notes || '',
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Nėra nustatymų, naudosime numatytąsias vertes
      } else {
        setMessage({ type: 'error', text: 'Klaida užkraunant nustatymus' });
      }
    }
  };

  const handleColorChange = (
    category: 'invoices' | 'expeditions' | 'orders' | 'payment_colors',
    status: string,
    color: string
  ) => {
    setSettings(prev => ({
      ...prev,
      status_colors: {
        ...prev.status_colors,
        [category]: {
          ...prev.status_colors[category],
          [status]: color,
        },
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { id, created_at, updated_at, ...dataToSend } = settings;
      await api.put('/settings/ui/current/', dataToSend);
      setMessage({ type: 'success', text: 'UI nustatymai išsaugoti sėkmingai!' });
      if (onSave) {
        onSave();
      }
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message;
      setMessage({ type: 'error', text: 'Klaida išsaugant: ' + errorMsg });
    } finally {
      setSaving(false);
    }
  };

  const renderColorPicker = (
    category: 'invoices' | 'expeditions' | 'orders' | 'payment_colors',
    status: string,
    label: string,
    color: string
  ) => {
    return (
      <div
        key={status}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px',
          padding: '4px 6px',
        }}
      >
        <label
          style={{
            minWidth: '140px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#495057',
          }}
        >
          {label}
        </label>
        <input
          type="color"
          value={color}
          onChange={(e) => handleColorChange(category, status, e.target.value)}
          style={{
            width: '40px',
            height: '28px',
            border: '1px solid #ced4da',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={color}
          onChange={(e) => handleColorChange(category, status, e.target.value)}
          style={{
            width: '85px',
            padding: '4px 6px',
            fontSize: '11px',
            border: '1px solid #ced4da',
            borderRadius: '3px',
            fontFamily: 'monospace',
          }}
          placeholder="#000000"
        />
        <div
          style={{
            width: '24px',
            height: '24px',
            backgroundColor: color,
            border: '1px solid #ced4da',
            borderRadius: '3px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        />
      </div>
    );
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '15px', marginBottom: '4px', fontWeight: '600' }}>Statusų spalvos</h2>
      <p className="section-description" style={{ fontSize: '10px', marginBottom: '8px', color: '#666' }}>
        Nustatykite spalvas, kurios bus naudojamos rodant būsenas užsakymuose, ekspedicijose ir sąskaitose.
      </p>

      {message && (
        <div
          style={{
            padding: '6px 10px',
            marginBottom: '8px',
            borderRadius: '3px',
            backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            fontSize: '11px',
          }}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {/* Sąskaitų būsenos */}
          <div
            style={{
              padding: '8px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ fontSize: '12px', marginBottom: '6px', color: '#2c3e50', fontWeight: '600' }}>
              Sąskaitų būsenos
            </h3>
          {renderColorPicker(
            'invoices',
            'paid',
            'Apmokėta',
            settings.status_colors.invoices?.paid || '#28a745'
          )}
          {renderColorPicker(
            'invoices',
            'not_paid',
            'Neapmokėta',
            settings.status_colors.invoices?.not_paid || '#dc3545'
          )}
          {renderColorPicker(
            'invoices',
            'partially_paid',
            'Dalinai apmokėta',
            settings.status_colors.invoices?.partially_paid || '#ffc107'
          )}
          {renderColorPicker(
            'invoices',
            'overdue',
            'Vėluojama apmokėti',
            settings.status_colors.invoices?.overdue || '#fd7e14'
          )}
          </div>

          {/* Ekspedicijų būsenos */}
          <div
            style={{
              padding: '8px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ fontSize: '12px', marginBottom: '6px', color: '#2c3e50', fontWeight: '600' }}>
              Ekspedicijų būsenos
            </h3>
          {renderColorPicker(
            'expeditions',
            'new',
            'Nauja',
            settings.status_colors.expeditions?.new || '#17a2b8'
          )}
          {renderColorPicker(
            'expeditions',
            'in_progress',
            'Vykdoma',
            settings.status_colors.expeditions?.in_progress || '#007bff'
          )}
          {renderColorPicker(
            'expeditions',
            'completed',
            'Baigta',
            settings.status_colors.expeditions?.completed || '#28a745'
          )}
          {renderColorPicker(
            'expeditions',
            'cancelled',
            'Atšaukta',
            settings.status_colors.expeditions?.cancelled || '#dc3545'
          )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {/* Užsakymų būsenos */}
          <div
            style={{
              padding: '8px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ fontSize: '12px', marginBottom: '6px', color: '#2c3e50', fontWeight: '600' }}>
              Užsakymų būsenos
            </h3>
          {renderColorPicker(
            'orders',
            'new',
            'Naujas',
            settings.status_colors.orders?.new || '#17a2b8'
          )}
          {renderColorPicker(
            'orders',
            'assigned',
            'Priskirtas',
            settings.status_colors.orders?.assigned || '#ffc107'
          )}
          {renderColorPicker(
            'orders',
            'executing',
            'Vykdomas',
            settings.status_colors.orders?.executing || '#007bff'
          )}
          {renderColorPicker(
            'orders',
            'waiting_for_docs',
            'Laukiama Dokumentų',
            settings.status_colors.orders?.waiting_for_docs || '#ffc107'
          )}
          {renderColorPicker(
            'orders',
            'waiting_for_payment',
            'Laukiama Apmokėjimo',
            settings.status_colors.orders?.waiting_for_payment || '#ffc107'
          )}
          {renderColorPicker(
            'orders',
            'finished',
            'Baigtas',
            settings.status_colors.orders?.finished || '#28a745'
          )}
          {renderColorPicker(
            'orders',
            'canceled',
            'Atšauktas',
            settings.status_colors.orders?.canceled || '#dc3545'
          )}
          {renderColorPicker(
            'orders',
            'closed',
            'Uždarytas',
            settings.status_colors.orders?.closed || '#28a745'
          )}
          </div>

          {/* Apmokėjimo spalvos */}
          <div
            style={{
              padding: '8px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
            }}
          >
            <h3 style={{ fontSize: '12px', marginBottom: '6px', color: '#2c3e50', fontWeight: '600' }}>
              Apmokėjimo spalvos
            </h3>
          {renderColorPicker(
            'payment_colors',
            'no_invoice',
            'Nėra sąskaitos',
            settings.status_colors.payment_colors?.no_invoice || '#000000'
          )}
          {renderColorPicker(
            'payment_colors',
            'unpaid',
            'Neapmokėta',
            settings.status_colors.payment_colors?.unpaid || '#dc3545'
          )}
          {renderColorPicker(
            'payment_colors',
            'partially_paid',
            'Dalinai apmokėta',
            settings.status_colors.payment_colors?.partially_paid || '#ffc107'
          )}
          {renderColorPicker(
            'payment_colors',
            'paid',
            'Apmokėta',
            settings.status_colors.payment_colors?.paid || '#28a745'
          )}
          </div>
        </div>

        {/* Pastabos */}
        <div style={{ marginBottom: '8px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              marginBottom: '4px',
              color: '#495057',
            }}
          >
            Pastabos
          </label>
          <textarea
            value={settings.notes}
            onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
            style={{
              width: '100%',
              minHeight: '50px',
              padding: '6px',
              fontSize: '11px',
              border: '1px solid #ced4da',
              borderRadius: '3px',
              fontFamily: 'inherit',
            }}
            placeholder="Papildomos pastabos..."
          />
        </div>

        {/* Išsaugoti mygtukas */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Išsaugoma...' : 'Išsaugoti nustatymus'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UISettingsForm;

