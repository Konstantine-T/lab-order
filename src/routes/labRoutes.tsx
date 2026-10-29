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
import { LabTrashPage } from '@/pages/lab/LabTrashPage';
import { LabProjectsPage } from '@/pages/lab/LabProjectsPage';
import { LabProjectPage } from '@/pages/lab/LabProjectPage';
import { LabFinancesPage } from '@/pages/lab/LabFinancesPage';
import { FinanceLockGate } from '@/features/lab/finances/FinanceLockGate';
import { LabStaffPage } from '@/pages/lab/LabStaffPage';
import { LabReviewsPage } from '@/pages/lab/LabReviewsPage';
import { LabMarketplaceLabPage, LabMarketplacePage } from '@/pages/lab/LabMarketplacePages';
import { lazyRoute } from './lazyRoute';
import { LazyBoundary } from './LazyBoundary';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/** The lab's orders to other labs (0048): a chunk of its own, see labPurchasesRoutes. */
const LabPurchases = lazyRoute(() => import('./labPurchasesRoutes'));

/**
 * Everything under `/lab`, loaded as one chunk the first time a lab enters
 * the area (see `src/routes.tsx`). Paths are relative to `/lab`; the guards
 * stay in `routes.tsx`.
 *
 * `marketplace…` and `purchases…` are the lab buying from other labs (0048):
 * the doctor's own pages, as the clinic reuses them, run through the lab's
 * buying profile. They are kept apart from `orders…`, the orders the lab
 * receives.
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
          {/* The incoming orders this lab deleted (0054); its purchases'
              trash is purchases/trash. */}
          <Route path="trash" element={<LabTrashPage />} />
          <Route path="projects" element={<LabProjectsPage />} />
          <Route path="projects/:patientId" element={<LabProjectPage />} />
          <Route path="staff" element={<LabStaffPage />} />
          <Route path="reviews" element={<LabReviewsPage />} />
          <Route path="marketplace" element={<LabMarketplacePage />} />
          <Route path="marketplace/:labId" element={<LabMarketplaceLabPage />} />
          <Route
            path="purchases/*"
            element={
              <LazyBoundary variant="inline">
                <LabPurchases />
              </LazyBoundary>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DatePickerProvider>
  );
}
