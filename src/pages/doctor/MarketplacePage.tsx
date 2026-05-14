import { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { LabCard } from '@/components/LabCard';
import type { LabRow } from '@/types/database';

export function MarketplacePage() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const [search, setSearch] = useState('');

  const { data: labs = [], isLoading, error } = useQuery({
    queryKey: ['marketplace-labs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name, city, short_description, logo_url')
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .order('public_name');
      if (error) throw error;
      return data as Pick<LabRow, 'id' | 'public_name' | 'city' | 'short_description' | 'logo_url'>[];
    },
  });

  const filtered = search
    ? labs.filter(
        (l) =>
          l.public_name.toLowerCase().includes(search.toLowerCase()) ||
          (l.city ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : labs;

  return (
    <Stack spacing={3}>
      <Stack>
        <Typography variant="h4">{t('marketplace.title')}</Typography>
        <Typography color="text.secondary">{t('marketplace.subtitle')}</Typography>
      </Stack>

      <TextField
        label={t('marketplace.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ maxWidth: 480 }}
      />

      {error && <Alert severity="error">{tc('errors.loadFailed')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">{t('marketplace.empty')}</Alert>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((lab) => (
            <Grid key={lab.id} item xs={12} sm={6} md={4} lg={3}>
              <LabCard lab={lab} />
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
