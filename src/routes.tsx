import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { RoleGuard } from '@/auth/RoleGuard';
import { RoleAwareRedirect } from '@/auth/RoleAwareRedirect';

import { LoginPage } from '@/pages/public/LoginPage';
import { DoctorRegisterPage } from '@/pages/public/DoctorRegisterPage';
import { LabRegisterPage } from '@/pages/public/LabRegisterPage';
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';
import { ForbiddenPage } from '@/pages/public/ForbiddenPage';

import { DoctorLayout } from '@/layouts/DoctorLayout';
import { DoctorHomePage } from '@/pages/doctor/DoctorHomePage';
import { DoctorProfilePage } from '@/pages/doctor/DoctorProfilePage';
import { WorkLocationsPage } from '@/pages/doctor/WorkLocationsPage';
import { MarketplacePage } from '@/pages/doctor/MarketplacePage';
import { LabPublicProfilePage } from '@/pages/doctor/LabPublicProfilePage';
import { OrderCreateWizard } from '@/pages/doctor/OrderCreateWizard';
import { OrdersListPage } from '@/pages/doctor/OrdersListPage';
import { OrderDetailPage } from '@/pages/doctor/OrderDetailPage';
import { PatientsPage } from '@/pages/doctor/PatientsPage';
import { PatientOrdersPage } from '@/pages/doctor/PatientOrdersPage';
import { UnderDevelopmentPage } from '@/pages/common/UnderDevelopmentPage';

import { LabLayout } from '@/layouts/LabLayout';
import { LabDashboardPage } from '@/pages/lab/LabDashboardPage';
import { LabProfilePage } from '@/pages/lab/LabProfilePage';
import { LabServicesPage } from '@/pages/lab/LabServicesPage';
import { LabServiceCreatePage } from '@/pages/lab/LabServiceCreatePage';
import { LabServiceEditPage } from '@/pages/lab/LabServiceEditPage';
import { LabOrdersDashboardPage } from '@/pages/lab/LabOrdersDashboardPage';
import { LabOrderSheetPage } from '@/pages/lab/LabOrderSheetPage';

import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminHomePage } from '@/pages/admin/AdminHomePage';
import { LabApprovalQueuePage } from '@/pages/admin/LabApprovalQueuePage';
import { LabReviewPage } from '@/pages/admin/LabReviewPage';

import { ClinicLayout } from '@/layouts/ClinicLayout';
import { ClinicHomePage } from '@/pages/clinic/ClinicHomePage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/doctor" element={<DoctorRegisterPage />} />
      <Route path="/register/lab" element={<LabRegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      {/* Doctor */}
      <Route
        path="/doctor"
        element={
          <ProtectedRoute>
            <RoleGuard allow={['DOCTOR']}>
              <DoctorLayout />
            </RoleGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<DoctorHomePage />} />
        <Route path="profile" element={<DoctorProfilePage />} />
        <Route path="work-locations" element={<WorkLocationsPage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="labs/:labId" element={<LabPublicProfilePage />} />
        <Route path="orders" element={<OrdersListPage />} />
        <Route path="orders/new" element={<OrderCreateWizard />} />
        <Route path="orders/:orderId" element={<OrderDetailPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:patientId" element={<PatientOrdersPage />} />
        <Route path="invoices" element={<UnderDevelopmentPage featureKey="invoices" />} />
        <Route path="debts" element={<UnderDevelopmentPage featureKey="debts" />} />
      </Route>

      {/* Lab */}
      <Route
        path="/lab"
        element={
          <ProtectedRoute>
            <RoleGuard allow={['LAB_MAIN_ADMIN']}>
              <LabLayout />
            </RoleGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<LabDashboardPage />} />
        <Route path="profile" element={<LabProfilePage />} />
        <Route path="services" element={<LabServicesPage />} />
        <Route path="services/new" element={<LabServiceCreatePage />} />
        <Route path="services/:serviceId" element={<LabServiceEditPage />} />
        <Route path="orders" element={<LabOrdersDashboardPage />} />
        <Route path="orders/:orderId" element={<LabOrderSheetPage />} />
      </Route>

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleGuard allow={['PLATFORM_ADMIN']}>
              <AdminLayout />
            </RoleGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHomePage />} />
        <Route path="labs" element={<LabApprovalQueuePage />} />
        <Route path="labs/:labId" element={<LabReviewPage />} />
      </Route>

      {/* Clinic */}
      <Route
        path="/clinic"
        element={
          <ProtectedRoute>
            <RoleGuard allow={['CLINIC_ADMIN']}>
              <ClinicLayout />
            </RoleGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<ClinicHomePage />} />
      </Route>

      {/* Root + 404 */}
      <Route path="/" element={<RoleAwareRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
