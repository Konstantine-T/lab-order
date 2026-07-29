import HomeIcon from '@mui/icons-material/Home';
import ScienceIcon from '@mui/icons-material/Science';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';

export function AdminLayout() {
  const { t } = useTranslation('admin');
  const nav: NavEntry[] = [
    { to: '/admin', label: t('nav.home'), icon: <HomeIcon />, end: true },
    { to: '/admin/labs', label: t('nav.labs'), icon: <ScienceIcon /> },
    { to: '/admin/feedbacks', label: t('nav.feedbacks'), icon: <FeedbackOutlinedIcon /> },
  ];
  return <AppShell brand="Lab Order — Admin" navEntries={nav} />;
}
