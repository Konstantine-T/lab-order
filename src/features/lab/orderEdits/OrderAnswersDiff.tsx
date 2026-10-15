import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { FieldRenderer } from '@/components/DynamicForm';
import { OrderForm } from '@/features/orderForms/OrderForm';
import {
  ChangedFrame,
  ChangedPill,
  ChangedTeethNote,
} from '@/features/orderForms/changeHighlight';
import {
  ChangeMarksContext,
  questionMarkId,
  sectionMarkId,
  type ChangeMarks,
} from '@/features/orderForms/changeMarks';
import { valuesEqual } from '@/features/lab/orderEdits/diff';
import { changedTeethByChart, changedTeethIn } from '@/features/lab/orderEdits/toothChanges';
import {
  changedItems,
  sectionsForTemplate,
  type ChangedItem,
} from '@/features/lab/orderEdits/answerSections';
import { fieldText, useUiLang } from '@/features/lab/labText';
import { radii, surfaces } from '@/theme/tokens';
import type { FieldConfig, FormConfiguration, PricingConfig } from '@/types/database';

const noop = () => {};

type Props = {
  configuration: FormConfiguration;
  pricing?: PricingConfig;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/** What a chip reads, and the mark it jumps to (none for "other answers"). */
type SummaryItem = { label: string; markId: string | null };

/**
 * The questions this edit touched, named. Each chip that has a marked section
 * on the page is a button that scrolls to it.
 *
 * Without it the lab got a "changed × 2" badge and two full copies of the form
 * and had to find the difference by eye — on a Crown & Bridge sheet that is
 * eight sections and a 32-tooth chart, twice.
 */
function ChangedSummary({
  items,
  isNavigable,
  onJump,
}: {
  items: SummaryItem[];
  isNavigable: (markId: string) => boolean;
  onJump: (markId: string) => void;
}) {
  const { t } = useTranslation('lab');
  if (items.length === 0) return null;

  return (
    <Box sx={{ border: 1, borderColor: 'warning.main', borderRadius: 1, p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Icon name="edit_note" size={18} />
        <Typography variant="subtitle2">{t('orderSheet.diff.whatChanged')}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {items.map((item, i) => {
          const target = item.markId && isNavigable(item.markId) ? item.markId : null;
          return (
            <Chip
              key={i}
              label={item.label}
              size="small"
              color="warning"
              variant="outlined"
              {...(target && {
                onClick: () => onJump(target),
                'aria-label': t('orderSheet.diff.jumpTo', { section: item.label }),
              })}
              sx={{
                maxWidth: '100%',
                height: 'auto',
                py: 0.5,
                '& .MuiChip-label': { whiteSpace: 'normal' },
              }}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * The order's answers as they are now, with the sections this edit changed
 * marked in place (a bar, a tint and a "Changed" pill) and named in a summary
 * above.
 *
 * A clinical template is rendered once, through the same `OrderForm` as an
 * unedited order, with the marks handed down in `ChangeMarksContext`; the
 * previous version sits in a collapsed accordion beneath it. A plain builder
 * form is drawn question by question, each changed one with its old answer.
 */
export function OrderAnswersDiff(props: Props) {
  const { configuration, before, after } = props;
  const lang = useUiLang();
  const items = useMemo(
    () =>
      changedItems(
        // The lab's own questions named in the reader's language, where it
        // translated them (labels only; the answers are compared as stored,
        // and questions are marked by code, never by label).
        {
          ...configuration,
          fields: configuration.fields.map((f) => ({ ...f, label: fieldText(f, 'label', lang) })),
        },
        before,
        after,
      ),
    [configuration, before, after, lang],
  );
  // A fresh body, and so a fresh record of which marks were drawn and whether
  // the previous version is open, whenever the set of changes is a new one.
  return <DiffBody key={JSON.stringify(items)} {...props} items={items} />;
}

function DiffBody({
  configuration,
  pricing,
  before,
  after,
  items,
}: Props & { items: ChangedItem[] }) {
  const { t } = useTranslation('lab');
  // A clinical template, drawn by its own form. Not "has a template code": an
  // OTHER_CUSTOM builder form carries one too, and is drawn question by
  // question below, the way `changedItems` reads it.
  const hasStructured = sectionsForTemplate(configuration._templateCode) !== null;
  const currentRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo<SummaryItem[]>(
    () =>
      items.map((item) => {
        if (item.kind === 'question') {
          return { label: item.label, markId: questionMarkId(item.code) };
        }
        if (item.kind === 'other') return { label: t('orderSheet.diff.otherAnswers'), markId: null };
        const label = t(item.labelKey);
        return {
          // The surgical guide asks the same five questions of each jaw, so the
          // section name alone would be ambiguous on a both-jaws case.
          label: item.jaw ? `${t(`sgForm.jaw.${item.jaw}Label`)} — ${label}` : label,
          markId: sectionMarkId(label, item.jaw),
        };
      }),
    [items, t],
  );

  // Which marks a section actually drew. Written from the sections' effects,
  // which run before this component's own, so it is complete when read below.
  const matched = useRef(new Set<string>());
  const onMatched = useCallback((markId: string) => {
    matched.current.add(markId);
  }, []);

  const { labels, codes } = useMemo(() => {
    const labels = new Set<string>();
    const codes = new Set<string>();
    for (const item of items) {
      if (item.kind === 'section') {
        const label = t(item.labelKey);
        labels.add(item.jaw ? `${item.jaw}|${label}` : label);
      } else if (item.kind === 'question') {
        codes.add(item.code);
      }
    }
    return { labels, codes };
  }, [items, t]);

  // The teeth that changed on each of the template's tooth charts, marked on
  // the chart itself in both copies.
  const teeth = useMemo(
    () => changedTeethByChart(configuration._templateCode, before, after),
    [configuration._templateCode, before, after],
  );

  const currentMarks = useMemo<ChangeMarks>(
    () => ({ labels, codes, before, teeth, onMatched }),
    [labels, codes, before, teeth, onMatched],
  );
  // The same sections marked in the old copy, without reporting (that copy is
  // not where a change has to be visible) and without an old value under the
  // old value.
  const previousMarks = useMemo<ChangeMarks>(
    () => ({ labels, codes, teeth }),
    [labels, codes, teeth],
  );

  // Template forms: marks no section drew. `null` until the first check.
  const [unmatched, setUnmatched] = useState<string[] | null>(null);
  const [previousOpen, setPreviousOpen] = useState(false);
  // Opened and warned about once: a refetch re-runs the check below, and must
  // not reopen an accordion the lab has since closed.
  const reported = useRef(false);

  useEffect(() => {
    if (!hasStructured) return;
    const missing = summary
      .filter((s) => s.markId === null || !matched.current.has(s.markId))
      .map((s) => s.label);
    setUnmatched(missing);
    if (missing.length > 0 && !reported.current) {
      reported.current = true;
      // A change highlighted nowhere would leave the lab to find it by eye, or
      // not at all. Open the old copy so the difference can still be read.
      setPreviousOpen(true);
      if (import.meta.env.DEV) {
        console.warn(
          '[OrderAnswersDiff] changes no section marked (answerSections.ts may have drifted from the form):',
          missing,
          configuration._templateCode,
        );
      }
    }
  }, [hasStructured, summary, currentMarks, configuration._templateCode]);

  const isNavigable = (markId: string) => {
    if (!hasStructured) return true; // drawn below by this component
    return unmatched !== null && matched.current.has(markId);
  };

  const jumpTo = (markId: string) => {
    // The current form only, not the previous version beneath it.
    const el = [
      ...(currentRef.current?.querySelectorAll<HTMLElement>('[data-changed-section]') ?? []),
    ].find((node) => node.getAttribute('data-changed-section') === markId);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  // The previous version, when something in the template's own part changed
  // (a custom question shows its old answer under itself), and whenever a
  // change was drawn nowhere, so it can at least be read there.
  const showPrevious =
    items.some((i) => i.kind === 'section' || i.kind === 'other') ||
    (unmatched !== null && unmatched.length > 0);

  return (
    <Stack spacing={3}>
      <ChangedSummary items={summary} isNavigable={isNavigable} onJump={jumpTo} />

      {hasStructured ? (
        <>
          <Box ref={currentRef}>
            <ChangeMarksContext.Provider value={currentMarks}>
              <OrderForm
                configuration={configuration}
                pricing={pricing}
                values={after}
                onChange={noop}
                readOnly
              />
            </ChangeMarksContext.Provider>
          </Box>

          {showPrevious && (
            <PreviousVersion open={previousOpen} onToggle={setPreviousOpen}>
              <ChangeMarksContext.Provider value={previousMarks}>
                <OrderForm
                  configuration={configuration}
                  pricing={pricing}
                  values={before}
                  onChange={noop}
                  readOnly
                />
              </ChangeMarksContext.Provider>
            </PreviousVersion>
          )}
        </>
      ) : (
        <Stack spacing={3} ref={currentRef}>
          {configuration.fields
            .filter((f) => f.enabled && f.visible_to_doctor !== false)
            .map((field) => (
              <PlainQuestion
                key={field.code}
                field={field}
                before={before[field.code]}
                after={after[field.code]}
              />
            ))}
        </Stack>
      )}
    </Stack>
  );
}

/** The answers before this edit, collapsed until asked for. */
function PreviousVersion({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('lab');
  const theme = useTheme();
  return (
    <Accordion
      expanded={open}
      onChange={(_, next) => onToggle(next)}
      disableGutters
      elevation={0}
      TransitionProps={{ unmountOnExit: true }}
      sx={{
        border: 1,
        borderColor: surfaces[theme.palette.mode].borderSolid,
        borderRadius: `${radii.card}px !important`,
        bgcolor: 'transparent',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<Icon name="expand_more" />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon name="history" size={18} />
          <Typography variant="subtitle2">{t('orderSheet.diff.previousVersion')}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 2, sm: 3 }, pb: 2.75 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

/**
 * One question of a plain builder form. A changed one gets the same bar, tint
 * and pill as a template section, and its previous answer underneath.
 */
function PlainQuestion({
  field,
  before,
  after,
}: {
  field: FieldConfig;
  before: unknown;
  after: unknown;
}) {
  const { t } = useTranslation('lab');
  const lang = useUiLang();
  if (valuesEqual(before, after)) {
    return <FieldRenderer field={field} value={after} onChange={noop} readOnly />;
  }
  // A tooth question rings the teeth that changed, in both answers.
  const changedTeeth =
    field.type === 'tooth_selection' ? changedTeethIn(before, after) : undefined;
  return (
    <ChangedFrame
      markId={questionMarkId(field.code)}
      ariaLabel={`${fieldText(field, 'label', lang)}: ${t('orderSheet.diff.changed')}`}
    >
      <Stack spacing={1.25}>
        <Box>
          <ChangedPill />
        </Box>
        <FieldRenderer
          field={field}
          value={after}
          onChange={noop}
          readOnly
          changedTeeth={changedTeeth}
        />
        <ChangedTeethNote teeth={changedTeeth} />
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('orderSheet.diff.before')}
          </Typography>
          <Box sx={{ opacity: 0.6 }}>
            <FieldRenderer
              field={field}
              value={before}
              onChange={noop}
              readOnly
              hideLabel
              changedTeeth={changedTeeth}
            />
          </Box>
        </Box>
      </Stack>
    </ChangedFrame>
  );
}
