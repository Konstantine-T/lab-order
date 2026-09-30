import { Box, Button, Link, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Icon } from '@/components/design';
import { brand, palette2026, radii, surfaces } from '@/theme/tokens';
import { scrollToAnchor, useLandingTones } from './helpers';

/**
 * Building blocks for the landing page, from the 2026-09 redesign
 * (`page01` desktop, `page02` phone).
 *
 * The design is a marketing page and runs a larger type scale than the app —
 * a 48px headline, 30px section titles, 15–18px body — so sizes here are
 * explicit rather than the theme's compact variants. Colours still come from
 * the tokens: the page has to read correctly in the dark theme too, which the
 * design (light only) never had to.
 */

const asArray = (sx?: SxProps<Theme>) => (Array.isArray(sx) ? sx : [sx]);

/** The design's 1120px column: 40px gutters on desktop, 24px on tablets, 20px on phones. */
export function Container({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        // `width` so it still spans its parent inside a flex column (the
        // menu sheet), where auto margins would otherwise shrink it to fit.
        { width: '100%', maxWidth: 1120 + 2 * 40, mx: 'auto', px: { xs: '20px', sm: '24px', lg: '40px' } },
        ...asArray(sx),
      ]}
    >
      {children}
    </Box>
  );
}

/** Small periwinkle label above a title. Georgian has no case, so the uppercase only shows in en/ru. */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const tones = useLandingTones();
  return (
    <Typography
      component="p"
      sx={{
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color ?? tones.accentText,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * Glue a spaced em dash to the word before it, so a line never starts with
 * "—". Several titles hinge on one ("შეუკვეთე ერთხელ — სწორად"), and
 * `text-wrap: pretty` would otherwise happily carry the dash down with the
 * last word.
 */
const keepDash = (node: ReactNode) => (typeof node === 'string' ? node.replace(/ —/g, ' —') : node);

/** Section title: the design's `.h1`, 24–30px / 700. */
export function SectionTitle({
  children,
  id,
  color,
  sx,
}: {
  children: ReactNode;
  id?: string;
  color?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      variant="h2"
      component="h2"
      id={id}
      sx={[
        {
          fontSize: 'clamp(1.5rem, 2.6vw, 1.875rem)',
          lineHeight: 1.25,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color,
          textWrap: 'pretty',
        },
        ...asArray(sx),
      ]}
    >
      {keepDash(children)}
    </Typography>
  );
}

/** Eyebrow over title, the head of most sections. */
export function SectionHead({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return (
    <Stack sx={{ gap: '10px', maxWidth: 720, minWidth: 0 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionTitle id={id}>{title}</SectionTitle>
    </Stack>
  );
}

const isHash = (to: string) => to.startsWith('#');
const isMail = (to: string) => to.startsWith('mailto:');
const isWeb = (to: string) => /^https?:\/\//.test(to);

/**
 * A periwinkle text link with a trailing arrow — "view the catalogue →".
 * Internal paths go through the router; anchors smooth-scroll.
 */
export function ArrowLink({
  to,
  children,
  small,
}: {
  to: string;
  children: ReactNode;
  small?: boolean;
}) {
  const tones = useLandingTones();
  const sx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    alignSelf: 'flex-start',
    fontSize: small ? '0.8125rem' : '0.9375rem',
    fontWeight: 600,
    color: tones.accentText,
    whiteSpace: 'nowrap',
    '&:hover': { color: tones.accentTextHover },
  } as const;
  const arrow = <Icon name="arrow_forward" size={small ? 15 : 17} />;
  if (isHash(to) || isMail(to) || isWeb(to)) {
    return (
      <Link href={to} onClick={isHash(to) ? scrollToAnchor : undefined} underline="none" sx={sx}>
        {children}
        {arrow}
      </Link>
    );
  }
  return (
    <Link component={RouterLink} to={to} underline="none" sx={sx}>
      {children}
      {arrow}
    </Link>
  );
}

type LinkButtonProps = {
  to: string;
  children: ReactNode;
  /**
   * `primary`  periwinkle — the one "send an order" action per screen.
   * `ink`      the redesign's ordinary primary (the theme's primary colour).
   * `outlined` paper with a control-coloured edge.
   * `white`    for the ink surfaces: the labs card and the footer.
   */
  variant?: 'primary' | 'ink' | 'outlined' | 'white';
  /** `lg` 54px tall (the hero), `md` 48px, `sm` 40px (the nav; 36px on phones). */
  size?: 'lg' | 'md' | 'sm';
  sx?: SxProps<Theme>;
};

/**
 * The design's buttons, as links. Internal paths go through the router;
 * anchors smooth-scroll; mailto: and other sites stay plain links (the latter
 * in a new tab).
 */
export function LinkButton({ to, children, variant = 'ink', size = 'md', sx }: LinkButtonProps) {
  const tones = useLandingTones();

  // Heights are minimums: on a narrow phone a long Georgian label may wrap
  // to a second line rather than push the button past the screen edge.
  const geometry = {
    lg: { minHeight: 54, px: { xs: '18px', sm: '26px' }, fontSize: '1rem' },
    md: { minHeight: 48, px: { xs: '16px', sm: '22px' }, fontSize: '0.9375rem' },
    sm: {
      minHeight: { xs: 36, sm: 40 },
      px: { xs: '14px', sm: '18px' },
      fontSize: { xs: '0.8125rem', sm: '0.875rem' },
    },
  }[size];

  const looks: Record<NonNullable<LinkButtonProps['variant']>, SxProps<Theme>> = {
    primary: {
      bgcolor: palette2026.peri,
      color: '#fff',
      // The design sets its periwinkle button a size up and bolder.
      ...(size !== 'sm' && { fontSize: { xs: '1rem', sm: '1.0625rem' }, fontWeight: 700 }),
      '&:hover': { bgcolor: brand.strong },
    },
    ink: {
      bgcolor: 'primary.main',
      color: 'primary.contrastText',
      '&:hover': { bgcolor: 'primary.light' },
    },
    outlined: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      border: 1,
      borderColor: tones.control,
      '&:hover': { bgcolor: 'background.paper', borderColor: 'text.primary' },
    },
    white: {
      bgcolor: '#fff',
      color: palette2026.ink,
      border: 1,
      borderColor: '#fff',
      '&:hover': { bgcolor: surfaces.light.chip, borderColor: surfaces.light.chip },
    },
  };

  const shared = {
    disableElevation: true,
    sx: [
      {
        ...geometry,
        py: '4px',
        minWidth: 0,
        borderRadius: `${radii.tile}px`,
        fontWeight: 600,
        lineHeight: 1.2,
        textAlign: 'center',
        whiteSpace: { xs: 'normal', sm: 'nowrap' },
        textTransform: 'none',
        '&.Mui-focusVisible': { outline: `2px solid ${tones.accent}`, outlineOffset: '3px' },
      },
      looks[variant],
      ...asArray(sx),
    ] as SxProps<Theme>,
  };

  // Two renders rather than one spread: MUI's `component` overloads type the
  // anchor's onClick and the router link's `to` differently.
  if (isHash(to) || isMail(to) || isWeb(to)) {
    return (
      <Button
        component="a"
        href={to}
        onClick={isHash(to) ? scrollToAnchor : undefined}
        {...(isWeb(to) && { target: '_blank', rel: 'noopener noreferrer' })}
        {...shared}
      >
        {children}
      </Button>
    );
  }
  return (
    <Button component={RouterLink} to={to} {...shared}>
      {children}
    </Button>
  );
}
