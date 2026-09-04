import { useState } from 'react';
import { alpha, Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Icon } from '@/components/design';
import { serviceImageUrl, templateLook } from '@/utils/serviceDefaults';
import { lift, motion } from '@/theme/tokens';

/**
 * The service tile from the Lab Services mockup, shared by the lab's own
 * service list and the public lab profile a doctor orders from: a tinted icon
 * square (or the service's cover picture), the service name, a description,
 * a row of fact chips and a footer with one action.
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
        px: 2.75,
        py: 2.5,
        borderRadius: '18px',
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
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        {image ? (
          // The lab's own picture earns the tile; the template icon is only a
          // stand-in for services that never uploaded one.
          <Box
            component="img"
            src={image}
            alt=""
            onError={() => setImageBroken(true)}
            sx={{
              width: 42,
              height: 42,
              flexShrink: 0,
              borderRadius: '12px',
              objectFit: 'cover',
              border: 1,
              borderColor: 'divider',
            }}
          />
        ) : (
          <Box
            sx={{
              width: 42,
              height: 42,
              flexShrink: 0,
              borderRadius: '12px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: alpha(look.color, 0.12),
            }}
          >
            <Icon name={look.icon} size={21} sx={{ color: look.color }} />
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
            {name}
          </Typography>
        </Box>
        {headerAction && <Box onClick={(e) => e.stopPropagation()}>{headerAction}</Box>}
      </Stack>

      {description && (
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mt: 1.25, lineHeight: 1.55 }}
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
    </Stack>
  );
}
