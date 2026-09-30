import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { WizardState } from '@/features/doctor/orderCreate/types';

export type ServerDraftStatus = {
  /** When the last write to `order_drafts` succeeded; null before the first. */
  savedAt: Date | null;
  /** The last write failed. Sticky until a later one succeeds. */
  failed: boolean;
};

/**
 * `useDebouncedDraftAutosave` with an outcome: the redesigned header says
 * "draft saved 14:32", and the time has to be a save that actually landed.
 *
 * Same schedule, same row, same unmount flush as the original in
 * `draftStorage` — only the upsert's `{ error }` is read instead of dropped
 * (supabase-js resolves rather than throws on a failed write, so `saveDraft`
 * resolving says nothing about whether it saved). Kept beside the wizard
 * rather than in `draftStorage` only because that file belongs to another
 * part of the redesign; folding the status into the original hook is the
 * obvious next step.
 */
export function useServerDraftAutosave(
  doctorId: string | undefined,
  authorUserId: string | undefined,
  state: WizardState,
  step: number,
  labName: string,
  serviceName: string,
): ServerDraftStatus {
  const [status, setStatus] = useState<ServerDraftStatus>({ savedAt: null, failed: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest values so the unmount flush captures current state.
  const latestRef = useRef({ doctorId, authorUserId, state, step, labName, serviceName });
  latestRef.current = { doctorId, authorUserId, state, step, labName, serviceName };
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!doctorId || !authorUserId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // The fired timer's id is deliberately left in the ref: the original's
    // unmount flush keys off it, so it re-writes the latest state on the way
    // out even when nothing is pending. Mirrored, not tidied.
    timerRef.current = setTimeout(() => {
      void write(doctorId, authorUserId, state, step, labName, serviceName).then((ok) => {
        if (!mountedRef.current) return;
        setStatus((prev) =>
          ok ? { savedAt: new Date(), failed: false } : { ...prev, failed: true },
        );
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [doctorId, authorUserId, step, labName, serviceName, state]);

  // Flush any pending save immediately when the wizard unmounts (navigation,
  // a redirect). Nothing is left to show the outcome to, so it is not read.
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
        void write(id, author, s, st, ln, sn);
      }
    };
  }, []);

  return status;
}

/** `saveDraft`'s upsert, reporting whether it landed. */
async function write(
  doctorId: string,
  authorUserId: string,
  state: WizardState,
  step: number,
  labName: string,
  serviceName: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.from('order_drafts').upsert(
      {
        doctor_id: doctorId,
        author_user_id: authorUserId,
        state_json: state,
        step,
        lab_name: labName,
        service_name: serviceName,
      },
      { onConflict: 'doctor_id,author_user_id' },
    );
    return !error;
  } catch {
    return false;
  }
}
