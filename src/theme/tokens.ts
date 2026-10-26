import { alpha, createTheme, type PaletteMode } from '@mui/material';

// Design tokens from the September 2026 "Redesign & Growth" bundle.
//
// Everything below is exported raw as well as baked into the MUI theme, so a
// one-off `sx` can reach for `tone('warning', mode).bg` instead of pasting a hex
// and drifting off-system.
//
// The redesign's colour story, which the rest of this file encodes:
//   ink       — the primary action and anything selected (buttons, the chosen
//               segment of a toggle, the picked material). Not periwinkle.
//   periwinkle — the brand: links, focus, the logo.
//   aqua      — done / confirmed, and nothing else: finished steps, a confirmed
//               price or date, the selected teeth. Dashed grey is "not yet".
//   gold      — waiting on you.

const INK = '#20263D';
const INK_2 = '#2B3357';
const INK_LINE = '#3A4160';
const INK_TEXT = '#C9D1F5';
const INK_MUTED = '#8A93B8';

const PERI = '#7987F7';
const PERI_HOVER = '#6B79EE';
const PERI_L = '#90A0FD';
// Periwinkle dark enough for small text on white/mist (5.1:1 / 4.8:1 — AA).
// #7987F7 itself is 3.2:1: fine for large type, icons and fills, not captions.
const PERI_TEXT = '#5563D6';

const AQUA = '#44C9F6';
const AQUA_SOFT = '#E6F7FE';
const AQUA_TEXT = '#0B6B8A';

const GOLD = '#FBCD56';
const GOLD_SOFT = '#FFF4D6';
const GOLD_TEXT = '#7A5A00';

const MIST = '#F7F9FF'; // page ground
const HAIR = '#E6EAF5'; // dividers
const BORDER = '#E3E7F3'; // card edges
const CTRL = '#D9DEF0'; // input and control edges
const CHIP = '#EEF1FB';
const CHIP_TEXT = '#3F4A6B';
const DASHED = '#C9D0EA'; // not-yet-done
const SEC = '#5B6478';
const MUTED = '#9AA3BD';

// Dark mode v2: graphite ground, softened text, half-chroma accents.
// Exported for the few dark-only branches outside the theme.
export const DARK = {
  ground: '#18191E',
  surface: '#1F2026',
  raised: '#282A31',
  line: '#373941',
  dashed: '#52555E',
  text: '#D4D5DB',
  text2: '#B0B2BA',
  muted: '#8E909A',
  peri: '#9BA3DA',
  periLight: '#ACB4E4',
  periDark: '#828AC6',
  periText: '#B4BBE5',
  onPrimary: '#181A24',
  aqua: '#7EBCD1',
  aquaText: '#9DCDDE',
  gold: '#D5BA82',
  goldText: '#E0C896',
  rose: '#CE7E84',
  roseText: '#E3A0A4',
} as const;

// The names the rest of the codebase already reads. BRAND is the periwinkle
// accent, not the primary colour — primary is ink now.
const BRAND = PERI;
const BRAND_STRONG = PERI_HOVER; // active nav, links on tint
const BRAND_LINK = PERI_HOVER; // hover / link
const BRAND_SOFT = PERI_L; // avatars; primary on dark

/** Corner radii, in px. */
export const radii = {
  pill: 999,
  control: 9,
  card: 12,
  tile: 10,
  chipSm: 7,
} as const;

/** The only three durations the mockups use. */
export const motion = {
  fast: '120ms ease',
  base: '140ms ease',
  slow: '160ms ease',
} as const;

/**
 * Page geometry from the mockups. The content column is centred at
 * `contentMax`, and `gutter` is the horizontal padding either side of it — in
 * theme spacing units, so `PageHeader` can negate it exactly to bleed its
 * translucent band to the edge of the main column.
 */
