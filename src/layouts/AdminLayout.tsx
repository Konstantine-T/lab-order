import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAdminNavAlerts } from '@/features/notifications/useNavAlerts';

export function AdminLayout() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const alerts = useAdminNavAlerts();

  const nav: NavEntry[] = [
    { to: '/admin', label: t('nav.home'), icon: 'home', end: true },
    {
      to: '/admin/labs',
      label: t('nav.labs'),
      icon: 'fact_check',
      // Labs sitting in the approval queue.
      badge: (
        <NavBadge count={alerts.labs} label={tc('nav.needsAttention', { count: alerts.labs })} />
      ),
    },
    { to: '/admin/feedbacks', label: t('nav.feedbacks'), icon: 'feedback' },
  ];
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
