import { Box, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  body?: string;
  action?: ReactNode;
};

/** Soft, generous-whitespace empty state for the orders list. */
export function OrdersEmptyState({ title, body, action }: Props) {
  return (
    <Stack
      alignItems="center"
      sx={{
        py: { xs: 6, md: 9 },
        px: 3,
        textAlign: 'center',
        gap: 1.5,
        borderRadius: 3,
        border: '1px dashed',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background:
            'linear-gradient(135deg, rgba(146,146,255,0.18) 0%, rgba(117,117,242,0.12) 100%)',
          color: 'primary.main',
        }}
        aria-hidden
      >
        <InboxOutlinedIcon fontSize="large" />
      </Box>
      <Typography variant="h6">{title}</Typography>
      {body && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {body}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}
