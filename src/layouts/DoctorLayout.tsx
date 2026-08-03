import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function DoctorLayout() {
  const { t } = useTranslation('doctor');
  const nav: NavEntry[] = [
    { to: '/doctor', label: t('nav.home'), icon: 'home', end: true },
    { to: '/doctor/marketplace', label: t('nav.marketplace'), icon: 'storefront' },
    { to: '/doctor/orders', label: t('nav.orders'), icon: 'receipt_long' },
    { to: '/doctor/patients', label: t('nav.patients'), icon: 'groups' },
    { to: '/doctor/invoices', label: t('nav.invoices'), icon: 'receipt' },
    { to: '/doctor/debts', label: t('nav.debts'), icon: 'account_balance_wallet' },
    { to: '/doctor/work-locations', label: t('nav.workLocations'), icon: 'location_on' },
    { to: '/doctor/profile', label: t('nav.profile'), icon: 'person' },
  ];
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
