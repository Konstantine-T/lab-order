import { useState } from 'react';
import type { ReactNode } from 'react';
import { Box, ButtonBase, Collapse, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FieldLabel, Icon, MoneyRow } from '@/components/design';
import { calculatePrice, formatGEL, pricingShape } from '@/utils/pricing';
import type { PriceLineItem, PricingShape } from '@/utils/pricing';
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
  /**
   * The "how this is calculated" panel. Opt-in: it's for the doctor deciding
   * whether to place an order, so the order wizard and the edit page turn it
   * on. The lab's own pages don't need their own pricing rules explained back
   * to them.
   */
  explain?: boolean;
};

function LineItemRow({ item }: { item: PriceLineItem }) {
  const { t } = useTranslation('common');
  const { t: tLab } = useTranslation('lab');

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

  // Show the arithmetic, not just the multiplier — a doctor seeing "× 3" has to
  // do the division to learn what one costs. Driven purely by which fields the
  // line item carries, so every template gets this for free.
  let detail: ReactNode = null;
  if (item.baseAmount != null) {
    // Implant bar: a base fee plus a per-implant charge.
    detail = (
      <>
        ({formatGEL(item.baseAmount)} + {item.qty}×{formatGEL(item.unitAmount ?? 0)})
      </>
    );
  } else if (item.unitAmount != null && item.qty != null) {
    detail = (
      <>
        ({formatGEL(item.unitAmount)} × {item.qty})
      </>
    );
  } else if (item.qty != null) {
    detail = <>×{item.qty}</>;
  }

  return (
    <MoneyRow
      label={
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 0.75,
            // Wrap the caption onto its own line before the row gets so wide
            // it pushes the amount out of a narrow rail.
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          {displayLabel}
          {detail && (
            // nowrap so the arithmetic never breaks across lines in the 316px
            // rail — "(GEL 145.00 ×" on one line and "3)" on the next is worse
            // than letting the material name wrap instead.
            <Typography
              component="span"
              variant="caption"
              color="text.disabled"
              sx={{ whiteSpace: 'nowrap' }}
            >
              {detail}
            </Typography>
          )}
        </Box>
      }
      amount={formatGEL(item.amount)}
    />
  );
}

/** The plain-language rule for each pricing shape, so the doctor can see *why*
 *  a charge applies and not just what it is. */
const EXPLAIN_KEY: Record<PricingShape, string> = {
  perToothMaterial: 'priceBreakdown.explain.perToothMaterial',
  surgicalGuide: 'priceBreakdown.explain.surgicalGuide',
  implant: 'priceBreakdown.explain.implant',
  printMilling: 'priceBreakdown.explain.printMilling',
  modelPerJaw: 'priceBreakdown.explain.modelPerJaw',
  fixedPrice: 'priceBreakdown.explain.fixedPrice',
  generic: 'priceBreakdown.explain.generic',
};

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
  explain = false,
}: Props) {
  const { t } = useTranslation('common');
  // Collapsed by default — the itemised rows answer "what", and most doctors
  // only need "why" the first few times they order from a lab.
  const [showExplain, setShowExplain] = useState(false);

  const result = calculatePrice(pricing, answers, rush);
  const hasDetails = result.lineItems.length > 0;
  const discounted = finalTotal != null && finalTotal < result.total;
  // Nothing priceable answered yet — lead with a hint rather than a bare 0.
  const isEmpty = !hasDetails && result.subtotal === 0;

  const shape = pricingShape(pricing, answers);
  // The rush actually applied: an explicit override (the wizard's toggle) wins
  // over the lab's configured default, exactly as calculatePrice resolves it.
  const effectiveRush = rush ?? pricing?.rush;
  const explainRule = shape ? t(EXPLAIN_KEY[shape] as Parameters<typeof t>[0]) : null;
  const explainRush =
    result.rushAmount > 0 && effectiveRush
      ? effectiveRush.type === 'PERCENTAGE'
        ? t('priceBreakdown.explain.rushPercentage', { value: effectiveRush.value ?? 0 })
        : t('priceBreakdown.explain.rushFixed', { value: formatGEL(effectiveRush.value ?? 0) })
      : null;
  const canExplain = explain && !isEmpty && (explainRule != null || explainRush != null);

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

      {isEmpty ? (
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {t('priceBreakdown.emptyHint')}
        </Typography>
      ) : (
        <MoneyRow label={t('priceBreakdown.subtotal')} amount={formatGEL(result.subtotal)} />
      )}

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

      {canExplain && (
        <Box sx={{ pt: 0.5 }}>
          <ButtonBase
            onClick={() => setShowExplain((v) => !v)}
            aria-expanded={showExplain}
            sx={{
              gap: 0.5,
              borderRadius: 1,
              px: 0.25,
              color: 'text.secondary',
              fontSize: '0.71875rem',
              fontWeight: 600,
              '&:hover': { color: 'text.primary' },
            }}
          >
            {t('priceBreakdown.explainToggle')}
            <Icon name={showExplain ? 'expand_less' : 'expand_more'} size={16} />
          </ButtonBase>
          <Collapse in={showExplain} unmountOnExit>
            <Stack spacing={0.5} sx={{ pt: 0.75 }}>
              {explainRule && (
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {explainRule}
                </Typography>
              )}
              {explainRush && (
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                  {explainRush}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </Box>
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
