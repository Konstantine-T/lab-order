import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { WizardState } from './types';

export type OrderDraftRow = {
  doctor_id: string;
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

export async function loadDraft(doctorId: string): Promise<DraftData | null> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select('*')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as OrderDraftRow;
  if (Date.now() - new Date(row.updated_at).getTime() > DRAFT_EXPIRY_MS) {
    await clearDraft(doctorId);
    return null;
  }
  return {
    state: row.state_json,
    step: row.step,
    labName: row.lab_name,
    serviceName: row.service_name,
  };
}

export async function saveDraft(doctorId: string, data: DraftData): Promise<void> {
  await supabase.from('order_drafts').upsert(
    {
      doctor_id: doctorId,
      state_json: data.state,
      step: data.step,
      lab_name: data.labName,
      service_name: data.serviceName,
    },
    { onConflict: 'doctor_id' },
  );
}

export async function clearDraft(doctorId: string): Promise<void> {
  await supabase.from('order_drafts').delete().eq('doctor_id', doctorId);
}

export function useDebouncedDraftAutosave(
  doctorId: string | undefined,
  state: WizardState,
  step: number,
  labName: string,
  serviceName: string,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest values so the unmount flush captures current state.
  const latestRef = useRef({ doctorId, state, step, labName, serviceName });
  latestRef.current = { doctorId, state, step, labName, serviceName };

  useEffect(() => {
    if (!doctorId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveDraft(doctorId, { state, step, labName, serviceName });
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doctorId, step, labName, serviceName, state]);

  // Flush any pending save immediately when the wizard unmounts (navigation,
  // "Add work location" redirect, etc.). Does not help with hard browser refresh
  // since JS is interrupted, but covers all in-app unmount scenarios.
  useEffect(() => {
    return () => {
      const { doctorId: id, state: s, step: st, labName: ln, serviceName: sn } = latestRef.current;
      if (id && timerRef.current) {
        clearTimeout(timerRef.current);
        void saveDraft(id, { state: s, step: st, labName: ln, serviceName: sn });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
