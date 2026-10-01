import { Route, Routes } from 'react-router-dom';
import { DatePickerProvider } from './DatePickerProvider';
import { LabLayout } from '@/layouts/LabLayout';
import { LabDashboardPage } from '@/pages/lab/LabDashboardPage';
import { LabProfilePage } from '@/pages/lab/LabProfilePage';
import { LabServicesPage } from '@/pages/lab/LabServicesPage';
import { LabServiceCreatePage } from '@/pages/lab/LabServiceCreatePage';
import { LabServiceEditPage } from '@/pages/lab/LabServiceEditPage';
import { LabOrdersDashboardPage } from '@/pages/lab/LabOrdersDashboardPage';
import { LabEditedOrdersPage } from '@/pages/lab/LabEditedOrdersPage';
import { LabOrderSheetPage } from '@/pages/lab/LabOrderSheetPage';
import { LabFinancesPage } from '@/pages/lab/LabFinancesPage';
import { FinanceLockGate } from '@/features/lab/finances/FinanceLockGate';
import { LabStaffPage } from '@/pages/lab/LabStaffPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/**
 * Everything under `/lab`, loaded as one chunk the first time a lab enters
 * the area (see `src/routes.tsx`). Paths are relative to `/lab`; the guards
 * stay in `routes.tsx`.
 */
export default function LabRoutes() {
  return (
    <DatePickerProvider>
      <Routes>
        <Route element={<LabLayout />}>
          <Route index element={<LabDashboardPage />} />
          <Route path="profile" element={<LabProfilePage />} />
          <Route path="services" element={<LabServicesPage />} />
          <Route path="services/new" element={<LabServiceCreatePage />} />
          <Route path="services/:serviceId" element={<LabServiceEditPage />} />
          <Route path="orders" element={<LabOrdersDashboardPage />} />
          <Route
            path="finances"
            element={
              <FinanceLockGate>
                <LabFinancesPage />
              </FinanceLockGate>
            }
          />
          <Route path="edited-orders" element={<LabEditedOrdersPage />} />
          <Route path="orders/:orderId" element={<LabOrderSheetPage />} />
          <Route path="staff" element={<LabStaffPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DatePickerProvider>
  );
}
