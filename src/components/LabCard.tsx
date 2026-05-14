import {
  alpha,
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import { Link as RouterLink } from 'react-router-dom';

type LabCardLab = {
  id: string;
  public_name: string;
  city: string | null;
  short_description: string | null;
  logo_url: string | null;
};

export function LabCard({ lab, to }: { lab: LabCardLab; to?: string }) {
  const theme = useTheme();
  const target = to ?? `/doctor/labs/${lab.id}`;
  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 220ms ease, border-color 200ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha(theme.palette.primary.main, 0.4),
          boxShadow:
            theme.palette.mode === 'light'
              ? `0 1px 2px rgba(15,23,42,0.04), 0 8px 24px ${alpha(theme.palette.primary.main, 0.12)}`
              : `0 8px 24px ${alpha(theme.palette.primary.main, 0.18)}`,
        },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={target}
        sx={{ height: '100%', display: 'flex', alignItems: 'stretch' }}
      >
        <CardContent sx={{ p: 2.5, width: '100%' }}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Avatar
              src={lab.logo_url ?? undefined}
              variant="rounded"
              sx={{
                width: 56,
                height: 56,
                flexShrink: 0,
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                color: 'primary.main',
                fontWeight: 600,
              }}
            >
              <BusinessIcon />
            </Avatar>
            <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.25}>
              <Typography variant="subtitle1" fontWeight={600} noWrap letterSpacing="-0.005em">
                {lab.public_name}
              </Typography>
              {/* Reserve a fixed slot for the city — even when missing — so
                  cards align across rows regardless of which fields each lab
                  has filled out. */}
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ minHeight: 18, display: 'block' }}
              >
                {lab.city ?? ''}
              </Typography>
              {/* Same idea for the description: always two lines of vertical
                  space, clamped at two lines when present. */}
              <Box
                sx={{
                  mt: 0.75,
                  color: 'text.secondary',
                  fontSize: 13,
                  lineHeight: 1.5,
                  height: '3em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                }}
              >
                {lab.short_description ?? ''}
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
