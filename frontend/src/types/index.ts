/**
 * Bendros tipo definicijos visai aplikacijai
 * Išvengiama dubliavimo skirtinguose komponentuose
 */

// ============================================================================
// PARTNER TYPES
// ============================================================================

export interface Partner {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  address: string;
  phone: string;
  email: string;
  is_client: boolean;
  is_supplier: boolean;
  bank_account: string;
  payment_term_days: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface Contact {
  id?: number;
  name: string;
  email: string;
  phone: string;
  position: string;
  notes: string;
  is_primary: boolean;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderStatus = 'new' | 'in_progress' | 'completed' | 'cancelled' | 'waiting_for_docs';

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  status_display?: string;
  client: number | Partner;
  client_name?: string;
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
  sender_route_from?: string;
  receiver_route_to?: string;
  order_date: string | null;
  loading_date: string | null;
  unloading_date: string | null;
  loading_date_from: string | null;
  loading_date_to: string | null;
  unloading_date_from: string | null;
  unloading_date_to: string | null;
  price_net: string | null;
  price_vat: string | null;
  price_with_vat: string | null;
  vat_rate: string | null;
  notes: string;
  carriers: OrderCarrier[];
  cargo_items: CargoItem[];
  other_costs: OtherCost[];
  carrier_price_net: string | null;
  carrier_price_vat: string | null;
  carrier_price_with_vat: string | null;
  carrier_vat_amount: string | null;
  client_invoice_issued: boolean;
  client_invoice_received: boolean;
  is_partial?: boolean;
  weight_kg?: string | number | null;
  ldm?: string | number | null;
  length_m?: string | number | null;
  width_m?: string | number | null;
  height_m?: string | number | null;
  is_palletized?: boolean;
  is_stackable?: boolean;
  vehicle_type?: string | null;
  vehicle_type_display?: string | null;
  requires_forklift?: boolean;
  requires_crane?: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderCarrier {
  id?: number;
  partner: number;
  partner_name?: string;
  carrier_type: 'carrier' | 'warehouse';
  carrier_type_display?: string;
  route_from: string;
  route_to: string;
  loading_date: string | null;
  unloading_date: string | null;
  loading_date_from: string | null;
  loading_date_to: string | null;
  unloading_date_from: string | null;
  unloading_date_to: string | null;
  price_net: string | null;
  price_vat: string | null;
  price_with_vat: string | null;
  vat_rate: string | null;
  payment_terms?: string;
  notes: string;
  sequence_order?: number;
  invoice_number?: string | null;
  invoice_received?: boolean;
}

export interface CargoItem {
  id?: number;
  description: string;
  quantity: number | string;
  weight_kg: number | string | null;
  volume_m3: number | string | null;
  ldm: number | string | null;
  length_m: number | string | null;
  width_m: number | string | null;
  height_m: number | string | null;
  is_stackable: boolean;
  is_palletized: boolean;
  notes: string;
}

export interface OtherCost {
  id?: number;
  description: string;
  amount: string | number;
  notes?: string;
}

// ============================================================================
// INVOICE TYPES
// ============================================================================

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export interface SalesInvoice {
  id: number;
  invoice_number: string;
  partner: number;
  partner_name?: string;
  issue_date: string;
  due_date: string;
  amount_net: string | number;
  amount_vat: string | number;
  amount_total: string | number;
  vat_rate: string | number;
  payment_status: PaymentStatus;
  payment_status_display?: string;
  payment_date: string | null;
  related_order?: number | null;
  order_number?: string | null;
  notes: string;
  invoice_items?: InvoiceItem[];
  display_options?: DisplayOptions;
  visible_items_indexes?: number[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseInvoice {
  id: number;
  invoice_number: string;
  partner: number;
  partner_name?: string;
  issue_date: string;
  due_date: string;
  amount_net: string | number;
  amount_vat: string | number;
  amount_total: string | number;
  vat_rate: string | number;
  payment_status: PaymentStatus;
  payment_status_display?: string;
  payment_date: string | null;
  carrier?: number | null;
  carrier_name?: string | null;
  related_order?: number | null;
  related_orders?: Array<{ id: number; order_number: string; order_date?: string; amount?: string }>;
  related_orders_amounts?: Array<{ order_id: number; amount: string }>;
  order_number?: string | null;
  notes: string;
  invoice_file?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  description: string;
  amount_net: number;
  vat_amount: number;
  amount_total: number;
  vat_rate: number;
  type?: string;
  visible?: boolean;
}

export interface DisplayOptions {
  show_carriers?: boolean;
  show_prices?: boolean;
  show_price_details?: boolean;
  show_my_price?: boolean;
  show_other_costs?: boolean;
  show_order_type?: boolean;
}

export interface InvoiceInfo {
  invoice_number: string;
  amount_total: number;
  payment_status: PaymentStatus;
  due_date?: string;
}

// ============================================================================
// EXPENSE TYPES
// ============================================================================

export interface ExpenseCategory {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSupplier {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  address: string;
  phone: string;
  email: string;
  bank_account: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInvoice {
  id: number;
  invoice_number: string;
  supplier: number;
  supplier_name?: string;
  category: number;
  category_name?: string;
  issue_date: string;
  due_date: string;
  amount_net: string | number;
  amount_vat: string | number;
  amount_total: string | number;
  vat_rate: string | number;
  currency: string;
  payment_status: PaymentStatus;
  payment_status_display?: string;
  payment_date: string | null;
  payment_method: string;
  notes: string;
  invoice_file?: string | null;
  invoice_file_url?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface UpcomingOrder {
  id: number;
  order_number: string;
  client_name: string;
  loading_date: string | null;
  unloading_date: string | null;
  status: OrderStatus;
  status_display: string;
  route_from: string;
  route_to: string;
}

export interface CarrierInfo {
  id: number;
  partner_name: string;
  invoice_number: string;
  amount_total: number;
  due_date: string;
  payment_status: PaymentStatus;
  overdue_days?: number;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

export interface CompanyInfo {
  id: number;
  name: string;
  code: string;
  vat_code: string;
  address: string;
  phone: string;
  email: string;
  bank_account: string;
  bank_name: string;
  bank_swift: string;
  director_name: string;
  logo?: string | null;
}

export interface UserSettings {
  id: number;
  user: number;
  full_name: string;
  position: string;
  phone: string;
  email_signature: string;
}

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  company_name?: string;
  role?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  detail?: string;
  message?: string;
  error?: string;
  type?: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface OrderFilters {
  status?: OrderStatus;
  client?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface InvoiceFilters {
  payment_status?: PaymentStatus;
  partner?: number;
  issue_date__gte?: string;
  issue_date__lte?: string;
  due_date__gte?: string;
  due_date__lte?: string;
  search?: string;
}

