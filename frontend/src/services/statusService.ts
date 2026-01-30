/**
 * StatusService - Frontend servisas statusų valdymui
 * 
 * Šis servisas yra vienintelis būdas keisti statusus sistemoje per API.
 */
import { api } from './api';

export interface ChangeStatusRequest {
  entity_type: 'order' | 'sales_invoice' | 'purchase_invoice' | 'order_carrier' | 'order_cost';
  entity_id: number;
  new_status: string;
  reason?: string;
}

export interface ChangeStatusResponse {
  success: boolean;
  old_status: string;
  new_status: string;
  message: string;
}

export interface AllowedTransitionsResponse {
  entity_type: string;
  current_status: string;
  allowed_transitions: string[];
}

class StatusService {
  /**
   * Pakeisti objekto statusą
   */
  static async changeStatus(request: ChangeStatusRequest): Promise<ChangeStatusResponse> {
    const response = await api.post<ChangeStatusResponse>('/core/status/change/', request);
    return response.data;
  }

  /**
   * Gauti leistinus statusų perėjimus
   */
  static async getAllowedTransitions(
    entityType: string,
    currentStatus: string
  ): Promise<AllowedTransitionsResponse> {
    const response = await api.get<AllowedTransitionsResponse>('/core/status/allowed-transitions/', {
      params: {
        entity_type: entityType,
        current_status: currentStatus,
      },
    });
    return response.data;
  }

  /**
   * Patikrinti, ar statusų perėjimas yra leistinas
   */
  static async isTransitionAllowed(
    entityType: string,
    currentStatus: string,
    newStatus: string
  ): Promise<boolean> {
    try {
      const result = await StatusService.getAllowedTransitions(entityType, currentStatus);
      return result.allowed_transitions.includes(newStatus);
    } catch (error) {
      console.error('Error checking allowed transitions:', error);
      return false;
    }
  }
}

export default StatusService;
