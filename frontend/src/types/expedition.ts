export interface Partner {
  id: number;
  name: string;
  code?: string | null;
  vat_code?: string | null;
}

export interface PaymentStatusInfo {
  status: 'not_paid' | 'partially_paid' | 'paid' | 'overdue';
  message: string;
  has_invoices?: boolean;
  invoice_issued?: boolean;
  overdue_days?: number;
  payment_date?: string;
}

export interface ExpeditionDocument {
  id: number;
  order_carrier: number;
  document_type: 'invoice' | 'cmr' | 'other';
  document_type_display?: string;
  amount?: string;
  invoice_number?: string | null;
  cmr_number?: string | null;
  issue_date?: string | null;
  received_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Expedition {
  id: number;
  order: number | { id: number; order_number?: string } | null;
  partner: Partner;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display: string;
  expedition_number: string | null;
  route_from: string;
  route_to: string;
  // Detali maršruto informacija
  route_from_country: string;
  route_from_postal_code: string;
  route_from_city: string;
  route_from_address: string;
  sender_name?: string; // Siuntėjo pavadinimas
  route_to_country: string;
  route_to_postal_code: string;
  route_to_city: string;
  route_to_address: string;
  receiver_name?: string; // Gavėjo pavadinimas
  loading_date: string | null;
  unloading_date: string | null;
  loading_date_from: string | null;
  loading_date_to: string | null;
  unloading_date_from: string | null;
  unloading_date_to: string | null;
  status: 'new' | 'in_progress' | 'completed' | 'cancelled';
  status_display: string;
  calculated_status?: 'new' | 'in_progress' | 'completed' | 'cancelled';
  calculated_status_display?: string;
  invoice_issued: boolean;
  invoice_received?: boolean;
  payment_status: 'not_paid' | 'partially_paid' | 'paid' | 'overdue';
  payment_status_display: string;
  payment_status_info?: PaymentStatusInfo;
  payment_date?: string | null;
  price_net: string | null;
  vat_rate?: string | null;
  vat_rate_article?: string | null;
  price_with_vat: number | null;
  vat_amount: number | null;
  notes: string;
  created_at?: string;
  due_date?: string | null;
  invoice_received_date?: string | null;
  payment_days?: number | null;
  payment_terms?: string;
  sequence_order?: number;
  documents?: ExpeditionDocument[];
}
