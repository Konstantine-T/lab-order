import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function LabLayout() {
  const { t } = useTranslation('lab');
  const nav: NavEntry[] = [
    { to: '/lab', label: t('nav.dashboard'), icon: <DashboardIcon />, end: true },
    { to: '/lab/orders', label: t('nav.orders'), icon: <ListAltIcon /> },
    { to: '/lab/services', label: t('nav.services'), icon: <StorefrontIcon /> },
    { to: '/lab/profile', label: t('nav.profile'), icon: <BusinessIcon /> },
  ];
  return <AppShell brand="Lab Order" navEntries={nav} />;
}
