import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Callout,
  CardStack,
  DetailList,
  DetailRow,
  PageHeader,
  SectionCard,
} from '@/components/design';
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
    <>
      <PageHeader
        backTo="/admin/labs"
        title={lab.public_name}
        subtitle={dayjs(lab.created_at).format('YYYY-MM-DD')}
        chips={<LabStatusChip status={lab.approval_status} />}
      />

      <CardStack sx={{ maxWidth: 900 }}>
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      {!complete && <Callout tone="warning">{t('labs.review.incomplete')}</Callout>}
      {lab.approval_note && (
        <Callout tone="brand" title={t('labs.review.lastNote')}>
          {lab.approval_note}
        </Callout>
      )}

      <SectionCard icon="store" title={t('labs.review.viewProfile')}>
        <DetailList>
          <DetailRow label={t('labs.fields.publicName')} labelWidth={200}>{lab.public_name || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.shortDescription')} labelWidth={200}>{lab.short_description || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.logoUrl')} labelWidth={200}>{lab.logo_url || '—'}</DetailRow>
        </DetailList>
      </SectionCard>

      <SectionCard icon="description" title={t('labs.review.viewLegal')}>
        <DetailList>
          <DetailRow label={t('labs.fields.legalName')} labelWidth={200}>{lab.legal_name || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.identificationCode')} labelWidth={200}>{lab.identification_code || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.legalAddress')} labelWidth={200}>{lab.legal_address || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.workingAddress')} labelWidth={200}>{lab.working_address || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.city')} labelWidth={200}>{lab.city || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.country')} labelWidth={200}>{lab.country || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.contactPerson')} labelWidth={200}>{lab.contact_person_name || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.contactPhone')} labelWidth={200}>{lab.contact_phone || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.contactEmail')} labelWidth={200}>{lab.contact_email || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.bankName')} labelWidth={200}>{lab.bank_name || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.bankAccount')} labelWidth={200}>{lab.bank_account_iban || '—'}</DetailRow>
          <DetailRow label={t('labs.fields.paymentInstructions')} labelWidth={200}>
            <Box sx={{ whiteSpace: 'pre-wrap' }}>{lab.payment_instructions || '—'}</Box>
          </DetailRow>
        </DetailList>
      </SectionCard>

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
      </CardStack>
    </>
  );
}
