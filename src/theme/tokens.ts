import { alpha, createTheme, type PaletteMode } from '@mui/material';

// Design tokens extracted from the July 2026 redesign mockups.
// See docs/superpowers/specs/2026-07-29-design-foundation-design.md.
//
// Everything below is exported raw as well as baked into the MUI theme, so a
// one-off `sx` can reach for `tone('warning', mode).bg` instead of pasting a hex
// and drifting off-system.

const BRAND = '#9292FF';
const BRAND_STRONG = '#5252CC'; // active nav, links on tint
const BRAND_LINK = '#6E6EE8'; // hover / link
const BRAND_SOFT = '#B4B4FF'; // avatars; primary on dark

/** Corner radii, in px. */
export const radii = {
  pill: 999,
  control: 10,
  card: 16,
  tile: 11,
  chipSm: 8,
} as const;

/** The only three durations the mockups use. */
export const motion = {
  fast: '120ms ease',
  base: '140ms ease',
  slow: '160ms ease',
} as const;

/** Brand focus ring — border colour plus glow. */
export const focusRing = {
  borderColor: BRAND,
  boxShadow: `0 0 0 3px ${alpha(BRAND, 0.18)}`,
} as const;

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

type ToneStyle = { fg: string; bg: string; border: string };

const LIGHT_TONES: Record<Tone, ToneStyle> = {
  brand: { fg: BRAND_STRONG, bg: alpha(BRAND, 0.12), border: alpha(BRAND, 0.25) },
  success: { fg: '#15803D', bg: '#E3F4E8', border: 'rgba(22,163,74,0.25)' },
  warning: { fg: '#B45309', bg: '#FEF3E2', border: 'rgba(180,83,9,0.25)' },
  danger: { fg: '#DC2626', bg: '#FDEAEA', border: 'rgba(220,38,38,0.22)' },
  neutral: { fg: '#5B6477', bg: '#FBFBFD', border: 'rgba(15,23,42,0.08)' },
};

