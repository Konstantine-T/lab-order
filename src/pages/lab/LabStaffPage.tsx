import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import {
  CardStack,
  EmptyState,
  Icon,
  InitialsAvatar,
  MetaChip,
  PageHeader,
  SectionCard,
} from '@/components/design';
import { StaffDialog } from '@/features/lab/staff/StaffDialog';
import type { StaffInput } from '@/features/lab/staff/staffSchema';
import type { LabStaffRow } from '@/types/database';

export function LabStaffPage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();

  const labId = user?.lab?.id;

  const { data: staff = [], isLoading, error } = useQuery({
    queryKey: ['lab-staff', labId],
    enabled: !!labId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_staff')
        .select('*')
        .eq('lab_id', labId!)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LabStaffRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lab-staff', labId] });

  const createMutation = useMutation({
    mutationFn: async (values: StaffInput) => {
      if (!labId) throw new Error('Missing lab');
      const { error } = await supabase.from('lab_staff').insert({
        lab_id: labId,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        email: values.email || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: StaffInput }) => {
      const { error } = await supabase
        .from('lab_staff')
        .update({
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone,
          email: values.email || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lab_staff')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabStaffRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LabStaffRow | null>(null);
  const [actionError, setActionError] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (row: LabStaffRow) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const handleSubmit = async (values: StaffInput) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, values });
    } else {
      await createMutation.mutateAsync(values);
    }
  };

  return (
    <>
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        actions={
          <Button startIcon={<Icon name="add" size={17} />} variant="contained" onClick={openCreate}>
            {t('staff.addNew')}
          </Button>
        }
      />

      <CardStack>
        {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : staff.length === 0 ? (
          <EmptyState
            icon="group_add"
            title={t('staff.empty')}
            onClick={openCreate}
            minHeight={220}
          />
        ) : (
          staff.map((member) => (
            <SectionCard key={member.id}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                spacing={2}
              >
                <Stack direction="row" spacing={2} alignItems="center" flex={1} sx={{ minWidth: 0 }}>
                  <InitialsAvatar
                    name={`${member.first_name} ${member.last_name}`}
                    size={40}
                    shape="circle"
                  />
                  <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography variant="h5">
                      {member.first_name} {member.last_name}
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                      <MetaChip icon={<Icon name="call" size={13} />}>{member.phone}</MetaChip>
                      {member.email && (
                        <MetaChip icon={<Icon name="mail" size={13} />}>{member.email}</MetaChip>
                      )}
                    </Stack>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                  <Tooltip title={tc('actions.edit')}>
                    <IconButton onClick={() => openEdit(member)}>
                      <Icon name="edit" size={19} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={tc('actions.archive')}>
                    <IconButton onClick={() => setArchiveTarget(member)}>
                      <Icon name="archive" size={19} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </SectionCard>
          ))
        )}
      </CardStack>

      <StaffDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('staff.archiveConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('staff.archiveConfirm.body')}</DialogContentText>
          {archiveTarget && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography>
                <strong>
                  {archiveTarget.first_name} {archiveTarget.last_name}
                </strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {archiveTarget.phone}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(null)}>{tc('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={archiveMutation.isPending}
            onClick={async () => {
              try {
                if (archiveTarget) await archiveMutation.mutateAsync(archiveTarget.id);
              } catch {
                setActionError(true);
              } finally {
                setArchiveTarget(null);
              }
            }}
          >
            {tc('actions.archive')}
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
    </>
  );
}
