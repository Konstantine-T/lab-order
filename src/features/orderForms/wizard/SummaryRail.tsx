import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Collapse,
  MenuItem,
  Popover,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { DateCalendar, TimePicker } from '@mui/x-date-pickers';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Callout } from '@/components/design';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { calculatePrice, formatGEL, formatGELShort, pricingShape } from '@/utils/pricing';
import type { PriceLineItem } from '@/utils/pricing';
import { motion, radii, surfaces, tone } from '@/theme/tokens';
import type { DoctorWorkLocationRow, LabFormVersionRow, RushType } from '@/types/database';
import type { WizardState } from '@/features/doctor/orderCreate/types';
import {
  hasProblem,
  orderProblemMessage,
  problemFor,
  type OrderProblem,
} from '@/features/doctor/orderValidation';
import { dueWindowEnd } from '@/features/orders/orderDates';
import { isCnbTemplate, isSectionEnabled } from '../cnbTypes';
import { RequiredMark } from '../primitives';
import { useRegisterSection } from './sectionRegistry';
import { minTurnaroundDays } from './dueDate';
import { InkSegmented, PeriLink, WizLabel } from './ui';

/** The rail's due-and-send block — the navigator's last stop. */
export const DUE_SECTION_ID = 'order-due';

/**
 * The sticky right rail from the redesign: what the order adds up to so far,
 * the estimate, then every non-clinical decision — rush, due date, work
 * location, who gets the invoice — and the send button.
 */
