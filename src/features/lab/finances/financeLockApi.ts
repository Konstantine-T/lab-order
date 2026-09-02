import { supabase } from '@/lib/supabase';

export type FinanceLockState = { passcode_set: boolean; locked_until: string | null };

/** Is a passcode set for the caller's lab, and is it currently rate-limited? */
export async function fetchFinanceLockState(): Promise<FinanceLockState> {
  const { data, error } = await supabase.rpc('lab_finance_lock_state');
  if (error) throw error;
  const row = (data as FinanceLockState[] | null)?.[0];
  return row ?? { passcode_set: false, locked_until: null };
}

/**
 * Set the passcode, or change it. `current` is required once one exists — the
 * server enforces that too; sending it from here is not the check.
 */
export async function setFinancePasscode(next: string, current?: string): Promise<void> {
  const { error } = await supabase.rpc('set_lab_finance_passcode', {
    p_new: next,
    p_current: current ?? null,
  });
  if (error) throw error;
}

/** Ask the server whether this passcode is right. The hash never leaves the DB. */
export async function verifyFinancePasscode(passcode: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_lab_finance_passcode', {
    p_passcode: passcode,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Unlocking lasts for the browser tab and no longer.
 *
 * sessionStorage, not localStorage: closing the tab should re-lock. The value
 * is only a "this tab already answered" marker — it is not a credential, and
 * forging it reveals nothing that the account could not already read.
 */
const key = (labId: string) => `finance-unlocked:${labId}`;

export const isUnlockedThisSession = (labId: string): boolean => {
  try {
    return sessionStorage.getItem(key(labId)) === '1';
  } catch {
    return false;
  }
};

export const rememberUnlocked = (labId: string): void => {
  try {
    sessionStorage.setItem(key(labId), '1');
  } catch {
    /* private mode — the gate just asks again, which is the safe direction */
  }
};

export const forgetUnlocked = (labId: string): void => {
  try {
    sessionStorage.removeItem(key(labId));
  } catch {
    /* nothing to do */
  }
};
