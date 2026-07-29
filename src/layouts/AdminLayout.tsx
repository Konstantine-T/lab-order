import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function AdminLayout() {
  const { t } = useTranslation('admin');
  const nav: NavEntry[] = [
    { to: '/admin', label: t('nav.home'), icon: 'home', end: true },
    { to: '/admin/labs', label: t('nav.labs'), icon: 'fact_check' },
    { to: '/admin/feedbacks', label: t('nav.feedbacks'), icon: 'feedback' },
  ];
  return <AppShell brand="LabOrder" navEntries={nav} />;
}
