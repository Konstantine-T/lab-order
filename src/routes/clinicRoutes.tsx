import { Route, Routes } from 'react-router-dom';
import { DatePickerProvider } from './DatePickerProvider';
import { ClinicLayout } from '@/layouts/ClinicLayout';
import { ClinicHomePage } from '@/pages/clinic/ClinicHomePage';
import { ClinicDoctorsPage } from '@/pages/clinic/ClinicDoctorsPage';
import { ClinicOrdersPage } from '@/pages/clinic/ClinicOrdersPage';
import { ClinicOrderDetailPage } from '@/pages/clinic/ClinicOrderDetailPage';
import { ClinicOrderCreatePage } from '@/pages/clinic/ClinicOrderCreatePage';
import { ClinicFinancesPage } from '@/pages/clinic/ClinicFinancesPage';
import { MarketplacePage } from '@/pages/doctor/MarketplacePage';
import { LabPublicProfilePage } from '@/pages/doctor/LabPublicProfilePage';
import { OrderEditPage } from '@/pages/doctor/OrderEditPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/**
 * Everything under `/clinic`, loaded as one chunk the first time a clinic
 * enters the area (see `src/routes.tsx`). Paths are relative to `/clinic`; the
 * guards stay in `routes.tsx`. The doctor pages it reuses are shared with the
 * doctor chunk, not copied into this one.
 */
export default function ClinicRoutes() {
  return (
    <DatePickerProvider>
      <Routes>
        <Route element={<ClinicLayout />}>
          <Route index element={<ClinicHomePage />} />
          <Route path="doctors" element={<ClinicDoctorsPage />} />
          {/* The clinic walks the doctor's own ordering path: pick a doctor,
              then the same marketplace, lab profile and wizard. */}
          <Route path="marketplace" element={<MarketplacePage basePath="/clinic" />} />
          <Route path="labs/:labId" element={<LabPublicProfilePage basePath="/clinic" />} />
          <Route path="orders" element={<ClinicOrdersPage />} />
          <Route path="finances" element={<ClinicFinancesPage />} />
          <Route path="orders/new" element={<ClinicOrderCreatePage />} />
          <Route path="orders/:orderId" element={<ClinicOrderDetailPage />} />
          <Route
            path="orders/:orderId/edit"
            element={<OrderEditPage basePath="/clinic/orders" />}
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DatePickerProvider>
  );
}
