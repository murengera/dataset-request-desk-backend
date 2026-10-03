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
