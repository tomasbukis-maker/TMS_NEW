import { useState, useEffect } from 'react';
import { api } from '../services/api';

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
      closed?: string;
      canceled?: string;
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

const defaultColors = {
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
    waiting_for_payment: '#ffc107',
    finished: '#28a745',
    closed: '#28a745',
    canceled: '#dc3545',
  },
  payment_colors: {
    no_invoice: '#000000',
    unpaid: '#dc3545',
    partially_paid: '#ffc107',
    paid: '#28a745',
  },
};

export const useUISettings = () => {
  const [settings, setSettings] = useState<UISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get('/settings/ui/current/');
        const data = response.data;
        
        // Užtikrinti, kad visi status_colors būtų užpildyti
        const statusColors = data.status_colors || {};
        
        setSettings({
          id: data.id || 0,
          status_colors: {
            invoices: {
              paid: statusColors.invoices?.paid || defaultColors.invoices.paid,
              not_paid: statusColors.invoices?.not_paid || defaultColors.invoices.not_paid,
              partially_paid: statusColors.invoices?.partially_paid || defaultColors.invoices.partially_paid,
              overdue: statusColors.invoices?.overdue || defaultColors.invoices.overdue,
            },
            expeditions: {
              new: statusColors.expeditions?.new || defaultColors.expeditions.new,
              in_progress: statusColors.expeditions?.in_progress || defaultColors.expeditions.in_progress,
              completed: statusColors.expeditions?.completed || defaultColors.expeditions.completed,
              cancelled: statusColors.expeditions?.cancelled || defaultColors.expeditions.cancelled,
            },
            orders: {
              new: statusColors.orders?.new || defaultColors.orders.new,
              assigned: statusColors.orders?.assigned || defaultColors.orders.assigned,
              executing: statusColors.orders?.executing || defaultColors.orders.executing,
              waiting_for_docs: statusColors.orders?.waiting_for_docs || defaultColors.orders.waiting_for_docs,
              waiting_for_payment: statusColors.orders?.waiting_for_payment || defaultColors.orders.waiting_for_payment,
              finished: statusColors.orders?.finished || defaultColors.orders.finished,
              closed: statusColors.orders?.closed || defaultColors.orders.closed,
              canceled: statusColors.orders?.canceled || defaultColors.orders.canceled,
            },
            payment_colors: {
              no_invoice: statusColors.payment_colors?.no_invoice || defaultColors.payment_colors.no_invoice,
              unpaid: statusColors.payment_colors?.unpaid || defaultColors.payment_colors.unpaid,
              partially_paid: statusColors.payment_colors?.partially_paid || defaultColors.payment_colors.partially_paid,
              paid: statusColors.payment_colors?.paid || defaultColors.payment_colors.paid,
            },
          },
          notes: data.notes || '',
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
        setError(null);
      } catch (err: any) {
        console.error('Klaida užkraunant UI nustatymus:', err);
        setError(err.message || 'Klaida užkraunant nustatymus');
        // Naudoti default spalvas, jei nepavyko užkrauti
        setSettings({
          id: 0,
          status_colors: {
            invoices: defaultColors.invoices,
            expeditions: defaultColors.expeditions,
            orders: defaultColors.orders,
            payment_colors: defaultColors.payment_colors,
          },
          notes: '',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const getInvoiceColor = (status: 'paid' | 'not_paid' | 'partially_paid' | 'overdue'): string => {
    if (!settings) return defaultColors.invoices[status === 'not_paid' ? 'not_paid' : status] || '#6c757d';
    const statusKey = status === 'not_paid' ? 'not_paid' : status;
    return settings.status_colors.invoices?.[statusKey] || defaultColors.invoices[statusKey] || '#6c757d';
  };

  const getExpeditionColor = (status: 'new' | 'in_progress' | 'completed' | 'cancelled'): string => {
    if (!settings) return defaultColors.expeditions[status] || '#6c757d';
    return settings.status_colors.expeditions?.[status] || defaultColors.expeditions[status] || '#6c757d';
  };

  const getOrderColor = (status: string): string => {
    // Map status to the expected keys, handling variations
    const statusKey = status === 'canceled' ? 'canceled' : status as keyof typeof defaultColors.orders;
    if (!settings) return defaultColors.orders[statusKey] || '#6c757d';
    return settings.status_colors.orders?.[statusKey] || defaultColors.orders[statusKey] || '#6c757d';
  };

  const getPaymentColor = (status: 'no_invoice' | 'unpaid' | 'partially_paid' | 'paid'): string => {
    if (!settings) return defaultColors.payment_colors[status] || '#6c757d';
    return settings.status_colors.payment_colors?.[status] || defaultColors.payment_colors[status] || '#6c757d';
  };

  return {
    settings,
    loading,
    error,
    getInvoiceColor,
    getExpeditionColor,
    getOrderColor,
    getPaymentColor,
  };
};

