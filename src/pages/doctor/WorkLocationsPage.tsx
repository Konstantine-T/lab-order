import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { WorkLocationDialog } from '@/features/doctor/workLocations/WorkLocationDialog';
import type { WorkLocationInput } from '@/features/doctor/workLocations/schema';
import type { DoctorWorkLocationRow } from '@/types/database';

export function WorkLocationsPage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();

  const doctorId = user?.doctor_profile?.id;

  const { data: locations = [], isLoading, error } = useQuery({
    queryKey: ['doctor-work-locations', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_work_locations')
        .select('*')
        .eq('doctor_id', doctorId!)
        .is('archived_at', null)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoctorWorkLocationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: WorkLocationInput) => {
      if (!doctorId) throw new Error('Missing doctor profile');
      if (values.is_default) {
        await supabase
          .from('doctor_work_locations')
          .update({ is_default: false })
          .eq('doctor_id', doctorId)
          .is('archived_at', null);
      }
      const { error } = await supabase.from('doctor_work_locations').insert({
        doctor_id: doctorId,
        clinic_name: values.clinic_name,
        branch_name: values.branch_name || null,
        address: values.address,
        city: values.city,
        clinic_identification_code: values.clinic_identification_code || null,
        clinic_invoice_email: values.clinic_invoice_email || null,
        phone: values.phone || null,
        is_default: values.is_default,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-work-locations', doctorId] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: WorkLocationInput }) => {
      if (!doctorId) throw new Error('Missing doctor profile');
      if (values.is_default) {
        await supabase
          .from('doctor_work_locations')
          .update({ is_default: false })
          .eq('doctor_id', doctorId)
          .neq('id', id)
          .is('archived_at', null);
      }
      const { error } = await supabase
        .from('doctor_work_locations')
        .update({
          clinic_name: values.clinic_name,
          branch_name: values.branch_name || null,
          address: values.address,
          city: values.city,
          clinic_identification_code: values.clinic_identification_code || null,
          clinic_invoice_email: values.clinic_invoice_email || null,
          phone: values.phone || null,
          is_default: values.is_default,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-work-locations', doctorId] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!doctorId) throw new Error('Missing doctor profile');
      await supabase
        .from('doctor_work_locations')
        .update({ is_default: false })
        .eq('doctor_id', doctorId)
        .is('archived_at', null);
      const { error } = await supabase
        .from('doctor_work_locations')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-work-locations', doctorId] }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('doctor_work_locations')
        .update({ archived_at: new Date().toISOString(), is_default: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctor-work-locations', doctorId] }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DoctorWorkLocationRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DoctorWorkLocationRow | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (row: DoctorWorkLocationRow) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const handleSubmit = async (values: WorkLocationInput) => {
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
          <Typography variant="h4">{t('workLocations.title')}</Typography>
          <Typography color="text.secondary">{t('workLocations.subtitle')}</Typography>
        </Stack>
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate}>
            {t('workLocations.addNew')}
          </Button>
        </Box>
      </Stack>

      {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">{t('workLocations.empty')}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {locations.map((loc) => (
            <Card key={loc.id}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Stack spacing={0.5} flex={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h6">
                        {loc.clinic_name}
                        {loc.branch_name ? ` · ${loc.branch_name}` : ''}
                      </Typography>
                      {loc.is_default && (
                        <Chip
                          color="primary"
                          size="small"
                          icon={<StarIcon />}
                          label={t('workLocations.default')}
                        />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {loc.address}, {loc.city}
                    </Typography>
                    {loc.phone && (
                      <Typography variant="body2" color="text.secondary">
                        {loc.phone}
                      </Typography>
                    )}
                    {loc.clinic_identification_code && (
                      <Typography variant="body2" color="text.secondary">
                        {t('workLocations.fields.clinicIdentificationCode')}:{' '}
                        {loc.clinic_identification_code}
                      </Typography>
                    )}
                    {loc.clinic_invoice_email && (
                      <Typography variant="body2" color="text.secondary">
                        {loc.clinic_invoice_email}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={0.5}>
                    {!loc.is_default && (
                      <Tooltip title={t('workLocations.makeDefault')}>
                        <IconButton onClick={() => setDefaultMutation.mutate(loc.id)}>
                          <StarOutlineIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={tc('actions.edit')}>
                      <IconButton onClick={() => openEdit(loc)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={tc('actions.archive')}>
                      <IconButton onClick={() => setArchiveTarget(loc)}>
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

      <WorkLocationDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('workLocations.archiveConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('workLocations.archiveConfirm.body')}</DialogContentText>
          {archiveTarget && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography>
                <strong>{archiveTarget.clinic_name}</strong>
                {archiveTarget.branch_name ? ` · ${archiveTarget.branch_name}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {archiveTarget.address}, {archiveTarget.city}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveTarget(null)}>{tc('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (archiveTarget) await archiveMutation.mutateAsync(archiveTarget.id);
              setArchiveTarget(null);
            }}
          >
            {tc('actions.archive')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
