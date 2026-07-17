import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import CloseIcon from '@mui/icons-material/Close';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { ClinicDoctorInviteRow, ClinicDoctorRow } from '@/types/database';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClinicDoctorsPage() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const clinicId = user?.clinic?.id;
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ClinicDoctorRow | null>(null);
  const [actionError, setActionError] = useState(false);

  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['clinic-doctors', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['clinic-invites', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinic_doctor_invites')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClinicDoctorInviteRow[];
    },
  });

  const pendingInvites = invites.filter((i) => i.status === 'PENDING');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clinic-doctors', clinicId] });
    qc.invalidateQueries({ queryKey: ['clinic-invites', clinicId] });
    // Keep the home dashboard counters fresh too.
    qc.invalidateQueries({ queryKey: ['clinic-pending-invites', clinicId] });
    qc.invalidateQueries({ queryKey: ['clinic-order-count', clinicId] });
  };

  const invite = useMutation({
    mutationFn: async (addr: string) => {
      const { error } = await supabase.from('clinic_doctor_invites').insert({
        clinic_id: clinicId,
        doctor_email: addr.trim().toLowerCase(),
        invited_by_user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail('');
      invalidate();
    },
    onError: () => setActionError(true),
  });

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('clinic_doctor_invites')
        .update({ status: 'REVOKED', responded_at: new Date().toISOString() })
        .eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => setActionError(true),
  });

  const remove = useMutation({
    mutationFn: async (doctorId: string) => {
      const { error } = await supabase.rpc('clinic_remove_doctor', { p_doctor_id: doctorId });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => setActionError(true),
  });

  const submitInvite = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('doctors.invite.invalidEmail'));
      return;
    }
    setEmailError(null);
    invite.mutate(email);
  };

  return (
    <Stack spacing={3}>
      <Stack>
        <Typography variant="h4">{t('doctors.title')}</Typography>
        <Typography color="text.secondary">{t('doctors.subtitle')}</Typography>
      </Stack>

      {/* Invite */}
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6">{t('doctors.invite.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('doctors.invite.hint')}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                fullWidth
                type="email"
                label={t('doctors.invite.emailLabel')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitInvite()}
                error={!!emailError}
                helperText={emailError ?? ' '}
                sx={{ maxWidth: { sm: 360 } }}
              />
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                disabled={invite.isPending}
                onClick={submitInvite}
                sx={{ mt: { xs: 0, sm: 0.5 } }}
              >
                {t('doctors.invite.action')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">{t('doctors.pending.title')}</Typography>
              {pendingInvites.map((inv) => (
                <Stack
                  key={inv.id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={t('doctors.pending.badge')} color="warning" variant="outlined" />
                    <Typography variant="body2">{inv.doctor_email}</Typography>
                  </Stack>
                  <Tooltip title={t('doctors.pending.revoke')}>
                    <IconButton
                      size="small"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Roster */}
      {doctorsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : doctors.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">{t('doctors.empty')}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6" gutterBottom>
                {t('doctors.roster.title', { n: doctors.length })}
              </Typography>
              {doctors.map((doc, i) => (
                <Box key={doc.doctor_id}>
                  {i > 0 && <Divider sx={{ my: 1 }} />}
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                      <Avatar>{(doc.first_name[0] ?? '') + (doc.last_name[0] ?? '')}</Avatar>
                      <Stack sx={{ minWidth: 0 }}>
                        <Typography noWrap>
                          {doc.first_name} {doc.last_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {doc.email}
                          {doc.specialty ? ` · ${doc.specialty}` : ''}
                        </Typography>
                      </Stack>
                    </Stack>
                    <Tooltip title={t('doctors.roster.remove')}>
                      <IconButton
                        color="error"
                        disabled={remove.isPending}
                        onClick={() => setRemoveTarget(doc)}
                      >
                        <PersonRemoveIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Remove confirm */}
      <Dialog open={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <DialogTitle>{t('doctors.roster.removeConfirmTitle')}</DialogTitle>
        <DialogContent>
          {removeTarget && (
            <Typography>
              {t('doctors.roster.removeConfirmBody', {
                name: `${removeTarget.first_name} ${removeTarget.last_name}`,
              })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>{tc('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={async () => {
              if (removeTarget) {
                await remove.mutateAsync(removeTarget.doctor_id).catch(() => {});
              }
              setRemoveTarget(null);
            }}
          >
            {t('doctors.roster.removeAction')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={actionError}
        autoHideDuration={5000}
        onClose={() => setActionError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(false)} variant="filled">
          {tc('errors.generic')}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
