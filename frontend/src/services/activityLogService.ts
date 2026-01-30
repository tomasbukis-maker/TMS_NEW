/**
 * ActivityLogService - Centralizuotas veiksmų istorijos servisas frontend'e
 * 
 * Šis servisas yra vienintelis būdas peržiūrėti veiksmų istoriją frontend'e.
 */
import { api } from './api';

export interface ActivityLog {
  id: number;
  action_type: string;
  action_type_display: string;
  description: string;
  content_type: number | null;
  object_id: number | null;
  content_object_info: {
    model: string;
    id: number;
    order_number?: string;
    invoice_number?: string;
    name?: string;
    error?: string;
  } | null;
  metadata: Record<string, any>;
  user: number | null;
  user_display: string;
  user_name: string;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}

export interface ActivityLogFilters {
  action_type?: string;
  user_id?: number;
  content_type?: string;
  object_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface ActivityLogListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ActivityLog[];
}

class ActivityLogService {
  /**
   * Gauti veiksmų istorijos sąrašą su filtravimu
   */
  static async getActivityLogs(filters?: ActivityLogFilters): Promise<ActivityLogListResponse> {
    const params: any = {};
    
    if (filters?.action_type) params.action_type = filters.action_type;
    if (filters?.user_id) params.user_id = filters.user_id;
    if (filters?.content_type) params.content_type = filters.content_type;
    if (filters?.object_id) params.object_id = filters.object_id;
    if (filters?.date_from) params.date_from = filters.date_from;
    if (filters?.date_to) params.date_to = filters.date_to;
    if (filters?.search) params.search = filters.search;
    if (filters?.page) params.page = filters.page;
    if (filters?.page_size) params.page_size = filters.page_size;
    
    const response = await api.get<ActivityLogListResponse>('/core/activity-logs/', { params });
    return response.data;
  }
  
  /**
   * Gauti konkretų veiksmų istorijos įrašą
   */
  static async getActivityLog(id: number): Promise<ActivityLog> {
    const response = await api.get<ActivityLog>(`/core/activity-logs/${id}/`);
    return response.data;
  }
  
  /**
   * Gauti veiksmų istoriją pagal objektą (pvz., užsakymas, sąskaita)
   */
  static async getActivityLogsByObject(
    contentType: string,
    objectId: number,
    filters?: Omit<ActivityLogFilters, 'content_type' | 'object_id'>
  ): Promise<ActivityLogListResponse> {
    return ActivityLogService.getActivityLogs({
      ...filters,
      content_type: contentType,
      object_id: objectId,
    });
  }
  
  /**
   * Gauti veiksmų istoriją pagal vartotoją
   */
  static async getActivityLogsByUser(
    userId: number,
    filters?: Omit<ActivityLogFilters, 'user_id'>
  ): Promise<ActivityLogListResponse> {
    return ActivityLogService.getActivityLogs({
      ...filters,
      user_id: userId,
    });
  }
  
  /**
   * Gauti veiksmų istoriją pagal veiksmo tipą
   */
  static async getActivityLogsByActionType(
    actionType: string,
    filters?: Omit<ActivityLogFilters, 'action_type'>
  ): Promise<ActivityLogListResponse> {
    return ActivityLogService.getActivityLogs({
      ...filters,
      action_type: actionType,
    });
  }
}

export default ActivityLogService;
