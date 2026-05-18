import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
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
    return patients.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q),
    );
  }, [patients, search]);

  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={600}>
        {t('patients.title')}
      </Typography>

      {!isLoading && patients.length > 0 && (
        <TextField
          placeholder={t('patients.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: 360 }}
        />
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : patients.length === 0 ? (
        <Typography color="text.secondary">{t('patients.empty')}</Typography>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">{t('patients.noResults')}</Typography>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <List disablePadding>
            {filtered.map((p, i) => {
              const orderCount = p.orders?.[0]?.count ?? 0;
              const initials = `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase();
              return (
                <ListItemButton
                  key={p.id}
                  divider={i < filtered.length - 1}
                  onClick={() => navigate(`/doctor/patients/${p.id}`)}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                      {initials || <PersonIcon />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${p.first_name} ${p.last_name}`}
                    secondary={
                      orderCount > 0
                        ? t('patients.orders', { count: orderCount })
                        : t('patients.noOrders')
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Paper>
      )}
    </Stack>
  );
}