// Dark tones follow the pattern the mockups' dark surfaces establish: a light
// foreground on a ~12% fill with a ~30% border.
const DARK_TONES: Record<Tone, ToneStyle> = {
  brand: { fg: BRAND_SOFT, bg: alpha(BRAND, 0.15), border: alpha(BRAND, 0.35) },
  success: { fg: '#4ADE80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)' },
  warning: { fg: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  danger: { fg: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  neutral: { fg: '#A1A6BD', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)' },
};

/** Tinted status colours — the fill/text pairing behind pills and alert rows. */
export const tone = (name: Tone, mode: PaletteMode): ToneStyle =>
  (mode === 'light' ? LIGHT_TONES : DARK_TONES)[name];

/** Surfaces and text that MUI's palette has no slot for. */
export const surfaces = {
  light: {
    subtle: '#FBFBFD',
    borderSolid: '#E2E5EE',
    textMuted: '#8A91A5',
    sidebar: '#FFFFFF',
  },
  dark: {
    subtle: 'rgba(255,255,255,0.03)',
    borderSolid: 'rgba(255,255,255,0.12)',
    textMuted: '#5C6175',
    sidebar: '#1E2036',
  },
} as const;

export const brand = {
  main: BRAND,
  strong: BRAND_STRONG,
  link: BRAND_LINK,
  soft: BRAND_SOFT,
} as const;

const tokens = (mode: PaletteMode) => {
  const light = mode === 'light';
  const divider = light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.09)';

  return {
    palette: {
      mode,
      primary: {
        main: light ? BRAND : BRAND_SOFT,
        light: light ? BRAND_SOFT : '#D0D0FF',
        dark: light ? BRAND_LINK : '#8A8AF5',
        contrastText: '#FFFFFF',
      },
      secondary: { main: light ? '#0F172A' : '#E2E8F0' },
      error: { main: light ? '#DC2626' : '#F87171' },
      warning: { main: light ? '#F59E0B' : '#FBBF24' },
      success: { main: light ? '#16A34A' : '#4ADE80' },
      info: { main: light ? '#0284C7' : '#7DD3FC' },
      background: light
        ? { default: '#EEF0F5', paper: '#FFFFFF' }
        : // Sourced from the mockups' own dark surfaces (screens index, the
          // Telegram card); paper is lifted off default so cards separate.
          { default: '#151628', paper: '#1E2036' },
      text: light
        ? { primary: '#0F172A', secondary: '#5B6477', disabled: '#CBD5E1' }
        : { primary: '#F1F2FA', secondary: '#A1A6BD', disabled: '#5C6175' },
      divider,
      action: {
        hover: alpha(light ? BRAND : BRAND_SOFT, light ? 0.07 : 0.08),
        selected: alpha(light ? BRAND : BRAND_SOFT, light ? 0.13 : 0.16),
        focus: alpha(BRAND, 0.2),
      },
    },

    // Compact scale from the mockups: 17px page titles, 13.5px nav, 12-13px
    // body. Sizes are rem so browser font-size settings still apply.
    typography: {
      fontFamily:
        '"Inter Variable", Inter, "Noto Sans Georgian", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      h1: { fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15 },
      h2: { fontSize: '1.625rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2 },
      h3: { fontSize: '1.3125rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.25 },
      h4: { fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.3 },
      h5: { fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.4 },
      h6: { fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.45 },
      subtitle1: { fontSize: '0.84375rem', fontWeight: 600, lineHeight: 1.45 },
      subtitle2: { fontSize: '0.78125rem', fontWeight: 600, lineHeight: 1.45 },
      body1: { fontSize: '0.8125rem', lineHeight: 1.55 },
      body2: { fontSize: '0.75rem', lineHeight: 1.5 },
      caption: { fontSize: '0.71875rem', fontWeight: 500, lineHeight: 1.4 },
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        lineHeight: 1.4,
      },
      button: { textTransform: 'none' as const, fontWeight: 600, fontSize: '0.8125rem' },
    },

    shape: { borderRadius: radii.control },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          '*': { boxSizing: 'border-box' as const },
          '::selection': {
            background: alpha(BRAND, 0.22),
          },
          // Material Symbols Rounded — the mockups' icon set. `Icon` sets FILL
          // per instance; everything else is fixed here.
          '.material-symbols-rounded': {
            fontFamily: '"Material Symbols Rounded"',
            fontWeight: 'normal',
            fontStyle: 'normal',
            lineHeight: 1,
            letterSpacing: 'normal',
            textTransform: 'none' as const,
            display: 'inline-block',
            whiteSpace: 'nowrap' as const,
            wordWrap: 'normal' as const,
            direction: 'ltr' as const,
            WebkitFontFeatureSettings: "'liga'",
            WebkitFontSmoothing: 'antialiased',
            userSelect: 'none' as const,
            flexShrink: 0,
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            background: light ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.12)',
            borderRadius: 8,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: light ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.2)',
          },
        },
      },

      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },

      MuiCard: {
        defaultProps: { variant: 'outlined' as const },
        styleOverrides: {
          root: {
            borderRadius: radii.card,
            borderColor: divider,
            transition: `border-color ${motion.slow}, box-shadow ${motion.slow}`,
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: {
          root: {
            borderRadius: radii.card,
            '& .MuiCardActionArea-focusHighlight': { borderRadius: radii.card },
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radii.control,
            padding: '10px 18px',
            fontWeight: 600,
            textTransform: 'none' as const,
            transition: `background-color ${motion.base}, border-color ${motion.base}, box-shadow ${motion.slow}, transform ${motion.fast}`,
            '&:active': { transform: 'scale(0.98)' },
          },
          sizeSmall: { padding: '7px 14px', fontSize: '0.75rem' },
          sizeLarge: { padding: '12px 22px', fontSize: '0.875rem' },
          contained: {
            fontWeight: 700,
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: light ? BRAND_LINK : BRAND_SOFT,
              boxShadow: `0 8px 20px ${alpha(BRAND, light ? 0.45 : 0.25)}`,
            },
          },
          // The mockups' secondary action: a white button with a hairline
          // border that turns brand on hover.
          outlined: {
            backgroundColor: light ? '#FFFFFF' : alpha('#FFFFFF', 0.03),
            borderColor: light ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.16)',
            color: light ? '#0F172A' : '#F1F2FA',
            '&:hover': {
              borderColor: BRAND,
              backgroundColor: alpha(BRAND, light ? 0.04 : 0.08),
            },
          },
          text: {
            '&:hover': { backgroundColor: alpha(BRAND, light ? 0.06 : 0.1) },
          },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: radii.control,
            transition: `background-color ${motion.base}, color ${motion.base}`,
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radii.pill,
            fontWeight: 700,
            letterSpacing: '0.005em',
            fontSize: '0.71875rem',
          },
          sizeSmall: { height: 24, fontSize: '0.6875rem' },
          labelSmall: { paddingInline: 11 },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none' as const,
            fontWeight: 600,
            minHeight: 42,
            fontSize: '0.8125rem',
          },
        },
      },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radii.control,
            fontSize: '0.8125rem',
            backgroundColor: light ? '#FFFFFF' : alpha('#FFFFFF', 0.02),
            transition: `border-color ${motion.base}, box-shadow ${motion.base}`,
            '& fieldset': {
              borderColor: light ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.14)',
            },
            '&:hover fieldset': { borderColor: alpha(BRAND, 0.5) },
            // The mockups' focus treatment: brand border plus a soft ring,
            // rather than MUI's default border thickening.
            '&.Mui-focused': { boxShadow: focusRing.boxShadow },
            '&.Mui-focused fieldset': { borderWidth: 1, borderColor: BRAND },
          },
          input: { padding: '10px 13px' },
          inputSizeSmall: { padding: '8px 12px' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontWeight: 500, fontSize: '0.8125rem' } } },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 4, fontSize: '0.71875rem' } } },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: radii.tile, fontSize: '0.8125rem' },
          standardInfo: {
            backgroundColor: alpha(BRAND, light ? 0.08 : 0.14),
            color: light ? '#3B3BAE' : '#D0D0FF',
            '& .MuiAlert-icon': { color: light ? BRAND : BRAND_SOFT },
          },
        },
      },

      MuiTooltip: {
        defaultProps: { arrow: false },
        styleOverrides: {
          tooltip: {
            fontSize: 12,
            fontWeight: 500,
            paddingInline: 10,
            paddingBlock: 6,
            borderRadius: 8,
            backgroundColor: light ? '#0F172A' : '#1F1F38',
          },
        },
      },

      MuiDivider: { styleOverrides: { root: { borderColor: divider } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: radii.card } } },

      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${divider}`,
            boxShadow: light
              ? '0 4px 16px rgba(15, 23, 42, 0.08), 0 12px 32px rgba(15, 23, 42, 0.06)'
              : '0 8px 24px rgba(0, 0, 0, 0.32)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: { root: { borderRadius: 8, margin: '2px 6px', fontSize: '0.8125rem' } },
      },

      // Sidebar nav geometry from the mockups.
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radii.control,
            padding: '9px 12px',
            fontSize: '0.84375rem',
            transition: `background-color ${motion.fast}, color ${motion.fast}`,
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: {
            width: 42,
            height: 24,
            padding: 0,
            overflow: 'visible',
            '& .MuiSwitch-switchBase': {
              padding: 2,
              transitionDuration: '200ms',
              '& .MuiSwitch-thumb': {
                width: 20,
                height: 20,
                backgroundColor: '#FFFFFF',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.2), 0 1px 1px rgba(15, 23, 42, 0.06)',
              },
              '&.Mui-checked': {
                transform: 'translateX(18px)',
                '& + .MuiSwitch-track': { opacity: 1, backgroundColor: BRAND },
                '& .MuiSwitch-thumb': {
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.22), 0 1px 1px rgba(15, 23, 42, 0.08)',
                },
              },
              '&.Mui-disabled': {
                '& .MuiSwitch-thumb': { backgroundColor: '#F1F5F9', boxShadow: 'none' },
              },
            },
            '& .MuiSwitch-track': {
              borderRadius: radii.pill,
              opacity: 1,
              backgroundColor: light ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.22)',
              transition: 'background-color 200ms ease',
            },
          },
        },
      },

      MuiCheckbox: { styleOverrides: { root: { borderRadius: 6 } } },
    },
  };
};

export const buildTheme = (mode: PaletteMode) => createTheme(tokens(mode));
