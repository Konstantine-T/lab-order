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
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CardStack,
  EmptyState,
  Icon,
  MetaChip,
  PageHeader,
  SectionCard,
  StatusPill,
} from '@/components/design';
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
    <>
      <PageHeader
        title={t('workLocations.title')}
        subtitle={t('workLocations.subtitle')}
        actions={
          <Button startIcon={<Icon name="add" size={17} />} variant="contained" onClick={openCreate}>
            {t('workLocations.addNew')}
          </Button>
        }
      />

      <CardStack>
        {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : locations.length === 0 ? (
          <EmptyState
            icon="location_on"
            title={t('workLocations.empty')}
            onClick={openCreate}
            minHeight={220}
          />
        ) : (
          locations.map((loc) => (
            <SectionCard key={loc.id}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                spacing={2}
              >
                <Stack spacing={1} flex={1} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="h5">
                      {loc.clinic_name}
                      {loc.branch_name ? ` · ${loc.branch_name}` : ''}
                    </Typography>
                    {loc.is_default && (
                      <StatusPill tone="brand" dot>
                        {t('workLocations.default')}
                      </StatusPill>
                    )}
                  </Stack>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    <MetaChip icon={<Icon name="location_on" size={13} />}>
                      {loc.address}, {loc.city}
                    </MetaChip>
                    {loc.phone && (
                      <MetaChip icon={<Icon name="call" size={13} />}>{loc.phone}</MetaChip>
                    )}
                    {loc.clinic_identification_code && (
                      <MetaChip icon={<Icon name="badge" size={13} />}>
                        {loc.clinic_identification_code}
                      </MetaChip>
                    )}
                    {loc.clinic_invoice_email && (
                      <MetaChip icon={<Icon name="mail" size={13} />}>
                        {loc.clinic_invoice_email}
                      </MetaChip>
                    )}
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  {!loc.is_default && (
                    <Tooltip title={t('workLocations.makeDefault')}>
                      <IconButton onClick={() => setDefaultMutation.mutate(loc.id)}>
                        <Icon name="star" size={19} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={tc('actions.edit')}>
                    <IconButton onClick={() => openEdit(loc)}>
                      <Icon name="edit" size={19} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={tc('actions.archive')}>
                    <IconButton onClick={() => setArchiveTarget(loc)}>
                      <Icon name="archive" size={19} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </SectionCard>
          ))
        )}
      </CardStack>

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
    </>
  );
}
