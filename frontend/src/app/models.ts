export interface User {
  id: number;
  username: string;
  email: string;
  role: 'client' | 'operator' | 'admin';
  organisation?: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Assignment {
  id: number;
  episode: number;
  episode_id: string;
  episode_quality: string;
  episode_task: string;
  assigned_at: string;
  assigned_by_username: string;
}

export interface StatusHistory {
  id: number;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by_username: string;
}

export interface DatasetRequest {
  id: number;
  task_name: string;
  episodes_requested: number;
  deadline: string | null;
  notes: string;
  status: 'submitted' | 'in_progress' | 'delivered' | 'accepted' | 'rejected';
  client: number;
  client_username: string;
  assigned_count: number;
  created_at: string;
  updated_at: string;
  assignments?: Assignment[];
  status_history?: StatusHistory[];
}

export interface Episode {
  id: number;
  episode_id: string;
  robot_id: string;
  task_name: string;
  recorded_at: string;
  duration_seconds: number;
  operator_name: string;
  quality: 'good' | 'usable' | 'bad';
  assigned_request?: number | null;
}

export interface ImportReport {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errors?: string[];
}

export interface AnalyticsData {
  episodes_per_day_per_robot: Array<{
    date: string;
    robot_id: string;
    episode_count: number;
  }>;
  request_fulfilment: {
    counts_by_status: Record<string, number>;
    median_delivery_time_hours: number | null;
  };
  top_5_tasks_by_good_episodes: Array<{
    task_name: string;
    good_episodes_count: number;
  }>;
}
