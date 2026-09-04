import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { FieldRenderer } from '@/components/DynamicForm';
import { OrderForm } from '@/features/orderForms/OrderForm';
import { valuesEqual } from '@/features/lab/orderEdits/diff';
import { changedItems, type ChangedItem } from '@/features/lab/orderEdits/answerSections';
import type { FormConfiguration, PricingConfig } from '@/types/database';

const noop = () => {};

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/**
 * The questions this edit touched, named.
 *
 * Without it the lab got a "changed × 2" badge and two full copies of the form
 * and had to find the difference by eye — on a Crown & Bridge sheet that is
 * eight sections and a 32-tooth chart, twice.
 */
function ChangedSummary({ items }: { items: ChangedItem[] }) {
  const { t } = useTranslation('lab');
  if (items.length === 0) return null;

  const labelOf = (item: ChangedItem) => {
    if (item.kind === 'question') return item.label;
    if (item.kind === 'other') return t('orderSheet.diff.otherAnswers');
    const label = t(item.labelKey);
    // The surgical guide asks the same five questions of each jaw, so the
    // section name alone would be ambiguous on a both-jaws case.
    return item.jaw ? `${t(`sgForm.jaw.${item.jaw}Label`)} — ${label}` : label;
  };

  return (
    <Box sx={{ border: 1, borderColor: 'warning.main', borderRadius: 1, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Icon name="edit_note" size={18} />
        <Typography variant="subtitle2">{t('orderSheet.diff.whatChanged')}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {items.map((item, i) => (
          <Chip
            key={i}
            label={labelOf(item)}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ maxWidth: '100%', height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }}
          />
        ))}
      </Stack>
    </Box>
  );
}

// Renders the order answers once (the "after"/current state), highlighting only
// the questions that changed and showing each one's previous value inline. The
// structured template part (tooth maps etc.) can't be diffed per-question, so it
// falls back to a whole-block before/after — but only that sub-block, and only
// when it actually changed.
export function OrderAnswersDiff({ configuration, pricing, before, after }: Props) {
  const { t } = useTranslation('lab');
  const hasStructured = !!configuration._templateCode;

  // Fields we can highlight per-question: custom questions on a template form,
  // or every visible field on a plain dynamic form.
  const questionFields = hasStructured
    ? configuration.fields.filter((f) => f.type === 'custom_question' && f.enabled)
    : configuration.fields.filter((f) => f.enabled && f.visible_to_doctor !== false);

  const questionCodes = new Set(questionFields.map((f) => f.code));

  // Structured part changed = any answer key NOT owned by a per-question field differs.
  const structuredChanged =
    hasStructured &&
    [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => !questionCodes.has(k))
      .some((k) => !valuesEqual(before[k], after[k]));

  // Strip custom questions so OrderForm renders ONLY the structured block.
  const structuredConfig = {
    ...configuration,
    fields: configuration.fields.filter((f) => f.type !== 'custom_question'),
  };

  return (
    <Stack spacing={3}>
      <ChangedSummary items={changedItems(configuration, before, after)} />

      {hasStructured &&
        (structuredChanged ? (
          <Box sx={{ border: 1, borderColor: 'warning.main', borderRadius: 1, p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('orderSheet.diff.changed')}
            </Typography>
            <Stack spacing={2}>
              <Box>
                {/* current values — what the order is now */}
                <Typography variant="caption" color="text.secondary">
                  {t('orderSheet.diff.after')}
                </Typography>
                <OrderForm
                  configuration={structuredConfig}
                  pricing={pricing}
                  values={after}
                  onChange={noop}
                  readOnly
                />
              </Box>

              {/* Loud separator so it's unmistakable the block below is the OLD
                  version, not a continuation of the form above. */}
              <Divider
                textAlign="center"
                sx={{ my: 2, '&::before, &::after': { borderColor: 'warning.main' } }}
              >
                <Chip
                  icon={<Icon name="history" size={16} />}
                  label={t('orderSheet.diff.previousVersion')}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Divider>

              <Box sx={{ opacity: 0.6 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('orderSheet.diff.previousVersion')}
                </Typography>
                <OrderForm
                  configuration={structuredConfig}
                  pricing={pricing}
                  values={before}
                  onChange={noop}
                  readOnly
                />
              </Box>
            </Stack>
          </Box>
        ) : (
          <OrderForm
            configuration={structuredConfig}
            pricing={pricing}
            values={after}
            onChange={noop}
            readOnly
          />
        ))}

      {questionFields.map((field) => {
        const changed = !valuesEqual(before[field.code], after[field.code]);
        if (!changed) {
          return (
            <FieldRenderer
              key={field.code}
              field={field}
              value={after[field.code]}
              onChange={noop}
              readOnly
            />
          );
        }
        // Changed question: yellow border, current value on top, previous value
        // rendered inline below (muted) so the lab sees what it was.
        return (
          <Box
            key={field.code}
            sx={{ border: 1, borderColor: 'warning.main', borderRadius: 1, p: 1.5 }}
          >
            <FieldRenderer field={field} value={after[field.code]} onChange={noop} readOnly />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1 }}
            >
              {t('orderSheet.diff.before')}
            </Typography>
            <Box sx={{ opacity: 0.6 }}>
              <FieldRenderer
                field={field}
                value={before[field.code]}
                onChange={noop}
                readOnly
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
