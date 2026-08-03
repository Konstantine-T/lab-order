import { Box, type SxProps, type Theme } from '@mui/material';
import { avatarColor, brand, initialsOf } from '@/theme/tokens';

/**
 * The initials tile the mockups put in front of every person and organisation:
 * a rounded square in a colour hashed from the name, so the same patient keeps
 * the same tile on every screen.
 *
 * `variant="brand"` is the gradient one used for the signed-in lab or clinic;
 * `shape="circle"` is the smaller one inside table rows.
 */
export function InitialsAvatar({
  name,
  size = 40,
  shape = 'rounded',
  variant = 'hashed',
  sx,
}: {
  name: string;
  size?: number;
  shape?: 'rounded' | 'circle';
  variant?: 'hashed' | 'brand' | 'soft';
  sx?: SxProps<Theme>;
}) {
  const background =
    variant === 'brand'
      ? `linear-gradient(135deg, ${brand.main}, ${brand.link})`
      : variant === 'soft'
        ? brand.soft
        : avatarColor(name);

  return (
    <Box
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: shape === 'circle' ? '50%' : `${Math.round(size * 0.3)}px`,
          background,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.max(9, Math.round(size * 0.3)),
          fontWeight: 800,
          letterSpacing: '0.01em',
          userSelect: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {initialsOf(name)}
    </Box>
  );
}
