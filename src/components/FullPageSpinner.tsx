import { Box, CircularProgress } from '@mui/material';

export function FullPageSpinner() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      <CircularProgress />
    </Box>
  );
}
