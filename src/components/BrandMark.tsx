import { Box } from '@mui/material';
import logo from '@/assets/dentallabs-logo.png';

/**
 * The Dentallabs.ge mark, from the brand book's sub-brand set.
 *
 * The brand book ships a vertical lockup — the bag mark above a
 * "Dentallabs.ge" wordmark, on opaque white. Both were wrong for this slot:
 * at the ~30px the sidebar header has, the wordmark renders about eight pixels
 * tall and reads as a smudge, and a white block sits badly on the dark theme.
 * The file in `assets` is therefore the mark alone, on transparency, so it
 * works on both themes and the product name stays beside it as real text —
 * crisp, translatable, and the same string the layouts already pass.
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
