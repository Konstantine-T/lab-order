import { Route, Routes } from 'react-router-dom';
import { DatePickerProvider } from './DatePickerProvider';
import { DoctorLayout } from '@/layouts/DoctorLayout';
import { DoctorHomePage } from '@/pages/doctor/DoctorHomePage';
import { DoctorProfilePage } from '@/pages/doctor/DoctorProfilePage';
import { WorkLocationsPage } from '@/pages/doctor/WorkLocationsPage';
import { MarketplacePage } from '@/pages/doctor/MarketplacePage';
import { LabPublicProfilePage } from '@/pages/doctor/LabPublicProfilePage';
import { OrderCreateWizard } from '@/pages/doctor/OrderCreateWizard';
import { OrdersListPage } from '@/pages/doctor/OrdersListPage';
import { OrderDetailPage } from '@/pages/doctor/OrderDetailPage';
import { OrderEditPage } from '@/pages/doctor/OrderEditPage';
import { PatientsPage } from '@/pages/doctor/PatientsPage';
import { PatientOrdersPage } from '@/pages/doctor/PatientOrdersPage';
import { UnderDevelopmentPage } from '@/pages/common/UnderDevelopmentPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/**
 * Everything under `/doctor`, loaded as one chunk the first time a doctor
 * enters the area (see `src/routes.tsx`). Paths are relative to `/doctor`.
 * The session and role guards stay in `routes.tsx`, so a signed-out deep link
 * is redirected without downloading any of this.
 */
export default function DoctorRoutes() {
  return (
    <DatePickerProvider>
      <Routes>
        <Route element={<DoctorLayout />}>
          <Route index element={<DoctorHomePage />} />
          <Route path="profile" element={<DoctorProfilePage />} />
          <Route path="work-locations" element={<WorkLocationsPage />} />
          <Route path="marketplace" element={<MarketplacePage />} />
          <Route path="labs/:labId" element={<LabPublicProfilePage />} />
          <Route path="orders" element={<OrdersListPage />} />
          <Route path="orders/new" element={<OrderCreateWizard />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="orders/:orderId/edit" element={<OrderEditPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="patients/:patientId" element={<PatientOrdersPage />} />
          <Route path="invoices" element={<UnderDevelopmentPage featureKey="invoices" />} />
          <Route path="debts" element={<UnderDevelopmentPage featureKey="debts" />} />
        </Route>
        {/* Unknown paths under /doctor: the same 404 as anywhere else, outside the layout. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DatePickerProvider>
  );
}
