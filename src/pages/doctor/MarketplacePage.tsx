import { useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, InputAdornment, Stack, TextField } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { catalogPaths } from '@/features/public/publicRoutes';
import { supabase } from '@/lib/supabase';
import { SERVICE_PRICE_EMBED, servicePrice, type ServicePriceEmbed } from '@/features/catalog/servicePrice';
import { LabCard, type MarketplaceLab } from '@/components/LabCard';
import { labNames, useLabText } from '@/features/lab/labText';
import { PageHeader } from '@/components/design/PageHeader';
import { Icon } from '@/components/design/Icon';
import { motion, radii } from '@/theme/tokens';

const ALL = '__all__';

/**
 * The lab marketplace. Identical for a doctor, for a clinic admin ordering on
 * a doctor's behalf, and for a guest with no account — the only difference is
 * where a lab card links, and that the clinic carries the acting doctor along
 * in `?doctor=`. Nothing here needs a session: the query runs under the
 * `labs_marketplace_read` policy, which admits `anon`.
 */
export function MarketplacePage({
  basePath = '/doctor',
  guest = false,
}: {
  basePath?: string;
  guest?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText, lang } = useLabText();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string>(ALL);
  const [params] = useSearchParams();
  const doctorParam = params.get('doctor') ?? '';
  const isClinic = !guest && basePath === '/clinic';
  const paths = catalogPaths(guest, basePath);

  const {
    data: labs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['marketplace-labs'],
    queryFn: async () => {
      // Services come along for the ride: the card shows their names, their
      // "from" prices, their count, and the turnaround range derived from them.
      const { data, error } = await supabase
        .from('labs')
        .select(
          `id, public_name, city, short_description, logo_url, created_at,
           public_translations, price_lists,
           lab_services(name, average_turnaround_days, is_active, ${SERVICE_PRICE_EMBED})`,
        )
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .order('public_name');
      if (error) throw error;

      return (data ?? []).map((row) => {
        const { lab_services: svc, ...lab } = row as unknown as Omit<MarketplaceLab, 'services'> & {
          lab_services?: (ServicePriceEmbed & {
            name: string;
            average_turnaround_days: number | null;
            is_active: boolean;
          })[];
        };
        return {
          ...lab,
          services: (svc ?? [])
            .filter((s) => s.is_active)
            .map((s) => ({
              name: s.name,
              average_turnaround_days: s.average_turnaround_days,
              from: servicePrice(s),
            })),
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

  // The server sorts by the base name; a lab shown under its translated name
  // is re-sorted here so the list reads alphabetically in the reader's language.
  const sorted = useMemo(
    () =>
      [...labs].sort((a, b) =>
        labText(a, 'public_name').localeCompare(labText(b, 'public_name'), lang),
      ),
    [labs, labText, lang],
  );

  const filtered = sorted.filter((l) => {
    if (city !== ALL && l.city?.trim() !== city) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      // Every name the lab goes by, so a doctor typing the Russian name finds
      // the lab whatever language the page is in.
      labNames(l).some((n) => n.toLowerCase().includes(q)) ||
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
              to={`${paths.lab(lab.id)}${doctorParam ? `?doctor=${doctorParam}` : ''}`}
            />
          ))}
        </Box>
      )}
    </>
  );
}
