import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useLabNavAlerts } from '@/features/notifications/useNavAlerts';

export function LabLayout() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const alerts = useLabNavAlerts(user?.lab?.id);
  const badge = (count: number) => (
    <NavBadge count={count} label={tc('nav.needsAttention', { count })} />
  );

  const nav: NavEntry[] = [
    { to: '/lab', label: t('nav.dashboard'), icon: 'dashboard', end: true },
    {
      to: '/lab/orders',
      label: t('nav.orders'),
      icon: 'receipt_long',
      // Submitted, but the lab has not marked it received yet.
      badge: badge(alerts.orders),
    },
    { to: '/lab/finances', label: t('nav.finances'), icon: 'payments' },
    {
      to: '/lab/edited-orders',
      label: t('nav.editedOrders'),
      icon: 'difference',
      // The doctor changed an order the lab has not reviewed since.
      badge: badge(alerts.editedOrders),
    },
    { to: '/lab/services', label: t('nav.services'), icon: 'category' },
    { to: '/lab/staff', label: t('nav.staff'), icon: 'groups' },
    { to: '/lab/profile', label: t('nav.profile'), icon: 'store' },
  ];
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
