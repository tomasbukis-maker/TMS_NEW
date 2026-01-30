/**
 * StatusTransitionRuleService - Frontend servisas statusų perėjimų taisyklėms valdyti
 */
import { api } from './api';

export interface StatusTransitionRule {
  id: number;
  entity_type: 'order' | 'sales_invoice' | 'purchase_invoice' | 'order_carrier' | 'order_cost';
  entity_type_display: string;
  current_status: string;
  allowed_next_statuses: string[];
  is_active: boolean;
  order: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStatusTransitionRuleRequest {
  entity_type: 'order' | 'sales_invoice' | 'purchase_invoice' | 'order_carrier' | 'order_cost';
  current_status: string;
  allowed_next_statuses: string[];
  is_active?: boolean;
  order?: number;
  description?: string;
}

class StatusTransitionRuleService {
  /**
   * Gauti visas statusų perėjimų taisykles
   */
  static async getAllRules(params?: {
    entity_type?: string;
    is_active?: boolean;
  }): Promise<StatusTransitionRule[]> {
    const response = await api.get<StatusTransitionRule[] | { results: StatusTransitionRule[] }>('/core/status-transition-rules/', {
      params,
    });
    // Jei API grąžina objektą su results (pagination), grąžinti results, kitu atveju patį data
    if (Array.isArray(response.data)) {
      return response.data;
    } else if (response.data && typeof response.data === 'object' && 'results' in response.data) {
      return (response.data as { results: StatusTransitionRule[] }).results;
    }
    return [];
  }

  /**
   * Gauti taisyklę pagal ID
   */
  static async getRule(id: number): Promise<StatusTransitionRule> {
    const response = await api.get<StatusTransitionRule>(`/core/status-transition-rules/${id}/`);
    return response.data;
  }

  /**
   * Sukurti naują taisyklę
   */
  static async createRule(data: CreateStatusTransitionRuleRequest): Promise<StatusTransitionRule> {
    const response = await api.post<StatusTransitionRule>('/core/status-transition-rules/', data);
    return response.data;
  }

  /**
   * Atnaujinti taisyklę
   */
  static async updateRule(
    id: number,
    data: Partial<CreateStatusTransitionRuleRequest>
  ): Promise<StatusTransitionRule> {
    const response = await api.patch<StatusTransitionRule>(
      `/core/status-transition-rules/${id}/`,
      data
    );
    return response.data;
  }

  /**
   * Ištrinti taisyklę
   */
  static async deleteRule(id: number): Promise<void> {
    await api.delete(`/core/status-transition-rules/${id}/`);
  }
}

export default StatusTransitionRuleService;
