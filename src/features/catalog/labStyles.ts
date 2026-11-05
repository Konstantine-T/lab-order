import { alpha, type PaletteMode } from '@mui/material';
import { DARK, labCardMotion, palette2026, radii } from '@/theme/tokens';

/*
 * The styles the catalogue's lab card and the lab's profile share, both drawn
 * from the same mockups (labs.html, lab.html). Their shared components are in
 * `labDesign.tsx`.
 */

/** Days-old threshold for the NEW badge. */
const NEW_FOR_DAYS = 30;

export function isNewLab(createdAt: string | null | undefined): boolean {
  return !!createdAt && Date.now() - new Date(createdAt).getTime() < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}

/** The mockups' pill action, in the accent they draw every primary action with. */
export function pillActionSx(mode: PaletteMode) {
  const color = mode === 'light' ? palette2026.periText : DARK.peri;
  const glow = `0 8px 20px ${alpha(color, 0.35)}`;
  return {
    py: 0,
    borderRadius: `${radii.pill}px`,
    whiteSpace: 'nowrap',
    bgcolor: color,
    boxShadow: glow,
    '&:hover': { bgcolor: color, boxShadow: glow, transform: 'translateY(-1px)' },
  } as const;
}

/** The secondary action beside it: the same pill, on the theme's outline. */
export const pillOutlineSx = {
  py: 0,
  borderRadius: `${radii.pill}px`,
  whiteSpace: 'nowrap',
  fontWeight: 700,
} as const;

/** The mockups' three action sizes. */
export const pillSize = {
  sm: { minHeight: 36, px: 1.75, fontSize: '0.84375rem' },
  md: { minHeight: 44, px: 2.25, fontSize: '0.90625rem' },
  lg: { minHeight: 52, px: 2.25, fontSize: '1rem' },
} as const;

/** What `useCardTilt` drives: the tilt itself and the sheen following the pointer. */
export const tiltSurfaceSx = {
  transform: 'perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
  transition: `transform ${labCardMotion.tilt}, box-shadow ${labCardMotion.tilt}`,
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    zIndex: 3,
    borderRadius: 'inherit',
    pointerEvents: 'none',
    opacity: 0,
    transition: 'opacity 300ms',
    background:
      'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,.22), transparent 60%)',
    mixBlendMode: 'soft-light',
  },
  '&[data-lit]::after': { opacity: 1 },
  '@media (prefers-reduced-motion: reduce)': { transform: 'none' },
} as const;
