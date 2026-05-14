import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppUserRow, DoctorProfileRow, LabRow, UserRole } from '@/types/database';

export type AppUser = AppUserRow & {
  doctor_profile?: DoctorProfileRow | null;
  lab?: LabRow | null;
};

type AuthContextValue = {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function loadAppUser(userId: string): Promise<AppUser | null> {
  const { data: userRow, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Auth] failed to load public.users row:', error);
    return null;
  }
  if (!userRow) {
    console.warn('[Auth] no public.users row for', userId, '— did the auth trigger run?');
    return null;
  }

  const role = (userRow as AppUserRow).role as UserRole;
  let doctor_profile: DoctorProfileRow | null = null;
  let lab: LabRow | null = null;

  if (role === 'DOCTOR') {
    const { data, error: e } = await supabase
      .from('doctor_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (e) console.error('[Auth] failed to load doctor_profiles:', e);
    doctor_profile = (data ?? null) as DoctorProfileRow | null;
  } else if (role === 'LAB_MAIN_ADMIN') {
    const { data, error: e } = await supabase
      .from('labs')
      .select('*')
      .eq('owner_user_id', userId)
      .maybeSingle();
    if (e) console.error('[Auth] failed to load labs:', e);
    lab = (data ?? null) as LabRow | null;
  }

  return { ...(userRow as AppUserRow), doctor_profile, lab };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);

  const hydrate = useCallback(
    async (s: Session | null, opts: { force?: boolean } = {}): Promise<void> => {
      if (!s) {
        setUser(null);
        lastUserIdRef.current = null;
        return;
      }
      // Skip refetch on token refresh / tab refocus — same user, no need.
      if (!opts.force && lastUserIdRef.current === s.user.id) return;

      setHydrating(true);
      try {
        const u = await loadAppUser(s.user.id);
        if (!u) {
          // Session present but no joined user row: broken state. Sign out so
          // we don't bounce between LoginPage and RoleAwareRedirect.
          console.warn('[Auth] Session present but no app user; signing out.');
          lastUserIdRef.current = null;
          setUser(null);
          await supabase.auth.signOut();
          return;
        }
        setUser(u);
        lastUserIdRef.current = s.user.id;
      } catch (e) {
        console.error('[Auth] hydrate failed', e);
        lastUserIdRef.current = null;
        setUser(null);
        await supabase.auth.signOut();
      } finally {
        setHydrating(false);
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      // Defer DB calls out of this callback to avoid the supabase-js auth
      // lock deadlock — see github.com/supabase/auth-js/issues/762.
      setTimeout(() => {
        if (!mounted) return;
        void hydrate(newSession).then(() => {
          if (mounted) setInitialized(true);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshUser = useCallback(async () => {
    if (session) await hydrate(session, { force: true });
  }, [session, hydrate]);

  const loading = !initialized || hydrating;

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, loading, signIn, signOut, refreshUser }),
    [session, user, loading, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
