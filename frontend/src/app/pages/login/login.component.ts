import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
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
            this.errorMessage = this.api.formatError(err);
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
            this.errorMessage = this.api.formatError(err);
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
