import React from 'react';
import '../../pages/SettingsPage.css';

interface PVMRate {
  id?: number;
  rate: string;
  article: string;
  article_en?: string;
  article_ru?: string;
  is_active: boolean;
  sequence_order: number;
  created_at?: string;
  updated_at?: string;
}

interface PvmRateFormModalProps {
  isOpen: boolean;
  pvmRate: PVMRate | null;
  onClose: () => void;
  onSave: (rate: PVMRate) => Promise<void>;
  onUpdate: (rate: PVMRate) => void;
  saving: boolean;
}

const PvmRateFormModal: React.FC<PvmRateFormModalProps> = ({
  isOpen,
  pvmRate,
  onClose,
  onSave,
  onUpdate,
  saving
}) => {
  if (!isOpen || !pvmRate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(pvmRate);
  };

  const updateField = (field: keyof PVMRate, value: any) => {
    const updated = { ...pvmRate, [field]: value };
    onUpdate(updated);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        backgroundColor: '#fff',
        padding: '30px',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: '20px' }}>
          {pvmRate.id ? 'Redaguoti PVM tarifą' : 'Naujas PVM tarifas'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              PVM Tarifas (%) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={pvmRate.rate}
              onChange={(e) => updateField('rate', e.target.value)}
              required
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Straipsnis (LT)
            </label>
            <input
              type="text"
              value={pvmRate.article}
              onChange={(e) => updateField('article', e.target.value)}
              placeholder="pvz. 5 str. 7 d., 6 str."
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Straipsnis (EN)
            </label>
            <input
              type="text"
              value={pvmRate.article_en || ''}
              onChange={(e) => updateField('article_en', e.target.value)}
              placeholder="Article 45 of the VAT Law"
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Straipsnis (RU)
            </label>
            <input
              type="text"
              value={pvmRate.article_ru || ''}
              onChange={(e) => updateField('article_ru', e.target.value)}
              placeholder="45 ст. Закона о НДС"
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              PVM įstatymo straipsnio vertimas į kitas kalbas
            </small>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={pvmRate.is_active}
                onChange={(e) => updateField('is_active', e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <span>Aktyvus (bus rodomas sąskaitų formose)</span>
            </label>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Eiliškumas
            </label>
            <input
              type="number"
              min="0"
              value={pvmRate.sequence_order}
              onChange={(e) => updateField('sequence_order', parseInt(e.target.value) || 0)}
              style={{ width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              Nustato tvarką, kuria tarifai yra rodomi sąraše
            </small>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              Atšaukti
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Išsaugoma...' : 'Išsaugoti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PvmRateFormModal;


