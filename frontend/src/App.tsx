import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DashboardPage_NEW from './pages/DashboardPage_NEW';
import PartnersPage from './pages/PartnersPage';
import OrdersPage from './pages/OrdersPage';
import InvoicesPage from './pages/InvoicesPage';
import ExpeditionsPage from './pages/ExpeditionsPage';
import SettingsPage from './pages/SettingsPage';
import CompanyInfoPage from './pages/CompanyInfoPage';
import UserSettingsPage from './pages/UserSettingsPage';
import ActivityLogPage from './pages/ActivityLogPage';
import ExpenseSuppliersPage from './pages/ExpenseSuppliersPage';
import ExpenseCategoriesPage from './pages/ExpenseCategoriesPage';
import ExpenseInvoicesPage from './pages/ExpenseInvoicesPage';
import MailPage from './pages/MailPage';
import PaymentsPage from './pages/PaymentsPage';
import AppsasPage from './pages/AppsasPage';
import Navigation from './components/Navigation';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModuleProvider } from './context/ModuleContext';
import './App.css';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <ModuleProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Navigation />
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard-new"
            element={
              <PrivateRoute>
                <DashboardPage_NEW />
              </PrivateRoute>
            }
          />
          <Route
            path="/partners"
            element={
              <PrivateRoute>
                <PartnersPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mail"
            element={
              <PrivateRoute>
                <MailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/appsas"
            element={
              <PrivateRoute>
                <AppsasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <PrivateRoute>
                <OrdersPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/expeditions"
            element={
              <PrivateRoute>
                <ExpeditionsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <PrivateRoute>
                <InvoicesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <PrivateRoute>
                <PaymentsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/user-settings"
            element={
              <PrivateRoute>
                <UserSettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/company-info"
            element={
              <PrivateRoute>
                <CompanyInfoPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/activity-logs"
            element={
              <PrivateRoute>
                <ActivityLogPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/expense-suppliers"
            element={
              <PrivateRoute>
                <ExpenseSuppliersPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/expense-categories"
            element={
              <PrivateRoute>
                <ExpenseCategoriesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/expense-invoices"
            element={
              <PrivateRoute>
                <ExpenseInvoicesPage />
              </PrivateRoute>
            }
          />
        </Routes>
        </Router>
      </ModuleProvider>
    </AuthProvider>
  );
}

export default App;

