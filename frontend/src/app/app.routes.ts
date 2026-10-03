import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { ClientDashboardComponent } from './pages/client-dashboard/client-dashboard.component';
import { OperatorDashboardComponent } from './pages/operator-dashboard/operator-dashboard.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'client', component: ClientDashboardComponent },
  { path: 'operator', component: OperatorDashboardComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
