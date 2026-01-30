import React, { useState, useEffect } from 'react';
import AutocompleteField from '../AutocompleteField';
import '../../pages/OrdersPage.css';

// Interfaces
interface CargoItem {
  id?: number;
  order?: number;
  sequence_order: number;
  reference_number?: string | null;
  description?: string;
  units?: string | number | null;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  pallet_count?: string | number | null;
  package_count?: string | number | null;
  length_m?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
  is_palletized?: boolean;
  is_stackable?: boolean;
  vehicle_type?: string | null;
  requires_forklift?: boolean;
  requires_crane?: boolean;
  requires_special_equipment?: boolean;
  fragile?: boolean;
  hazardous?: boolean;
  temperature_controlled?: boolean;
  requires_permit?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  loading_stop?: number | null;
  unloading_stop?: number | null;
}

interface RouteStop {
  id?: number;
  stop_type: 'loading' | 'unloading';
  city: string;
  country: string;
  name: string;
}

interface CargoItemModalProps {
  cargoItem: CargoItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (cargoItem: CargoItem) => void;
  routeStops?: RouteStop[];
}

const CargoItemModal: React.FC<CargoItemModalProps> = ({
  cargoItem: initialCargoItem,
  isOpen,
  onClose,
  onSave,
  routeStops = []
}) => {
  const [editingCargoItem, setEditingCargoItem] = useState<CargoItem | null>(initialCargoItem);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen && initialCargoItem) {
      setEditingCargoItem(initialCargoItem);
    } else if (isOpen && !initialCargoItem) {
      // Naujas cargo item
      setEditingCargoItem({
        sequence_order: 0,
        reference_number: null,
        description: '',
        units: null,
        weight_kg: null,
        ldm: null,
        pallet_count: null,
        package_count: null,
        length_m: null,
        width_m: null,
        height_m: null,
        is_palletized: false,
        is_stackable: false,
        vehicle_type: null,
        requires_forklift: false,
        requires_crane: false,
        requires_special_equipment: false,
        fragile: false,
        hazardous: false,
        temperature_controlled: false,
        requires_permit: false,
        notes: ''
      });
    } else {
      // Modal uždarytas
      setEditingCargoItem(null);
    }
  }, [isOpen, initialCargoItem]);

  const handleSave = () => {
    if (!editingCargoItem) return;

    const savedCargoItem: CargoItem = {
      ...editingCargoItem,
      sequence_order: editingCargoItem.sequence_order ?? 0,
    };

    onSave(savedCargoItem);
    onClose();
  };

  if (!isOpen || !editingCargoItem) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '95vh', overflowY: 'auto', padding: '15px 20px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>
            {initialCargoItem ? 'Redaguoti' : 'Pridėti'} krovinio aprašymą
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#999', cursor: 'pointer' }}>
            ×
          </button>
        </div>

        {/* Pagrindinis grid: 2 stulpeliai */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Kairė pusė */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
          <AutocompleteField
            fieldType="cargo_description"
            value={editingCargoItem.description || ''}
            onChange={(value) => setEditingCargoItem({ ...editingCargoItem, description: value })}
            label="Aprašymas"
            placeholder="Trumpas krovinių aprašymas"
            minLength={1}
            debounceMs={200}
          />
        </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>📍 Pakrovimo vieta</label>
                <select 
                  className="form-control"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                  value={editingCargoItem.loading_stop || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, loading_stop: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">Pasirinkite...</option>
                  {routeStops.filter(s => s.stop_type === 'loading').map((s, i) => (
                    <option key={s.id || `l-${i}`} value={s.id}>{s.city || '?'}, {s.country || '?'} {s.name ? `(${s.name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>📍 Iškrovimo vieta</label>
                <select 
                  className="form-control"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                  value={editingCargoItem.unloading_stop || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, unloading_stop: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">Pasirinkite...</option>
                  {routeStops.filter(s => s.stop_type === 'unloading').map((s, i) => (
                    <option key={s.id || `u-${i}`} value={s.id}>{s.city || '?'}, {s.country || '?'} {s.name ? `(${s.name})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
          <AutocompleteField
            fieldType="vehicle_type"
            value={editingCargoItem.vehicle_type || ''}
            onChange={(value) => setEditingCargoItem({ ...editingCargoItem, vehicle_type: value })}
            label="Mašinos tipas"
            placeholder="Pvz: Sunkvežimis, Furgonas..."
          />
        </div>

            {/* Matmenys */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Ilgis (m)</label>
            <input
              type="number"
              step="0.01"
              value={editingCargoItem.length_m || ''}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, length_m: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0.00"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
            />
          </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Plotis (m)</label>
            <input
              type="number"
              step="0.01"
              value={editingCargoItem.width_m || ''}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, width_m: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0.00"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
            />
          </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Aukštis (m)</label>
            <input
              type="number"
              step="0.01"
              value={editingCargoItem.height_m || ''}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, height_m: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0.00"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
            />
          </div>
        </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '12px', marginBottom: '4px' }}>Ref. nr.</label>
              <input
                type="text"
                value={editingCargoItem.reference_number || ''}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, reference_number: e.target.value || null })}
                placeholder="Referencinis numeris"
                style={{ fontSize: '13px', padding: '6px 8px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '12px', marginBottom: '4px' }}>Pastabos</label>
              <textarea
                value={editingCargoItem.notes || ''}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, notes: e.target.value })}
                placeholder="Papildomos pastabos..."
                rows={3}
                style={{ fontSize: '13px', padding: '6px 8px', resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Dešinė pusė */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Skaitiniai parametrai */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Vnt.</label>
                <input
                  type="number"
                  step="1"
                  value={editingCargoItem.units || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, units: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Svoris (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingCargoItem.weight_kg || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, weight_kg: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>LDM</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingCargoItem.ldm || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, ldm: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Paletių sk.</label>
                <input
                  type="number"
                  step="1"
                  value={editingCargoItem.pallet_count || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, pallet_count: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '12px', marginBottom: '4px' }}>Pakuočių sk.</label>
                <input
                  type="number"
                  step="1"
                  value={editingCargoItem.package_count || ''}
                  onChange={(e) => setEditingCargoItem({ ...editingCargoItem, package_count: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="0"
                  style={{ fontSize: '13px', padding: '6px 8px' }}
                />
              </div>
            </div>

            {/* Checkbox'ai - kompaktiškai */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={editingCargoItem.is_palletized || false}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, is_palletized: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Paletemis</span>
            </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={editingCargoItem.is_stackable || false}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, is_stackable: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Stabeliuojamas</span>
            </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={editingCargoItem.requires_forklift || false}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, requires_forklift: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
                <span>Keltuvas</span>
            </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={editingCargoItem.requires_crane || false}
                onChange={(e) => setEditingCargoItem({ ...editingCargoItem, requires_crane: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
                <span>Kranas</span>
            </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={editingCargoItem.requires_special_equipment || false}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, requires_special_equipment: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
                <span>Spec. įranga</span>
          </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={editingCargoItem.fragile || false}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, fragile: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
                <span>Trapus</span>
          </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={editingCargoItem.hazardous || false}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, hazardous: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
                <span>Pavojingas</span>
          </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={editingCargoItem.temperature_controlled || false}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, temperature_controlled: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
                <span>Temp. kontrolė</span>
          </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={editingCargoItem.requires_permit || false}
              onChange={(e) => setEditingCargoItem({ ...editingCargoItem, requires_permit: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
                <span>Reik. leidimas</span>
          </label>
            </div>
          </div>
        </div>

        {/* Mygtukai */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #e0e0e0' }}>
          <button type="button" className="button" onClick={handleSave} style={{ padding: '8px 16px', fontSize: '13px' }}>
            Išsaugoti
          </button>
          <button type="button" className="button button-secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: '13px' }}>
            Atšaukti
          </button>
        </div>
      </div>
    </div>
  );
};

export default CargoItemModal;
