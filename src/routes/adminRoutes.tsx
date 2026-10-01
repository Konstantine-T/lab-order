import { Route, Routes } from 'react-router-dom';
import { DatePickerProvider } from './DatePickerProvider';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminHomePage } from '@/pages/admin/AdminHomePage';
import { LabApprovalQueuePage } from '@/pages/admin/LabApprovalQueuePage';
import { LabReviewPage } from '@/pages/admin/LabReviewPage';
import { FeedbacksPage } from '@/pages/admin/FeedbacksPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/**
 * Everything under `/admin`, loaded as one chunk the first time an admin
 * enters the area (see `src/routes.tsx`). Paths are relative to `/admin`; the
 * guards stay in `routes.tsx`. No admin screen renders a date picker today;
 * the provider is here so the first one to do so works like everywhere else.
 */
export default function AdminRoutes() {
  return (
    <DatePickerProvider>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="labs" element={<LabApprovalQueuePage />} />
          <Route path="labs/:labId" element={<LabReviewPage />} />
          <Route path="feedbacks" element={<FeedbacksPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </DatePickerProvider>
  );
}
