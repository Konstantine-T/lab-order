import type { ReactNode } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

/**
 * The MUI date pickers' dayjs adapter — the same provider `main.tsx` used to
 * mount around the whole app.
 *
 * It lives at the top of each lazy area and of the guest wizard instead, so
 * `@mui/x-date-pickers` rides in those chunks and the landing page, sign-in
 * and the public catalogue never download it. Every screen that renders a
 * picker is inside one of them; a picker rendered anywhere else throws "MUI
 * X: Can not find the date and time pickers localization context" — wrap
 * that screen in this provider rather than hoisting it back to the root.
 */
export function DatePickerProvider({ children }: { children: ReactNode }) {
  return <LocalizationProvider dateAdapter={AdapterDayjs}>{children}</LocalizationProvider>;
}
