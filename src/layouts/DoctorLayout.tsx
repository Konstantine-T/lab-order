import HomeIcon from '@mui/icons-material/Home';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PaymentsIcon from '@mui/icons-material/Payments';
import PersonIcon from '@mui/icons-material/Person';
import PlaceIcon from '@mui/icons-material/Place';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function DoctorLayout() {
  const { t } = useTranslation('doctor');
  const nav: NavEntry[] = [
    { to: '/doctor', label: t('nav.home'), icon: <HomeIcon />, end: true },
    { to: '/doctor/marketplace', label: t('nav.marketplace'), icon: <StorefrontIcon /> },
    { to: '/doctor/orders', label: t('nav.orders'), icon: <ListAltIcon /> },
    { to: '/doctor/patients', label: t('nav.patients'), icon: <PeopleIcon /> },
    { to: '/doctor/invoices', label: t('nav.invoices'), icon: <ReceiptIcon /> },
    { to: '/doctor/debts', label: t('nav.debts'), icon: <PaymentsIcon /> },
    { to: '/doctor/work-locations', label: t('nav.workLocations'), icon: <PlaceIcon /> },
    { to: '/doctor/profile', label: t('nav.profile'), icon: <PersonIcon /> },
  ];
  return <AppShell brand="Lab Order" navEntries={nav} />;
}
