import { Box, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import type { PricingConfig, RushType } from '@/types/database';

type Props = {
  pricing?: PricingConfig;
  answers: Record<string, unknown>;
  rush?: { type: RushType; value: number };
  finalTotal?: number | null;
};

export function PriceBreakdown({ pricing, answers, rush, finalTotal }: Props) {
  const { t } = useTranslation('common');
  const result = calculatePrice(pricing, answers, rush);

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between">
          <Typography>{t('priceBreakdown.subtotal')}</Typography>
          <Typography>{formatGEL(result.subtotal)}</Typography>
        </Stack>
        {result.rushAmount > 0 && (
          <Stack direction="row" justifyContent="space-between">
            <Typography>{t('priceBreakdown.rushSurcharge')}</Typography>
            <Typography>{formatGEL(result.rushAmount)}</Typography>
          </Stack>
        )}
        <Divider />
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            {t('priceBreakdown.estimatedTotal')}
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            sx={{
              textDecoration:
                finalTotal != null && finalTotal < result.total ? 'line-through' : undefined,
              color:
                finalTotal != null && finalTotal < result.total
                  ? 'text.secondary'
                  : undefined,
            }}
          >
            {formatGEL(result.total)}
          </Typography>
        </Stack>
        {finalTotal != null && finalTotal !== result.total && (
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              {t('priceBreakdown.labFinalTotal')}
            </Typography>
            <Typography variant="subtitle1" fontWeight={700} color="primary">
              {formatGEL(finalTotal)}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
