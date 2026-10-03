import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DatasetRequest, User } from '../../models';

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="max-width: 1000px; margin: 0 auto; padding: 1.5rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h1 style="font-size: 1.4rem; font-weight: 700;">Dataset Request Desk</h1>
          <p style="font-size: 0.85rem; color: var(--text-muted);" *ngIf="currentUser">
            Welcome, <strong>{{ currentUser.username }}</strong>
            <span *ngIf="currentUser.organisation">({{ currentUser.organisation }})</span>
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button
            class="btn"
            [ngClass]="activeTab === 'list' ? 'btn-primary' : 'btn-secondary'"
            (click)="activeTab = 'list'"
          >
            My Requests
          </button>
          <button
            class="btn"
            [ngClass]="activeTab === 'create' ? 'btn-primary' : 'btn-secondary'"
            (click)="activeTab = 'create'"
          >
            + Create Request
          </button>
          <button class="btn btn-secondary" (click)="logout()">Logout</button>
        </div>
      </div>

      <!-- Error / Success Alert -->
      <div *ngIf="message" class="alert alert-success">
        {{ message }}
      </div>
      <div *ngIf="errorMessage" class="alert alert-danger">
        {{ errorMessage }}
      </div>

      <!-- VIEW 1: MY REQUESTS LIST -->
      <div *ngIf="activeTab === 'list'">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="font-size: 1.1rem; font-weight: 600;">My Dataset Requests</h2>
            <button class="btn btn-secondary btn-sm" (click)="loadRequests()">Refresh</button>
          </div>

          <div *ngIf="loading" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Loading requests...
          </div>

          <div *ngIf="!loading && requests.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            You have not submitted any dataset requests yet. Click "Create Request" above to get started.
          </div>

          <div *ngIf="!loading && requests.length > 0" style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task Name</th>
                  <th>Episodes</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let req of requests">
                  <td class="mono">#{{ req.id }}</td>
                  <td>
                    <div style="font-weight: 600;">{{ req.task_name }}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);" *ngIf="req.notes">{{ req.notes }}</div>
                  </td>
                  <td>
                    <span class="mono">{{ req.assigned_count }} / {{ req.episodes_requested }}</span>
                  </td>
                  <td>{{ req.deadline || 'None' }}</td>
                  <td>
                    <span class="badge" [ngClass]="'badge-' + req.status">
                      {{ req.status.replace('_', ' ') }}
                    </span>
                  </td>
                  <td>
                    <div style="display: flex; gap: 0.4rem; align-items: center;">
                      <!-- Accept / Reject when Delivered -->
                      <ng-container *ngIf="req.status === 'delivered'">
                        <button class="btn btn-success btn-sm" (click)="transitionStatus(req.id, 'accepted')">
                          Accept
                        </button>
                        <button class="btn btn-danger btn-sm" (click)="transitionStatus(req.id, 'rejected')">
                          Reject
                        </button>
                      </ng-container>

                      <!-- View Details -->
                      <button class="btn btn-secondary btn-sm" (click)="viewDetails(req)">
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- VIEW 2: CREATE REQUEST FORM -->
      <div *ngIf="activeTab === 'create'">
        <div class="card" style="max-width: 540px; margin: 0 auto;">
          <h2 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem;">Submit New Dataset Request</h2>
          <form (ngSubmit)="submitCreateRequest()">
            <div class="form-group">
              <label>Task Name</label>
              <input
                type="text"
                class="form-control"
                name="task_name"
                [(ngModel)]="newRequest.task_name"
                placeholder="e.g. pick_and_place_cups"
                required
              />
            </div>

            <div class="form-group">
              <label>Episodes Requested</label>
              <input
                type="number"
                class="form-control"
                name="episodes_requested"
                [(ngModel)]="newRequest.episodes_requested"
                min="1"
                required
              />
            </div>

            <div class="form-group">
              <label>Deadline (Optional)</label>
              <input
                type="date"
                class="form-control"
                name="deadline"
                [(ngModel)]="newRequest.deadline"
              />
            </div>

            <div class="form-group">
              <label>Notes (Optional)</label>
              <textarea
                class="form-control"
                name="notes"
                [(ngModel)]="newRequest.notes"
                placeholder="Specify camera angles, robot type, or special requirements"
                rows="3"
              ></textarea>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button type="submit" class="btn btn-primary" [disabled]="submitting">
                {{ submitting ? 'Submitting...' : 'Create Request' }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="activeTab = 'list'">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- REQUEST DETAILS MODAL -->
      <div *ngIf="selectedRequest" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 50;">
        <div class="card" style="max-width: 600px; width: 100%; max-height: 85vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
            <h3 style="font-size: 1.1rem; font-weight: 600;">Request #{{ selectedRequest.id }} Details</h3>
            <button class="btn btn-secondary btn-sm" (click)="selectedRequest = null">✕</button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem;">
            <div><strong>Task:</strong> {{ selectedRequest.task_name }}</div>
            <div><strong>Status:</strong> <span class="badge" [ngClass]="'badge-' + selectedRequest.status">{{ selectedRequest.status }}</span></div>
            <div><strong>Episodes Needed:</strong> {{ selectedRequest.episodes_requested }}</div>
            <div><strong>Assigned Count:</strong> {{ selectedRequest.assigned_count }}</div>
            <div><strong>Deadline:</strong> {{ selectedRequest.deadline || 'None' }}</div>
            <div><strong>Notes:</strong> {{ selectedRequest.notes || 'None' }}</div>
          </div>

          <div *ngIf="selectedRequest.status === 'delivered'" style="margin: 1rem 0; padding: 1rem; background: rgba(139, 92, 246, 0.1); border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.85rem; color: var(--purple);">This request has been delivered for your review:</span>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-success btn-sm" (click)="transitionStatus(selectedRequest.id, 'accepted')">Accept</button>
              <button class="btn btn-danger btn-sm" (click)="transitionStatus(selectedRequest.id, 'rejected')">Reject</button>
            </div>
          </div>

          <h4 style="font-size: 0.9rem; font-weight: 600; margin: 1rem 0 0.5rem 0;">Assigned Episodes ({{ selectedRequest.assignments?.length || 0 }})</h4>
          <div *ngIf="!selectedRequest.assignments || selectedRequest.assignments.length === 0" style="color: var(--text-muted); font-size: 0.85rem;">
            No episodes assigned yet.
          </div>
          <table *ngIf="selectedRequest.assignments && selectedRequest.assignments.length > 0">
            <thead>
              <tr>
                <th>Episode ID</th>
                <th>Task</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of selectedRequest.assignments">
                <td class="mono">{{ a.episode_id }}</td>
                <td>{{ a.episode_task }}</td>
                <td><span class="badge" [ngClass]="'badge-' + a.episode_quality">{{ a.episode_quality }}</span></td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 1.5rem; text-align: right;">
            <button class="btn btn-secondary" (click)="selectedRequest = null">Close</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClientDashboardComponent implements OnInit {
  currentUser: User | null = null;
  requests: DatasetRequest[] = [];
  selectedRequest: DatasetRequest | null = null;
  activeTab: 'list' | 'create' = 'list';
  loading = false;
  submitting = false;
  message = '';
  errorMessage = '';

  newRequest = {
    task_name: '',
    episodes_requested: 10,
    deadline: '',
    notes: '',
  };

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.api.getMe().subscribe({
      next: (user) => {
        this.currentUser = user;
        if (user.role !== 'client') {
          this.router.navigate(['/operator']);
        } else {
          this.loadRequests();
        }
      },
      error: () => {
        this.logout();
      },
    });
  }

  loadRequests(): void {
    this.loading = true;
    this.api.getRequests().subscribe({
      next: (data) => {
        this.requests = data;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = 'Failed to load requests.';
      },
    });
  }

  submitCreateRequest(): void {
    this.errorMessage = '';
    this.message = '';
    if (!this.newRequest.task_name || this.newRequest.episodes_requested < 1) {
      this.errorMessage = 'Please provide a valid task name and number of episodes.';
      return;
    }

    this.submitting = true;
    this.api
      .createRequest({
        task_name: this.newRequest.task_name.trim(),
        episodes_requested: this.newRequest.episodes_requested,
        deadline: this.newRequest.deadline || null,
        notes: this.newRequest.notes.trim(),
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.message = 'Dataset request submitted successfully!';
          this.newRequest = { task_name: '', episodes_requested: 10, deadline: '', notes: '' };
          this.activeTab = 'list';
          this.loadRequests();
        },
        error: (err) => {
          this.submitting = false;
          this.errorMessage = err.error?.error || 'Failed to create request.';
        },
      });
  }

  transitionStatus(id: number, status: 'accepted' | 'rejected'): void {
    this.api.transitionRequest(id, status).subscribe({
      next: () => {
        this.message = `Request #${id} marked as ${status}!`;
        this.selectedRequest = null;
        this.loadRequests();
      },
      error: (err) => {
        this.errorMessage = err.error?.error || `Failed to transition request #${id}`;
      },
    });
  }

  viewDetails(req: DatasetRequest): void {
    this.api.getRequest(req.id).subscribe({
      next: (fullReq) => {
        this.selectedRequest = fullReq;
      },
      error: () => {
        this.selectedRequest = req;
      },
    });
  }

  logout(): void {
    this.api.clearToken();
    this.router.navigate(['/login']);
  }
}
