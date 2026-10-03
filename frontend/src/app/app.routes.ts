import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ClientDashboardComponent } from './components/client/client-dashboard.component';
import { OperatorDashboardComponent } from './components/operator/operator-dashboard.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'client', component: ClientDashboardComponent },
  { path: 'operator', component: OperatorDashboardComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
