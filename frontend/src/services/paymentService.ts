/**
 * PaymentService - Centralizuotas mokėjimų valdymo servisas frontend'e
 * 
 * Šis servisas yra vienintelis būdas keisti payment_status ir valdyti mokėjimus frontend'e.
 * Visi payment_status pakeitimai turi eiti per šį servisą.
 */
import { api } from './api';

export interface Payment {
  id: number;
  amount: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at?: string;
}

export interface Invoice {
  id: number;
  payment_status: string;
  paid_amount: string;
  remaining_amount: string;
}

export interface AddPaymentRequest {
  invoice_type: 'sales' | 'purchase';
  invoice_id: number;
  amount: string | number;
  payment_date: string;
  payment_method?: string;
  notes?: string;
  offset_invoice_ids?: number[];
}

export interface AddPaymentResponse {
  success: boolean;
  payment: {
    id: number | null;
    amount: string;
    payment_date: string | null;
    payment_method: string;
    notes: string;
  };
  invoice: Invoice;
}

export interface DeletePaymentResponse {
  success: boolean;
  invoice: Invoice;
}

export interface MarkAsPaidRequest {
  invoice_type: 'sales' | 'purchase';
  invoice_id: number;
  payment_date?: string;
  payment_method?: string;
  notes?: string;
}

class PaymentService {
  /**
   * Pridėti mokėjimą prie sąskaitos
   */
  static async addPayment(data: AddPaymentRequest): Promise<AddPaymentResponse> {
    const response = await api.post<AddPaymentResponse>('/invoices/payments/add/', {
      invoice_type: data.invoice_type,
      invoice_id: data.invoice_id,
      amount: String(data.amount),
      payment_date: data.payment_date,
      payment_method: data.payment_method || 'Pavedimu',
      notes: data.notes || '',
      offset_invoice_ids: data.offset_invoice_ids || []
    });
    return response.data;
  }

  /**
   * Ištrinti mokėjimą
   */
  static async deletePayment(paymentId: number): Promise<DeletePaymentResponse> {
    const response = await api.delete<DeletePaymentResponse>(`/invoices/payments/${paymentId}/delete/`);
    return response.data;
  }

  /**
   * Pažymėti sąskaitą kaip apmokėtą
   * 
   * Naudoja PaymentService API endpoint'ą, kuris automatiškai sukuria InvoicePayment įrašą
   * ir atnaujina payment_status. Visi pakeitimai matomi mokėjimų valdyme.
   */
  static async markAsPaid(
    invoiceType: 'sales' | 'purchase',
    invoiceId: number,
    paymentDate?: string,
    paymentMethod?: string,
    notes?: string
  ): Promise<{ success: boolean; payment: any; invoice: Invoice }> {
    const response = await api.post<{ success: boolean; payment: any; invoice: Invoice }>('/invoices/payments/mark-as-paid/', {
      invoice_type: invoiceType,
      invoice_id: invoiceId,
      payment_date: paymentDate,
      payment_method: paymentMethod || 'Pavedimu',
      notes: notes || 'Pažymėta kaip apmokėta'
    });
    return response.data;
  }

  /**
   * Pažymėti sąskaitą kaip neapmokėtą
   * 
   * Naudoja PaymentService API endpoint'ą, kuris ištrina visus mokėjimus
   * ir atnaujina payment_status. Visi pakeitimai matomi mokėjimų valdyme.
   */
  static async markAsUnpaid(
    invoiceType: 'sales' | 'purchase',
    invoiceId: number
  ): Promise<{ success: boolean; invoice: Invoice }> {
    const response = await api.post<{ success: boolean; invoice: Invoice }>('/invoices/payments/mark-as-unpaid/', {
      invoice_type: invoiceType,
      invoice_id: invoiceId
    });
    return response.data;
  }
}

export default PaymentService;
