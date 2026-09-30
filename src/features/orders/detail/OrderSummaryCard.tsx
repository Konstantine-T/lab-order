import { useState, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon, SectionCard } from '@/components/design';
import { ToothMap, toDisplayLabel } from '@/components/ToothMap';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { formatGELShort } from '@/utils/pricing';
import type { LabFormVersionRow } from '@/types/database';
import type { OrderFacts } from './orderFacts';
import { serviceNameOf, type DetailOrder } from './types';

/** A caption over a value — the mockups' two-column spec grid. */
function Fact({
  label,
  children,
  hint,
  wide,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        component="div"
        sx={{
          fontSize: '0.875rem',
          fontWeight: wide ? 400 : 600,
          lineHeight: 1.5,
          mt: 0.25,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap' }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The order at a glance: the chart on the left, the answers a doctor checks
 * first on the right. Only answers that were actually given appear — a crown
 * order has no unit count to show, a model order no shade.
 *
 * Without any teeth the chart is left out rather than drawn empty, and the
 * card is titled as a summary instead.
 */
export function OrderSummaryCard({ order, facts }: { order: DetailOrder; facts: OrderFacts }) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { t: tl } = useTranslation('lab');

  const hasChart = facts.teeth.length > 0;
  const label = (n: number) => toDisplayLabel(n, facts.notation);
  // Teeth painted a material colour carry their own legend below; handing
  // them to the map as selected too would print the map's own capsule row
  // over the same teeth. Anything left uncoloured is shown as selected.
  const uncoloured = facts.teeth.filter((n) => !facts.toothColors[n]);

  const rush =
    order.rush_type === 'NONE'
      ? tc('no')
      : order.rush_value == null
        ? tc('yes')
        : `${tc('yes')} · ${
            order.rush_type === 'PERCENTAGE'
              ? tc('rush.chipPercent', { value: Number(order.rush_value) })
              : tc('rush.chipFixed', { amount: formatGELShort(Number(order.rush_value)) })
          }`;

  const scale = facts.shade?.scale;

  return (
    <SectionCard
      title={
        hasChart
          ? t('orderDetail.summary.teethTitle', { notation: facts.notation })
          : t('orderDetail.summary.title')
      }
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2.5, md: 3.5 },
          alignItems: 'start',
          gridTemplateColumns: hasChart
            ? { xs: 'minmax(0, 1fr)', md: 'minmax(240px, 320px) minmax(0, 1fr)' }
            : 'minmax(0, 1fr)',
        }}
      >
        {hasChart && (
          <Box sx={{ minWidth: 0 }}>
            <ToothMap
              readOnly
              value={uncoloured}
              toothColors={facts.toothColors}
              notation={facts.notation}
            />
            {facts.groups.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1.25 }}>
                {facts.groups.map((g) => (
                  <Stack key={g.label} direction="row" alignItems="center" spacing={0.75}>
                    <Box
                      aria-hidden
                      sx={{ width: 11, height: 11, borderRadius: '3px', bgcolor: g.color, flexShrink: 0 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {g.label} · {g.teeth.map(label).join(', ')}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: { xs: '14px 16px', md: '16px 20px' },
            pt: { md: 0.5 },
          }}
        >
          {hasChart ? (
            <Fact label={t('orderDetail.facts.units')}>{facts.teeth.map(label).join(' · ')}</Fact>
          ) : (
            facts.units != null && <Fact label={t('orderDetail.facts.units')}>{facts.units}</Fact>
          )}
          <Fact label={t('orderDetail.service')}>{serviceNameOf(order) || '—'}</Fact>
          {facts.materials.length > 0 && (
            <Fact label={tl('fabForm.material')}>{facts.materials.join(', ')}</Fact>
          )}
          {facts.shade && (
            <Fact
              label={
                scale
                  ? `${t('orderDetail.facts.shade')} (${tl(`cnbForm.shadeScales.${scale}`)})`
                  : t('orderDetail.facts.shade')
              }
              hint={facts.shade.notes || undefined}
            >
              {facts.shade.value}
            </Fact>
          )}
          <Fact label={t('orderDetail.facts.rush')}>{rush}</Fact>
          {order.patients?.date_of_birth && (
            <Fact label={t('orderCreate.patient.dateOfBirth')}>{order.patients.date_of_birth}</Fact>
          )}
          {facts.notes.length > 0 && (
            <Fact wide label={tl('fabForm.notes')}>
              {facts.notes.join('\n')}
            </Fact>
          )}
        </Box>
      </Box>
    </SectionCard>
  );
}

/**
 * The whole submitted form, read-only — the complete record every answer
 * lives in, lab-appended questions included.
 *
 * Folded by default when the summary above already draws the chart, since
 * the form draws its own and two identical charts one above the other read
 * as a mistake. Open by default when there is no chart to repeat: then this
 * is where the order's substance is.
 */
export function OrderAnswersCard({
  version,
  answers,
  defaultOpen,
}: {
  version: LabFormVersionRow;
  answers: Record<string, unknown>;
  defaultOpen: boolean;
}) {
  const { t } = useTranslation('doctor');
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SectionCard
      icon="assignment"
      title={t('orderDetail.answers')}
      // A phone has no room for the aside beside the toggle; the title says enough.
      meta={
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {t('orderDetail.snapshot')}
        </Box>
      }
      actions={
        <Button
          size="small"
          variant="text"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          endIcon={<Icon name={open ? 'expand_less' : 'expand_more'} size={18} />}
        >
          {open ? t('orderDetail.answersToggle.hide') : t('orderDetail.answersToggle.show')}
        </Button>
      }
    >
      {open ? (
        <OrderForm
          configuration={version.configuration_json}
          pricing={version.pricing_configuration_json}
          values={answers}
          onChange={() => {}}
          readOnly
        />
      ) : null}
    </SectionCard>
  );
}
