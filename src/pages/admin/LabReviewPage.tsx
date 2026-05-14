import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { LabStatusChip } from '@/components/LabStatusChip';
import { isLabProfileComplete } from '@/features/lab/labProfileSchema';
import type { LabApprovalStatus, LabRow } from '@/types/database';

type ActionKind = 'approve' | 'reject' | 'request_changes' | 'suspend' | null;

export function LabReviewPage() {
  const { labId } = useParams<{ labId: string }>();
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [action, setAction] = useState<ActionKind>(null);
  const [note, setNote] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: lab, isLoading } = useQuery({
    queryKey: ['admin-lab', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase.from('labs').select('*').eq('id', labId!).maybeSingle();
      if (error) throw error;
      return data as LabRow | null;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (next: {
      status: LabApprovalStatus;
      isActive: boolean;
      noteText: string | null;
    }) => {
      if (!lab || !user) throw new Error('No lab/user');
      const patch: Record<string, unknown> = {
        approval_status: next.status,
        is_active: next.isActive,
        approval_note: next.noteText,
      };
      if (next.status === 'APPROVED_ACTIVE') {
        patch.approved_at = new Date().toISOString();
        patch.approved_by_user_id = user.id;
      }
      const { error } = await supabase.from('labs').update(patch).eq('id', lab.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-lab', labId] });
      qc.invalidateQueries({ queryKey: ['admin-labs'] });
      qc.invalidateQueries({ queryKey: ['admin-pending-labs-count'] });
    },
  });

  const closeDialog = () => {
    setAction(null);
    setNote('');
    setError(null);
  };

  const performAction = async () => {
    if (!lab || !action) return;
    setError(null);
    try {
      if (action === 'approve') {
        await updateStatus.mutateAsync({
          status: 'APPROVED_ACTIVE',
          isActive: true,
          noteText: null,
        });
        setSuccess(t('labs.review.approveSuccess'));
      } else if (action === 'reject') {
        await updateStatus.mutateAsync({
          status: 'REJECTED',
          isActive: false,
          noteText: note || null,
        });
        setSuccess(t('labs.review.rejectSuccess'));
      } else if (action === 'request_changes') {
        if (!note.trim()) {
          setError(tc('errors.required'));
          return;
        }
        await updateStatus.mutateAsync({
          status: 'CHANGES_REQUESTED',
          isActive: false,
          noteText: note,
        });
        setSuccess(t('labs.review.changesRequestedSuccess'));
      } else if (action === 'suspend') {
        if (!note.trim()) {
          setError(tc('errors.required'));
          return;
        }
        await updateStatus.mutateAsync({
          status: 'SUSPENDED',
          isActive: false,
          noteText: note,
        });
        setSuccess(t('labs.review.suspendedSuccess'));
      }
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  if (isLoading) return null;
  if (!lab) {
    return <Alert severity="error">{tc('errors.notFound')}</Alert>;
  }

  const complete = isLabProfileComplete({
    public_name: lab.public_name,
    legal_name: lab.legal_name ?? '',
    identification_code: lab.identification_code ?? '',
    legal_address: lab.legal_address ?? '',
    working_address: lab.working_address ?? '',
    city: lab.city ?? '',
    country: lab.country ?? '',
    contact_person_name: lab.contact_person_name ?? '',
    contact_phone: lab.contact_phone ?? '',
    contact_email: lab.contact_email ?? '',
    bank_name: lab.bank_name ?? '',
    bank_account_iban: lab.bank_account_iban ?? '',
    payment_instructions: lab.payment_instructions ?? '',
  });

  const status = lab.approval_status;
  const canApprove = (status === 'PENDING_APPROVAL' || status === 'CHANGES_REQUESTED') && complete;
  const canRequestChanges = status === 'PENDING_APPROVAL' || status === 'CHANGES_REQUESTED';
  const canReject = status === 'PENDING_APPROVAL' || status === 'CHANGES_REQUESTED';
  const canSuspend = status === 'APPROVED_ACTIVE';

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
        <Stack spacing={1} flex={1}>
          <Button component={RouterLink} to="/admin/labs" size="small" sx={{ alignSelf: 'flex-start' }}>
            ← {t('nav.labs')}
          </Button>
          <Typography variant="h4">{lab.public_name}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <LabStatusChip status={lab.approval_status} />
            <Typography variant="body2" color="text.secondary">
              {dayjs(lab.created_at).format('YYYY-MM-DD')}
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {!complete && <Alert severity="warning">{t('labs.review.incomplete')}</Alert>}
      {lab.approval_note && (
        <Alert severity="info">
          <Typography variant="body2" fontWeight={600}>
            Last note:
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {lab.approval_note}
          </Typography>
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('labs.review.viewProfile')}</Typography>
            <Divider />
            <DetailRow label="Public name" value={lab.public_name} />
            <DetailRow label="Short description" value={lab.short_description} />
            <DetailRow label="Logo URL" value={lab.logo_url} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('labs.review.viewLegal')}</Typography>
            <Divider />
            <DetailRow label="Legal name" value={lab.legal_name} />
            <DetailRow label="Identification code" value={lab.identification_code} />
            <DetailRow label="Legal address" value={lab.legal_address} />
            <DetailRow label="Working address" value={lab.working_address} />
            <DetailRow label="City" value={lab.city} />
            <DetailRow label="Country" value={lab.country} />
            <Divider />
            <DetailRow label="Contact person" value={lab.contact_person_name} />
            <DetailRow label="Contact phone" value={lab.contact_phone} />
            <DetailRow label="Contact email" value={lab.contact_email} />
            <Divider />
            <DetailRow label="Bank name" value={lab.bank_name} />
            <DetailRow label="Bank account / IBAN" value={lab.bank_account_iban} />
            <DetailRow label="Payment instructions" value={lab.payment_instructions} multiline />
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
        {canApprove && (
          <Button color="success" variant="contained" onClick={() => setAction('approve')}>
            {tc('actions.approve')}
          </Button>
        )}
        {canRequestChanges && (
          <Button variant="outlined" onClick={() => setAction('request_changes')}>
            {tc('actions.requestChanges')}
          </Button>
        )}
        {canReject && (
          <Button color="error" variant="outlined" onClick={() => setAction('reject')}>
            {tc('actions.reject')}
          </Button>
        )}
        {canSuspend && (
          <Button color="error" variant="outlined" onClick={() => setAction('suspend')}>
            {tc('actions.suspend')}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => navigate('/admin/labs')}>{tc('actions.back')}</Button>
      </Stack>

      <Dialog open={action === 'approve'} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('labs.review.approveConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('labs.review.approveConfirm.body')}</DialogContentText>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{tc('actions.cancel')}</Button>
          <Button onClick={performAction} variant="contained" color="success">
            {tc('actions.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={action === 'reject'} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('labs.review.rejectConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('labs.review.rejectConfirm.body')}</DialogContentText>
          <TextField
            sx={{ mt: 2 }}
            label="Reason (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{tc('actions.cancel')}</Button>
          <Button onClick={performAction} variant="contained" color="error">
            {tc('actions.reject')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={action === 'request_changes'} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{t('labs.review.requestChangesDialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            sx={{ mt: 1 }}
            label={t('labs.review.requestChangesDialog.noteLabel')}
            helperText={t('labs.review.requestChangesDialog.noteHelp')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            required
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{tc('actions.cancel')}</Button>
          <Button onClick={performAction} variant="contained">
            {t('labs.review.requestChangesDialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={action === 'suspend'} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{t('labs.review.suspendDialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            sx={{ mt: 1 }}
            label={t('labs.review.suspendDialog.noteLabel')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            required
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{tc('actions.cancel')}</Button>
          <Button onClick={performAction} variant="contained" color="error">
            {t('labs.review.suspendDialog.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ flex: 1, whiteSpace: multiline ? 'pre-wrap' : undefined }}
      >
        {value || <em style={{ color: 'gray' }}>—</em>}
      </Typography>
    </Stack>
  );
}
