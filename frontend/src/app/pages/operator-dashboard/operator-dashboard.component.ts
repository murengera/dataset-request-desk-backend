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
