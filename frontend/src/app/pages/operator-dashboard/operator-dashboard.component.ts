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
  templateUrl: './operator-dashboard.component.html',
  styleUrl: './operator-dashboard.component.css',
})
export class OperatorDashboardComponent implements OnInit {
  currentUser: User | null = null;
  requests: DatasetRequest[] = [];
  episodes: Episode[] = [];
  modalEpisodes: Episode[] = [];
  analytics: AnalyticsData | null = null;

  activeTab: 'requests' | 'episodes' | 'import' | 'analytics' | 'users' = 'requests';
  loadingRequests = false;
  loadingEpisodes = false;
  loadingAnalytics = false;
  loadingUsers = false;
  importing = false;
  submittingUser = false;
  showCreateUserModal = false;

  message = '';
  errorMessage = '';

  // Filter states
  episodeSearch = '';
  episodeQuality = '';
  modalTaskSearch = '';
  modalQualityFilter = '';

  // User management state (Admin)
  users: User[] = [];
  newUser: {
    username: string;
    email: string;
    password?: string;
    role: 'client' | 'operator' | 'admin';
    organisation?: string;
  } = {
    username: '',
    email: '',
    password: '',
    role: 'client',
    organisation: '',
  };

  // Modal State
  assigningRequest: DatasetRequest | null = null;
  deliverModal: { request: DatasetRequest; notes: string } | null = null;
  reworkModal: { request: DatasetRequest; notes: string } | null = null;
  delivering = false;
  reworking = false;
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

  transitionReq(id: number, status: string, notes?: string): void {
    this.api.transitionRequest(id, status, notes).subscribe({
      next: () => {
        this.message = `Request #${id} moved to ${status}`;
        this.loadRequests();
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Transition failed.';
      },
    });
  }

  openDeliverModal(req: DatasetRequest): void {
    this.deliverModal = {
      request: req,
      notes: '',
    };
  }

  submitDeliver(): void {
    if (!this.deliverModal) return;
    const { request, notes } = this.deliverModal;
    this.delivering = true;
    this.api.transitionRequest(request.id, 'delivered', notes).subscribe({
      next: () => {
        this.delivering = false;
        this.message = `Request #${request.id} successfully delivered to client!`;
        this.deliverModal = null;
        this.loadRequests();
      },
      error: (err) => {
        this.delivering = false;
        this.errorMessage = err.error?.error || 'Delivery transition failed.';
      },
    });
  }

  openReworkModal(req: DatasetRequest): void {
    this.reworkModal = {
      request: req,
      notes: '',
    };
  }

  submitRework(openAssignAfter = false): void {
    if (!this.reworkModal) return;
    const req = this.reworkModal.request;
    const notes = this.reworkModal.notes;
    this.reworking = true;
    this.api.transitionRequest(req.id, 'in_progress', notes).subscribe({
      next: () => {
        this.reworking = false;
        this.message = `Request #${req.id} moved back to In Progress for rework.`;
        this.reworkModal = null;
        this.loadRequests();
        if (openAssignAfter) {
          this.openAssignModal(req);
        }
      },
      error: (err) => {
        this.reworking = false;
        this.errorMessage = err.error?.error || 'Rework transition failed.';
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

  // --- Admin User Management Methods ---
  loadUsers(): void {
    if (this.currentUser?.role !== 'admin') return;
    this.loadingUsers = true;
    this.api.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.loadingUsers = false;
      },
      error: () => {
        this.loadingUsers = false;
        this.errorMessage = 'Failed to load user accounts.';
      },
    });
  }

  changeUserRole(user: User, newRole: string): void {
    if (newRole !== 'client' && newRole !== 'operator' && newRole !== 'admin') return;
    this.api.updateUser(user.id, { role: newRole as 'client' | 'operator' | 'admin' }).subscribe({
      next: (updated) => {
        user.role = updated.role;
        this.message = `Updated ${user.username}'s role to ${newRole}.`;
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Failed to update user role.';
      },
    });
  }

  toggleUserActive(user: User): void {
    const newStatus = !user.is_active;
    this.api.updateUser(user.id, { is_active: newStatus }).subscribe({
      next: (updated) => {
        user.is_active = updated.is_active;
        this.message = `${user.username} is now ${user.is_active ? 'active' : 'deactivated'}.`;
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Failed to update active status.';
      },
    });
  }

  submitCreateUser(): void {
    this.errorMessage = '';
    this.message = '';
    if (!this.newUser.username || !this.newUser.email || !this.newUser.password) {
      this.errorMessage = 'Please provide username, email, and password.';
      return;
    }

    this.submittingUser = true;
    this.api.createUser(this.newUser).subscribe({
      next: () => {
        this.submittingUser = false;
        this.showCreateUserModal = false;
        this.message = `User '${this.newUser.username}' created successfully!`;
        this.newUser = { username: '', email: '', password: '', role: 'client', organisation: '' };
        this.loadUsers();
      },
      error: (err) => {
        this.submittingUser = false;
        this.errorMessage = err.error?.error || JSON.stringify(err.error) || 'Failed to create user.';
      },
    });
  }

  logout(): void {
    this.api.clearToken();
    this.router.navigate(['/login']);
  }
}
