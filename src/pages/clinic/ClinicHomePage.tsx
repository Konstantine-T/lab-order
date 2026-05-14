import { Card, CardContent, Stack, Typography } from '@mui/material';

export function ClinicHomePage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Clinic admin</Typography>
      <Card>
        <CardContent>
          <Typography color="text.secondary">
            Clinic admin features will appear here in Phase 13.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
