import { useMemo, useState } from 'react';
import { Box, CircularProgress, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { EmptyState, Icon, InitialsAvatar, PageHeader, SectionCard } from '@/components/design';
import type { PatientRow } from '@/types/database';

type PatientWithCount = PatientRow & {
  orders: { count: number }[];
};

export function PatientsPage() {
  const { t } = useTranslation('doctor');
  const { user } = useAuth();
  const doctorId = user?.doctor_profile?.id;
  const navigate = useNavigate();

  const [search, setSearch] = useState('');

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['doctor-patients', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*, orders(count)')
        .eq('doctor_id', doctorId!)
        .order('last_name')
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as unknown as PatientWithCount[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.trim().toLowerCase();
    return patients.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
  }, [patients, search]);

  return (
    <>
      <PageHeader
        title={t('patients.title')}
        subtitle={t('patients.subtitle')}
        actions={
          patients.length > 0 ? (
            <TextField
              placeholder={t('patients.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ width: { sm: 260 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon name="search" size={18} sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
          ) : undefined
        }
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : patients.length === 0 ? (
        <EmptyState icon="groups" title={t('patients.empty')} minHeight={240} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search_off" title={t('patients.noResults')} minHeight={200} />
      ) : (
        <SectionCard dense>
          {filtered.map((p, i) => {
            const orderCount = p.orders?.[0]?.count ?? 0;
            const name = `${p.first_name} ${p.last_name}`;
            return (
              <Stack
                key={p.id}
                direction="row"
                alignItems="center"
                spacing={1.5}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/doctor/patients/${p.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/doctor/patients/${p.id}`);
                }}
                sx={{
                  px: 3,
                  py: 1.625,
                  cursor: 'pointer',
                  borderTop: i === 0 ? 0 : 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <InitialsAvatar name={name} size={36} shape="circle" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }} noWrap>
                    {name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {orderCount > 0
                      ? t('patients.orders', { count: orderCount })
                      : t('patients.noOrders')}
                  </Typography>
                </Box>
                {p.date_of_birth && (
                  <Typography variant="caption" color="text.secondary">
                    {p.date_of_birth}
                  </Typography>
                )}
                <Icon name="chevron_right" size={17} sx={{ color: 'text.disabled' }} />
              </Stack>
            );
          })}
        </SectionCard>
      )}
    </>
  );
}
