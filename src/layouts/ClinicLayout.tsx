import { useTranslation } from 'react-i18next';
import type { NavEntry } from './AppShell';
import type { MenuLink } from './AccountMenu';
import { TopNavShell } from './TopNavShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useClinicNavAlerts } from '@/features/notifications/useNavAlerts';

export function ClinicLayout() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const alerts = useClinicNavAlerts(user?.clinic?.id);

  const orders: NavEntry = {
    to: '/clinic/orders',
    label: t('nav.orders'),
    icon: 'assignment',
    // Anything waiting on one of the clinic's doctors, across all of them.
    badge: (
      <NavBadge count={alerts.orders} label={tc('nav.needsAttention', { count: alerts.orders })} />
    ),
  };

  // The clinic's own sections, in the doctor's top-bar layout. Home is the
  // wordmark; its profile (0050: the delivery and invoice details its orders
  // are filled from) sits in the avatar menu, as the doctor's does.
  const nav: NavEntry[] = [
    orders,
    { to: '/clinic/doctors', label: t('nav.doctors'), icon: 'groups' },
    { to: '/clinic/finances', label: t('nav.finances'), icon: 'payments' },
  ];
  const menuLinks: MenuLink[] = [{ to: '/clinic/profile', label: t('nav.profile'), icon: 'apartment' }];

  return (
    <TopNavShell
      homeTo="/clinic"
      nav={nav}
      menuLinks={menuLinks}
      tabs={[{ to: '/clinic', label: t('nav.home'), icon: 'home', end: true }, ...nav]}
      // Picks the doctor first, then walks the doctor's own path.
      newOrder={{ to: '/clinic/orders/new', label: t('orders.newOrder') }}
    />
  );
}
