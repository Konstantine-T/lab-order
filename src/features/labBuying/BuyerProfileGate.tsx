import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, CircularProgress, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Callout, PageHeader } from '@/components/design';
import { canLabBuy } from './buyerMode';
import { buyerErrorCode, buyerErrorText } from './buyerErrors';

/** Sync once per visit, not once per screen: marketplace → lab → form is one visit. */
const SYNC_FRESH_MS = 60_000;

/** When `BuyerSessionRefresh` last reloaded the session (module-wide, per tab). */
let lastSessionRefreshAt = 0;

/**
 * The purchases list, an order and its edit page (0048): they only read, so
 * unlike `BuyerProfileGate` they never create a buying profile and never
 * refuse a lab that may no longer buy (its old purchases stay readable).
 *
 * What they need is a session that knows the profile. One loaded before the
 * lab's first purchase (made on another device, say) has none, and every
 * query on these pages filters on its id, so the list would read empty and an
 * order "not found" until a manual reload. So when the session lacks the
 * profile (or the lab), it is reloaded silently once, at most once a minute,
 * before the page renders.
 */
export function BuyerSessionRefresh({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const missing = user?.role === 'LAB_MAIN_ADMIN' && (!user.lab || !user.buyer_profile);
  const [waiting, setWaiting] = useState(
    () => missing && Date.now() - lastSessionRefreshAt > SYNC_FRESH_MS,
  );
  const startedRef = useRef(false);
  useEffect(() => {
    if (!waiting || startedRef.current) return;
    startedRef.current = true;
    lastSessionRefreshAt = Date.now();
    void refreshUser({ silent: true }).finally(() => setWaiting(false));
  }, [waiting, refreshUser]);

  if (waiting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  return <>{children}</>;
}

/**
 * The entrance to a lab's buying screens: the marketplace, a lab's profile and
 * the order form (0048, C2).
 *
 * Calls `ensure_lab_buyer_profile()` on the way in. The first time it creates
 * the lab's buying profile; every time it re-copies the lab's working address
 * onto the profile's one delivery location (J3), so a purchase goes to where
 * the lab is now. When the profile is new to this session the AppUser is
 * reloaded silently, and the screen waits for `buyer_profile` before
 * rendering: every query the reused doctor pages run filters on its id.
 *
 * A lab that may not buy (in review, suspended, inactive) is told so in words
 * and never reaches the RPC; the RPC's own `lab_cannot_buy` reads the same.
 */
export function BuyerProfileGate({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation('lab');
  const { t: te } = useTranslation('errors');
  const { t: tc } = useTranslation('common');
  const lab = user?.role === 'LAB_MAIN_ADMIN' ? (user.lab ?? null) : null;
  const allowed = canLabBuy(lab);
  const profileId = user?.buyer_profile?.id ?? null;

  const ensure = useQuery({
    queryKey: ['lab-buyer-profile-sync', lab?.id],
    enabled: allowed,
    staleTime: SYNC_FRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ensure_lab_buyer_profile');
      if (error) throw error;
      return data as string;
    },
  });

  // At most one reload per entrance: if the reloaded session still lacked the
  // profile, a second one would only loop.
  const reloadedRef = useRef(false);
  const [reloaded, setReloaded] = useState(false);
  useEffect(() => {
    const id = ensure.data;
    if (!id || id === profileId || reloadedRef.current) return;
    reloadedRef.current = true;
    void refreshUser({ silent: true }).finally(() => setReloaded(true));
  }, [ensure.data, profileId, refreshUser]);

  const refusal = !allowed
    ? te('labBuying.lab_cannot_buy')
    : ensure.error && (!profileId || buyerErrorCode(ensure.error) === 'lab_cannot_buy')
      ? (buyerErrorText(ensure.error, te) ?? tc('errors.generic'))
      : reloaded && !profileId
        ? tc('errors.generic')
        : null;

  if (refusal) {
    return (
      <Stack spacing={2}>
        <PageHeader title={t('nav.marketplace')} />
        <Callout tone="warning">{refusal}</Callout>
      </Stack>
    );
  }

  // A profile already in the session renders at once; the address sync runs
  // behind it.
  if (profileId) return <>{children}</>;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  );
}
