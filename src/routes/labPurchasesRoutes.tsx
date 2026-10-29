import { Route, Routes } from 'react-router-dom';
import { OrdersListPage } from '@/pages/doctor/OrdersListPage';
import { OrderCreateWizard } from '@/pages/doctor/OrderCreateWizard';
import { OrderDetailPage } from '@/pages/doctor/OrderDetailPage';
import { OrderEditPage } from '@/pages/doctor/OrderEditPage';
import { DoctorTrashPage } from '@/pages/doctor/DoctorTrashPage';
import { CompletionDialogHost } from '@/features/orders/completion/CompletionDialogHost';
import { BuyerProfileGate, BuyerSessionRefresh } from '@/features/labBuying/BuyerProfileGate';
import { PURCHASE_PATHS } from '@/features/labBuying/buyerMode';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

/**
 * Everything under `/lab/purchases` (0048): the orders a lab places with other
 * labs, on the doctor's own list, wizard, order and edit pages with `buyer`
 * set. Paths are relative to `/lab/purchases`.
 *
 * Its own chunk, loaded the first time a lab opens its purchases: the order
 * form is the largest module in the app, and most lab sessions never buy, so
 * it is not part of the lab area's chunk (labRoutes.tsx).
 */
export default function LabPurchasesRoutes() {
  return (
    <>
      <Routes>
        {/* The read-only screens reload a session that predates the lab's
            first purchase; only the form creates the profile. */}
        <Route
          index
          element={
            <BuyerSessionRefresh>
              <OrdersListPage buyer />
            </BuyerSessionRefresh>
          }
        />
        <Route
          path="new"
          element={
            // Creates (or re-syncs) the buying profile before the form needs it.
            <BuyerProfileGate>
              <OrderCreateWizard buyer />
            </BuyerProfileGate>
          }
        />
        {/* The purchases this lab deleted (0054). A static segment, so it
            outranks :orderId below. */}
        <Route
          path="trash"
          element={
            <BuyerSessionRefresh>
              <DoctorTrashPage buyer />
            </BuyerSessionRefresh>
          }
        />
        <Route
          path=":orderId"
          element={
            <BuyerSessionRefresh>
              <OrderDetailPage buyer />
            </BuyerSessionRefresh>
          }
        />
        <Route
          path=":orderId/edit"
          element={
            <BuyerSessionRefresh>
              <OrderEditPage basePath={PURCHASE_PATHS.orders} buyer />
            </BuyerSessionRefresh>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {/* "Mark completed" on a purchase is followed by the review step, as for
          a doctor; the dialog that carries it is mounted here, so only the
          buying screens have it. */}
      <CompletionDialogHost />
    </>
  );
}
