import { useState } from 'react';
import { Box, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { calculatePrice, formatGEL } from '@/utils/pricing';
import type { PricingConfig, RushType } from '@/types/database';

/** Height of the bar; the spacer below reserves exactly this much so the bar
 *  never covers the last card on the page. */
const BAR_HEIGHT = 60;

type Props = {
  pricing?: PricingConfig;
  answers: Record<string, unknown>;
  rush?: { type: RushType; value: number };
};

/**
 * Always-visible running total on phones.
 *
 * `SplitLayout` drops the summary rail below the content under `lg`, so on a
 * phone the price scrolls out of view while the doctor fills a long form —
 * which defeats the point of a live price. This pins the total to the bottom of
 * the viewport and expands to the full breakdown on tap.
 *
 * Mobile only: above `lg` the sticky rail already does this job, untouched.
 */
export function MobilePriceBar({ pricing, answers, rush }: Props) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);

  // Only the collapsed total is computed here; the expanded drawer renders
  // PriceBreakdown, so the itemisation has exactly one implementation.
  const result = calculatePrice(pricing, answers, rush);
  // Neither a described service nor one with pricing turned off has a running
  // total to run — say so instead of parading a 0.00 at the bottom of the
  // screen the whole way down the form.
  const described = result.kind !== 'CALCULATED';

  return (
    <>
      {/* Reserves the bar's height so the page's last element stays reachable. */}
      <Box sx={{ display: { xs: 'block', lg: 'none' }, height: BAR_HEIGHT }} />

      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        sx={{
          display: { xs: 'flex', lg: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_HEIGHT,
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          cursor: 'pointer',
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          // Below MUI's modal/drawer layer (1200) so the expanded sheet, and
          // any dialog, still cover it.
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {described ? t('priceBreakdown.describedTitle') : t('priceBreakdown.estimatedTotal')}
            {result.rushAmount > 0 && ` · ${t('priceBreakdown.rushIncluded')}`}
          </Typography>
          <Typography
            sx={{ fontSize: described ? '0.8125rem' : '1.0625rem', fontWeight: 700, letterSpacing: '-0.01em' }}
            noWrap
          >
            {described ? t('priceBreakdown.describedBar') : formatGEL(result.total)}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'primary.main' }}>
          {t('priceBreakdown.explainToggle')}
        </Typography>
        <Icon name="expand_less" size={20} sx={{ color: 'primary.main' }} />
      </Box>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80vh' } }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2.5, pt: 2, pb: 1 }}
        >
          <Typography sx={{ fontSize: '0.90625rem', fontWeight: 700, flex: 1 }}>
            {t('priceBreakdown.priceDetails')}
          </Typography>
          <IconButton size="small" onClick={() => setOpen(false)} aria-label={t('actions.cancel')}>
            <Icon name="close" size={18} />
          </IconButton>
        </Stack>
        <Box sx={{ px: 2.5, pb: 3, overflowY: 'auto' }}>
          <PriceBreakdown explain variant="plain" pricing={pricing} answers={answers} rush={rush} />
        </Box>
      </Drawer>
    </>
  );
}
