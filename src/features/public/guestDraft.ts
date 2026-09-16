import { useCallback, useEffect, useRef, useState } from 'react';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';

/**
 * The order a guest builds before they have an account.
 *
 * `order_drafts` needs a doctor to belong to, and a guest has none, so the
 * draft lives in this browser's localStorage until they sign in — at which
 * point the wizard hydrates from it, the server autosave takes over, and this
 * copy is removed.
 *
 * WHAT IS IN HERE
 *   The whole wizard state, patient name and date of birth included — the
 *   owner's call, so that a guest who fills the order once never types it
 *   twice. That is also why `clearGuestDraft` runs on every sign-out and why
 *   the dialog says "saved on this device": a shared clinic computer is the
 *   normal case, not the edge case.
 *
 * WHAT IS NOT
 *   Files. A `File` cannot be serialised, and the storage bucket's policies
 *   need an existing order anyway, so the wizard does not offer the field to
 *   guests rather than silently dropping their attachments on redirect.
 *
 * Every read and write is wrapped: localStorage throws in private windows and
 * when full, and a failed save must degrade to a warning, never to a broken
 * wizard. A value that does not parse, has a different `schema`, or is older
 * than `EXPIRY_MS` is discarded rather than migrated — prices and turnaround
 * may have moved on, and a stale shape is not worth the code to upgrade.
 */
export const GUEST_DRAFT_KEY = 'laborder.guestDraft.v1';
export const GUEST_DRAFT_SCHEMA = 1;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type GuestDraft = {
  schema: number;
  savedAt: string;
  labId: string;
  serviceId: string;
  /** Null while the guest never got as far as the form loading. */
  formVersionId: string | null;
  state: WizardState;
};

export type GuestDraftInput = Omit<GuestDraft, 'schema' | 'savedAt'>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/**
 * Defensive hydration of a stored state, in the spirit of the form templates'
 * `coerceXAnswers`. Anything the guest could not have set — a matched patient,
 * a work location — is dropped, so the resumed doctor goes through the same
 * duplicate check and location pick as a fresh order.
 */
function coerceWizardState(raw: unknown): WizardState | null {
  if (!isRecord(raw)) return null;
  const patient = isRecord(raw.patient) ? raw.patient : {};
  const invoice = raw.invoice_recipient_type;
  return {
    patient: {
      first_name: str(patient.first_name),
      last_name: str(patient.last_name),
      date_of_birth: str(patient.date_of_birth),
      gender: str(patient.gender),
    },
    lab_id: str(raw.lab_id),
    lab_service_id: str(raw.lab_service_id),
    answers: isRecord(raw.answers) ? raw.answers : {},
    doctor_work_location_id: '',
    requested_due_date: str(raw.requested_due_date),
    requested_due_time: str(raw.requested_due_time),
    rush_requested: raw.rush_requested === true,
    invoice_recipient_type:
      invoice === 'CLINIC' || invoice === 'DOCTOR' ? invoice : initialState.invoice_recipient_type,
  };
}

/** The stored draft, or null — and the key is cleared whenever null is the
 *  answer because of what was found there, so a bad value is never re-read. */
export function readGuestDraft(): GuestDraft | null {
  let text: string | null;
  try {
    text = localStorage.getItem(GUEST_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    clearGuestDraft();
    return null;
  }
  if (!isRecord(parsed) || parsed.schema !== GUEST_DRAFT_SCHEMA) {
    clearGuestDraft();
    return null;
  }
  const savedAt = Date.parse(str(parsed.savedAt));
  if (!Number.isFinite(savedAt) || Date.now() - savedAt > EXPIRY_MS) {
    clearGuestDraft();
    return null;
  }
  const labId = str(parsed.labId);
  const serviceId = str(parsed.serviceId);
  const state = coerceWizardState(parsed.state);
  if (!labId || !serviceId || !state) {
    clearGuestDraft();
    return null;
  }
  return {
    schema: GUEST_DRAFT_SCHEMA,
    savedAt: new Date(savedAt).toISOString(),
    labId,
    serviceId,
    formVersionId: typeof parsed.formVersionId === 'string' ? parsed.formVersionId : null,
    state,
  };
}

/** True when it saved. False is a real answer the caller must show — the
 *  guest is about to be sent to a login page believing their work is safe. */
export function writeGuestDraft(input: GuestDraftInput): boolean {
  const draft: GuestDraft = {
    schema: GUEST_DRAFT_SCHEMA,
    savedAt: new Date().toISOString(),
    ...input,
  };
  try {
    localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestDraft(): void {
  try {
    localStorage.removeItem(GUEST_DRAFT_KEY);
  } catch {
    /* nothing to clear, or nowhere to clear it from */
  }
}

/** The doctor's wizard, opened on the draft's lab + service and told to
 *  hydrate from this browser rather than from `order_drafts`. */
export function guestDraftResumePath(draft: Pick<GuestDraft, 'labId' | 'serviceId'>): string {
  return `/doctor/orders/new?lab=${draft.labId}&service=${draft.serviceId}&resume=1`;
}

/** The URL a signed-in visitor to the guest wizard is sent to, with the
 *  resume flag only when there is something here to resume. */
export function doctorOrderNewPath(search: string): string {
  const params = new URLSearchParams(search);
  const draft = readGuestDraft();
  if (draft && draft.labId === params.get('lab') && draft.serviceId === params.get('service')) {
    params.set('resume', '1');
  }
  const qs = params.toString();
  return `/doctor/orders/new${qs ? `?${qs}` : ''}`;
}

/**
 * Whether there is anything worth keeping. Some forms seed an answer on mount
 * (the crown-and-bridge builder picks the first material), so `answers` alone
 * says nothing about the guest; the patient's name and the dates do.
 */
export function guestDraftHasContent(state: WizardState): boolean {
  const p = state.patient;
  return !!(
    p.first_name.trim() ||
    p.last_name.trim() ||
    p.date_of_birth ||
    state.requested_due_date ||
    state.requested_due_time ||
    state.rush_requested
  );
}

export type GuestSaveStatus = 'idle' | 'saved' | 'failed';

/**
 * Debounced save as the guest edits, plus `saveNow` for the moments that
 * cannot wait for a debounce — just before the sign-in dialog opens, and just
 * before the wizard unmounts under a redirect.
 *
 * `status` is what the header and the dialog show. `failed` is sticky until a
 * later write succeeds: a guest whose storage is blocked needs to know before
 * they leave the page, not only at the instant a write happened to fail.
 */
export function useGuestDraftAutosave(
  enabled: boolean,
  input: GuestDraftInput,
): { status: GuestSaveStatus; saveNow: () => boolean } {
  const [status, setStatus] = useState<GuestSaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ enabled, input });
  latestRef.current = { enabled, input };

  const saveNow = useCallback((): boolean => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ok = writeGuestDraft(latestRef.current.input);
    setStatus(ok ? 'saved' : 'failed');
    return ok;
  }, []);

  useEffect(() => {
    if (!enabled || !guestDraftHasContent(input.state)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus(writeGuestDraft(latestRef.current.input) ? 'saved' : 'failed');
    }, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, input.state, input.labId, input.serviceId, input.formVersionId]);

  // A pending save must not be lost to the redirect that follows a successful
  // sign-in — the wizard unmounts the instant the session lands.
  useEffect(() => {
    return () => {
      const { enabled: on, input: last } = latestRef.current;
      if (on && timerRef.current && guestDraftHasContent(last.state)) {
        clearTimeout(timerRef.current);
        writeGuestDraft(last);
      }
    };
  }, []);

  return { status, saveNow };
}