export const layout = {
  sidebarWidth: 224,
  contentMax: 1080,
  /** The top-nav shells' column (doctor, clinic, public): the mockups' 1200px
   *  of content plus `gutter` either side at `md`. */
  wideMax: 1256,
  gutter: { xs: 2, sm: 3, md: 3.5 },
  gutterNeg: { xs: -2, sm: -3, md: -3.5 },
  /** Height of the mobile top bar; sticky elements offset by it below `md`. */
  mobileBar: 56,
  /** Height of the doctor/clinic bottom tab bar below `md`, before the
   *  safe-area inset. Anything pinned to the bottom reads
   *  `--bottom-nav-height` rather than this, since the other shells have none. */
  tabBar: 64,
  /** What a sticky right rail clears: the page header band. */
  railTop: 76,
  railWidth: 316,
} as const;

/** Hover lift for interactive cards, straight from the mockups. */
export const lift = {
  card: `0 8px 24px ${alpha(INK, 0.07)}`,
  cardStrong: `0 10px 28px ${alpha(INK, 0.09)}`,
  cta: `0 6px 16px ${alpha(INK, 0.22)}`,
} as const;

/**
 * The row-avatar palette. Colour is picked by hashing a name so a given
 * patient keeps the same tile everywhere, as in the mockups.
 */
export const AVATAR_COLORS = [
  '#8A5CF6',
  '#6E6EE8',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#0EA5E9',
] as const;

export const avatarColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash += seed.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export const initialsOf = (text: string, max = 2) =>
  text
    .trim()
    .split(/\s+/)
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '·';

/** Brand focus ring — border colour plus glow. */
export const focusRing = {
  borderColor: BRAND,
  boxShadow: `0 0 0 3px ${alpha(BRAND, 0.18)}`,
} as const;

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

type ToneStyle = { fg: string; bg: string; border: string; dot: string };

const LIGHT_TONES: Record<Tone, ToneStyle> = {
  brand: { fg: PERI_HOVER, bg: alpha(PERI, 0.12), border: alpha(PERI, 0.35), dot: PERI },
  // Aqua is "done / confirmed" in the redesign — there is no green in it.
  success: { fg: AQUA_TEXT, bg: AQUA_SOFT, border: alpha(AQUA, 0.4), dot: AQUA },
  // Gold is "waiting on you".
  warning: { fg: GOLD_TEXT, bg: GOLD_SOFT, border: alpha(GOLD, 0.6), dot: GOLD },
  // The design has no red. Errors, overdue and unpaid still need one.
  danger: { fg: '#C2334D', bg: '#FDECEF', border: 'rgba(194,51,77,0.22)', dot: '#E0485F' },
  // Handed over / in someone else's hands. Kept off aqua so aqua stays "done".
  info: { fg: '#3D4BB8', bg: '#EEF0FF', border: alpha(PERI, 0.3), dot: PERI },
  neutral: { fg: SEC, bg: CHIP, border: BORDER, dot: MUTED },
};

// Dark tones follow the pattern the mockups' dark surfaces establish: a light
// foreground on a ~12% fill with a ~30% border.
const DARK_TONES: Record<Tone, ToneStyle> = {
  brand:   { fg: DARK.periText, bg: alpha(DARK.peri, 0.12), border: alpha(DARK.peri, 0.28), dot: DARK.peri },
  success: { fg: DARK.aquaText, bg: alpha(DARK.aqua, 0.11), border: alpha(DARK.aqua, 0.26), dot: DARK.aqua },
  warning: { fg: DARK.goldText, bg: alpha(DARK.gold, 0.11), border: alpha(DARK.gold, 0.26), dot: DARK.gold },
  danger:  { fg: DARK.roseText, bg: alpha(DARK.rose, 0.12), border: alpha(DARK.rose, 0.28), dot: DARK.rose },
  info:    { fg: DARK.periText, bg: alpha(DARK.peri, 0.10), border: alpha(DARK.peri, 0.24), dot: DARK.periLight },
  neutral: { fg: DARK.text2, bg: DARK.raised, border: DARK.line, dot: DARK.muted },
};

/** Tinted status colours — the fill/text pairing behind pills and alert rows. */
export const tone = (name: Tone, mode: PaletteMode): ToneStyle =>
  (mode === 'light' ? LIGHT_TONES : DARK_TONES)[name];

