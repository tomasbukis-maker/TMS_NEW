import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import AutocompleteTextarea from '../AutocompleteTextarea';
import AutocompleteField from '../AutocompleteField';
import '../../pages/OrdersPage.css';

// Interfaces - kopijuojame iš OrdersPage.tsx
interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position?: string;
  notes?: string;
}

interface Client {
  id: number;
  name: string;
  code: string;
  vat_code?: string;
  address?: string;
  is_client?: boolean;
  is_supplier?: boolean;
  status?: string;
  status_display?: string;
  contact_person?: Contact | null;
  contacts?: Contact[];
  payment_term_days?: number;
  notes?: string;
}

interface User {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface OtherCost {
  description: string;
  amount: number | string;
}

interface PVMRate {
  id: number;
  rate: string;
  article: string;
  is_active: boolean;
  sequence_order: number;
}

interface CargoItem {
  id?: number;
  description?: string;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  length_m?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
  is_palletized?: boolean;
  is_stackable?: boolean;
  vehicle_type?: string | null;
  requires_forklift?: boolean;
  requires_crane?: boolean;
  fragile?: boolean;
  hazardous?: boolean;
  temperature_controlled?: boolean;
  requires_permit?: boolean;
  sequence_order?: number;
}

interface OrderCarrier {
  id?: number;
  partner: Client;
  partner_id: number;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display: string;
  route_from?: string | null;
  route_to?: string | null;
  loading_date?: string | null;
  unloading_date?: string | null;
  price_net?: string | number | null;
  price_with_vat?: string | number | null;
  status?: string;
  status_display?: string;
  sequence_order: number;
  notes?: string | null;
}

interface Order {
  id: number;
  order_number?: string | null;
  client: Client;
  client_id: number;
  order_type: string;
  order_type_display: string;
  manager: User | null;
  manager_id: number | null;
  status: string;
  status_display: string;
  client_price_net: string | null;
  my_price_net?: string | number | null;
  other_costs?: OtherCost[];
  vat_rate: string;
  vat_rate_article?: string;
  client_invoice_issued: boolean;
  client_invoice_received: boolean;
  client_payment_status?: 'not_paid' | 'partially_paid' | 'paid';
  route_from: string;
  route_to: string;
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  order_date: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  notes: string;
  cargo_items?: CargoItem[];
  carriers?: OrderCarrier[];
}

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Order) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  onSave,
  showToast
}) => {
  // TODO: Pridėti visą state'ą ir logiką
  // TODO: Pridėti CarrierModal ir CargoItemModal importus
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid #dee2e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            {order ? 'Redaguoti užsakymą' : 'Naujas užsakymas'}
          </h2>
          <button
            onClick={onClose}
            className="button button-secondary"
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            ✕ Uždaryti
          </button>
        </div>
        
        <div style={{ padding: '15px 20px', overflowY: 'auto', flex: 1 }}>
          <p>OrderEditModal komponentas - dar kuriamas...</p>
        </div>
      </div>
    </div>
  );
};

export default OrderEditModal;