export function SummaryRail({
  state,
  update,
  locations,
  version,
  rush,
  selectedLoc,
  problems = [],
  averageTurnaroundDays,
  patientName,
  submitting,
  disabled,
  showError,
  onSubmit,
  onAddLocation,
  guest,
  sendDone,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  locations: DoctorWorkLocationRow[];
  version: LabFormVersionRow | null | undefined;
  rush: { type: RushType; value: number } | undefined;
  selectedLoc: DoctorWorkLocationRow | undefined;
  averageTurnaroundDays: number | null;
  /** Named problems from the last submit attempt, so fields can show theirs. */
  problems?: OrderProblem[];
  patientName: string;
  submitting: boolean;
  disabled: boolean;
  showError: boolean;
  onSubmit: () => void;
  /** Omitted when the actor can't manage the doctor's locations (clinic path). */
  onAddLocation?: () => void;
  /** No session: the location is picked after sign-in, and Send opens the
   *  sign-in dialog rather than submitting. */
  guest?: boolean;
  /** The navigator's "due date and send" dot: the date is valid (and, for a
   *  doctor, a work location is picked). */
  sendDone: boolean;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();

  useRegisterSection({
    id: DUE_SECTION_ID,
    kind: 'wizard',
    label: t('orderCreate.nav.dueAndSend'),
    name: t('orderCreate.nav.dueAndSend'),
    required: false,
    done: sendDone,
  });
  const mode = theme.palette.mode;
  const pricing = version?.pricing_configuration_json;

  const labRush = pricing?.rush;
  const rushAvailable = !!labRush && labRush.type !== 'NONE';
  const minDays = minTurnaroundDays(averageTurnaroundDays, pricing, state.rush_requested);
  const dueProblem = problemFor(problems, 'dueDate');
  // Live preview of the window the picked start implies, so the doctor sees
  // the hour they are actually asking for rather than having to know the rule.
  const win = state.requested_due_time ? dueWindowEnd(state.requested_due_time) : null;
  const timeHelper = win
    ? `${state.requested_due_time}–${win.end}` +
      (win.nextDay ? ` ${tc('orderCard.dueWindowNextDay')}` : '')
    : undefined;
  // With no locations at all the callout below already says what to do; a red
  // field on top of it says the same thing twice.
  const locationError = hasProblem(problems, 'workLocation') && locations.length > 0;

  // When the toggle changes, the min due date may move past the current
  // selection. Clear an out-of-range date so the picker stays consistent.
  const handleRushToggle = (checked: boolean) => {
    const nextMinDays = minTurnaroundDays(averageTurnaroundDays, pricing, checked);
    const nextMin = dayjs().startOf('day').add(nextMinDays, 'day');
    const next: Partial<WizardState> = { rush_requested: checked };
    if (state.requested_due_date && dayjs(state.requested_due_date).isBefore(nextMin, 'day')) {
      next.requested_due_date = '';
    }
    update(next);
  };

  const rushLabel = !labRush
    ? ''
    : labRush.type === 'PERCENTAGE'
      ? `+${labRush.value ?? 0}%`
      : `+${formatGELShort(labRush.value ?? 0)}`;

  // Short fields side by side only when both are real inputs: a guest's
  // location is a sentence, and a doctor with none gets a callout.
  const locationIsField = !guest && locations.length > 0;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: tone('success', mode).border,
        borderRadius: `${radii.card}px`,
        p: 2.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
      }}
    >
      <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.35 }}>
        {t('orderCreate.summary')}
      </Typography>

      <PriceSummary
        state={state}
        version={version}
        rush={rush}
        patientName={patientName}
        rushRow={
          rushAvailable
            ? {
                label: `${t('orderCreate.summaryRows.rush')} (${rushLabel})`,
                on: state.rush_requested,
              }
            : undefined
        }
      />

      {rushAvailable && (
        <Stack
          component="label"
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            px: 1.5,
            py: 1.25,
            borderRadius: `${radii.control}px`,
            bgcolor: surfaces[mode].subtle,
            cursor: 'pointer',
          }}
        >
          <Switch
            checked={state.rush_requested}
            onChange={(e) => handleRushToggle(e.target.checked)}
            size="small"
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.4 }}>
              {t('orderCreate.filesAndDue.rush')}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.45 }}>
              {labRush!.type === 'PERCENTAGE'
                ? t('orderCreate.filesAndDue.rushSurchargePercent', { value: labRush!.value })
                : t('orderCreate.filesAndDue.rushSurchargeFixed', {
                    amount: formatGEL(labRush!.value ?? 0),
                  })}
              {labRush!.turnaround_days != null && labRush!.turnaround_days > 0
                ? ` · ${
                    labRush!.turnaround_days === 1
                      ? t('orderCreate.filesAndDue.rushTurnaroundOne')
                      : t('orderCreate.filesAndDue.rushTurnaroundOther', {
                          count: labRush!.turnaround_days,
                        })
                  }`
                : ''}
            </Typography>
          </Box>
        </Stack>
      )}

      {/* The navigator's "due date and send" stop. data-form-error stays:
          scrollToFirstError queries it. */}
      <Stack id={DUE_SECTION_ID} spacing={1.75}>
        <DueDateField
          value={state.requested_due_date}
          onChange={(requested_due_date) => update({ requested_due_date })}
          minDays={minDays}
          error={dueProblem ? orderProblemMessage(dueProblem, t) : undefined}
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: locationIsField ? '1fr 1fr' : '1fr',
            gap: 1.25,
          }}
        >
          {/* Optional: the doctor names a start, and the window end is
              derived. There is no end input, because the hour is the rule. */}
          <Stack spacing={0.625} sx={{ minWidth: 0 }}>
            <WizLabel>{t('orderCreate.due.timeShort')}</WizLabel>
            <TimePicker
              ampm={false}
              value={
                state.requested_due_time ? dayjs(`2000-01-01T${state.requested_due_time}`) : null
              }
              onChange={(d: Dayjs | null) =>
                update({ requested_due_time: d && d.isValid() ? d.format('HH:mm') : '' })
              }
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                  helperText: timeHelper,
                  inputProps: { 'aria-label': t('orderCreate.filesAndDue.dueTime') },
                },
                field: { clearable: true },
              }}
            />
          </Stack>

          <Stack
            spacing={0.625}
            sx={{ minWidth: 0 }}
            data-form-error={locationError ? 'true' : undefined}
          >
            <WizLabel>{t('orderCreate.filesAndDue.workLocation')}</WizLabel>
            {guest ? (
              // Not the "you have none, add one" warning: a guest cannot add
              // one, and it is not a problem with their order.
              <Callout tone="neutral" icon="location_on">
                {t('orderCreate.guest.workLocationAfterSignIn')}
              </Callout>
            ) : locations.length === 0 ? (
              // The button under the sentence, not beside it: the rail is
              // too narrow for both on one line.
              <Callout tone="warning" title={t('orderCreate.filesAndDue.noLocations')}>
                {onAddLocation && (
                  <Button size="small" onClick={onAddLocation} sx={{ mt: 0.75, ml: -1.75 }}>
                    {t('orderCreate.filesAndDue.addLocation')}
                  </Button>
                )}
              </Callout>
            ) : (
              <TextField
                select
                size="small"
                value={state.doctor_work_location_id}
                onChange={(e) => update({ doctor_work_location_id: e.target.value })}
                error={locationError}
                helperText={locationError ? t('orderCreate.problems.workLocation') : undefined}
                fullWidth
                inputProps={{ 'aria-label': t('orderCreate.filesAndDue.workLocation') }}
                SelectProps={{
                  // The half-width field shows the clinic; the menu, the rest.
                  renderValue: (id) => {
                    const l = locations.find((x) => x.id === id);
                    return l ? `${l.clinic_name}${l.branch_name ? ` · ${l.branch_name}` : ''}` : '';
                  },
                }}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.clinic_name}
                    {l.branch_name ? ` · ${l.branch_name}` : ''} — {l.city}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </Box>

        <Stack spacing={0.625}>
          <WizLabel>{t('orderCreate.review.invoiceRecipient')}</WizLabel>
          <InkSegmented
            value={state.invoice_recipient_type}
            onChange={(v) => v && update({ invoice_recipient_type: v })}
            options={[
              { value: 'DOCTOR' as const, label: t('orderCreate.review.invoiceDoctorShort') },
              { value: 'CLINIC' as const, label: t('orderCreate.review.invoiceClinicShort') },
            ]}
            fullWidth
            ariaLabel={t('orderCreate.review.invoiceRecipient')}
          />
          {state.invoice_recipient_type === 'CLINIC' &&
            selectedLoc &&
            !selectedLoc.clinic_identification_code && (
              <Callout tone="warning" sx={{ mt: 0.5 }}>
                {t('orderCreate.review.clinicCodeWarning')}
              </Callout>
            )}
        </Stack>

        {showError && <Callout tone="danger" title={t('orderCreate.review.missingFields')} />}

        <Button
          variant="contained"
          fullWidth
          onClick={onSubmit}
          disabled={submitting || disabled}
          sx={{ height: 48, fontSize: '0.9375rem' }}
        >
          {t('orderCreate.review.submit')}
        </Button>

        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {t('orderCreate.sendNote')}
        </Typography>
      </Stack>
    </Box>
  );
}

