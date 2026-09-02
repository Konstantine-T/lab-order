import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { InitialsAvatar } from '@/components/design';
import { supabase } from '@/lib/supabase';
import type { ClinicDoctorRow } from '@/types/database';

/**
 * Who the clinic admin is ordering for.
 *
 * The clinic walks the doctor's own path — marketplace, lab profile, wizard —
 * so the doctor chosen in step one has to stay visible on every screen after
 * it: a clinic can manage many doctors, and getting this wrong misattributes
 * the whole order. All three screens read the roster under one query key, so
 * moving between them neither refetches nor flashes.
 *
 * `changeTo` points back at the doctor picker, carrying whatever has already
 * been chosen so switching doctor resumes the flow instead of restarting it.
 * `compact` drops the label for the wizard, where this chip shares the header
 * with the lab + service capsule and the two together overflow the row.
 */
export function ActingDoctorChip({
  doctorId,
  changeTo,
  compact = false,
}: {
  doctorId: string;
  changeTo: string;
  compact?: boolean;
}) {
  const { t } = useTranslation('doctor');

  const { data: doctor } = useQuery({
    queryKey: ['acting-doctor', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return ((data ?? []) as ClinicDoctorRow[]).find((d) => d.doctor_id === doctorId) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Nothing until the roster lands, and nothing at all for an id that isn't on
  // it — the wizard's own guard bounces that case back to the picker.
  if (!doctor) return null;
  const name = `${doctor.first_name} ${doctor.last_name}`;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.125}
      sx={{
        minWidth: 0,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 999,
        pl: 0.75,
        pr: 1,
        py: 0.75,
      }}
    >
      <InitialsAvatar name={name} size={24} shape="circle" variant="brand" />
      {!compact && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: 'none', md: 'block' } }}
        >
          {t('orderCreate.orderingFor')}
        </Typography>
      )}
      <Typography sx={{ fontSize: '0.78125rem', fontWeight: 600, minWidth: 0 }} noWrap>
        {name}
      </Typography>
      <Button component={RouterLink} to={changeTo} size="small" sx={{ p: 0.5, minWidth: 0 }}>
        {t('orderCreate.changeDoctor')}
      </Button>
    </Stack>
  );
}
