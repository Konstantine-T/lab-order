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

type Target = { labId: string; patientId: string; orderId: string };

/**
 * Shared "Continue project" launcher used by every entry point (orders list,
 * patient orders, order detail) so the draft-collision behaviour is identical.
 *
 * start() navigates to the lab's profile (service picker) carrying the patient
 * + originating order id. If the doctor already has an unfinished draft,
 * continuing would silently clobber it on the next autosave — so we first pop a
 * warning modal and only discard + navigate on confirm. Render the returned
 * `modal` element somewhere in the page.
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
    navigate(
      `/doctor/labs/${target.labId}?patient=${target.patientId}&continues=${target.orderId}`,
    );
  };

  const start = (labId: string, patientId: string, orderId: string) => {
    const target = { labId, patientId, orderId };
    // Draft present → ask first; otherwise go straight through.
    if (draft) setPending(target);
    else go(target);
  };

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

  return { start, modal };
}