/**
 * The mark a changed tooth gets on a chart in the lab's edit review: a wide,
 * soft halo in the warning colour round the tooth, a darker line on its
 * outline and a dot of that line colour, so it reads on white, on the dark
 * paper and on every material fill. The legend under the chart uses the same.
 */
export const changedToothRing = (mode: PaletteMode): { band: string; line: string } => {
  const warn = tone('warning', mode);
  return { band: alpha(warn.dot, mode === 'dark' ? 0.6 : 0.65), line: warn.fg };
};

/** Surfaces and text that MUI's palette has no slot for. */
export const surfaces = {
  light: {
    subtle: MIST,
    borderSolid: BORDER,
    textMuted: MUTED,
    sidebar: '#FFFFFF',
    chip: CHIP,
    chipText: CHIP_TEXT,
    control: CTRL,
    dashed: DASHED,
  },
  dark: {
    subtle: 'rgba(255,255,255,0.03)',
    borderSolid: DARK.line,
    textMuted: DARK.muted,
    sidebar: DARK.surface,
    chip: DARK.raised,
    chipText: DARK.text2,
    control: DARK.line,
    dashed: DARK.dashed,
  },
} as const;

export const brand = {
  main: BRAND,
  strong: BRAND_STRONG,
  link: BRAND_LINK,
  soft: BRAND_SOFT,
} as const;

/** The redesign's named colours, for the few places a tone doesn't fit. */
export const palette2026 = {
  ink: INK,
  ink2: INK_2,
  // Text and lines on the landing's ink bands (the labs card, the footer),
  // which are ink in both themes; not the dark theme's surfaces.
  inkText: INK_TEXT,
  inkMuted: INK_MUTED,
  inkLine: INK_LINE,
  peri: PERI,
  periText: PERI_TEXT,
  aqua: AQUA,
  aquaSoft: AQUA_SOFT,
  aquaText: AQUA_TEXT,
  gold: GOLD,
  goldSoft: GOLD_SOFT,
  goldText: GOLD_TEXT,
} as const;

