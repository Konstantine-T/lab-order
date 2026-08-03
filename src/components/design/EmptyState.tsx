import { alpha, Box, Stack, Typography } from '@mui/material';
import type { DragEvent, ReactNode } from 'react';
import { Icon } from '@/components/design/Icon';
import { brand, motion, radii } from '@/theme/tokens';

/**
 * The dashed "nothing here yet" panel — the mockups' add-a-service tile and
 * the empty list state, which are the same object at different sizes.
 */
export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  onClick,
  minHeight = 200,
}: {
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Makes the whole panel the button — the "Add a service" tile. */
  onClick?: () => void;
  minHeight?: number;
}) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick } : {})}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        minHeight,
        px: 3,
        py: 3.5,
        textAlign: 'center',
        border: '1.5px dashed',
        borderColor: alpha(brand.main, 0.5),
        borderRadius: '18px',
        transition: `background-color ${motion.slow}`,
        ...(onClick && {
          cursor: 'pointer',
          '&:hover': { bgcolor: alpha(brand.main, 0.05) },
        }),
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha(brand.main, 0.13),
        }}
      >
        <Icon name={icon} size={23} sx={{ color: 'primary.dark' }} />
      </Box>
      <Typography sx={{ fontSize: '0.84375rem', fontWeight: 700 }}>{title}</Typography>
      {description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: 300, lineHeight: 1.5 }}
        >
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 0.5 }}>{action}</Box>}
    </Stack>
  );
}

/**
 * The dashed brand dropzone from the wizard's Files section. Kept separate
 * from `EmptyState` because it owns drag state and a 14px radius.
 */
export function DropZone({
  title,
  hint,
  active,
  disabled,
  children,
  ...handlers
}: {
  title: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) {
  return (
    <Stack
      alignItems="center"
      spacing={0.75}
      {...handlers}
      sx={{
        px: 3,
        py: 3.25,
        borderRadius: '14px',
        border: '1.5px dashed',
        borderColor: alpha(brand.main, active ? 0.9 : 0.55),
        bgcolor: alpha(brand.main, active ? 0.09 : 0.04),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: `all ${motion.slow}`,
        '&:hover': disabled ? {} : { bgcolor: alpha(brand.main, 0.09) },
      }}
    >
      <Icon name="cloud_upload" size={30} sx={{ color: 'primary.main' }} />
      <Typography sx={{ fontSize: '0.84375rem', fontWeight: 600 }}>{title}</Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      )}
      {children}
    </Stack>
  );
}

/**
 * The file capsule the mockups repeat on the wizard, the order detail and the
 * lab's order sheet: a type icon, name, size and an optional trailing action.
 */
export function FileChip({
  icon = 'draft',
  name,
  size,
  action,
  onClick,
}: {
  icon?: string;
  name: ReactNode;
  size?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick } : {})}
      sx={{
        px: 1.5,
        py: 1,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.control}px`,
        bgcolor: 'background.default',
        maxWidth: '100%',
        ...(onClick && { cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }),
      }}
    >
      <Icon name={icon} size={17} sx={{ color: 'primary.dark', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        {size && (
          <Typography sx={{ fontSize: '0.65625rem', color: 'text.secondary' }} noWrap>
            {size}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
