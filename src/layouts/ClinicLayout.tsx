import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useClinicNavAlerts } from '@/features/notifications/useNavAlerts';

export function ClinicLayout() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const alerts = useClinicNavAlerts(user?.clinic?.id);

  const nav: NavEntry[] = [
    { to: '/clinic', label: t('nav.home'), icon: 'home', end: true },
    { to: '/clinic/doctors', label: t('nav.doctors'), icon: 'groups' },
    {
      to: '/clinic/orders',
      label: t('nav.orders'),
      icon: 'assignment',
      // Anything waiting on one of the clinic's doctors, across all of them.
      badge: (
        <NavBadge
          count={alerts.orders}
          label={tc('nav.needsAttention', { count: alerts.orders })}
        />
      ),
    },
    { to: '/clinic/finances', label: t('nav.finances'), icon: 'payments' },
  ];
  // Plain product name, like the doctor, lab and admin shells. The clinic was
  // the only one appending a role word ("Dental Labs — კლინიკა"), and it was
  // the only one that didn't fit: the sidebar gives the title ~148px and
  // renders it noWrap, so Georgian truncated to "Dental Labs — კ…". The role
  // is already on screen — the org card and the user's role label sit directly
  // beneath it.
  return <AppShell brand="Dental Labs" navEntries={nav} />;
}
