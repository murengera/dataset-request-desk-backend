import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  User,
  AuthResponse,
  DatasetRequest,
  Episode,
  Assignment,
  ImportReport,
  AnalyticsData,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = 'http://127.0.0.1:8000/api';
  private readonly tokenKey = 'drd_auth_token';

  constructor(private http: HttpClient) { }

  // --- Auth & Token Management ---
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.getToken();
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }
    return headers;
  }

  // --- Error Formatter Helper ---
  formatError(err: any): string {
    if (!err) return 'An unexpected error occurred.';
    const errorBody = err.error || err;

    if (typeof errorBody === 'string') {
      return errorBody;
    }

    if (errorBody.error && typeof errorBody.error === 'string') {
      return errorBody.error;
    }
    if (errorBody.detail && typeof errorBody.detail === 'string') {
      return errorBody.detail;
    }

    if (typeof errorBody === 'object' && errorBody !== null) {
      const messages: string[] = [];
      for (const [field, fieldErrors] of Object.entries(errorBody)) {
        const fieldName = field === 'non_field_errors' ? '' : `${field.replace('_', ' ')}: `;
        if (Array.isArray(fieldErrors)) {
          messages.push(`${fieldName}${fieldErrors.join(' ')}`);
        } else if (typeof fieldErrors === 'string') {
          messages.push(`${fieldName}${fieldErrors}`);
        } else if (typeof fieldErrors === 'object') {
          messages.push(`${fieldName}${JSON.stringify(fieldErrors)}`);
        }
      }
      if (messages.length > 0) {
        return messages.join(' | ');
      }
    }

    return err.message || 'Operation failed. Please check your inputs.';
  }

  login(credentials: { username_or_email?: string; username?: string; password: string }): Observable<AuthResponse> {
    const payload = {
      username_or_email: credentials.username_or_email || credentials.username,
      password: credentials.password,
    };
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login/`, payload);
  }

  register(data: { username: string; email: string; password: string; organisation?: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register/`, data);
  }

  getMe(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/auth/me/`, { headers: this.getHeaders() });
  }

  // --- Dataset Requests ---
  getRequests(): Observable<DatasetRequest[]> {
    return this.http.get<DatasetRequest[]>(`${this.baseUrl}/requests/`, { headers: this.getHeaders() });
  }

  getRequest(id: number): Observable<DatasetRequest> {
    return this.http.get<DatasetRequest>(`${this.baseUrl}/requests/${id}/`, { headers: this.getHeaders() });
  }

  createRequest(data: {
    task_name: string;
    episodes_requested: number;
    deadline?: string | null;
    notes?: string;
  }): Observable<DatasetRequest> {
    const payload = {
      ...data,
      deadline: data.deadline ? data.deadline : null,
    };
    return this.http.post<DatasetRequest>(`${this.baseUrl}/requests/`, payload, { headers: this.getHeaders() });
  }

  updateRequest(
    id: number,
    data: {
      task_name?: string;
      episodes_requested?: number;
      deadline?: string | null;
      notes?: string;
    }
  ): Observable<DatasetRequest> {
    const payload = {
      ...data,
      deadline: data.deadline ? data.deadline : null,
    };
    return this.http.patch<DatasetRequest>(`${this.baseUrl}/requests/${id}/`, payload, {
      headers: this.getHeaders(),
    });
  }

  transitionRequest(id: number, status: string, notes?: string): Observable<DatasetRequest> {
    const payload: { status: string; notes?: string } = { status };
    if (notes && notes.trim()) {
      payload.notes = notes.trim();
    }
    return this.http.post<DatasetRequest>(
      `${this.baseUrl}/requests/${id}/transition/`,
      payload,
      { headers: this.getHeaders() }
    );
  }

  assignEpisode(requestId: number, episodeId: string): Observable<Assignment> {
    return this.http.post<Assignment>(
      `${this.baseUrl}/requests/${requestId}/assign/`,
      { episode_id: episodeId },
      { headers: this.getHeaders() }
    );
  }

  unassignEpisode(requestId: number, episodeId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/requests/${requestId}/unassign/`,
      { episode_id: episodeId },
      { headers: this.getHeaders() }
    );
  }

  // --- Episodes Catalog ---
  getEpisodes(filters?: {
    task_name?: string;
    quality?: string;
    robot_id?: string;
    unassigned_only?: boolean;
  }): Observable<Episode[]> {
    let params = new HttpParams();
    if (filters?.task_name) params = params.set('task_name', filters.task_name);
    if (filters?.quality) params = params.set('quality', filters.quality);
    if (filters?.robot_id) params = params.set('robot_id', filters.robot_id);
    if (filters?.unassigned_only) params = params.set('unassigned_only', 'true');

    return this.http.get<Episode[]>(`${this.baseUrl}/episodes/`, {
      headers: this.getHeaders(),
      params,
    });
  }

  importCsv(file: File): Observable<ImportReport> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Token ${token}`);
    }

    return this.http.post<ImportReport>(`${this.baseUrl}/episodes/import_csv/`, formData, { headers });
  }

  // --- Analytics & Health ---
  getAnalytics(startDate?: string, endDate?: string): Observable<AnalyticsData> {
    let params = new HttpParams();
    if (startDate) params = params.set('start_date', startDate);
    if (endDate) params = params.set('end_date', endDate);

    return this.http.get<AnalyticsData>(`${this.baseUrl}/requests/analytics/`, {
      headers: this.getHeaders(),
      params,
    });
  }

  // --- User Management (Admin) ---
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users/`, { headers: this.getHeaders() });
  }

  createUser(userData: Partial<User>): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/`, userData, { headers: this.getHeaders() });
  }

  updateUser(id: number, userData: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${id}/`, userData, { headers: this.getHeaders() });
  }

  getHealth(): Observable<{ status: string; database: string }> {
    return this.http.get<{ status: string; database: string }>(`${this.baseUrl}/health/`);
  }
}
