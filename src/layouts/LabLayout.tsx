import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function LabLayout() {
  const { t } = useTranslation('lab');
  const nav: NavEntry[] = [
    { to: '/lab', label: t('nav.dashboard'), icon: 'dashboard', end: true },
    { to: '/lab/orders', label: t('nav.orders'), icon: 'receipt_long' },
    { to: '/lab/finances', label: t('nav.finances'), icon: 'payments' },
    { to: '/lab/edited-orders', label: t('nav.editedOrders'), icon: 'difference' },
    { to: '/lab/services', label: t('nav.services'), icon: 'category' },
    { to: '/lab/staff', label: t('nav.staff'), icon: 'groups' },
    { to: '/lab/profile', label: t('nav.profile'), icon: 'store' },
  ];
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
