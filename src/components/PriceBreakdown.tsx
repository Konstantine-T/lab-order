import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FieldLabel, MoneyRow } from '@/components/design';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import type { PriceLineItem } from '@/utils/pricing';
import { radii } from '@/theme/tokens';
import type { PricingConfig, RushType } from '@/types/database';

type Props = {
  pricing?: PricingConfig;
  answers: Record<string, unknown>;
  rush?: { type: RushType; value: number };
  finalTotal?: number | null;
  /**
   * `plain` drops the surrounding box so the breakdown can sit inside a
   * `SectionCard` — which is how the mockups draw every price panel.
   */
  variant?: 'boxed' | 'plain';
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

  const qty = isBar ? (
    <>
      ({formatGEL(item.baseAmount!)} + {item.qty}×{formatGEL(item.unitAmount ?? 0)})
    </>
  ) : item.qty != null ? (
    <>×{item.qty}</>
  ) : null;

  return (
    <MoneyRow
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75 }}>
          {displayLabel}
          {qty && (
            <Typography component="span" variant="caption" color="text.disabled">
              {qty}
            </Typography>
          )}
        </Box>
      }
      amount={formatGEL(item.amount)}
    />
  );
}

/**
 * The price panel from the mockups: line items, subtotal, an optional rush
 * surcharge, then the estimated total above a dashed rule — and the lab's
 * final total in green when it differs.
 */
export function PriceBreakdown({
  pricing,
  answers,
  rush,
  finalTotal,
  variant = 'boxed',
}: Props) {
  const { t } = useTranslation('common');
  const result = calculatePrice(pricing, answers, rush);
  const hasDetails = result.lineItems.length > 0;
  const discounted = finalTotal != null && finalTotal < result.total;

  const body = (
    <Stack spacing={0.75}>
      {hasDetails && (
        <>
          <FieldLabel sx={{ mb: 0.5 }}>{t('priceBreakdown.priceDetails')}</FieldLabel>
          {result.lineItems.map((item, i) => (
            <LineItemRow key={i} item={item} />
          ))}
        </>
      )}

      <MoneyRow label={t('priceBreakdown.subtotal')} amount={formatGEL(result.subtotal)} />
      {result.rushAmount > 0 && (
        <MoneyRow label={t('priceBreakdown.rushSurcharge')} amount={formatGEL(result.rushAmount)} />
      )}
      <MoneyRow
        total
        label={t('priceBreakdown.estimatedTotal')}
        amount={
          <Box
            component="span"
            sx={{
              textDecoration: discounted ? 'line-through' : undefined,
              color: discounted ? 'text.secondary' : undefined,
            }}
          >
            {formatGEL(result.total)}
          </Box>
        }
      />
      {finalTotal != null && finalTotal !== result.total && (
        <MoneyRow
          strong
          label={t('priceBreakdown.labFinalTotal')}
          amount={formatGEL(finalTotal)}
          color="success.main"
        />
      )}
    </Stack>
  );

  if (variant === 'plain') return body;

  return (
    <Box
      sx={{
        p: 2.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${radii.card}px`,
        bgcolor: 'background.paper',
      }}
    >
      {body}
    </Box>
  );
}
