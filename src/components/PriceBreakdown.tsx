import { Box, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import type { PriceLineItem } from '@/utils/pricing';
import type { PricingConfig, RushType } from '@/types/database';

type Props = {
  pricing?: PricingConfig;
  answers: Record<string, unknown>;
  rush?: { type: RushType; value: number };
  finalTotal?: number | null;
};

function LineItemRow({ item }: { item: PriceLineItem }) {
  const { t } = useTranslation('common');
  const { t: tLab } = useTranslation('lab');

  const isBar = item.baseAmount != null;

  let displayLabel: string;
  if (item.i18nKey === 'sgSupport') {
    // Translate the support type using the lab namespace
    const supportLabel = tLab(`sgForm.guideSupport.${item.label}`, { defaultValue: item.label });
    displayLabel = `${t('priceBreakdown.items.sgSupport')}: ${supportLabel}`;
  } else if (item.i18nKey) {
    displayLabel = t(`priceBreakdown.items.${item.i18nKey}` as Parameters<typeof t>[0]);
  } else {
    displayLabel = item.label;
  }

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ py: 0.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" noWrap>
          {displayLabel}
        </Typography>
        {isBar ? (
          <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
            ({formatGEL(item.baseAmount!)} base + {item.qty}×{formatGEL(item.unitAmount ?? 0)})
          </Typography>
        ) : item.qty != null ? (
          <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
            ×{item.qty}
          </Typography>
        ) : null}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, ml: 2 }}>
        {formatGEL(item.amount)}
      </Typography>
    </Stack>
  );
}

export function PriceBreakdown({ pricing, answers, rush, finalTotal }: Props) {
  const { t } = useTranslation('common');
  const result = calculatePrice(pricing, answers, rush);
  const hasDetails = result.lineItems.length > 0;

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
        {hasDetails && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('priceBreakdown.priceDetails')}
            </Typography>
            {result.lineItems.map((item, i) => (
              <LineItemRow key={i} item={item} />
            ))}
            <Divider />
          </>
        )}

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
