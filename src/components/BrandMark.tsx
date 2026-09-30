import { Box, Stack } from '@mui/material';
import logo from '@/assets/dentallabs-logo.png';
import { palette2026 } from '@/theme/tokens';

/**
 * The Dentallabs.ge mark, from the brand book's sub-brand set.
 *
 * The brand book ships a vertical lockup — the bag mark above a
 * "Dentallabs.ge" wordmark, on opaque white. Both were wrong for this slot:
 * at the ~30px the sidebar header has, the wordmark renders about eight pixels
 * tall and reads as a smudge, and a white block sits badly on the dark theme.
 * The file in `assets` is therefore the mark alone, on transparency, so it
 * works on both themes and the product name stays beside it as real text.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Box
      component="img"
      src={logo}
      alt=""
      sx={{ width: size, height: size, flexShrink: 0, objectFit: 'contain', display: 'block' }}
    />
  );
}

/**
 * Mark plus the "Dentallabs.ge" wordmark, as every screen of the 2026-09
 * redesign draws it: periwinkle, with "labs" in aqua.
 *
 * The name is the domain and is never translated. Callers wrap it in their
 * own link — the target differs per shell.
 */
export function BrandWordmark({ size = 30 }: { size?: number }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.125} sx={{ minWidth: 0 }}>
      <BrandMark size={size} />
      <Box
        component="span"
        sx={{
          fontSize: '1.0625rem',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: palette2026.peri,
          whiteSpace: 'nowrap',
        }}
      >
        Dental
        <Box component="span" sx={{ color: palette2026.aqua }}>
          labs
        </Box>
        .ge
      </Box>
    </Stack>
  );
}