const tokens = (mode: PaletteMode) => {
  const light = mode === 'light';
  const divider = light ? HAIR : DARK.line;

  return {
    palette: {
      mode,
      // Ink, not periwinkle: the redesign draws every primary action and every
      // selected control in ink. On dark, ink would vanish into the ground, so
      // primary lifts to the soft periwinkle there.
      primary: {
        main: light ? INK : DARK.peri,
        light: light ? INK_2 : DARK.periLight,
        dark: light ? '#151A2C' : DARK.periDark,
        contrastText: light ? '#FFFFFF' : DARK.onPrimary,
      },
      // Periwinkle as a palette slot, so `color="secondary"` reaches the brand.
      secondary: { main: light ? PERI : DARK.peri, contrastText: light ? '#FFFFFF' : DARK.onPrimary },
      error: { main: light ? '#E0485F' : DARK.roseText },
      warning: { main: light ? GOLD : DARK.gold, contrastText: light ? GOLD_TEXT : DARK.onPrimary },
      success: { main: light ? AQUA : DARK.aqua, contrastText: light ? AQUA_TEXT : DARK.onPrimary },
      info: { main: light ? PERI : DARK.peri },
      background: light
        ? { default: MIST, paper: '#FFFFFF' }
        : // Dark mode v2: a graphite ground with cards one step lighter.
          { default: DARK.ground, paper: DARK.surface },
      text: light
        ? { primary: INK, secondary: SEC, disabled: DASHED }
        : { primary: DARK.text, secondary: DARK.text2, disabled: DARK.dashed },
      divider,
      action: {
        hover: light ? alpha(INK, 0.045) : alpha(DARK.peri, 0.07),
        selected: light ? alpha(PERI, 0.12) : alpha(DARK.peri, 0.14),
        focus: alpha(light ? PERI : DARK.peri, 0.22),
      },
    },

    // Compact scale from the mockups: 17px page titles, 13.5px nav, 12-13px
    // body. Sizes are rem so browser font-size settings still apply.
    typography: {
      // The redesign sets Latin in Noto Sans Georgian too, so order codes and
      // prices share the Georgian text's letterforms rather than switching face
      // mid-line. Inter stays as the fallback for any glyph Noto lacks.
      fontFamily:
        '"Noto Sans Georgian", "Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
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
              boxShadow: light
                ? `0 6px 16px ${alpha(INK, 0.2)}`
                : `0 6px 16px ${alpha('#000000', 0.35)}`,
            },
          },
          // Only primary gets a fixed hover colour. This used to sit on
          // `contained`, which forced every contained button — an error-red
          // "discard", say — to periwinkle on hover.
          containedPrimary: {
            '&:hover': { backgroundColor: light ? INK_2 : DARK.periLight },
          },
          // The redesign's secondary action: white, a control-coloured hairline,
          // ink text; the edge turns periwinkle on hover.
          outlined: {
            backgroundColor: light ? '#FFFFFF' : alpha('#FFFFFF', 0.03),
            borderColor: light ? CTRL : DARK.line,
            color: light ? INK : DARK.text,
            '&:hover': {
              borderColor: light ? BRAND : DARK.peri,
              backgroundColor: alpha(light ? BRAND : DARK.peri, light ? 0.04 : 0.08),
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
            backgroundColor: light ? '#FFFFFF' : DARK.ground,
            transition: `border-color ${motion.base}, box-shadow ${motion.base}`,
            // The design's control edge, a touch stronger than a card's.
            '& fieldset': { borderColor: light ? CTRL : DARK.line },
            '&:hover fieldset': { borderColor: alpha(light ? BRAND : DARK.peri, 0.5) },
            // The mockups' focus treatment: brand border plus a soft ring,
            // rather than MUI's default border thickening.
            '&.Mui-focused': {
              boxShadow: light ? focusRing.boxShadow : `0 0 0 3px ${alpha(DARK.peri, 0.2)}`,
            },
            '&.Mui-focused fieldset': { borderWidth: 1, borderColor: light ? BRAND : DARK.peri },
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
            backgroundColor: light ? alpha(BRAND, 0.08) : alpha(DARK.peri, 0.12),
            color: light ? '#3B3BAE' : DARK.periText,
            '& .MuiAlert-icon': { color: light ? BRAND : DARK.peri },
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
            backgroundColor: light ? INK : DARK.raised,
          },
        },
      },

      MuiDivider: { styleOverrides: { root: { borderColor: divider } } },

      // The mockups' modal: an 18-radius sheet with a deep shadow, an 800-weight
      // title and generous but not airy padding.
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 18,
            boxShadow: light
              ? '0 24px 60px rgba(15, 23, 42, 0.3)'
              : '0 24px 60px rgba(0, 0, 0, 0.55)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '1rem',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            padding: '24px 26px 8px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: '0 26px 8px' } },
      },
      MuiDialogContentText: {
        styleOverrides: { root: { fontSize: '0.8125rem', lineHeight: 1.55 } },
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: '14px 26px 22px', gap: 8 } },
      },

      MuiLink: {
        defaultProps: { underline: 'hover' as const },
        styleOverrides: {
          root: {
            color: light ? BRAND_LINK : DARK.periLight,
            fontWeight: 600,
            transition: `color ${motion.fast}`,
            '&:hover': { color: light ? BRAND_STRONG : DARK.periText },
          },
        },
      },

      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${divider}`,
          },
          option: { fontSize: '0.8125rem', borderRadius: 8, margin: '2px 6px' },
        },
      },

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
      // A bottom-anchored toast clears the doctor/clinic tab bar on phones.
      // The variable is set by that shell only, so everywhere else this is
      // MUI's own 8px / 24px.
      MuiSnackbar: {
        styleOverrides: {
          anchorOriginBottomCenter: {
            bottom: 'calc(var(--bottom-nav-height, 0px) + 8px)',
            '@media (min-width: 600px)': { bottom: 'calc(var(--bottom-nav-height, 0px) + 24px)' },
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
                '& + .MuiSwitch-track': { opacity: 1, backgroundColor: light ? BRAND : DARK.peri },
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
