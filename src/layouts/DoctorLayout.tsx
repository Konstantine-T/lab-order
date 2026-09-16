import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useDoctorNavAlerts } from '@/features/notifications/useNavAlerts';
import { guestDraftResumePath, readGuestDraft } from '@/features/public/guestDraft';

const WIZARD_PATH = '/doctor/orders/new';

export function DoctorLayout() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const { pathname } = useLocation();
  const alerts = useDoctorNavAlerts(user?.doctor_profile?.id);
  const badge = (count: number) => (
    <NavBadge count={count} label={tc('nav.needsAttention', { count })} />
  );

  // An order built before signing in is waiting in this browser. Wherever the
  // doctor lands after login — home, the orders list, a bookmark — take them
  // to it. The wizard removes the draft the moment it hydrates, so this fires
  // once per draft and cannot trap a doctor who then navigates elsewhere.
  // Doctors only: a lab or clinic account signing in here is more likely the
  // wrong account than an abandoned order, so the draft is left alone for them.
  const resumeTo = useMemo(() => {
    if (pathname === WIZARD_PATH) return null;
    const draft = readGuestDraft();
    return draft ? guestDraftResumePath(draft) : null;
  }, [pathname]);
  if (resumeTo) return <Navigate to={resumeTo} replace />;

  const nav: NavEntry[] = [
    { to: '/doctor', label: t('nav.home'), icon: 'home', end: true },
    { to: '/doctor/marketplace', label: t('nav.marketplace'), icon: 'storefront' },
    {
      to: '/doctor/orders',
      label: t('nav.orders'),
      icon: 'receipt_long',
      // A lab waiting on an answer, or a case delivered and waiting to be closed.
      badge: badge(alerts.orders),
    },
    { to: '/doctor/patients', label: t('nav.patients'), icon: 'groups' },
    { to: '/doctor/invoices', label: t('nav.invoices'), icon: 'receipt' },
    { to: '/doctor/debts', label: t('nav.debts'), icon: 'account_balance_wallet' },
    { to: '/doctor/work-locations', label: t('nav.workLocations'), icon: 'location_on' },
    { to: '/doctor/profile', label: t('nav.profile'), icon: 'person' },
  ];
  return <AppShell brand="Dental Labs" navEntries={nav} />;
}
