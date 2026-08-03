import { useState } from 'react';
import { Alert, Button, Snackbar, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { SectionCard } from '@/components/design';

type MyInvite = {
  invite_id: string;
  clinic_id: string;
  clinic_name: string;
  created_at: string;
};

/**
 * Doctor-facing card: pending clinic invitations addressed to this doctor.
 * Accepting links the doctor to the clinic (via the respond_clinic_invite RPC,
 * which runs as the doctor — the consent gate). Renders nothing when there are
 * no pending invites.
 */
export function ClinicInvitesCard() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: invites = [] } = useQuery({
    queryKey: ['my-clinic-invites'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_clinic_invites');
      if (error) throw error;
      return (data ?? []) as MyInvite[];
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_clinic_invite', {
        p_invite_id: id,
        p_accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-clinic-invites'] }),
    onError: (e: unknown) => {
      const msg = (e as { message?: string })?.message ?? '';
      // The RPC raises 'already_in_clinic' when the doctor is already linked.
      setErrorMsg(
        msg.includes('already_in_clinic')
          ? t('clinicInvites.alreadyInClinic')
          : tc('errors.generic'),
      );
    },
  });

  if (invites.length === 0) return null;

  return (
    <SectionCard accent="brand" icon="mail" title={t('clinicInvites.title')}>
        <Stack spacing={2}>
          {invites.map((inv) => (
            <Stack
              key={inv.invite_id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
            >
              <Typography>
                {t('clinicInvites.body', { clinic: inv.clinic_name })}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: inv.invite_id, accept: true })}
                >
                  {t('clinicInvites.accept')}
                </Button>
                <Button
                  size="small"
                  color="inherit"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: inv.invite_id, accept: false })}
                >
                  {t('clinicInvites.decline')}
                </Button>
              </Stack>
            </Stack>
          ))}
        </Stack>

      <Snackbar
        open={!!errorMsg}
        autoHideDuration={5000}
        onClose={() => setErrorMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorMsg(null)} variant="filled">
          {errorMsg}
        </Alert>
      </Snackbar>
    </SectionCard>
  );
}
