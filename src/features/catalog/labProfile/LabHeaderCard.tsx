import { useState, type ReactNode } from 'react';
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { useLabText } from '@/features/lab/labText';
import { pickPriceList, priceListUrl } from '@/features/lab/priceList/priceListApi';
import { initialsOf, surfaces } from '@/theme/tokens';
import { panelSx, rushSummary, turnaroundRange } from './format';
import type { ProfileLab, ProfileService } from './useLabProfile';

/** The lab's logo, or its initials on a soft tile when it has none (or it fails). */
function LogoTile({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const theme = useTheme();
  const s = surfaces[theme.palette.mode];
  const [broken, setBroken] = useState(false);
  const size = { xs: 56, sm: 72 };

  if (logoUrl && !broken) {
    return (
      <Box
        component="img"
        src={logoUrl}
        alt=""
        onError={() => setBroken(true)}
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '18px',
          objectFit: 'cover',
          bgcolor: s.chip,
          border: 1,
          borderColor: 'divider',
        }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '18px',
        bgcolor: s.chip,
        color: s.chipText,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: { xs: '1.0625rem', sm: '1.25rem' },
        userSelect: 'none',
      }}
    >
      {initialsOf(name)}
    </Box>
  );
}

function Fact({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      component="span"
      sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}
    >
      <Icon name={icon} size={15} sx={{ color: (theme) => surfaces[theme.palette.mode].textMuted }} />
      <span>{children}</span>
    </Stack>
  );
}

/**
 * The top card of a lab's profile (design page 4): logo or initials, the
 * name, city · address, the turnaround range and rush across its services,
 * the translated description, and the price-list file when it has one.
 */
export function LabHeaderCard({
  lab,
  services,
}: {
  lab: ProfileLab;
  services: ProfileService[];
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText, lang } = useLabText();

  const name = labText(lab, 'public_name');
  const description = labText(lab, 'short_description');
  const place = [lab.city?.trim(), lab.working_address?.trim()].filter(Boolean).join(' · ');
  const range = turnaroundRange(services);
  const rush = rushSummary(services, tc);
  // The file in the reader's language, else whichever exists (ka → en → ru).
  const priceList = pickPriceList(lab.price_lists, lang);

  const priceListButton = (fullWidth: boolean) =>
    priceList ? (
      <Button
        component="a"
        href={priceListUrl(priceList)}
        target="_blank"
        rel="noopener noreferrer"
        variant="outlined"
        fullWidth={fullWidth}
        startIcon={<Icon name="receipt_long" size={17} />}
        aria-label={t('labProfile.priceListA11y')}
        sx={{ flexShrink: 0 }}
      >
        {t('labProfile.priceList')}
      </Button>
    ) : null;

  return (
    <Box sx={[panelSx, { p: { xs: 2.25, sm: 3.5 } }]}>
      <Stack direction="row" spacing={{ xs: 1.75, sm: 2.25 }} alignItems="flex-start">
        <LogoTile name={name} logoUrl={lab.logo_url} />
        <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '1.375rem', sm: '1.625rem' },
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
              overflowWrap: 'anywhere',
            }}
          >
            {name}
          </Typography>
          {place && (
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {place}
            </Typography>
          )}
          {(range || rush.offered) && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2.75, rowGap: 0.5, pt: 0.5 }}>
              {range && (
                <Fact icon="schedule">
                  {t('labProfile.turnaroundIs', {
                    value:
                      range.min === range.max
                        ? t('marketplace.days', { count: range.max })
                        : t('labProfile.daysRange', { min: range.min, max: range.max }),
                  })}
                </Fact>
              )}
              {rush.offered && (
                <Fact icon="bolt">
                  {rush.surcharge
                    ? t('labProfile.rushIs', { value: rush.surcharge })
                    : t('labProfile.rushAvailable')}
                </Fact>
              )}
            </Stack>
          )}
        </Stack>
        {priceList && (
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{priceListButton(false)}</Box>
        )}
      </Stack>

      {description && (
        <Typography
          sx={{
            mt: 2.75,
            maxWidth: 760,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: 'text.secondary',
            whiteSpace: 'pre-line',
            overflowWrap: 'anywhere',
          }}
        >
          {description}
        </Typography>
      )}

      {priceList && (
        <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 2 }}>{priceListButton(true)}</Box>
      )}
    </Box>
  );
}
