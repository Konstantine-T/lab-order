import { useState, type ReactNode } from 'react';
import { Box, useTheme } from '@mui/material';
import { avatarColor, initialsOf, surfaces } from '@/theme/tokens';

/**
 * A lab's logo as the marketplace card draws it (`LabTile` in LabCard): a
 * square tile, the whole image visible (`contain`, a little padding, on the
 * chip surface), and the lab's initials on its name colour when there is no
 * logo or the image fails to load. For the lab's own profile and the admin's
 * review page, so both show what doctors will see.
 */
export function LabLogoTile({
  url,
  name,
  colorSeed,
  size = 72,
  children,
}: {
  url: string | null | undefined;
  /** The name the initials come from. */
  name: string;
  /** What the initials tile is coloured from — the lab's base name, as the card. */
  colorSeed: string;
  size?: number;
  /** Drawn over the tile (a busy spinner). */
  children?: ReactNode;
}) {
  const theme = useTheme();
  // The URL that failed, not a flag: a new logo gets its own chance to load.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showImage = !!url && brokenSrc !== url;

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={url}
          alt=""
          onError={() => setBrokenSrc(url)}
          sx={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            p: `${Math.round(size / 12)}px`,
            bgcolor: surfaces[theme.palette.mode].chip,
          }}
        />
      ) : (
        <Box
          aria-hidden
          sx={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: avatarColor(colorSeed),
            color: 'common.white',
            fontSize: `${Math.round(size / 4)}px`,
            fontWeight: 800,
            letterSpacing: '0.01em',
            userSelect: 'none',
          }}
        >
          {initialsOf(name)}
        </Box>
      )}
      {children}
    </Box>
  );
}
