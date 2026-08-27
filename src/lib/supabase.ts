import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  );
}

// A recovery link can land on "/" instead of "/reset-password" whenever Supabase
// ignores our redirectTo (the URL is missing from the project's Redirect URL
// allow list) and falls back to Site URL. Move it onto the reset page *before*
// createClient runs — otherwise detectSessionInUrl consumes the token, the user
// counts as signed in, and RoleAwareRedirect sends them to their dashboard
// without ever showing the password form.
if (typeof window !== 'undefined' && window.location.pathname !== '/reset-password') {
  const { hash, search } = window.location;
  const isRecovery =
    new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery' ||
    new URLSearchParams(search).get('type') === 'recovery';
  if (isRecovery) {
    window.location.replace(`/reset-password${search}${hash}`);
  }
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
