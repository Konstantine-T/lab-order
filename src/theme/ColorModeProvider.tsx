import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import type { PaletteMode } from '@mui/material';
import { buildTheme } from './tokens';

type ColorPref = 'light' | 'dark' | 'system';

type ColorModeContextValue = {
  mode: PaletteMode;
  pref: ColorPref;
  toggle: () => void;
  setPref: (m: ColorPref) => void;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

const STORAGE_KEY = 'lab-order:color-mode';

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider');
  return ctx;
}

export function ColorModeProvider({ children }: PropsWithChildren) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [pref, setPrefState] = useState<ColorPref>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });

  const mode: PaletteMode = pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'light' ? '#EEF0F5' : '#1E1F2C');
  }, [mode]);

  const value = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      pref,
      toggle: () => setPrefState(mode === 'light' ? 'dark' : 'light'),
      setPref: setPrefState,
    }),
    [mode, pref],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
