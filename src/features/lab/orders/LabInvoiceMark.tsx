import { Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { tone } from '@/theme/tokens';

/**
 * "Invoice", stacked under the patient name in the lab's queue — the same slot
 * and scale as the unreviewed-edit and answered indicators. The word is kept
 * short so it fits the patient column at 1280px in every locale; the fuller
 * "Invoice attached" is the hover title.
 *
 * Neutral, and an icon rather than their warning dot: those are alerts that
 * clear, this is a permanent fact about the order. The lab attached the invoice
 * itself, so the doctor's warning-toned "New invoice" badge would be noise on
 * every order it has already billed.
 */
export function LabInvoiceMark() {
  const { t } = useTranslation('lab');
  const label = t('ordersDashboard.invoiceAttached');

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      title={t('ordersDashboard.invoiceAttachedHint')}
      sx={(theme) => ({ minWidth: 0, color: tone('neutral', theme.palette.mode).fg })}
    >
      <Icon name="receipt_long" size={12} sx={{ flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, color: 'inherit' }} noWrap>
        {label}
      </Typography>
    </Stack>
  );
}
