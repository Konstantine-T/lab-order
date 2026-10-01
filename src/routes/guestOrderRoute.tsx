import { DatePickerProvider } from './DatePickerProvider';
import { OrderCreateWizard } from '@/pages/doctor/OrderCreateWizard';

/**
 * The guest order wizard (`/order/new`), as its own lazy chunk.
 *
 * It is the one public page that needs the date pickers (due date, the
 * patient's date of birth), so keeping it out of the entry keeps
 * `@mui/x-date-pickers` out of the landing page. The wizard module itself is
 * shared with the doctor and clinic chunks, not copied. `routes.tsx` preloads
 * it while a guest looks at a lab's profile, the step before it.
 */
export default function GuestOrderRoute() {
  return (
    <DatePickerProvider>
      <OrderCreateWizard guest />
    </DatePickerProvider>
  );
}
