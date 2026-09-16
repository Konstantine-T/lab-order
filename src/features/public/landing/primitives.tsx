import { alpha, Box, Button, Stack, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Icon } from '@/components/design';
import { brand, lift, radii } from '@/theme/tokens';
import { scrollToAnchor, useLandingTones } from './helpers';

/**
 * Building blocks for the landing page, ported from the Claude Design file
 * `design/Landing Page.dc.html` (Sep 2026).
 *
 * The design is a marketing page and runs a larger type scale than the app —
 * 52px hero, 32px section titles, 15–18px body — so sizes here are explicit
 * rather than the theme's compact variants. Colours still come from the
 * tokens: the page has to read correctly in the dark theme too, which the
 * design (light only) never had to.
 */

/** The design's 1140px column with 28px gutters, narrowing on phones. */
export function Container({
  children,
  maxWidth = 1140,
  sx,
}: {
  children: ReactNode;
  maxWidth?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[{ maxWidth, mx: 'auto', px: { xs: 2.5, sm: 3.5 } }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Box>
  );
}

/** Uppercase grey label above a section title. */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const t = useLandingTones();
  return (
    <Typography
      component="div"
      sx={{
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color ?? t.muted,
      }}
    >
      {children}
    </Typography>
  );
}

/** Section title: the design's 32px / 800 / -0.025em. */
export function SectionTitle({
  children,
  maxWidth,
  align,
  color,
  sx,
}: {
  children: ReactNode;
  maxWidth?: number;
  align?: 'center';
  color?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Typography
      variant="h2"
      component="h2"
      sx={[
        {
          fontSize: { xs: '1.625rem', md: '2rem' },
          lineHeight: 1.18,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          maxWidth,
          textAlign: align,
          color,
          textWrap: 'pretty',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}

/** Section lede: 15.5px secondary text. */
export function Lede({
  children,
  maxWidth,
  align,
  color,
  size = '0.96875rem',
}: {
  children: ReactNode;
  maxWidth?: number;
  align?: 'center';
  color?: string;
  size?: string;
}) {
  return (
    <Typography
      sx={{
        fontSize: size,
        lineHeight: 1.65,
        color: color ?? 'text.secondary',
        maxWidth,
        textAlign: align,
        textWrap: 'pretty',
      }}
    >
      {children}
    </Typography>
  );
}

/** The tinted brand pill used as a section marker ("For doctors & clinics"). */
export function BrandPill({ icon, children }: { icon?: string; children: ReactNode }) {
  const t = useLandingTones();
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        alignItems: 'center',
        gap: 0.875,
        height: 28,
        px: 1.5,
        borderRadius: `${radii.pill}px`,
        bgcolor: t.brandTint.bg,
        color: t.brandTint.fg,
        fontSize: '0.78125rem',
        fontWeight: 700,
      }}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
    </Box>
  );
}

/** Icon + bold title + body, the feature rows in the doctors/labs sections. */
export function FeatureRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Icon name={icon} size={20} sx={{ color: brand.link, mt: 0.25 }} />
      <Box>
        <Typography sx={{ fontSize: '0.96875rem', fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.90625rem', lineHeight: 1.65, color: 'text.secondary' }}>
          {body}
        </Typography>
      </Box>
    </Stack>
  );
}

/** A tick followed by a short claim — the hero's and closing CTA's proof lines. */
export function CheckLine({
  children,
  icon = 'check',
  iconColor,
  color,
  size = '0.8125rem',
}: {
  children: ReactNode;
  icon?: string;
  iconColor?: string;
  color?: string;
  size?: string;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{ fontSize: size, fontWeight: 600, color: color ?? 'text.secondary' }}
    >
      <Icon name={icon} size={icon === 'check_circle' ? 18 : 17} sx={{ color: iconColor ?? brand.link }} />
      <span>{children}</span>
    </Stack>
  );
}

type LinkButtonProps = {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'outlined' | 'soft' | 'ghostDark' | 'onBand';
  size?: 'lg' | 'md' | 'sm';
  endIcon?: string;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
};

/**
 * The design's five link buttons. Internal paths go through the router;
 * anchors and mailto: stay plain links. `primary` carries the brand lift.
 */
export function LinkButton({
  to,
  children,
  variant = 'primary',
  size = 'md',
  endIcon,
  fullWidth,
  sx,
}: LinkButtonProps) {
  const theme = useTheme();
  const t = useLandingTones();
  const external = to.startsWith('#') || to.startsWith('mailto:');
  const pad = { lg: '15px 28px', md: '12px 22px', sm: '9px 14px' }[size];
  const font = { lg: '0.9375rem', md: '0.875rem', sm: '0.8125rem' }[size];

  const looks: Record<NonNullable<LinkButtonProps['variant']>, SxProps<Theme>> = {
    primary: {
      bgcolor: brand.main,
      color: '#fff',
      fontWeight: 700,
      boxShadow: size === 'lg' ? lift.cta : 'none',
      '&:hover': { bgcolor: brand.link, boxShadow: lift.cta },
    },
    outlined: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      fontWeight: 600,
      border: 1,
      borderColor: alpha(theme.palette.text.primary, 0.12),
      '&:hover': { borderColor: brand.main, bgcolor: alpha(brand.main, 0.05) },
    },
    soft: {
      bgcolor: brand.soft,
      color: t.ink,
      fontWeight: 700,
      '&:hover': { bgcolor: brand.soft, filter: 'brightness(1.05)' },
    },
    ghostDark: {
      bgcolor: 'transparent',
      color: t.inkText,
      fontWeight: 600,
      border: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      '&:hover': { borderColor: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.06)' },
    },
    onBand: {
      bgcolor: '#fff',
      color: brand.strong,
      fontWeight: 700,
      '&:hover': { bgcolor: '#fff', filter: 'brightness(0.97)' },
    },
  };

  const shared = {
    fullWidth,
    endIcon: endIcon ? <Icon name={endIcon} size={19} /> : undefined,
    sx: [
      {
        padding: pad,
        fontSize: font,
        borderRadius: `${radii.control}px`,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        textTransform: 'none',
      },
      looks[variant],
      ...(Array.isArray(sx) ? sx : [sx]),
    ] as SxProps<Theme>,
  };

  // Two renders rather than one spread: MUI's `component` overloads type the
  // anchor's onClick and the router link's `to` differently.
  if (external) {
    return (
      <Button
        component="a"
        href={to}
        onClick={to.startsWith('#') ? scrollToAnchor : undefined}
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
