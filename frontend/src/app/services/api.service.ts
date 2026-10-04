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

  transitionRequest(id: number, status: string): Observable<DatasetRequest> {
    return this.http.post<DatasetRequest>(
      `${this.baseUrl}/requests/${id}/transition/`,
      { status },
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
