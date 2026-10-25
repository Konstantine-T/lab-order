import { useTranslation } from 'react-i18next';
import { AppShell, type NavEntry } from './AppShell';
import { NavBadge } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { useLabNavAlerts } from '@/features/notifications/useNavAlerts';
import { canLabBuy } from '@/features/labBuying/buyerMode';
import { usePurchaseNavAlerts } from '@/features/labBuying/usePurchaseNavAlerts';

export function LabLayout() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const alerts = useLabNavAlerts(user?.lab?.id);
  // Buying from other labs (0048): only an approved, live lab, and apart from
  // the orders it receives.
  const canBuy = canLabBuy(user?.lab);
  const purchasesWaiting = usePurchaseNavAlerts(canBuy ? user?.buyer_profile?.id : undefined);
  const badge = (count: number) => (
    <NavBadge count={count} label={tc('nav.needsAttention', { count })} />
  );

  const nav: NavEntry[] = [
    { to: '/lab', label: t('nav.dashboard'), icon: 'dashboard', end: true },
    {
      to: '/lab/orders',
      label: t('nav.orders'),
      icon: 'receipt_long',
      // Submitted but not yet acknowledged, plus the clarifications the doctor
      // has answered and nobody has acted on (0029).
      badge: badge(alerts.orders + alerts.answeredClarifications),
    },
    { to: '/lab/finances', label: t('nav.finances'), icon: 'payments' },
    {
      to: '/lab/edited-orders',
      label: t('nav.editedOrders'),
      icon: 'difference',
      // The doctor changed an order the lab has not reviewed since.
      badge: badge(alerts.editedOrders),
    },
    { to: '/lab/reviews', label: t('nav.reviews'), icon: 'reviews' },
    ...(canBuy
      ? [
          { to: '/lab/marketplace', label: t('nav.marketplace'), icon: 'storefront' },
          {
            to: '/lab/purchases',
            label: t('nav.purchases'),
            icon: 'shopping_cart',
            // A purchase waiting on this lab: a question, a change, a case to
            // close, an invoice to see: what a doctor's own badge counts.
            badge: badge(purchasesWaiting),
          },
        ]
      : []),
    { to: '/lab/services', label: t('nav.services'), icon: 'category' },
    { to: '/lab/staff', label: t('nav.staff'), icon: 'groups' },
    { to: '/lab/profile', label: t('nav.profile'), icon: 'store' },
  ];
  return <AppShell navEntries={nav} />;
}
