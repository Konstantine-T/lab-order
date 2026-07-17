import HomeIcon from '@mui/icons-material/Home';
import GroupsIcon from '@mui/icons-material/Groups';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function ClinicLayout() {
  const { t } = useTranslation('clinic');
  const nav: NavEntry[] = [
    { to: '/clinic', label: t('nav.home'), icon: <HomeIcon />, end: true },
    { to: '/clinic/doctors', label: t('nav.doctors'), icon: <GroupsIcon /> },
    { to: '/clinic/orders', label: t('nav.orders'), icon: <AssignmentIcon /> },
  ];
  return <AppShell brand={t('brand')} navEntries={nav} />;
}
