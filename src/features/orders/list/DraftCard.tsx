import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { brand, palette2026, radii, surfaces, tone } from '@/theme/tokens';

type Props = {
  /** Service picked in the draft, if it got that far. */
  serviceName: string;
  /** Short patient name and lab, already joined. */
  meta: string;
  /** Clinic list: the doctor the draft is for. */
  doctorName?: string;
  /** "Yesterday", "12 min ago" — when the draft was last saved, if known. */
  savedAgo?: string;
  /** The lab, service or form changed since the draft was saved. */
  outdated?: boolean;
  onContinue: () => void;
  onDiscard: () => void;
};

/**
 * An unfinished order, drawn the way the board draws its "draft" column: a
 * dashed frame — dashed is the redesign's "not yet" — with the service, who it
 * is for, and a "continue →".
 *
 * Not a link as a whole: it carries two actions, and "discard" must never be
 * one stray click away from "continue".
 */
export function DraftCard({
  serviceName,
  meta,
  doctorName,
  savedAgo,
  outdated,
  onContinue,
  onDiscard,
}: Props) {
  const { t } = useTranslation(['common', 'doctor']);
  const mode = useTheme().palette.mode;

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        px: 2,
        py: 1.75,
        borderRadius: `${radii.card}px`,
        border: '1px dashed',
        borderColor: surfaces[mode].dashed,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" alignItems="center" spacing={0.625} sx={{ color: 'text.secondary' }}>
          <Icon name="draft" size={15} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'inherit' }}>
            {t('doctor:orders.draft.label')}
          </Typography>
        </Stack>
        {outdated && (
          <Typography
            sx={{ fontSize: '0.75rem', fontWeight: 600, color: tone('warning', mode).fg }}
            noWrap
          >
            {t('doctor:orders.draft.titleBroken')}
          </Typography>
        )}
      </Stack>

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.35 }}>
          {serviceName || '—'}
        </Typography>
        {meta && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }} noWrap>
            {meta}
          </Typography>
        )}
        {doctorName && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{ mt: 0.25, color: 'text.secondary', minWidth: 0 }}
          >
            <Icon name="stethoscope" size={14} />
            <Typography sx={{ fontSize: '0.75rem', color: 'inherit' }} noWrap>
              {t('orderList.doctorName', { name: doctorName })}
            </Typography>
          </Stack>
        )}
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mt: 'auto', pt: 0.5 }}
      >
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 0 }} noWrap>
          {savedAgo}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
          <Button
            size="small"
            color="inherit"
            onClick={onDiscard}
            sx={{ color: 'text.secondary', px: 1, minWidth: 0 }}
          >
            {t('doctor:orders.draft.discard')}
          </Button>
          <Button
            size="small"
            onClick={onContinue}
            endIcon={<Icon name="arrow_forward" size={15} />}
            sx={{
              px: 1,
              minWidth: 0,
              fontWeight: 600,
              color: mode === 'light' ? palette2026.periText : brand.soft,
            }}
          >
            {t('doctor:orders.draft.resume')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