// ============================================================================
// Price summary
// ============================================================================
/**
 * The rail's top half: the rows the order adds up from, then the estimate.
 *
 * Money only when the lab's pricing produces some (`kind === 'CALCULATED'`).
 * A described service shows the lab's own words and a service with no
 * published price says so — through `PriceBreakdown`, which already words
 * both — and neither gets a confident "0 ₾".
 */
function PriceSummary({
  state,
  version,
  rush,
  patientName,
  rushRow,
}: {
  state: WizardState;
  version: LabFormVersionRow | null | undefined;
  rush: { type: RushType; value: number } | undefined;
  patientName: string;
  rushRow?: { label: string; on: boolean };
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { t: tl } = useTranslation('lab');
  const [explainOpen, setExplainOpen] = useState(false);
  const pricing = version?.pricing_configuration_json;
  const answers = state.answers;

  const result = useMemo(
    () => (version ? calculatePrice(pricing, answers, rush) : null),
    [version, pricing, answers, rush],
  );
  const calculated = result?.kind === 'CALCULATED';

  // The one shade the order carries, as stored. Shown for the forms that ask
  // for it; the others have no such row.
  const configuration = version?.configuration_json;
  const shade = typeof answers.shade === 'string' ? answers.shade : undefined;
  const showShade =
    shade !== undefined ||
    (!!configuration &&
      isCnbTemplate(configuration._templateCode) &&
      isSectionEnabled(configuration, 'shade'));

  // Same plain-language rule the breakdown panel gives, keyed by the same
  // shape `calculatePrice` used, so the two cannot describe different maths.
  const shape = version ? pricingShape(pricing, answers) : null;
  const effectiveRush = rush ?? pricing?.rush;
  const explainRule = shape ? tc(`priceBreakdown.explain.${shape}`) : null;
  const explainRush =
    result && result.rushAmount > 0 && effectiveRush
      ? effectiveRush.type === 'PERCENTAGE'
        ? tc('priceBreakdown.explain.rushPercentage', { value: effectiveRush.value ?? 0 })
        : tc('priceBreakdown.explain.rushFixed', { value: formatGEL(effectiveRush.value ?? 0) })
      : null;
  const lineItems = calculated ? result.lineItems : [];
  const isEmpty = calculated && lineItems.length === 0 && result.subtotal === 0;
  const canExplain = calculated && !isEmpty && (!!explainRule || !!explainRush);

  const itemLabel = (item: PriceLineItem) => {
    // As PriceBreakdown resolves its rows: a guide support is named by its
    // translated type, other keyed items by their key, the rest verbatim.
    const base =
      item.i18nKey === 'sgSupport'
        ? `${tc('priceBreakdown.items.sgSupport')}: ${tl(`sgForm.guideSupport.${item.label}`, {
            defaultValue: item.label,
          })}`
        : item.i18nKey
          ? tc(`priceBreakdown.items.${item.i18nKey}`)
          : item.label;
    return item.qty != null ? `${base} × ${item.qty}` : base;
  };

  return (
    <>
      <Stack
        spacing={0.75}
        sx={{ pb: 1.5, borderBottom: 1, borderColor: 'divider', fontSize: '0.8125rem' }}
      >
        <SummaryRow
          label={t('orderCreate.review.fields.patient')}
          value={patientName || undefined}
        />
        {lineItems.map((item, i) => (
          <SummaryRow key={i} label={itemLabel(item)} value={formatGELShort(item.amount)} />
        ))}
        {isEmpty && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5 }}>
            {tc('priceBreakdown.emptyHint')}
          </Typography>
        )}
        {showShade && (
          <SummaryRow label={t('orderCreate.summaryRows.shade')} value={shade || undefined} />
        )}
        {rushRow && (
          <SummaryRow
            label={rushRow.label}
            value={
              rushRow.on
                ? calculated && result.rushAmount > 0
                  ? `+${formatGELShort(result.rushAmount)}`
                  : t('orderCreate.summaryRows.rushOn')
                : undefined
            }
          />
        )}
      </Stack>

      {result && !calculated && (
        <PriceBreakdown variant="plain" pricing={pricing} answers={answers} rush={rush} />
      )}

      {calculated && (
        <Box>
          <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={1.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="div"
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  lineHeight: 1.4,
                }}
              >
                {tc('priceBreakdown.estimatedTotal')}
                {canExplain && (
                  <>
                    {' · '}
                    <PeriLink onClick={() => setExplainOpen((v) => !v)} aria-expanded={explainOpen}>
                      {tc('priceBreakdown.explainToggle')}
                    </PeriLink>
                  </>
                )}
              </Typography>
              <Typography
                sx={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatGELShort(result.total)}
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: 'text.secondary',
                textAlign: 'right',
                maxWidth: 120,
                lineHeight: 1.4,
                pb: 0.5,
              }}
            >
              {t('orderCreate.labConfirms')}
            </Typography>
          </Stack>
          <Collapse in={explainOpen && canExplain} unmountOnExit>
            <Stack spacing={0.5} sx={{ pt: 1 }}>
              {explainRule && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.55 }}>
                  {explainRule}
                </Typography>
              )}
              {explainRush && (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.55 }}>
                  {explainRush}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </Box>
      )}
    </>
  );
}

