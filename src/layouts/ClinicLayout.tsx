import HomeIcon from '@mui/icons-material/Home';
import { AppShell, type NavEntry } from './AppShell';

export function ClinicLayout() {
  const nav: NavEntry[] = [{ to: '/clinic', label: 'Home', icon: <HomeIcon />, end: true }];
  return <AppShell brand="Lab Order — Clinic" navEntries={nav} />;
}
