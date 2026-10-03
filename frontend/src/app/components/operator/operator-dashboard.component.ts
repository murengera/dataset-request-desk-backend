import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DatasetRequest, Episode, AnalyticsData, User } from '../../models';

@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="max-width: 1100px; margin: 0 auto; padding: 1.5rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h1 style="font-size: 1.4rem; font-weight: 700;">Dataset Request Desk — Operations</h1>
          <p style="font-size: 0.85rem; color: var(--text-muted);" *ngIf="currentUser">
            Logged in as <strong>{{ currentUser.username }}</strong>
            <span class="badge" [ngClass]="'badge-' + currentUser.role" style="margin-left: 0.5rem;">{{ currentUser.role }}</span>
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn" [ngClass]="activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'" (click)="activeTab = 'requests'">
            Requests Desk
          </button>
          <button class="btn" [ngClass]="activeTab === 'episodes' ? 'btn-primary' : 'btn-secondary'" (click)="activeTab = 'episodes'">
            Episode Catalog
          </button>
          <button class="btn" [ngClass]="activeTab === 'import' ? 'btn-primary' : 'btn-secondary'" (click)="activeTab = 'import'">
            CSV Import
          </button>
          <button class="btn" [ngClass]="activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'" (click)="activeTab = 'analytics'; loadAnalytics()">
            Analytics
          </button>
          <button class="btn btn-secondary" (click)="logout()">Logout</button>
        </div>
      </div>

      <!-- Alerts -->
      <div *ngIf="message" class="alert alert-success">{{ message }}</div>
      <div *ngIf="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <!-- TAB 1: REQUESTS DESK -->
      <div *ngIf="activeTab === 'requests'">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="font-size: 1.1rem; font-weight: 600;">All Customer Requests ({{ requests.length }})</h2>
            <button class="btn btn-secondary btn-sm" (click)="loadRequests()">Refresh</button>
          </div>

          <div *ngIf="loadingRequests" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Loading requests...
          </div>

          <div *ngIf="!loadingRequests && requests.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No requests found.
          </div>

          <div *ngIf="!loadingRequests && requests.length > 0" style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Task Name</th>
                  <th>Client</th>
                  <th>Assigned</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let req of requests">
                  <td class="mono">#{{ req.id }}</td>
                  <td>
                    <div style="font-weight: 600;">{{ req.task_name }}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);" *ngIf="req.notes">{{ req.notes }}</div>
                  </td>
                  <td>{{ req.client_username }}</td>
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
                    <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                      <!-- Start Work -->
                      <button
                        *ngIf="req.status === 'submitted'"
                        class="btn btn-primary btn-sm"
                        (click)="transitionReq(req.id, 'in_progress')"
                      >
                        Start Work
                      </button>

                      <!-- In Progress Actions -->
                      <ng-container *ngIf="req.status === 'in_progress'">
                        <button class="btn btn-secondary btn-sm" (click)="openAssignModal(req)">
                          Assign Episodes
                        </button>
                        <button
                          class="btn btn-success btn-sm"
                          [disabled]="req.assigned_count < req.episodes_requested"
                          [title]="req.assigned_count < req.episodes_requested ? 'Must assign all requested episodes first' : ''"
                          (click)="transitionReq(req.id, 'delivered')"
                        >
                          Deliver
                        </button>
                      </ng-container>

                      <!-- Rework if rejected -->
                      <button
                        *ngIf="req.status === 'rejected'"
                        class="btn btn-warning btn-sm"
                        (click)="transitionReq(req.id, 'in_progress')"
                      >
                        Rework
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: EPISODE CATALOG -->
      <div *ngIf="activeTab === 'episodes'">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; gap: 1rem;">
            <h2 style="font-size: 1.1rem; font-weight: 600;">Episode Catalog</h2>
            <div style="display: flex; gap: 0.5rem;">
              <input
                type="text"
                class="form-control"
                style="width: 200px;"
                placeholder="Search task name..."
                [(ngModel)]="episodeSearch"
                (input)="loadEpisodes()"
              />
              <select class="form-control" style="width: 140px;" [(ngModel)]="episodeQuality" (change)="loadEpisodes()">
                <option value="">All Qualities</option>
                <option value="good">Good</option>
                <option value="usable">Usable</option>
                <option value="bad">Bad</option>
              </select>
            </div>
          </div>

          <div *ngIf="loadingEpisodes" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Loading episodes...
          </div>

          <div *ngIf="!loadingEpisodes && episodes.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No episodes match the selected filter.
          </div>

          <div *ngIf="!loadingEpisodes && episodes.length > 0" style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>Episode ID</th>
                  <th>Robot</th>
                  <th>Task</th>
                  <th>Duration</th>
                  <th>Quality</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let ep of episodes">
                  <td class="mono">{{ ep.episode_id }}</td>
                  <td>{{ ep.robot_id }}</td>
                  <td>{{ ep.task_name }}</td>
                  <td class="mono">{{ ep.duration_seconds }}s</td>
                  <td><span class="badge" [ngClass]="'badge-' + ep.quality">{{ ep.quality }}</span></td>
                  <td>
                    <span *ngIf="ep.assigned_request" class="mono" style="color: var(--text-muted);">
                      Assigned (#{{ ep.assigned_request }})
                    </span>
                    <span *ngIf="!ep.assigned_request" style="color: var(--success); font-size: 0.8rem;">
                      Available
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: CSV IMPORT -->
      <div *ngIf="activeTab === 'import'">
        <div class="card" style="max-width: 600px; margin: 0 auto;">
          <h2 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">Import Episodes from CSV</h2>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
            Upload recording logs. The backend import is idempotent and normalizes timestamps, floats, casing, and duplicates.
          </p>

          <form (ngSubmit)="onUploadCsv()">
            <div class="form-group">
              <label>Select CSV File</label>
              <input type="file" class="form-control" (change)="onFileSelected($event)" accept=".csv" required />
            </div>

            <button type="submit" class="btn btn-primary" [disabled]="!selectedFile || importing">
              {{ importing ? 'Importing...' : 'Upload & Import' }}
            </button>
          </form>

          <div *ngIf="importReport" style="margin-top: 1.5rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 6px;">
            <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--success); margin-bottom: 0.5rem;">Import Result</h4>
            <div style="font-size: 0.85rem;">
              <div><strong>Created:</strong> {{ importReport.created_count }}</div>
              <div><strong>Updated:</strong> {{ importReport.updated_count }}</div>
              <div><strong>Skipped:</strong> {{ importReport.skipped_count }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 4: ANALYTICS -->
      <div *ngIf="activeTab === 'analytics'">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h2 style="font-size: 1.1rem; font-weight: 600;">System Performance & Analytics</h2>
            <button class="btn btn-secondary btn-sm" (click)="loadAnalytics()">Refresh</button>
          </div>

          <div *ngIf="loadingAnalytics" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Computing database analytics...
          </div>

          <div *ngIf="!loadingAnalytics && analytics">
            <!-- Summary Stats -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
              <div class="card" style="margin: 0; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">SUBMITTED</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #60a5fa;">
                  {{ analytics.request_fulfilment.counts_by_status['submitted'] || 0 }}
                </div>
              </div>
              <div class="card" style="margin: 0; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">IN PROGRESS</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24;">
                  {{ analytics.request_fulfilment.counts_by_status['in_progress'] || 0 }}
                </div>
              </div>
              <div class="card" style="margin: 0; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">DELIVERED</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #c084fc;">
                  {{ analytics.request_fulfilment.counts_by_status['delivered'] || 0 }}
                </div>
              </div>
              <div class="card" style="margin: 0; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">ACCEPTED</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #34d399;">
                  {{ analytics.request_fulfilment.counts_by_status['accepted'] || 0 }}
                </div>
              </div>
              <div class="card" style="margin: 0; text-align: center;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">MEDIAN DELIVERY</div>
                <div style="font-size: 1.5rem; font-weight: 700;">
                  {{ analytics.request_fulfilment.median_delivery_time_hours !== null ? analytics.request_fulfilment.median_delivery_time_hours + 'h' : 'N/A' }}
                </div>
              </div>
            </div>

            <!-- Top 5 Tasks & Robot Recordings -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
              <div>
                <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">Top 5 Tasks (Good Quality Episodes)</h4>
                <table>
                  <thead>
                    <tr><th>Task Name</th><th>Count</th></tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let t of analytics.top_5_tasks_by_good_episodes">
                      <td>{{ t.task_name }}</td>
                      <td class="mono" style="font-weight: 600; color: var(--success);">{{ t.good_episodes_count }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem;">Daily Recordings per Robot</h4>
                <div style="max-height: 220px; overflow-y: auto;">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Robot</th><th>Count</th></tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let r of analytics.episodes_per_day_per_robot">
                        <td>{{ r.date }}</td>
                        <td class="mono">{{ r.robot_id }}</td>
                        <td class="mono">{{ r.episode_count }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- EPISODE ASSIGNMENT MODAL -->
      <div *ngIf="assigningRequest" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 50;">
        <div class="card" style="max-width: 800px; width: 100%; max-height: 90vh; display: flex; flex-direction: column;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; margin-bottom: 1rem;">
            <div>
              <h3 style="font-size: 1.1rem; font-weight: 600;">Assign Episodes to Request #{{ assigningRequest.id }}</h3>
              <p style="font-size: 0.8rem; color: var(--text-muted);">
                Task: <strong>{{ assigningRequest.task_name }}</strong> | Assigned: <strong>{{ assigningRequest.assigned_count }} / {{ assigningRequest.episodes_requested }}</strong> needed
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" (click)="closeAssignModal()">✕</button>
          </div>

          <!-- Filter episodes in modal -->
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <input
              type="text"
              class="form-control"
              style="flex: 1;"
              placeholder="Search task..."
              [(ngModel)]="modalTaskSearch"
              (input)="loadModalEpisodes()"
            />
            <select class="form-control" style="width: 160px;" [(ngModel)]="modalQualityFilter" (change)="loadModalEpisodes()">
              <option value="">Good & Usable</option>
              <option value="good">Good Only</option>
              <option value="usable">Usable Only</option>
            </select>
          </div>

          <div style="overflow-y: auto; max-height: 380px;">
            <table>
              <thead>
                <tr>
                  <th>Episode ID</th>
                  <th>Task</th>
                  <th>Quality</th>
                  <th>Duration</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let ep of modalEpisodes">
                  <td class="mono">{{ ep.episode_id }}</td>
                  <td>{{ ep.task_name }}</td>
                  <td><span class="badge" [ngClass]="'badge-' + ep.quality">{{ ep.quality }}</span></td>
                  <td class="mono">{{ ep.duration_seconds }}s</td>
                  <td>
                    <button
                      *ngIf="ep.assigned_request === assigningRequest.id"
                      class="btn btn-danger btn-sm"
                      (click)="unassign(ep.episode_id)"
                    >
                      Unassign
                    </button>
                    <button
                      *ngIf="!ep.assigned_request && ep.quality !== 'bad'"
                      class="btn btn-primary btn-sm"
                      (click)="assign(ep.episode_id)"
                    >
                      Assign
                    </button>
                    <span *ngIf="ep.assigned_request && ep.assigned_request !== assigningRequest.id" style="font-size: 0.75rem; color: var(--text-muted);">
                      Assigned (#{{ ep.assigned_request }})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem; text-align: right;">
            <button class="btn btn-secondary" (click)="closeAssignModal()">Done</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OperatorDashboardComponent implements OnInit {
  currentUser: User | null = null;
  requests: DatasetRequest[] = [];
  episodes: Episode[] = [];
  modalEpisodes: Episode[] = [];
  analytics: AnalyticsData | null = null;

  activeTab: 'requests' | 'episodes' | 'import' | 'analytics' = 'requests';
  loadingRequests = false;
  loadingEpisodes = false;
  loadingAnalytics = false;
  importing = false;

  message = '';
  errorMessage = '';

  // Filter states
  episodeSearch = '';
  episodeQuality = '';
  modalTaskSearch = '';
  modalQualityFilter = '';

  // Modal State
  assigningRequest: DatasetRequest | null = null;
  selectedFile: File | null = null;
  importReport: any = null;

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.api.getMe().subscribe({
      next: (user) => {
        this.currentUser = user;
        if (user.role === 'client') {
          this.router.navigate(['/client']);
        } else {
          this.loadRequests();
          this.loadEpisodes();
        }
      },
      error: () => {
        this.logout();
      },
    });
  }

  loadRequests(): void {
    this.loadingRequests = true;
    this.api.getRequests().subscribe({
      next: (data) => {
        this.requests = data;
        this.loadingRequests = false;
      },
      error: () => {
        this.loadingRequests = false;
        this.errorMessage = 'Failed to load requests.';
      },
    });
  }

  loadEpisodes(): void {
    this.loadingEpisodes = true;
    this.api
      .getEpisodes({
        task_name: this.episodeSearch.trim(),
        quality: this.episodeQuality || undefined,
      })
      .subscribe({
        next: (data) => {
          this.episodes = data;
          this.loadingEpisodes = false;
        },
        error: () => {
          this.loadingEpisodes = false;
        },
      });
  }

  loadAnalytics(): void {
    this.loadingAnalytics = true;
    this.api.getAnalytics().subscribe({
      next: (data) => {
        this.analytics = data;
        this.loadingAnalytics = false;
      },
      error: () => {
        this.loadingAnalytics = false;
      },
    });
  }

  transitionReq(id: number, status: string): void {
    this.api.transitionRequest(id, status).subscribe({
      next: () => {
        this.message = `Request #${id} moved to ${status}`;
        this.loadRequests();
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Transition failed.';
      },
    });
  }

  openAssignModal(req: DatasetRequest): void {
    this.assigningRequest = req;
    this.modalTaskSearch = req.task_name;
    this.loadModalEpisodes();
  }

  closeAssignModal(): void {
    this.assigningRequest = null;
    this.loadRequests();
    this.loadEpisodes();
  }

  loadModalEpisodes(): void {
    this.api
      .getEpisodes({
        task_name: this.modalTaskSearch.trim(),
        quality: this.modalQualityFilter || undefined,
      })
      .subscribe({
        next: (data) => {
          this.modalEpisodes = data;
        },
      });
  }

  assign(episodeId: string): void {
    if (!this.assigningRequest) return;
    this.api.assignEpisode(this.assigningRequest.id, episodeId).subscribe({
      next: () => {
        if (this.assigningRequest) {
          this.assigningRequest.assigned_count++;
        }
        this.loadModalEpisodes();
      },
      error: (err) => {
        alert(err.error?.error || 'Assignment failed.');
      },
    });
  }

  unassign(episodeId: string): void {
    if (!this.assigningRequest) return;
    this.api.unassignEpisode(this.assigningRequest.id, episodeId).subscribe({
      next: () => {
        if (this.assigningRequest && this.assigningRequest.assigned_count > 0) {
          this.assigningRequest.assigned_count--;
        }
        this.loadModalEpisodes();
      },
      error: (err) => {
        alert(err.error?.error || 'Unassign failed.');
      },
    });
  }

  onFileSelected(event: any): void {
    this.selectedFile = event.target.files[0] || null;
  }

  onUploadCsv(): void {
    if (!this.selectedFile) return;
    this.importing = true;
    this.api.importCsv(this.selectedFile).subscribe({
      next: (report) => {
        this.importing = false;
        this.importReport = report;
        this.message = 'CSV imported successfully!';
        this.loadEpisodes();
      },
      error: (err) => {
        this.importing = false;
        this.errorMessage = err.error?.error || 'Import failed.';
      },
    });
  }

  logout(): void {
    this.api.clearToken();
    this.router.navigate(['/login']);
  }
}
