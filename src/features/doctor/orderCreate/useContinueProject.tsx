import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { loadDraft, clearDraft } from '@/features/doctor/orderCreate/draftStorage';

/** `orderId` is absent for the patient-level "add new order" launch — see
 *  `startForPatient`. */
type Target = { labId: string; patientId: string; orderId?: string };

/**
 * Shared launcher for both ways of starting an order against an existing
 * patient, so the draft-collision behaviour is identical for each.
 *
 * Both navigate to the lab's profile (service picker) carrying the patient, so
 * the wizard pre-fills and locks them. If the doctor already has an unfinished
 * draft, continuing would silently clobber it on the next autosave — so we
 * first pop a warning modal and only discard + navigate on confirm. Render the
 * returned `modal` element somewhere in the page.
 */
export function useContinueProject() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation('doctor');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;

  // Same key the wizard + orders list use, so we see the live draft state.
  const { data: draft = null } = useQuery({
    queryKey: ['doctor-draft', doctorId],
    enabled: !!doctorId,
    queryFn: () => loadDraft(doctorId!),
    staleTime: 0,
  });

  const [pending, setPending] = useState<Target | null>(null);

  const go = (target: Target) => {
    const base = `/doctor/labs/${target.labId}?patient=${target.patientId}`;
    navigate(target.orderId ? `${base}&continues=${target.orderId}` : base);
  };

  const launch = (target: Target) => {
    // Draft present → ask first; otherwise go straight through.
    if (draft) setPending(target);
    else go(target);
  };

  /** Continue a specific project: pre-fills the patient AND records lineage
   *  back to `orderId`. Used by the per-order "Continue project" buttons. */
  const start = (labId: string, patientId: string, orderId: string) =>
    launch({ labId, patientId, orderId });

  /**
   * Patient-level "add new order": seeds the patient but deliberately passes no
   * `continues`, because this isn't the continuation of one particular project
   * — it's just another order for the same person. No lineage link is created.
   */
  const startForPatient = (labId: string, patientId: string) =>
    launch({ labId, patientId });

  const confirmDiscard = async () => {
    if (doctorId) await clearDraft(doctorId);
    qc.setQueryData(['doctor-draft', doctorId], null);
    if (pending) go(pending);
    setPending(null);
  };

  const modal = (
    <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
      <DialogTitle>{t('orders.continueDraftWarning.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('orders.continueDraftWarning.body')}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPending(null)} color="inherit">
          {t('orders.continueDraftWarning.keepDraft')}
        </Button>
        <Button onClick={confirmDiscard} color="error" variant="contained">
          {t('orders.continueDraftWarning.continueAnyway')}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { start, startForPatient, modal };
}
