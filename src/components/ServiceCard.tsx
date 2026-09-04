import { useState } from 'react';
import { alpha, Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design';
import { serviceImageUrl, templateLook } from '@/utils/serviceDefaults';
import { lift, motion, radii } from '@/theme/tokens';

/**
 * The service tile, shared by the lab's own service list and the public lab
 * profile a doctor orders from: a cover photo, the service name, a
 * description, a row of fact chips and a footer with one action.
 *
 * The picture leads. It used to be a 42px square beside the name, which made
 * the per-service upload nearly pointless — a crown and a denture are told
 * apart by how they look, and at 42px they don't. A service with no upload
 * keeps the tinted template icon, at the same size, so the grid stays even.
 *
 * `templateCode` looks like a leftover now that the template name is gone, but
 * it still picks the icon and its colour, and supplies the stock cover image
 * for a service the lab never uploaded one for.
 */
export function ServiceCard({
  templateCode,
  imageUrl,
  name,
  description,
  chips,
  meta,
  action,
  headerAction,
  onClick,
  disabled,
}: {
  templateCode?: string | null;
  /** The lab's uploaded cover, shown in place of the template icon. */
  imageUrl?: string | null;
  name: ReactNode;
  description?: ReactNode;
  /** Fact capsules — turnaround, pricing model, form status. */
  chips?: ReactNode;
  /** Muted footer text at the left of the action. */
  meta?: ReactNode;
  action?: ReactNode;
  /** Control at the top right — the lab's active toggle. */
  headerAction?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const look = templateLook(templateCode);
  // The lab's own upload wins; otherwise the template's stock picture, which
  // has been sitting unused in the service-defaults bucket all along.
  //
  // Not every template code actually has a file behind it, and a URL that 404s
  // renders as an empty box — worse than the icon it replaced. Fall back to the
  // icon the moment the browser tells us the image didn't load.
  const [imageBroken, setImageBroken] = useState(false);
  const resolved = serviceImageUrl(imageUrl, templateCode);
  const image = imageBroken ? null : resolved;

  return (
    <Stack
      {...(onClick && !disabled ? { role: 'button', tabIndex: 0, onClick } : {})}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter') onClick();
            }
          : undefined
      }
      sx={{
        height: '100%',
        borderRadius: '18px',
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        opacity: disabled ? 0.65 : 1,
        transition: `all ${motion.slow}`,
        ...(onClick &&
          !disabled && {
            cursor: 'pointer',
            '&:hover': {
              borderColor: alpha(look.color, 0.5),
              boxShadow: lift.cardStrong,
            },
          }),
      }}
    >
      {/* A fixed height, not a ratio: a ratio ties the picture to the column
          width, and at two columns that made a 340px image with a name
          underneath it. This is a banner at any column count, and a portrait
          upload and a landscape one still produce the same tile. */}
      <Box
        sx={{
          position: 'relative',
          height: 168,
          flexShrink: 0,
          bgcolor: alpha(look.color, 0.12),
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {image ? (
          // The lab's own picture earns the tile; the template icon is only a
          // stand-in for services that never uploaded one.
          <Box
            component="img"
            src={image}
            alt=""
            onError={() => setImageBroken(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Icon name={look.icon} size={40} sx={{ color: look.color }} />
          </Box>
        )}
        {headerAction && (
          // Over the photo, where the reference puts its badge. The plate is
          // what keeps a switch readable on a dark crown and a white denture
          // alike.
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              borderRadius: `${radii.pill}px`,
              bgcolor: 'background.paper',
              boxShadow: lift.card,
              px: 1,
              py: 0.25,
            }}
          >
            {headerAction}
          </Box>
        )}
      </Box>

      <Box sx={{ px: 2.75, pt: 2, pb: 2.5, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
          {name}
        </Typography>

      {description && (
        <Typography
          variant="body1"
          color="text.secondary"
          // Clamped, not truncated to a character count: three lines is what
          // the tile has room for at every width, and the full text is one
          // click away on the order screen. A long description setting the
          // height for every other card is the thing being fixed.
          sx={{
            mt: 1.25,
            lineHeight: 1.55,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }}
        >
          {description}
        </Typography>
      )}

      {chips && (
        <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {chips}
        </Stack>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {(meta || action) && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ mt: 1.75, pt: 1.625, borderTop: 1, borderColor: 'divider' }}
        >
          {meta && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {meta}
            </Typography>
          )}
          {action && (
            <Box sx={{ ml: 'auto' }} onClick={(e) => e.stopPropagation()}>
              {action}
            </Box>
          )}
        </Stack>
      )}
      </Box>
    </Stack>
  );
}
