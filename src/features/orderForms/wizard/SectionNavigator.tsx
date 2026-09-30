import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { motion, palette2026, radii, surfaces } from '@/theme/tokens';
import { useSections, useSectionStatuses, type SectionEntry } from './sectionRegistry';
import { isFullyVisible, scrollToSection, stickyChromeHeight } from './scroll';
import { WizLabel } from './ui';

/** How far below the sticky header a section's top counts as "reached". */
const SPY_OFFSET = 96;

/**
 * The left column of the new-order form: every part of the order, in page
 * order, with an aqua dot once it is done and a hollow grey one until then —
 * the redesign's "aqua is done, dashed grey is not yet". The part in view is
 * highlighted, and a click scrolls to it.
 *
 * `railIds` are parts that live in the right rail (due date and send). The
 * rail is pinned beside the form, so those never "scroll into view" and are
 * left out of the highlight; clicking one moves focus into it instead of
 * scrolling when it is already on screen.
 *
 * `progress` builds the sentence under the list from the registered
 * sections — the wizard owns the checks, the registry owns the sections.
 */
export function SectionNavigator({
  top,
  railIds = [],
  progress,
}: {
  top: number;
  railIds?: string[];
  progress: (sections: SectionEntry[]) => string;
}) {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const mode = theme.palette.mode;
  const sections = useSections();
  const status = useSectionStatuses();
  const [active, setActive] = useState<string | null>(null);
  // A clicked item stays highlighted while the smooth scroll it started runs,
  // rather than flickering through every section it passes — or losing out
  // to the last card when the page cannot scroll the clicked one to the top.
  const clickedRef = useRef<{ id: string; until: number } | null>(null);
  const note = progress(sections);

  const spyIds = sections.map((s) => s.id).filter((id) => !railIds.includes(id));
  const spyKey = spyIds.join('|');

  useEffect(() => {
    const ids = spyKey ? spyKey.split('|') : [];
    if (ids.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const clicked = clickedRef.current;
      if (clicked && Date.now() < clicked.until) {
        setActive(clicked.id);
        return;
      }
      clickedRef.current = null;
      const line = stickyChromeHeight() + SPY_OFFSET;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // The last card may be too short to ever reach the line.
      if (atBottom) current = ids[ids.length - 1];
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [spyKey]);

  const go = (id: string) => {
    if (railIds.includes(id)) {
      // Already beside the form: just move the doctor's focus there.
      if (!isFullyVisible(id)) scrollToSection(id);
      const el = document.getElementById(id);
      el?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
      return;
    }
    clickedRef.current = { id, until: Date.now() + 1200 };
    setActive(id);
    scrollToSection(id);
    // Focus follows the view, or the next Tab would carry on down this list
    // and jump the page back. Sections take focus (tabIndex -1) for this.
    document.getElementById(id)?.focus({ preventScroll: true });
  };

  return (
    <Box
      component="nav"
      aria-label={t('orderCreate.nav.title')}
      sx={{
        position: 'sticky',
        top: `${top}px`,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: surfaces[mode].borderSolid,
        borderRadius: `${radii.card}px`,
        p: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      }}
    >
      <WizLabel sx={{ px: 1.25, pt: 0.75, pb: 1.25 }}>{t('orderCreate.nav.title')}</WizLabel>
      {sections.map((s) => {
        const done = status.get(s.id) ?? false;
        const on = s.id === active;
        return (
          <Box
            key={s.id}
            component="a"
            href={`#${s.id}`}
            aria-current={on ? 'location' : undefined}
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              go(s.id);
            }}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.125,
              px: 1.25,
              py: 1,
              borderRadius: '8px',
              fontSize: '0.8125rem',
              lineHeight: 1.4,
              fontWeight: on ? 600 : 500,
              color: on ? 'text.primary' : 'text.secondary',
              bgcolor: on ? surfaces[mode].chip : 'transparent',
              textDecoration: 'none',
              transition: `background-color ${motion.fast}, color ${motion.fast}`,
              '&:hover': { color: 'text.primary' },
              '&:focus-visible': {
                outline: `2px solid ${palette2026.peri}`,
                outlineOffset: -2,
              },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 8,
                height: 8,
                // Centred on the first line of a label that may wrap.
                mt: '5px',
                borderRadius: '50%',
                flexShrink: 0,
                boxSizing: 'border-box',
                border: '1.5px solid',
                borderColor: done ? palette2026.aqua : surfaces[mode].dashed,
                bgcolor: done ? palette2026.aqua : 'transparent',
                transition: `background-color ${motion.base}, border-color ${motion.base}`,
              }}
            />
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {s.label}
              <Box component="span" sx={visuallyHidden}>
                {done ? ` — ${t('orderCreate.nav.doneA11y')}` : ''}
              </Box>
            </Box>
          </Box>
        );
      })}
      {note && (
        <Typography
          aria-live="polite"
          sx={{
            mx: 1.25,
            mt: 1.25,
            mb: 0.5,
            px: 1.5,
            py: 1.25,
            borderRadius: '8px',
            bgcolor: surfaces[mode].subtle,
            fontSize: '0.75rem',
            lineHeight: 1.5,
            color: 'text.secondary',
          }}
        >
          {note}
        </Typography>
      )}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
