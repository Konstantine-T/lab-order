import { alpha, createTheme, type PaletteMode } from '@mui/material';

// Brand color — soft lavender. The same hex anchors light & dark modes; in
// dark we lift it slightly for legibility on dark surfaces.
const BRAND = '#9292FF';

const tokens = (mode: PaletteMode) => ({
  palette: {
    mode,
    primary: {
      main: mode === 'light' ? BRAND : '#B4B4FF',
      light: mode === 'light' ? '#B4B4FF' : '#D0D0FF',
      dark: mode === 'light' ? '#6E6EE8' : '#8A8AF5',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: mode === 'light' ? '#0F172A' : '#E2E8F0',
    },
    error: { main: mode === 'light' ? '#DC2626' : '#F87171' },
    warning: { main: mode === 'light' ? '#D97706' : '#FBBF24' },
    success: { main: mode === 'light' ? '#16A34A' : '#4ADE80' },
    info: { main: mode === 'light' ? '#0284C7' : '#7DD3FC' },
    background:
      mode === 'light'
        ? // Slightly grayer page bg gives content surfaces presence without
          // looking washed out.
          { default: '#EEF0F5', paper: '#FFFFFF' }
        : // Eye-relaxing dark: lifted off pure black, warm purple-grey.
          { default: '#1E1F2C', paper: '#2A2B3D' },
    text:
      mode === 'light'
        ? { primary: '#0F172A', secondary: '#5B6477', disabled: '#CBD5E1' }
        : { primary: '#E5E7F0', secondary: '#A1A6BD', disabled: '#5C6175' },
    divider:
      mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.1)',
    action: {
      hover: mode === 'light' ? alpha(BRAND, 0.06) : alpha('#B4B4FF', 0.08),
      selected: mode === 'light' ? alpha(BRAND, 0.1) : alpha('#B4B4FF', 0.14),
      focus: alpha(BRAND, 0.2),
    },
  },
  typography: {
    fontFamily:
      'Inter, "Noto Sans Georgian", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 },
    h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h3: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.3 },
    h4: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    subtitle1: { fontSize: '0.95rem', fontWeight: 500, lineHeight: 1.5 },
    subtitle2: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: '0.95rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    button: { textTransform: 'none' as const, fontWeight: 600, letterSpacing: '0.005em' },
    caption: { fontSize: '0.8125rem', lineHeight: 1.4, letterSpacing: '0.01em' },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
    },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        },
        '*': { boxSizing: 'border-box' as const },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          background: mode === 'light' ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.12)',
          borderRadius: 8,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: mode === 'light' ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.2)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' as const },
      styleOverrides: {
        root: {
          borderRadius: 16,
          borderColor:
            mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)',
          transition: 'border-color 160ms ease, box-shadow 200ms ease',
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          '& .MuiCardActionArea-focusHighlight': { borderRadius: 16 },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: false },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 18px',
          fontWeight: 600,
          textTransform: 'none' as const,
          transition:
            'background-color 160ms ease, border-color 160ms ease, box-shadow 200ms ease, transform 120ms ease',
          '&:active': { transform: 'scale(0.98)' },
        },
        sizeSmall: { padding: '6px 14px', fontSize: '0.85rem' },
        sizeLarge: { padding: '11px 22px', fontSize: '0.95rem' },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow:
              mode === 'light'
                ? '0 6px 14px rgba(146, 146, 255, 0.28)'
                : '0 6px 14px rgba(146, 146, 255, 0.18)',
          },
        },
        outlined: {
          borderColor:
            mode === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.16)',
          '&:hover': {
            borderColor: 'currentColor',
            backgroundColor: alpha(BRAND, mode === 'light' ? 0.04 : 0.08),
          },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(BRAND, mode === 'light' ? 0.06 : 0.1),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: 'background-color 160ms ease, color 160ms ease',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
          letterSpacing: '0.01em',
          fontSize: '0.78rem',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none' as const,
          fontWeight: 600,
          minHeight: 44,
          fontSize: '0.92rem',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 3,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: mode === 'light' ? '#FFFFFF' : alpha('#FFFFFF', 0.02),
          '& fieldset': {
            borderColor:
              mode === 'light' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.14)',
          },
          '&:hover fieldset': {
            borderColor: alpha(BRAND, 0.5),
          },
          '&.Mui-focused fieldset': {
            borderWidth: 1.5,
          },
        },
        input: { padding: '10px 14px' },
        inputSizeSmall: { padding: '8px 12px' },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: { marginLeft: 4, fontSize: '0.78rem' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, fontSize: '0.9rem' },
        standardInfo: {
          backgroundColor: alpha(BRAND, mode === 'light' ? 0.08 : 0.14),
          color: mode === 'light' ? '#3B3BAE' : '#D0D0FF',
          '& .MuiAlert-icon': { color: mode === 'light' ? BRAND : '#B4B4FF' },
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
          backgroundColor: mode === 'light' ? '#0F172A' : '#1F1F38',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor:
            mode === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border:
            mode === 'light'
              ? '1px solid rgba(15, 23, 42, 0.08)'
              : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow:
            mode === 'light'
              ? '0 4px 16px rgba(15, 23, 42, 0.08), 0 12px 32px rgba(15, 23, 42, 0.06)'
              : '0 8px 24px rgba(0, 0, 0, 0.32)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 6px',
          fontSize: '0.9rem',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
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
            // Default (off) state — white thumb on a soft grey track.
            '& .MuiSwitch-thumb': {
              width: 20,
              height: 20,
              backgroundColor: '#FFFFFF',
              boxShadow:
                '0 1px 3px rgba(15, 23, 42, 0.2), 0 1px 1px rgba(15, 23, 42, 0.06)',
            },
            // Checked: track turns brand, thumb stays white so it never
            // blends into the track. Slightly stronger drop-shadow for lift.
            '&.Mui-checked': {
              transform: 'translateX(18px)',
              '& + .MuiSwitch-track': {
                opacity: 1,
                backgroundColor: BRAND,
              },
              '& .MuiSwitch-thumb': {
                backgroundColor: '#FFFFFF',
                boxShadow:
                  '0 2px 6px rgba(15, 23, 42, 0.22), 0 1px 1px rgba(15, 23, 42, 0.08)',
              },
            },
            '&.Mui-disabled': {
              '& .MuiSwitch-thumb': {
                backgroundColor: '#F1F5F9',
                boxShadow: 'none',
              },
            },
          },
          '& .MuiSwitch-track': {
            borderRadius: 999,
            opacity: 1,
            backgroundColor:
              mode === 'light' ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.22)',
            transition: 'background-color 200ms ease',
          },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
  },
});

export const buildTheme = (mode: PaletteMode) => createTheme(tokens(mode));
