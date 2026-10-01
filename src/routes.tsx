import { useEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { RoleGuard } from '@/auth/RoleGuard';
import { RoleAwareRedirect } from '@/auth/RoleAwareRedirect';
import { GuestRoute } from '@/auth/GuestRoute';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { doctorOrderNewPath } from '@/features/public/guestDraft';
import type { UserRole } from '@/types/database';
import { lazyRoute } from '@/routes/lazyRoute';
import { LazyBoundary } from '@/routes/LazyBoundary';

import { PublicLayout } from '@/layouts/PublicLayout';
import { LoginPage } from '@/pages/public/LoginPage';
import { DoctorRegisterPage } from '@/pages/public/DoctorRegisterPage';
import { LabRegisterPage } from '@/pages/public/LabRegisterPage';
import { ClinicRegisterPage } from '@/pages/public/ClinicRegisterPage';
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';
import { ForbiddenPage } from '@/pages/public/ForbiddenPage';
import { MarketplacePage } from '@/pages/doctor/MarketplacePage';
import { LabPublicProfilePage } from '@/pages/doctor/LabPublicProfilePage';

/*
 * CODE SPLITTING
 *
 * The entry chunk holds what a first-time visitor can reach: the landing page
 * (via RoleAwareRedirect), sign-in and registration, and the public catalogue
 * — the marketplace and a lab's profile. Those stay eager so none of them
 * shows a loading spinner.
 *
 * Each signed-in area is one lazy chunk — its layout and every page, with the
 * date pickers — loaded once, the first time someone enters it. Area, not
 * page: four downloads per session rather than forty. The guest wizard is a
 * fifth, because it is the only public page that needs the date pickers.
 * Code the areas share (the wizard, the order forms, the tooth chart) lands in
 * shared chunks, never in two places.
 *
 * The guards stay here, outside the lazy chunks: a signed-out deep link is
 * redirected to /login — or to the public copy of a catalogue page — without
 * downloading the area at all.
 */
const DoctorArea = lazyRoute(() => import('@/routes/doctorRoutes'));
const LabArea = lazyRoute(() => import('@/routes/labRoutes'));
const ClinicArea = lazyRoute(() => import('@/routes/clinicRoutes'));
const AdminArea = lazyRoute(() => import('@/routes/adminRoutes'));
const GuestOrderWizard = lazyRoute(() => import('@/routes/guestOrderRoute'));

const AREAS = [
  { base: '/doctor', area: DoctorArea },
  { base: '/lab', area: LabArea },
  { base: '/clinic', area: ClinicArea },
  { base: '/admin', area: AdminArea },
] as const;

/** Supabase keeps the session under `sb-<project>-auth-token`. Only a hint — the guards decide. */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? '')) return true;
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

// A cold load straight onto an area — a bookmark, a reload, a link from an
// email — starts that area's download now, alongside the language bundle and
// the session check, instead of after both. Only when a session is stored:
// a signed-out visitor is about to be redirected and never needs it.
(function preloadForEntryUrl() {
  if (typeof window === 'undefined') return;
  const { pathname } = window.location;
  const signedIn = hasStoredSession();
  if (pathname === PUBLIC_ROUTES.orderNew) {
    if (!signedIn) GuestOrderWizard.preload();
    return;
  }
  if (!signedIn) return;
  AREAS.find(({ base }) => pathname === base || pathname.startsWith(`${base}/`))?.area.preload();
})();

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 1500);
  return () => clearTimeout(id);
}

/** A lab's profile is one click from the wizard: fetch the wizard while the guest reads it. */
function PreloadGuestWizard({ children }: { children: ReactNode }) {
  useEffect(() => whenIdle(GuestOrderWizard.preload), []);
  return <>{children}</>;
}

/** Session check → role check → the area's chunk. */
function AreaGate({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  return (
    <ProtectedRoute>
      <RoleGuard allow={allow}>
        <LazyBoundary>{children}</LazyBoundary>
      </RoleGuard>
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/doctor" element={<DoctorRegisterPage />} />
      <Route path="/register/lab" element={<LabRegisterPage />} />
      <Route path="/register/clinic" element={<ClinicRegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      {/* Public catalogue: the doctor's marketplace, lab profile and order
          wizard, without an account. A signed-in visitor is sent to the same
          screen inside their own area, so each page has one URL per audience. */}
      <Route element={<PublicLayout />}>
        <Route
          path={PUBLIC_ROUTES.marketplace}
          element={
            <GuestRoute authedTo={({ base, search }) => `${base}/marketplace${search}`}>
              <MarketplacePage guest />
            </GuestRoute>
          }
        />
        <Route
          path="/labs/:labId"
          element={
            <GuestRoute
              authedTo={({ base, params, search }) => `${base}/labs/${params.labId}${search}`}
            >
              <PreloadGuestWizard>
                <LabPublicProfilePage guest />
              </PreloadGuestWizard>
            </GuestRoute>
          }
        />
        <Route
          path={PUBLIC_ROUTES.orderNew}
          element={
            <GuestRoute
              authedTo={({ base, search }) =>
                // The doctor's copy also gets the resume flag when this
                // browser holds a draft for the same service; the clinic's
                // does not — it starts at the doctor picker.
                base === '/doctor' ? doctorOrderNewPath(search) : `${base}/orders/new${search}`
              }
            >
              <LazyBoundary variant="inline">
                <GuestOrderWizard />
              </LazyBoundary>
            </GuestRoute>
          }
        />
      </Route>

      {/* The four signed-in areas. Each chunk holds its layout and its pages
          (src/routes/<area>Routes.tsx), with paths relative to the base. */}
      <Route
        path="/doctor/*"
        element={
          <AreaGate allow={['DOCTOR']}>
            <DoctorArea />
          </AreaGate>
        }
      />
      <Route
        path="/lab/*"
        element={
          <AreaGate allow={['LAB_MAIN_ADMIN']}>
            <LabArea />
          </AreaGate>
        }
      />
      <Route
        path="/admin/*"
        element={
          <AreaGate allow={['PLATFORM_ADMIN']}>
            <AdminArea />
          </AreaGate>
        }
      />
      <Route
        path="/clinic/*"
        element={
          <AreaGate allow={['CLINIC_ADMIN']}>
            <ClinicArea />
          </AreaGate>
        }
      />

      {/* Root + 404 */}
      <Route path="/" element={<RoleAwareRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
