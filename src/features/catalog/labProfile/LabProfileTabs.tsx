import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { alpha, Box, useMediaQuery, useTheme } from '@mui/material';
import { layout, palette2026, DARK, surfaces } from '@/theme/tokens';
import { jumpToSection, SECTION } from './format';

/** Clear space kept between the tabs and the section the page has reached. */
const SPY_GAP = 24;

export type LabProfileTab = { id: string; label: string; count?: number };

/**
 * Which section the page has scrolled to: the last one whose top has passed
 * under the tabs. A clicked tab holds until the reader next scrolls by hand, so
 * it stays lit through the smooth scroll instead of flickering across the tabs
 * it passes — and so does "About" on a wide screen, where that card sits in the
 * rail and never reaches the line (it is left out of the spy there).
 */
function useActiveSection(tabs: LabProfileTab[], railBeside: boolean) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const held = useRef<string | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const spied = tabs.map((t) => t.id).filter((id) => !(railBeside && id === SECTION.about));
  const spiedKey = spied.join();

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (held.current) return;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + SPY_GAP;
      let current = spied[0] ?? '';
      for (const id of spied) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const release = () => {
      held.current = null;
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', release);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
    };
    // `spied` is rebuilt every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spiedKey]);

  const hold = (id: string) => {
    held.current = id;
    setActive(id);
  };
  return { active, hold, bar };
}

/**
 * The band of section tabs under the lab's header (lab.html): sticks to the top
 * of the window, bleeds to the edges of the column, and scrolls sideways when
 * the labels outgrow a phone.
 */
export function LabProfileTabs({ tabs, label }: { tabs: LabProfileTab[]; label: string }) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const railBeside = useMediaQuery(theme.breakpoints.up('lg'));
  const { active, hold, bar } = useActiveSection(tabs, railBeside);

  return (
    <Box
      ref={bar}
      component="nav"
      aria-label={label}
      sx={{
        position: 'sticky',
        // What PageHeader sticks under: the mobile top bar, where a shell has one.
        top: {
          xs: `var(--page-header-top, ${layout.mobileBar}px)`,
          md: 'var(--page-header-top, 0px)',
        },
        zIndex: 40,
        mx: layout.gutterNeg,
        px: layout.gutter,
        bgcolor: alpha(theme.palette.background.default, 0.88),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Box
              key={tab.id}
              component="a"
              href={`#${tab.id}`}
              aria-current={on ? 'true' : undefined}
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                hold(tab.id);
                jumpToSection(tab.id);
              }}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                flexShrink: 0,
                height: { xs: 44, sm: 48 },
                px: { xs: 1.25, sm: 1.5 },
                mb: '-1px',
                fontSize: { xs: '0.875rem', sm: '0.90625rem' },
                fontWeight: 700,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                color: on ? 'text.primary' : 'text.secondary',
                borderBottom: '2px solid',
                borderColor: on ? (mode === 'light' ? palette2026.periText : DARK.peri) : 'transparent',
                '&:hover': { color: 'text.primary' },
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <Box
                  component="b"
                  sx={{ fontSize: '0.78125rem', fontWeight: 700, color: surfaces[mode].textMuted }}
                >
                  {tab.count}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
