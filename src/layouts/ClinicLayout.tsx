import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function ClinicLayout() {
  const { t } = useTranslation('clinic');
  const nav: NavEntry[] = [
    { to: '/clinic', label: t('nav.home'), icon: 'home', end: true },
    { to: '/clinic/doctors', label: t('nav.doctors'), icon: 'groups' },
    { to: '/clinic/orders', label: t('nav.orders'), icon: 'assignment' },
  ];
  return <AppShell brand={t('brand')} navEntries={nav} />;
}