/** One label/value row; a missing value is a quiet dash. */
function SummaryRow({ label, value }: { label: ReactNode; value?: ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1.5}>
      <Box component="span" sx={{ color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          fontWeight: value ? 700 : 400,
          color: value ? 'text.primary' : 'text.secondary',
          textAlign: 'right',
          flexShrink: 0,
          maxWidth: '60%',
          overflowWrap: 'anywhere',
        }}
      >
        {value ?? '—'}
      </Box>
    </Stack>
  );
}

// ============================================================================
// Due date
// ============================================================================
/**
 * The due date as the redesign asks for it: the earliest date the lab can
 * make first, the two days after it, and "other" for the calendar.
 *
 * The earliest is exactly the minimum the form already enforced — today plus
 * the service's turnaround, or the rush turnaround when rush is on. The lab's
 * working days are not modelled anywhere, so neither are they here: the next
 * two chips are simply the next two days.
 */
function DueDateField({
  value,
  onChange,
  minDays,
  error,
}: {
  value: string;
  onChange: (date: string) => void;
  minDays: number;
  error?: string;
}) {
  const { t, i18n } = useTranslation('doctor');
  const theme = useTheme();
  const mode = theme.palette.mode;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const minDate = useMemo(() => dayjs().startOf('day').add(minDays, 'day'), [minDays]);
  const quick = [0, 1, 2].map((n) => minDate.add(n, 'day').format('YYYY-MM-DD'));
  const other = !!value && !quick.includes(value);

  // dayjs, not Intl: Chrome ships no Georgian locale data, so Intl quietly
  // falls back to English there — for most of this app's readers.
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const fmt = (iso: string, month: 'short' | 'long') =>
    dayjs(iso)
      .locale(lang)
      .format(month === 'short' ? 'D MMM' : 'D MMMM');

  const chip = (selected: boolean) => ({
    height: 34,
    px: 1.25,
    borderRadius: `${radii.control}px`,
    border: 1,
    borderColor: selected ? 'primary.main' : surfaces[mode].control,
    bgcolor: selected ? 'primary.main' : 'background.paper',
    color: selected ? 'primary.contrastText' : 'text.primary',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    fontWeight: selected ? 600 : 500,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    transition: `background-color ${motion.fast}, border-color ${motion.fast}`,
    '&:hover': { borderColor: 'primary.main' },
    '&:focus-visible': { outline: 'none', boxShadow: `0 0 0 3px ${theme.palette.action.focus}` },
  });

  return (
    <Stack spacing={0.75} data-form-error={error ? 'true' : undefined}>
      <WizLabel>
        {t('orderCreate.filesAndDue.dueDate')}
        <RequiredMark />
        {` · ${t('orderCreate.due.minDays', { count: minDays })}`}
      </WizLabel>
      <Stack
        direction="row"
        role="group"
        aria-label={t('orderCreate.filesAndDue.dueDate')}
        sx={{ gap: 0.75, flexWrap: 'wrap' }}
      >
        {quick.map((iso) => (
          <Box
            key={iso}
            component="button"
            type="button"
            aria-pressed={value === iso}
            onClick={() => onChange(iso)}
            sx={chip(value === iso)}
          >
            {fmt(iso, 'short')}
          </Box>
        ))}
        <Box
          component="button"
          type="button"
          aria-pressed={other}
          aria-haspopup="dialog"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={chip(other)}
        >
          {other ? fmt(value, 'short') : t('orderCreate.due.other')} ▾
        </Box>
      </Stack>
      <Typography
        sx={{
          fontSize: '0.75rem',
          lineHeight: 1.5,
          color: error ? 'error.main' : 'text.secondary',
        }}
      >
        {error ?? t('orderCreate.due.earliestNote', { date: fmt(quick[0], 'long') })}
      </Typography>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.75, borderRadius: `${radii.card}px` } } }}
      >
        <DateCalendar
          value={value ? dayjs(value) : null}
          minDate={minDate}
          onChange={(d: Dayjs | null, selection) => {
            if (!d || !d.isValid()) return;
            onChange(d.format('YYYY-MM-DD'));
            // Picking a year is a step on the way, not the answer.
            if (selection === 'finish') setAnchor(null);
          }}
        />
      </Popover>
    </Stack>
  );
}
