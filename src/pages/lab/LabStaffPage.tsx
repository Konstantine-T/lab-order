import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
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
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import EmailIcon from '@mui/icons-material/EmailOutlined';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { StaffDialog } from '@/features/lab/staff/StaffDialog';
import type { StaffInput } from '@/features/lab/staff/staffSchema';
import type { LabStaffRow } from '@/types/database';

function initials(row: LabStaffRow) {
  return `${row.first_name[0] ?? ''}${row.last_name[0] ?? ''}`.toUpperCase();
}

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
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Stack>
          <Typography variant="h4">{t('staff.title')}</Typography>
          <Typography color="text.secondary">{t('staff.subtitle')}</Typography>
        </Stack>
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate}>
            {t('staff.addNew')}
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : staff.length === 0 ? (
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">{t('staff.empty')}</Typography>
              <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate}>
                {t('staff.addNew')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {staff.map((member) => (
            <Card key={member.id}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Stack direction="row" spacing={2} alignItems="center" flex={1}>
                    <Avatar>{initials(member)}</Avatar>
                    <Stack spacing={0.5}>
                      <Typography variant="h6">
                        {member.first_name} {member.last_name}
                      </Typography>
                      <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <PhoneIcon fontSize="small" color="disabled" />
                          <Typography variant="body2" color="text.secondary">
                            {member.phone}
                          </Typography>
                        </Stack>
                        {member.email && (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <EmailIcon fontSize="small" color="disabled" />
                            <Typography variant="body2" color="text.secondary">
                              {member.email}
                            </Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Tooltip title={tc('actions.edit')}>
                      <IconButton onClick={() => openEdit(member)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={tc('actions.archive')}>
                      <IconButton onClick={() => setArchiveTarget(member)}>
                        <ArchiveIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

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
    </Stack>
  );
}
