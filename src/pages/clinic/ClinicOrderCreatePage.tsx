import { useState } from 'react';
import {
  alpha,
  Alert,
  Box,
  Card,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Callout, EmptyState, Icon, InitialsAvatar, PageHeader } from '@/components/design';
import { supabase } from '@/lib/supabase';
import { OrderCreateWizard } from '@/pages/doctor/OrderCreateWizard';
import { brand, motion } from '@/theme/tokens';
import type { ClinicDoctorRow } from '@/types/database';

/**
 * Ordering from the clinic.
 *
 * There is no separate clinic order form any more. The clinic admin picks
 * which doctor they are ordering for, and from there walks exactly the path
 * the doctor walks — marketplace, lab profile, the same wizard with its live
 * price, drafts and rush options. This page is only the doctor choice; once
 * `?doctor=` is set it hands straight over to the wizard, which redirects on
 * to the marketplace if no lab/service has been chosen yet.
 */
export function ClinicOrderCreatePage() {
  const [params] = useSearchParams();
  const doctorId = params.get('doctor');

  if (doctorId) return <OrderCreateWizard basePath="/clinic" />;
  return <DoctorPicker />;
}

/** Show the search box only once scanning the list stops being instant. */
const SEARCH_FROM = 6;

function DoctorPicker() {
  const { t } = useTranslation('clinic');
  const { t: tc } = useTranslation('common');
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  // Someone may already have a lab/service picked (they browsed the
  // marketplace directly). Resume there rather than making them start over.
  const labParam = params.get('lab');
  const serviceParam = params.get('service');

  const {
    data: doctors = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['clinic-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('clinic_doctors');
      if (error) throw error;
      return (data ?? []) as ClinicDoctorRow[];
    },
  });

  // When this clinic last ordered for each doctor. RLS (0013/0015) already
  // limits the read to the clinic's own doctors. It turns a wall of names into
  // something recognisable — the admin usually wants whoever they ordered for
  // last. The order of the list itself stays alphabetical, as on the roster
  // page, so a card doesn't move under the cursor between visits.
  const { data: lastOrderByDoctor = {} } = useQuery({
    queryKey: ['clinic-doctor-last-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('doctor_id, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const latest: Record<string, string> = {};
      for (const row of (data ?? []) as { doctor_id: string; created_at: string }[]) {
        if (!latest[row.doctor_id]) latest[row.doctor_id] = row.created_at;
      }
      return latest;
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? doctors.filter((d) =>
        `${d.first_name} ${d.last_name} ${d.specialty ?? ''} ${d.email}`.toLowerCase().includes(q),
      )
    : doctors;

  // Picking the doctor resumes the flow rather than starting it: back into the
  // wizard if a lab and service are already chosen, otherwise into the
  // marketplace with that doctor in hand.
  const hrefFor = (id: string) =>
    labParam && serviceParam
      ? `/clinic/orders/new?doctor=${id}&lab=${labParam}&service=${serviceParam}`
      : `/clinic/marketplace?doctor=${id}`;

  return (
    <>
      <PageHeader
        backTo="/clinic/orders"
        title={t('orderCreate.title')}
        subtitle={t('orderCreate.pickDoctorSubtitle')}
        actions={
          doctors.length >= SEARCH_FROM && (
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('orderCreate.searchDoctor')}
              size="small"
              sx={{ width: { sm: 270 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
          )
        }
      />

      {error && <Alert severity="error">{tc('errors.generic')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : doctors.length === 0 ? (
        <EmptyState
          icon="groups"
          title={t('orderCreate.noDoctors')}
          description={t('orderCreate.noDoctorsHint')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title={t('orderCreate.noMatches')} minHeight={200} />
      ) : (
        <>
          <Callout tone="brand" sx={{ mb: 2 }}>
            {t('orderCreate.pickDoctorHint')}
          </Callout>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {filtered.map((doc) => (
              <DoctorCard
                key={doc.doctor_id}
                doctor={doc}
                to={hrefFor(doc.doctor_id)}
                lastOrderAt={lastOrderByDoctor[doc.doctor_id]}
              />
            ))}
          </Box>
        </>
      )}
    </>
  );
}

/**
 * One doctor, in the same card vocabulary as the lab cards the admin meets on
 * the very next screen — a real link, so the row is middle-clickable and
 * keyboard-reachable without hand-rolled key handling.
 */
function DoctorCard({
  doctor,
  to,
  lastOrderAt,
}: {
  doctor: ClinicDoctorRow;
  to: string;
  lastOrderAt?: string;
}) {
  const { t } = useTranslation('clinic');
  const name = `${doctor.first_name} ${doctor.last_name}`;

  return (
    <Card
      component={RouterLink}
      to={to}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        p: 2.75,
        borderRadius: '18px',
        textDecoration: 'none',
        color: 'text.primary',
        transition: `border-color ${motion.slow}, box-shadow ${motion.slow}`,
        '&:hover, &:focus-visible': {
          borderColor: alpha(brand.main, 0.6),
          boxShadow: `0 12px 32px ${alpha(brand.main, 0.14)}`,
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.625}>
        <InitialsAvatar name={name} size={46} shape="circle" variant="brand" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{ fontSize: '0.96875rem', fontWeight: 800, letterSpacing: '-0.01em' }}
            noWrap
          >
            {name}
          </Typography>
          {doctor.specialty && (
            <Stack direction="row" alignItems="center" spacing={0.625} sx={{ mt: 0.25 }}>
              <Icon name="badge" size={14} sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {doctor.specialty}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.625} sx={{ mt: 1.5, minWidth: 0 }}>
        <Icon name="mail" size={14} sx={{ color: 'text.secondary' }} />
        <Typography variant="body2" color="text.secondary" noWrap>
          {doctor.email}
        </Typography>
      </Stack>

      <Stack
        direction="row"
        alignItems="center"
        sx={{ mt: 'auto', pt: 1.75, borderTop: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={0.625} sx={{ minWidth: 0 }}>
          <Icon name="history" size={15} sx={{ color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {lastOrderAt
              ? t('orderCreate.lastOrder', { date: dayjs(lastOrderAt).format('MMM D, YYYY') })
              : t('orderCreate.noOrdersYet')}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{
            ml: 'auto',
            flexShrink: 0,
            bgcolor: 'primary.main',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 700,
            px: 1.875,
            py: 1,
            borderRadius: '9px',
            transition: `background-color ${motion.base}`,
            '.MuiCard-root:hover &': { bgcolor: 'primary.dark' },
          }}
        >
          {t('orderCreate.orderFor')}
          <Icon name="arrow_forward" size={15} />
        </Stack>
      </Stack>
    </Card>
  );
}
