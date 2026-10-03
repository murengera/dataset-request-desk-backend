import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="max-width: 420px; margin: 4rem auto; padding: 1rem;">
      <div class="card">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 0.25rem;">Dataset Request Desk</h2>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            {{ isRegistering ? 'Register Client Account' : 'Sign in to your account' }}
          </p>
        </div>

        <div *ngIf="errorMessage" class="alert alert-danger">
          {{ errorMessage }}
        </div>

        <form (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label>Username</label>
            <input
              type="text"
              name="username"
              class="form-control"
              [(ngModel)]="username"
              placeholder="e.g. alex"
              required
            />
          </div>

          <div *ngIf="isRegistering" class="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              class="form-control"
              [(ngModel)]="email"
              placeholder="alex@acme.com"
              required
            />
          </div>

          <div *ngIf="isRegistering" class="form-group">
            <label>Organisation</label>
            <input
              type="text"
              name="organisation"
              class="form-control"
              [(ngModel)]="organisation"
              placeholder="Acme Robotics"
            />
          </div>

          <div class="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              class="form-control"
              [(ngModel)]="password"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            style="width: 100%; margin-top: 0.5rem;"
            [disabled]="loading"
          >
            {{ loading ? 'Processing...' : (isRegistering ? 'Register & Sign In' : 'Login') }}
          </button>
        </form>

        <div style="margin-top: 1rem; text-align: center; font-size: 0.85rem;">
          <a
            href="javascript:void(0)"
            style="color: var(--accent); text-decoration: none;"
            (click)="toggleMode()"
          >
            {{ isRegistering ? 'Already have an account? Log in' : 'New client? Register here' }}
          </a>
        </div>

        <!-- Quick Demo logins -->
        <div *ngIf="!isRegistering" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border);">
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">Seed User Presets:</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" (click)="quickFill('alex', 'alex1234')">Client: Alex</button>
            <button class="btn btn-secondary btn-sm" (click)="quickFill('sam', 'sam1234')">Operator: Sam</button>
            <button class="btn btn-secondary btn-sm" (click)="quickFill('devon', 'devon1234')">Admin: Devon</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  username = '';
  email = '';
  password = '';
  organisation = '';
  isRegistering = false;
  loading = false;
  errorMessage = '';

  constructor(private api: ApiService, private router: Router) {}

  toggleMode(): void {
    this.isRegistering = !this.isRegistering;
    this.errorMessage = '';
  }

  quickFill(u: string, p: string): void {
    this.username = u;
    this.password = p;
    this.onSubmit();
  }

  onSubmit(): void {
    this.errorMessage = '';
    if (!this.username || !this.password) {
      this.errorMessage = 'Please enter both username and password.';
      return;
    }

    this.loading = true;

    if (this.isRegistering) {
      this.api
        .register({
          username: this.username.trim(),
          email: this.email.trim(),
          password: this.password,
          organisation: this.organisation.trim(),
        })
        .subscribe({
          next: (res) => {
            this.loading = false;
            this.api.setToken(res.token);
            this.redirectUser(res.user.role);
          },
          error: (err) => {
            this.loading = false;
            this.errorMessage = err.error?.error || 'Registration failed. Please check your inputs.';
          },
        });
    } else {
      this.api
        .login({
          username: this.username.trim(),
          password: this.password,
        })
        .subscribe({
          next: (res) => {
            this.loading = false;
            this.api.setToken(res.token);
            this.redirectUser(res.user.role);
          },
          error: (err) => {
            this.loading = false;
            this.errorMessage = err.error?.error || 'Invalid username or password.';
          },
        });
    }
  }

  private redirectUser(role: string): void {
    if (role === 'client') {
      this.router.navigate(['/client']);
    } else {
      this.router.navigate(['/operator']);
    }
  }
}
