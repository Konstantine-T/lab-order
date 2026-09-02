import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { WizardState } from './types';

export type OrderDraftRow = {
  doctor_id: string;
  author_user_id: string;
  state_json: WizardState;
  step: number;
  lab_name: string;
  service_name: string;
  updated_at: string;
};

export type DraftData = {
  state: WizardState;
  step: number;
  labName: string;
  serviceName: string;
};

export type DraftBrokenReason =
  | 'lab_unavailable'
  | 'service_unavailable'
  | 'form_unavailable';

export type DraftBrokenness =
  | { broken: false }
  | { broken: true; reason: DraftBrokenReason };

export function checkDraftBrokenness(
  lab: { is_active: boolean; approval_status: string } | null | undefined,
  service: { is_active: boolean } | null | undefined,
  form: { status: string } | null | undefined,
): DraftBrokenness {
  if (!lab || !lab.is_active || lab.approval_status !== 'APPROVED_ACTIVE') {
    return { broken: true, reason: 'lab_unavailable' };
  }
  if (!service || !service.is_active) {
    return { broken: true, reason: 'service_unavailable' };
  }
  if (!form || form.status !== 'PUBLISHED') {
    return { broken: true, reason: 'form_unavailable' };
  }
  return { broken: false };
}

const DRAFT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A draft belongs to a (doctor, author) pair, not to a doctor alone (0023).
 * A clinic admin ordering for one of their doctors gets their own slot, so
 * their autosave can't overwrite a draft that doctor is halfway through.
 * For a doctor ordering for themselves the two ids simply describe the same
 * person.
 */
export async function loadDraft(
  doctorId: string,
  authorUserId: string,
): Promise<DraftData | null> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('author_user_id', authorUserId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as OrderDraftRow;
  if (Date.now() - new Date(row.updated_at).getTime() > DRAFT_EXPIRY_MS) {
    await clearDraft(doctorId, authorUserId);
    return null;
  }
  return {
    state: row.state_json,
    step: row.step,
    labName: row.lab_name,
    serviceName: row.service_name,
  };
}

export type AuthoredDraft = DraftData & { doctorId: string; updatedAt: string };

/**
 * Every draft this user has authored, newest first.
 *
 * A doctor only ever has one, but a clinic admin has one slot per doctor they
 * order for, so their unfinished orders can only be surfaced as a list. RLS
 * (0023) already limits the read to rows this user authored.
 */
export async function loadDraftsByAuthor(authorUserId: string): Promise<AuthoredDraft[]> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('*')
    .eq('author_user_id', authorUserId)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];

  // Expired drafts are skipped rather than deleted: the single-draft loader
  // clears one when it is actually opened, and a list read should not fire a
  // pile of deletes as a side effect of rendering a page.
  return (data as OrderDraftRow[])
    .filter((row) => Date.now() - new Date(row.updated_at).getTime() <= DRAFT_EXPIRY_MS)
    .map((row) => ({
      doctorId: row.doctor_id,
      state: row.state_json,
      step: row.step,
      labName: row.lab_name,
      serviceName: row.service_name,
      updatedAt: row.updated_at,
    }));
}

export async function saveDraft(
  doctorId: string,
  authorUserId: string,
  data: DraftData,
): Promise<void> {
  await supabase.from('order_drafts').upsert(
    {
      doctor_id: doctorId,
      author_user_id: authorUserId,
      state_json: data.state,
      step: data.step,
      lab_name: data.labName,
      service_name: data.serviceName,
    },
    { onConflict: 'doctor_id,author_user_id' },
  );
}

export async function clearDraft(doctorId: string, authorUserId: string): Promise<void> {
  await supabase
    .from('order_drafts')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('author_user_id', authorUserId);
}

export function useDebouncedDraftAutosave(
  doctorId: string | undefined,
  authorUserId: string | undefined,
  state: WizardState,
  step: number,
  labName: string,
  serviceName: string,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest values so the unmount flush captures current state.
  const latestRef = useRef({ doctorId, authorUserId, state, step, labName, serviceName });
  latestRef.current = { doctorId, authorUserId, state, step, labName, serviceName };

  useEffect(() => {
    if (!doctorId || !authorUserId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveDraft(doctorId, authorUserId, { state, step, labName, serviceName });
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doctorId, authorUserId, step, labName, serviceName, state]);

  // Flush any pending save immediately when the wizard unmounts (navigation,
  // "Add work location" redirect, etc.). Does not help with hard browser refresh
  // since JS is interrupted, but covers all in-app unmount scenarios.
  useEffect(() => {
    return () => {
      const {
        doctorId: id,
        authorUserId: author,
        state: s,
        step: st,
        labName: ln,
        serviceName: sn,
      } = latestRef.current;
      if (id && author && timerRef.current) {
        clearTimeout(timerRef.current);
        void saveDraft(id, author, { state: s, step: st, labName: ln, serviceName: sn });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
