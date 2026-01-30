import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import '../../pages/SettingsPage.css';

interface EmailTemplate {
  id?: number;
  template_type: 'reminder_due_soon' | 'reminder_unpaid' | 'reminder_overdue' | 'order_to_client' | 'order_to_carrier' | 'invoice_to_client';
  template_type_display: string;
  subject: string;
  body_text: string;
  body_html: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const TEMPLATE_TYPES: { value: EmailTemplate['template_type']; label: string }[] = [
  { value: 'reminder_due_soon', label: 'Artėja terminas apmokėjimui' },
  { value: 'reminder_unpaid', label: 'Neapmokėta sąskaita' },
  { value: 'reminder_overdue', label: 'Vėluojama apmokėti sąskaita' },
  { value: 'order_to_client', label: 'Užsakymas klientui' },
  { value: 'order_to_carrier', label: 'Užsakymas vežėjui' },
  { value: 'invoice_to_client', label: 'Sąskaita klientui' },
];

// Kintamieji pagal šablono tipą
const TEMPLATE_VARIABLES: Record<EmailTemplate['template_type'], string[]> = {
  reminder_due_soon: [
    '{invoice_number} - Sąskaitos numeris',
    '{partner_name} - Partnerio/kliento vardas',
    '{amount} - Suma be PVM',
    '{amount_with_vat} - Suma su PVM',
    '{other_unpaid_invoices} - Kitos neapmokėtos sąskaitos (formatuotas sąrašas)',
    '{vat_amount} - PVM suma',
    '{due_date} - Mokėjimo terminas',
    '{issue_date} - Sąskaitos išrašymo data',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
  reminder_unpaid: [
    '{invoice_number} - Sąskaitos numeris',
    '{partner_name} - Partnerio/kliento vardas',
    '{amount} - Suma be PVM',
    '{amount_with_vat} - Suma su PVM',
    '{other_unpaid_invoices} - Kitos neapmokėtos sąskaitos (formatuotas sąrašas)',
    '{vat_amount} - PVM suma',
    '{due_date} - Mokėjimo terminas',
    '{issue_date} - Sąskaitos išrašymo data',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
  reminder_overdue: [
    '{invoice_number} - Sąskaitos numeris',
    '{partner_name} - Partnerio/kliento vardas',
    '{amount} - Suma be PVM',
    '{amount_with_vat} - Suma su PVM',
    '{other_unpaid_invoices} - Kitos neapmokėtos sąskaitos (formatuotas sąrašas)',
    '{vat_amount} - PVM suma',
    '{due_date} - Mokėjimo terminas',
    '{issue_date} - Sąskaitos išrašymo data',
    '{overdue_days} - Vėlavimo dienos',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
  order_to_client: [
    '{order_number} - Užsakymo numeris',
    '{partner_name} - Kliento vardas',
    '{route_from} - Maršrutas iš',
    '{route_to} - Maršrutas į',
    '{loading_date} - Pakrovimo data',
    '{unloading_date} - Iškrovimo data',
    '{order_date} - Užsakymo data',
    '{price_net} - Kaina be PVM',
    '{price_with_vat} - Kaina su PVM',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
  order_to_carrier: [
    '{order_number} - Užsakymo numeris',
    '{partner_name} - Vežėjo vardas',
    '{route_from} - Maršrutas iš',
    '{route_to} - Maršrutas į',
    '{loading_date} - Pakrovimo data',
    '{unloading_date} - Iškrovimo data',
    '{order_date} - Užsakymo data',
    '{price_net} - Kaina be PVM',
    '{expedition_number} - Ekspedicijos numeris',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
  invoice_to_client: [
    '{invoice_number} - Sąskaitos numeris',
    '{partner_name} - Kliento vardas',
    '{amount} - Suma be PVM',
    '{amount_with_vat} - Suma su PVM',
    '{vat_amount} - PVM suma',
    '{vat_rate} - PVM tarifas (%)',
    '{due_date} - Mokėjimo terminas',
    '{issue_date} - Sąskaitos išrašymo data',
    '{order_number} - Susieto užsakymo numeris',
    '{partner_code} - Partnerio kodas',
    '{partner_vat_code} - Partnerio PVM kodas',
  ],
};

// Bendri kintamieji visiems šablonams
const COMMON_VARIABLES = [
  '{signature} - El. laiškų pasirašymas (iš nustatymų)',
  '{auto_generated_notice} - Pranešimas apie automatinį generavimą (iš nustatymų)',
  '{contact_manager_notice} - Pranešimas apie vadybininką (iš nustatymų)',
];

const EmailTemplatesForm: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [testEmailModal, setTestEmailModal] = useState<{ templateId: number | null; templateType: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/email-templates/');
      const fetchedTemplates = response.data.results || response.data || [];
      
      // Užtikrinti, kad visi tipai būtų pateikti
      const allTemplates: EmailTemplate[] = TEMPLATE_TYPES.map(type => {
        const existing = fetchedTemplates.find((t: EmailTemplate) => t.template_type === type.value);
        if (existing) {
          return existing;
        }
        // Jei nėra, sukurti naują su numatytomis reikšmėmis
        return {
          template_type: type.value,
          template_type_display: type.label,
          subject: '',
          body_text: '',
          body_html: '',
          is_active: true,
        };
      });
      
      setTemplates(allTemplates);
    } catch (err: any) {
      console.error('Klaida užkraunant šablonus:', err);
      setMessage({ type: 'error', text: 'Nepavyko užkrauti šablonų' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (template: EmailTemplate) => {
    setSaving(true);
    setMessage(null);
    try {
      if (template.id) {
        // Atnaujinti esamą
        await api.put(`/settings/email-templates/${template.id}/`, template);
      } else {
        // Sukurti naują
        await api.post('/settings/email-templates/', template);
      }
      setMessage({ type: 'success', text: 'Šablonas sėkmingai išsaugotas' });
      setEditingTemplate(null);
      await fetchTemplates();
    } catch (err: any) {
      console.error('Klaida išsaugant šabloną:', err);
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.detail || err.response?.data?.message || 'Nepavyko išsaugoti šablono' 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate({ ...template });
  };

  const handleCancel = () => {
    setEditingTemplate(null);
    setMessage(null);
  };

  const updateEditingTemplate = (field: keyof EmailTemplate, value: any) => {
    if (editingTemplate) {
      setEditingTemplate({ ...editingTemplate, [field]: value });
    }
  };

  const handleTestTemplate = async (template: EmailTemplate) => {
    if (!template.id) {
      setMessage({ type: 'error', text: 'Išsaugokite šabloną pirmiau, prieš bandydami jį išbandyti' });
      return;
    }
    
    // Užpildyti prisijungusio vartotojo el. pašto adresą
    const userEmail = user?.email || '';
    setTestEmail(userEmail);
    setTestEmailModal({ templateId: template.id, templateType: template.template_type_display || template.template_type });
  };

  const sendTestEmail = async () => {
    if (!testEmailModal?.templateId || !testEmail.trim()) {
      setMessage({ type: 'error', text: 'Įveskite el. pašto adresą' });
      return;
    }

    setTesting(true);
    setMessage(null);
    
    try {
      const response = await api.post(`/settings/email-templates/${testEmailModal.templateId}/test/`, {
        email: testEmail.trim()
      });
      
      setMessage({ type: 'success', text: response.data.message || 'Testinis el. laiškas sėkmingai išsiųstas' });
      setTestEmailModal(null);
      setTestEmail('');
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.response?.data?.detail || 'Nepavyko išsiųsti testinio el. laiško'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Kraunama...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h3 style={{ marginTop: 0, marginBottom: '24px' }}>El. laiškų šablonai</h3>
      
      {message && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message.text}
        </div>
      )}


      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {templates.map((template) => {
          const isEditing = editingTemplate?.template_type === template.template_type;
          const displayTemplate = isEditing ? editingTemplate! : template;

          return (
            <div key={template.template_type} style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h4 style={{ margin: 0 }}>{template.template_type_display || TEMPLATE_TYPES.find(t => t.value === template.template_type)?.label}</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {!isEditing ? (
                    <>
                      {template.id && (
                        <button
                          onClick={() => handleTestTemplate(template)}
                          disabled={loading}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            opacity: loading ? 0.6 : 1
                          }}
                        >
                          Išbandyti
                        </button>
                      )}
                    <button
                      onClick={() => handleEdit(template)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Redaguoti
                    </button>
                    </>
                  ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleSave(editingTemplate!)}
                      disabled={saving}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        opacity: saving ? 0.6 : 1
                      }}
                    >
                      {saving ? 'Išsaugoma...' : 'Išsaugoti'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Atšaukti
                    </button>
                  </div>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                  {/* Kairėje: Forma */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
                        Aktyvus:
                      </label>
                      <input
                        type="checkbox"
                        checked={displayTemplate.is_active}
                        onChange={(e) => updateEditingTemplate('is_active', e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
                        Antraštė:
                      </label>
                      <input
                        type="text"
                        value={displayTemplate.subject}
                        onChange={(e) => updateEditingTemplate('subject', e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px' }}
                        placeholder="El. laiško antraštė"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
                        Turinys (tekstas):
                      </label>
                      <textarea
                        id={`textarea-${template.template_type}`}
                        value={displayTemplate.body_text}
                        onChange={(e) => updateEditingTemplate('body_text', e.target.value)}
                        rows={10}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}
                        placeholder="El. laiško turinys paprastu tekstu"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600', fontSize: '13px' }}>
                        Turinys (HTML) - neprivalomas:
                      </label>
                      <textarea
                        value={displayTemplate.body_html || ''}
                        onChange={(e) => updateEditingTemplate('body_html', e.target.value)}
                        rows={10}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}
                        placeholder="El. laiško turinys HTML formatu (jei tuščias, bus naudojamas tekstinis turinys)"
                      />
                    </div>
                  </div>

                  {/* Dešinėje: Kintamieji */}
                  <div style={{ width: '350px', flexShrink: 0 }}>
                    <div style={{ padding: '16px', backgroundColor: '#e7f3ff', borderRadius: '8px', border: '1px solid #b3d9ff', position: 'sticky', top: '20px' }}>
                      <strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: '#004085' }}>
                        Galimi kintamieji šiam šablonui:
                      </strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                        {TEMPLATE_VARIABLES[template.template_type]?.map((variable, idx) => (
                          <div key={idx} style={{ 
                            padding: '6px 10px', 
                            backgroundColor: '#fff', 
                            borderRadius: '4px',
                            fontSize: '12px',
                            border: '1px solid #b3d9ff',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f8ff'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                          onClick={() => {
                            const variableName = variable.split(' - ')[0];
                            const textareaId = `textarea-${template.template_type}`;
                            const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart || 0;
                              const end = textarea.selectionEnd || 0;
                              const text = displayTemplate.body_text || '';
                              const newText = text.substring(0, start) + variableName + text.substring(end);
                              updateEditingTemplate('body_text', newText);
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + variableName.length, start + variableName.length);
                              }, 0);
                            }
                          }}
                          title="Spustelėkite, kad įterptumėte į turinį"
                          >
                            <code style={{ color: '#0066cc', fontWeight: '600' }}>{variable.split(' - ')[0]}</code>
                            <span style={{ color: '#6c757d', marginLeft: '8px' }}>{variable.split(' - ')[1]}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #b3d9ff' }}>
                        <strong style={{ display: 'block', marginBottom: '12px', fontSize: '14px', color: '#004085' }}>
                          Bendri kintamieji (visiems šablonams):
                        </strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                          {COMMON_VARIABLES.map((variable, idx) => (
                            <div key={idx} style={{ 
                              padding: '6px 10px', 
                              backgroundColor: '#fff', 
                              borderRadius: '4px',
                              fontSize: '12px',
                              border: '1px solid #b3d9ff',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f8ff'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                            onClick={() => {
                              const variableName = variable.split(' - ')[0];
                              const textareaId = `textarea-${template.template_type}`;
                              const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
                              if (textarea) {
                                const start = textarea.selectionStart || 0;
                                const end = textarea.selectionEnd || 0;
                                const text = displayTemplate.body_text || '';
                                const newText = text.substring(0, start) + variableName + text.substring(end);
                                updateEditingTemplate('body_text', newText);
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + variableName.length, start + variableName.length);
                                }, 0);
                              }
                            }}
                            title="Spustelėkite, kad įterptumėte į turinį"
                            >
                              <code style={{ color: '#0066cc', fontWeight: '600' }}>{variable.split(' - ')[0]}</code>
                              <span style={{ color: '#6c757d', marginLeft: '8px' }}>{variable.split(' - ')[1]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  <div>
                    <strong>Aktyvus:</strong> {template.is_active ? 'Taip' : 'Ne'}
                  </div>
                  <div>
                    <strong>Antraštė:</strong> {template.subject || '(nėra)'}
                  </div>
                  <div>
                    <strong>Turinys:</strong>
                    <div style={{ marginTop: '4px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', border: '1px solid #dee2e6' }}>
                      {template.body_text || '(nėra)'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal langas testiniam el. laiškui */}
      {testEmailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => {
          if (!testing) {
            setTestEmailModal(null);
            setTestEmail('');
          }
        }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
              Išbandyti šabloną: {testEmailModal.templateType}
            </h3>
            <p style={{ marginBottom: '16px', color: '#6c757d' }}>
              Įveskite el. pašto adresą, į kurį norite gauti testinį el. laišką su pasirinktu šablonu.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '14px' }}>
                El. pašto adresas:
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !testing && testEmail.trim()) {
                    sendTestEmail();
                  }
                }}
                placeholder="pvz: testas@example.com"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setTestEmailModal(null);
                  setTestEmail('');
                }}
                disabled={testing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: testing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: testing ? 0.6 : 1
                }}
              >
                Atšaukti
              </button>
              <button
                onClick={sendTestEmail}
                disabled={testing || !testEmail.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (testing || !testEmail.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: (testing || !testEmail.trim()) ? 0.6 : 1
                }}
              >
                {testing ? 'Siunčiama...' : 'Išsiųsti'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailTemplatesForm;

