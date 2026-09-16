import { Box, Stack, Typography, useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { brand, lift, radii } from '@/theme/tokens';
import { CheckLine } from './primitives';
import { useLandingTones } from './helpers';

/**
 * The hero's "who talks to whom" card: Clinic ↔ Doctor ↔ Laboratory, with the
 * doctor in the middle because every order is theirs, and the two exchanges
 * labelled in both directions.
 *
 * The design ships two layouts and switches at 1000px — a row with arrows
 * between the three parties, or a column with the arrows turned vertical. The
 * same breakpoint is kept here rather than the theme's `md`/`lg`: at 900px
 * the row already crushes the labels, and at 1200px the column is wasting
 * width the row fits in comfortably.
 */
export function FlowCard() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const wide = useMediaQuery('(min-width:1000px)');

  const clinic = { icon: 'apartment', title: t('flow.clinic.title'), body: t('flow.clinic.body') };
  const doctor = { icon: 'stethoscope', title: t('flow.doctor.title'), body: t('flow.doctor.body') };
  const lab = { icon: 'science', title: t('flow.lab.title'), body: t('flow.lab.body') };

  return (
    <Box
      sx={{
        width: '100%',
        mt: 4,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.card}px`,
        p: { xs: 2.5, sm: '36px 24px' },
        boxShadow: '0 24px 60px rgba(15,23,42,0.08)',
      }}
    >
      {wide ? (
        <Stack direction="row" alignItems="stretch" justifyContent="center">
          <Party {...clinic} />
          <Exchange
            forward={t('flow.clinicToDoctor')}
            back={t('flow.doctorToClinic')}
            color="text.secondary"
          />
          <Party {...doctor} primary />
          <Exchange
            forward={t('flow.doctorToLab')}
            back={t('flow.labToDoctor')}
            color={tones.brandTint.fg}
          />
          <Party {...lab} />
        </Stack>
      ) : (
        <Stack alignItems="stretch">
          <Party {...clinic} narrow />
          <ExchangeVertical
            down={t('flow.clinicToDoctor')}
            up={t('flow.doctorToClinic')}
            color="text.secondary"
          />
          <Party {...doctor} primary narrow />
          <ExchangeVertical
            down={t('flow.doctorToLab')}
            up={t('flow.labToDoctor')}
            color={tones.brandTint.fg}
          />
          <Party {...lab} narrow />
        </Stack>
      )}

      {/* What the arrangement buys, in three ticks under the diagram. */}
      <Stack
        direction="row"
        justifyContent="center"
        sx={{ flexWrap: 'wrap', gap: { xs: 1.5, sm: 4.5 }, mt: 4.25, pt: 2.75, borderTop: 1, borderColor: 'divider' }}
      >
        <CheckLine icon="check_circle" size="0.78125rem">{t('flow.proofs.phone')}</CheckLine>
        <CheckLine icon="check_circle" size="0.78125rem">{t('flow.proofs.record')}</CheckLine>
        <CheckLine icon="check_circle" size="0.78125rem">{t('flow.proofs.invoice')}</CheckLine>
      </Stack>
    </Box>
  );
}

function Party({
  icon,
  title,
  body,
  primary,
  narrow,
}: {
  icon: string;
  title: string;
  body: string;
  /** The doctor: filled brand disc, brand border, a lift. */
  primary?: boolean;
  narrow?: boolean;
}) {
  const tones = useLandingTones();
  const disc = primary ? (narrow ? 60 : 64) : narrow ? 52 : 56;
  return (
    <Stack
      alignItems="center"
      spacing={narrow ? 1.25 : 1.5}
      sx={{
        flex: narrow ? undefined : primary ? '1 1 210px' : '1 1 190px',
        minWidth: 0,
        maxWidth: narrow ? undefined : primary ? 270 : 250,
        p: narrow ? '22px 16px' : primary ? '28px 18px' : '24px 16px',
        borderRadius: `${radii.card}px`,
        border: 1,
        borderColor: primary ? tones.brandTint.border : 'divider',
        bgcolor: primary ? 'background.paper' : tones.subtle,
        boxShadow: primary ? lift.cardStrong : 'none',
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: disc,
          height: disc,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          ...(primary
            ? { bgcolor: brand.main, color: '#fff', boxShadow: lift.cta }
            : {
                bgcolor: tones.brandTint.bg,
                border: 1,
                borderColor: tones.brandTint.border,
                color: tones.brandTint.fg,
              }),
        }}
      >
        <Icon name={icon} size={primary ? 31 : 27} />
      </Box>
      <Typography sx={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.015em' }}>
        {title}
      </Typography>
      <Typography
        sx={{ fontSize: narrow ? '0.84375rem' : '0.78125rem', lineHeight: 1.55, color: 'text.secondary' }}
      >
        {body}
      </Typography>
    </Stack>
  );
}

/** Two labelled arrows between neighbouring parties, one each way. */
function Exchange({ forward, back, color }: { forward: string; back: string; color: string }) {
  const line = (dir: 'right' | 'left') => (
    <Box
      sx={{
        flex: '1 1 0',
        // A string on purpose: MUI reads a bare `height: 1` as 100%, which
        // turned these hairlines into bars the full height of the row.
        height: '1px',
        background: `linear-gradient(${dir === 'right' ? 90 : 270}deg, rgba(146,146,255,0.25), rgba(146,146,255,0.7))`,
      }}
    />
  );
  const label = (text: string) => (
    <Typography
      sx={{ fontSize: '0.71875rem', fontWeight: 600, color, textAlign: 'center', textWrap: 'pretty' }}
    >
      {text}
    </Typography>
  );
  return (
    <Stack justifyContent="center" spacing={1.75} sx={{ flex: '1 1 110px', minWidth: 0, p: '12px 10px' }}>
      <Stack alignItems="center" spacing={0.875}>
        {label(forward)}
        <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
          {line('right')}
          <Icon name="chevron_right" size={17} sx={{ color: brand.main, ml: -0.5 }} />
        </Stack>
      </Stack>
      <Stack alignItems="center" spacing={0.875}>
        <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
          <Icon name="chevron_left" size={17} sx={{ color: brand.main, mr: -0.5 }} />
          {line('left')}
        </Stack>
        {label(back)}
      </Stack>
    </Stack>
  );
}

function ExchangeVertical({ down, up, color }: { down: string; up: string; color: string }) {
  const row = (icon: string, text: string) => (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ fontSize: '0.8125rem', fontWeight: 600, color }}>
      <Icon name={icon} size={17} sx={{ color: brand.main }} />
      <span>{text}</span>
    </Stack>
  );
  return (
    <Stack alignItems="center" spacing={0.875} sx={{ py: 2 }}>
      {row('south', down)}
      {row('north', up)}
    </Stack>
  );
}
