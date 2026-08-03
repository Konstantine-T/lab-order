import { alpha, Box, Card, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { StatusPill } from '@/components/design/StatusPill';
import { brand, motion, radii } from '@/theme/tokens';

/** A lab plus its active services, as the marketplace query returns it. */
export type MarketplaceLab = {
  id: string;
  public_name: string;
  city: string | null;
  short_description: string | null;
  logo_url: string | null;
  created_at?: string | null;
  services?: { name: string; average_turnaround_days: number | null }[];
};

// The mockups give each lab a distinct gradient tile. Picking by name hash
// keeps a given lab's colour stable across renders and sessions.
const GRADIENTS = [
  [brand.main, brand.link],
  ['#EC4899', '#BE185D'],
  ['#10B981', '#047857'],
  ['#0EA5E9', '#0369A1'],
  ['#F59E0B', '#B45309'],
  ['#8A5CF6', '#6D28D9'],
];

const gradientFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h + seed.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();

/** Days-old threshold for the NEW badge. */
const NEW_FOR_DAYS = 30;

export function LabCard({ lab, to }: { lab: MarketplaceLab; to?: string }) {
  const { t } = useTranslation('doctor');
  const target = to ?? `/doctor/labs/${lab.id}`;
  const [from, toColor] = gradientFor(lab.public_name);
  const services = lab.services ?? [];

  // Turnaround is per-service in the schema; the card shows the range across
  // this lab's active services, matching the mockup's single "3-7 days" line.
  const days = services
    .map((s) => s.average_turnaround_days)
    .filter((d): d is number => typeof d === 'number' && d > 0)
    .sort((a, b) => a - b);
  const turnaround =
    days.length === 0
      ? null
      : days[0] === days[days.length - 1]
        ? t('marketplace.days', { count: days[0] })
        : `${days[0]}–${days[days.length - 1]} ${t('marketplace.daysUnit')}`;

  const isNew =
    !!lab.created_at &&
    Date.now() - new Date(lab.created_at).getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

  return (
    <Card
      component={RouterLink}
      to={target}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        p: 2.75,
        borderRadius: '18px',
        textDecoration: 'none',
        color: 'text.primary',
        transition: `border-color ${motion.slow}, box-shadow ${motion.slow}`,
        '&:hover': {
          borderColor: alpha(brand.main, 0.6),
          boxShadow: `0 12px 32px ${alpha(brand.main, 0.14)}`,
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.625}>
        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: '14px',
            flexShrink: 0,
            background: lab.logo_url
              ? `center/cover url(${lab.logo_url})`
              : `linear-gradient(135deg, ${from}, ${toColor})`,
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {!lab.logo_url && initialsOf(lab.public_name)}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              sx={{ fontSize: '0.96875rem', fontWeight: 800, letterSpacing: '-0.01em' }}
              noWrap
            >
              {lab.public_name}
            </Typography>
            {isNew && <StatusPill tone="brand">{t('marketplace.new')}</StatusPill>}
          </Stack>
          {lab.city && (
            <Stack direction="row" alignItems="center" spacing={0.625} sx={{ mt: 0.25 }}>
              <Icon name="location_on" size={14} sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {lab.city}
              </Typography>
            </Stack>
          )}
        </Box>

        {turnaround && (
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography
              sx={{ fontSize: '0.65625rem', fontWeight: 600, color: 'text.secondary' }}
            >
              {t('marketplace.turnaround')}
            </Typography>
            <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }}>{turnaround}</Typography>
          </Box>
        )}
      </Stack>

      {lab.short_description && (
        <Typography
          sx={{
            mt: 1.5,
            fontSize: '0.78125rem',
            lineHeight: 1.55,
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {lab.short_description}
        </Typography>
      )}

      {services.length > 0 && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {services.slice(0, 4).map((s) => (
            <Box
              key={s.name}
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                bgcolor: 'background.default',
                px: 1.375,
                py: 0.5,
                borderRadius: `${radii.pill}px`,
              }}
            >
              {s.name}
            </Box>
          ))}
        </Stack>
      )}

      <Stack
        direction="row"
        alignItems="center"
        sx={{ mt: 'auto', pt: 1.75, borderTop: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={0.625} sx={{ minWidth: 0 }}>
          <Icon name="verified" size={15} sx={{ color: 'success.main' }} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {t('marketplace.servicesCount', { count: services.length })}
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
          {t('marketplace.viewServices')}
          <Icon name="arrow_forward" size={15} />
        </Stack>
      </Stack>
    </Card>
  );
}
