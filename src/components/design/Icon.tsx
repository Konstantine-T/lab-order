import { Box, type SxProps, type Theme } from '@mui/material';

/**
 * Material Symbols Rounded — the icon set the redesign mockups use.
 *
 * The font is self-hosted (`material-symbols/rounded.css`, imported in
 * `main.tsx`) and the shared base styles live in the `.material-symbols-rounded`
 * rule in `theme/tokens.ts`. Application code should use this rather than
 * importing from `@mui/icons-material`; MUI keeps using its own icons
 * internally for Select arrows, Dialog close buttons and the DataGrid.
 *
 * `filled` matches the mockups' convention: the active nav item is filled, the
 * rest are outlined.
 */
export function Icon({
  name,
  size = 20,
  filled = false,
  color,
  sx,
}: {
  /** Material Symbols ligature name, e.g. `receipt_long`. */
  name: string;
  size?: number;
  filled?: boolean;
  color?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      component="span"
      className="material-symbols-rounded"
      aria-hidden
      sx={[
        {
          fontSize: size,
          width: size,
          height: size,
          color,
          fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {name}
    </Box>
  );
}
