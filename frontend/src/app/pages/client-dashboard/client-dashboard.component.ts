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
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.css',
})
export class ClientDashboardComponent implements OnInit {
  currentUser: User | null = null;
  requests: DatasetRequest[] = [];
  selectedRequest: DatasetRequest | null = null;
  editingRequest: { id: number; task_name: string; episodes_requested: number; deadline: string; notes: string } | null = null;
  reviewModal: { request: DatasetRequest; status: 'accepted' | 'rejected'; notes: string } | null = null;
  activeTab: 'list' | 'create' = 'list';
  loading = false;
  submitting = false;
  updating = false;
  reviewing = false;
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
      error: () => {
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

  openReviewModal(req: DatasetRequest, status: 'accepted' | 'rejected'): void {
    this.reviewModal = {
      request: req,
      status,
      notes: '',
    };
  }

  submitReview(): void {
    if (!this.reviewModal) return;
    const { request, status, notes } = this.reviewModal;

    this.reviewing = true;
    this.api.transitionRequest(request.id, status, notes).subscribe({
      next: () => {
        this.reviewing = false;
        this.message = `Request #${request.id} has been ${status === 'accepted' ? 'accepted' : 'rejected and returned for rework'}!`;
        this.reviewModal = null;
        this.selectedRequest = null;
        this.loadRequests();
      },
      error: (err) => {
        this.reviewing = false;
        this.errorMessage = err.error?.error || `Failed to transition request #${request.id}`;
      },
    });
  }

  transitionStatus(id: number, status: 'accepted' | 'rejected', notes?: string): void {
    this.api.transitionRequest(id, status, notes).subscribe({
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

  openEditModal(req: DatasetRequest): void {
    this.editingRequest = {
      id: req.id,
      task_name: req.task_name,
      episodes_requested: req.episodes_requested,
      deadline: req.deadline || '',
      notes: req.notes || '',
    };
  }

  submitEditRequest(): void {
    if (!this.editingRequest) return;
    this.errorMessage = '';
    this.message = '';

    if (!this.editingRequest.task_name || this.editingRequest.episodes_requested < 1) {
      this.errorMessage = 'Please provide a valid task name and episode count.';
      return;
    }

    this.updating = true;
    this.api
      .updateRequest(this.editingRequest.id, {
        task_name: this.editingRequest.task_name.trim(),
        episodes_requested: this.editingRequest.episodes_requested,
        deadline: this.editingRequest.deadline || null,
        notes: this.editingRequest.notes.trim(),
      })
      .subscribe({
        next: () => {
          this.updating = false;
          this.message = `Request #${this.editingRequest?.id} updated successfully!`;
          this.editingRequest = null;
          this.loadRequests();
        },
        error: (err) => {
          this.updating = false;
          this.errorMessage = err.error?.error || 'Failed to update request.';
        },
      });
  }

  isOverdue(deadline: string | null, status: string): boolean {
    if (!deadline || status === 'accepted') return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadlineDate < today;
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
