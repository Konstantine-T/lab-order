import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useDoctorNavAlerts } from '@/features/notifications/useNavAlerts';

export function DoctorLayout() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const alerts = useDoctorNavAlerts(user?.doctor_profile?.id);
  const badge = (count: number) => (
    <NavBadge count={count} label={tc('nav.needsAttention', { count })} />
  );

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
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
