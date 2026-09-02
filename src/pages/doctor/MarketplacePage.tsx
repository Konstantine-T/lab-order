import { useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, InputAdornment, Stack, TextField } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { supabase } from '@/lib/supabase';
import { LabCard, type MarketplaceLab } from '@/components/LabCard';
import { PageHeader } from '@/components/design/PageHeader';
import { Icon } from '@/components/design/Icon';
import { motion, radii } from '@/theme/tokens';

const ALL = '__all__';

/**
 * The lab marketplace. Identical for a doctor and for a clinic admin ordering
 * on a doctor's behalf — the only difference is where a lab card links, and
 * that the clinic carries the acting doctor along in `?doctor=`.
 */
export function MarketplacePage({ basePath = '/doctor' }: { basePath?: string }) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string>(ALL);
  const [params] = useSearchParams();
  const doctorParam = params.get('doctor') ?? '';
  const isClinic = basePath === '/clinic';

  const {
    data: labs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['marketplace-labs'],
    queryFn: async () => {
      // Services come along for the ride: the card shows their names, their
      // count, and the turnaround range derived from them.
      const { data, error } = await supabase
        .from('labs')
        .select(
          'id, public_name, city, short_description, logo_url, created_at, lab_services(name, average_turnaround_days, is_active)',
        )
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .order('public_name');
      if (error) throw error;

      return (data ?? []).map((row) => {
        const { lab_services: svc, ...lab } = row as typeof row & {
          lab_services?: { name: string; average_turnaround_days: number | null; is_active: boolean }[];
        };
        return {
          ...lab,
          services: (svc ?? []).filter((s) => s.is_active),
        } as MarketplaceLab;
      });
    },
  });

  // City chips are built from the data rather than a fixed list, so a lab in a
  // new city appears without a code change.
  const cities = useMemo(() => {
    const seen = new Set<string>();
    labs.forEach((l) => {
      const c = l.city?.trim();
      if (c) seen.add(c);
    });
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [labs]);

  const filtered = labs.filter((l) => {
    if (city !== ALL && l.city?.trim() !== city) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.public_name.toLowerCase().includes(q) ||
      (l.city ?? '').toLowerCase().includes(q) ||
      (l.services ?? []).some((s) => s.name.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <PageHeader
        // The doctor reaches the marketplace from the sidebar, so there is
        // nowhere to go back to; the clinic reaches it mid-flow, one step after
        // choosing the doctor, and needs the way back to that choice.
        backTo={isClinic ? `${basePath}/orders/new` : undefined}
        title={t('marketplace.title')}
        subtitle={t('marketplace.subtitle')}
        chips={
          isClinic && doctorParam ? (
            <ActingDoctorChip doctorId={doctorParam} changeTo={`${basePath}/orders/new`} />
          ) : undefined
        }
        actions={
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('marketplace.search')}
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
        }
      />

      {cities.length > 1 && (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {[ALL, ...cities].map((c) => {
            const selected = city === c;
            return (
              <Box
                key={c}
                role="button"
                tabIndex={0}
                onClick={() => setCity(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setCity(c);
                }}
                sx={{
                  px: 1.875,
                  py: 0.875,
                  borderRadius: `${radii.pill}px`,
                  cursor: 'pointer',
                  fontSize: '0.78125rem',
                  fontWeight: 600,
                  border: 1,
                  transition: `all ${motion.fast}`,
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'primary.main' : 'background.paper',
                  color: selected ? '#fff' : 'text.secondary',
                }}
              >
                {c === ALL ? t('marketplace.allCities') : c}
              </Box>
            );
          })}
        </Stack>
      )}

      {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">{t('marketplace.empty')}</Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          {filtered.map((lab) => (
            <LabCard
              key={lab.id}
              lab={lab}
              to={`${basePath}/labs/${lab.id}${doctorParam ? `?doctor=${doctorParam}` : ''}`}
            />
          ))}
        </Box>
      )}
    </>
  );
}
