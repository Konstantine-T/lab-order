import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useAuth } from '@/auth/AuthProvider';
import { Icon, PageHeader, SectionCard } from '@/components/design';
import {
  fetchFinanceLockState,
  isUnlockedThisSession,
  rememberUnlocked,
  resetFinancePasscode,
  setFinancePasscode,
  verifyFinancePasscode,
} from './financeLockApi';

/**
 * The passcode in front of the lab's finances.
 *
 * Three states, in the order a lab meets them: no passcode yet (choose one),
 * locked (enter it), unlocked (the page). Unlocking lasts for the tab, so
 * moving between finances and orders doesn't re-prompt, but tomorrow does.
 *
 * What this is for: a lab screen sits on a bench where anyone in the room can
 * see it. It is a curtain, not a vault — the signed-in account can still reach
 * the same numbers through the API, and nothing here pretends otherwise.
 */
export function FinanceLockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('lab');
  const { user } = useAuth();
  const labId = user?.lab?.id ?? '';

  const [unlocked, setUnlocked] = useState(() => isUnlockedThisSession(labId));
  const [resetting, setResetting] = useState(false);

  // A different lab in the same tab (an account switch) must not inherit the
  // previous one's unlocked state.
  useEffect(() => setUnlocked(isUnlockedThisSession(labId)), [labId]);

  const state = useQuery({
    queryKey: ['lab-finance-lock', labId],
    enabled: !!labId && !unlocked,
    queryFn: fetchFinanceLockState,
  });

  if (unlocked) return <>{children}</>;

  if (state.isLoading || !labId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const onUnlocked = () => {
    rememberUnlocked(labId);
    setUnlocked(true);
  };

  if (!state.data?.passcode_set) return <CreateForm onCreated={onUnlocked} t={t} />;
  if (resetting) return <ResetForm onDone={onUnlocked} onCancel={() => setResetting(false)} t={t} />;
  return (
    <UnlockForm
      lockedUntil={state.data.locked_until}
      onUnlocked={onUnlocked}
      onForgot={() => setResetting(true)}
      t={t}
    />
  );
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Shared shell so both states are the same object in the same place. */
function LockShell({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <Box sx={{ maxWidth: 460 }}>
        <SectionCard icon={icon} title={title}>
          {children}
        </SectionCard>
      </Box>
    </>
  );
}

function UnlockForm({
  lockedUntil,
  onUnlocked,
  onForgot,
  t,
}: {
  lockedUntil: string | null;
  onUnlocked: () => void;
  onForgot: () => void;
  t: T;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cooling = lockedUntil != null && dayjs(lockedUntil).isAfter(dayjs());

  const submit = async () => {
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await verifyFinancePasscode(value)) {
        onUnlocked();
      } else {
        setError(t('finances.lock.wrong'));
        setValue('');
      }
    } catch {
      // The only error the server raises here is the rate limit.
      setError(t('finances.lock.tooMany'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LockShell title={t('finances.lock.title')} icon="lock">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('finances.lock.enterHint')}
        </Typography>
        {cooling && <Alert severity="warning">{t('finances.lock.tooMany')}</Alert>}
        <TextField
          type="password"
          autoFocus
          label={t('finances.lock.passcode')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          error={!!error}
          helperText={error ?? undefined}
          disabled={cooling}
          inputProps={{ inputMode: 'numeric', autoComplete: 'off' }}
          fullWidth
        />
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={busy || cooling || value.length === 0}
          startIcon={<Icon name="lock_open" size={17} />}
        >
          {t('finances.lock.unlock')}
        </Button>
        <Button size="small" color="inherit" onClick={onForgot} sx={{ alignSelf: 'center' }}>
          {t('finances.lock.forgot')}
        </Button>
      </Stack>
    </LockShell>
  );
}

/**
 * The way back in: the account password. Not a second passcode to remember —
 * the credential the lab already has, which is the only thing that stops a
 * forgotten four digits from shutting a lab out of its own books for good.
 */
function ResetForm({
  onDone,
  onCancel,
  t,
}: {
  onDone: () => void;
  onCancel: () => void;
  t: T;
}) {
  const [password, setPassword] = useState('');
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== value;
  const canSubmit = password.length > 0 && value.trim().length >= 4 && confirm === value && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await resetFinancePasscode(password, value);
      onDone();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === '55006' ? t('finances.lock.tooMany') : t('finances.lock.wrongPassword'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LockShell title={t('finances.lock.resetTitle')} icon="lock_reset">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('finances.lock.resetHint')}
        </Typography>
        <TextField
          type="password"
          autoFocus
          label={t('finances.lock.accountPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          inputProps={{ autoComplete: 'current-password' }}
          fullWidth
        />
        <TextField
          type="password"
          label={t('finances.lock.newPasscode')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          helperText={t('finances.lock.minLength')}
          inputProps={{ inputMode: 'numeric', autoComplete: 'new-password' }}
          fullWidth
        />
        <TextField
          type="password"
          label={t('finances.lock.confirmPasscode')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          error={mismatch}
          helperText={mismatch ? t('finances.lock.mismatch') : undefined}
          inputProps={{ autoComplete: 'new-password' }}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" onClick={() => void submit()} disabled={!canSubmit}>
          {t('finances.lock.resetAction')}
        </Button>
        <Button size="small" color="inherit" onClick={onCancel} sx={{ alignSelf: 'center' }}>
          {t('finances.lock.back')}
        </Button>
      </Stack>
    </LockShell>
  );
}

function CreateForm({ onCreated, t }: { onCreated: () => void; t: T }) {
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = value.length > 0 && value.trim().length < 4;
  const mismatch = confirm.length > 0 && confirm !== value;
  const canSubmit = value.trim().length >= 4 && confirm === value && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await setFinancePasscode(value);
      onCreated();
    } catch {
      setError(t('finances.lock.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LockShell title={t('finances.lock.createTitle')} icon="lock">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('finances.lock.createHint')}
        </Typography>
        <TextField
          type="password"
          autoFocus
          label={t('finances.lock.newPasscode')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={tooShort}
          helperText={tooShort ? t('finances.lock.tooShort') : t('finances.lock.minLength')}
          inputProps={{ inputMode: 'numeric', autoComplete: 'new-password' }}
          fullWidth
        />
        <TextField
          type="password"
          label={t('finances.lock.confirmPasscode')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          error={mismatch}
          helperText={mismatch ? t('finances.lock.mismatch') : undefined}
          inputProps={{ autoComplete: 'new-password' }}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Alert severity="info">{t('finances.lock.noRecovery')}</Alert>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={!canSubmit}
          startIcon={<Icon name="lock" size={17} />}
        >
          {t('finances.lock.create')}
        </Button>
      </Stack>
    </LockShell>
  );
}
