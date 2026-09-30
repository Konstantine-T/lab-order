import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { type Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Callout, Icon } from '@/components/design';
import { supabase } from '@/lib/supabase';
import { tone } from '@/theme/tokens';
import type { PatientRow } from '@/types/database';
import type { WizardState } from '@/features/doctor/orderCreate/types';
import { normalizeName } from '@/features/doctor/orderCreate/patientName';
import { SectionBadge, SectionCardShell } from '../primitives';
import { useRegisterSection } from './sectionRegistry';
import { InkSegmented, PeriLink, WizLabel } from './ui';

/** The patient card's DOM id — the navigator's scroll target. */
export const PATIENT_SECTION_ID = 'order-patient';

/** The patient's most recent order, for the inline "found" line. */
type LatestOrder = {
  id: string;
  order_code: string;
  status: string;
  lab_id: string;
  service_snapshot: { name?: string } | null;
};

/**
 * The patient card, shared by the new-order form and the edit page.
 *
 * Name, date of birth and sex, then the duplicate check. The check runs as
 * before — debounced on the names, again on blur — and how its answer is
 * asked depends on `matchMode`:
 *
 * - `inline` (the new-order form, the owner's call): one line under the
 *   fields, "found: Ana Kapanadze · previous order LO-1041 (Smile design)",
 *   with the answers beside it — this is the patient, continue from that
 *   order, or a new patient. It does not block the page, so an unanswered
 *   match is reported through `onMatchPendingChange` and the wizard refuses
 *   to send until it is answered, exactly as the old dialog refused to let
 *   the doctor past it: an unanswered match is not "use the existing one".
 * - `dialog` (the edit page, unchanged): the modal with two buttons.
 */
export function PatientStep({
  state,
  update,
  doctorId,
  patientAttempted,
  readOnly,
  matchMode = 'dialog',
  labId,
  onContinueFrom,
  onCancelContinuation,
  onMatchPendingChange,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  doctorId: string;
  patientAttempted?: boolean;
  /** Continue-project: the patient is fixed, so lock the fields + match check. */
  readOnly?: boolean;
  matchMode?: 'dialog' | 'inline';
  /** The lab being ordered from — a previous order can only be continued at the same lab. */
  labId?: string;
  /** Offered only when given: start this order as a continuation of `orderId`. */
  onContinueFrom?: (patientId: string, orderId: string) => void;
  /** Offered only when given: undo a continuation started from the match
   *  line, so a mis-click there is not a dead end. */
  onCancelContinuation?: () => void;
  onMatchPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const aqua = tone('success', theme.palette.mode);
  const [match, setMatch] = useState<PatientRow | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const inline = matchMode === 'inline';

  // The one place the lookup happens, so the debounce and the blur handler
  // can't drift. Names go out normalized — the RPC compares on the same rule,
  // and sending the raw value would miss a match over a stray space.
  const lookupMatch = useCallback(() => {
    if (readOnly) return; // locked patient never needs the match lookup
    const { first_name, last_name, existing_id, force_new, date_of_birth, gender } = state.patient;
    if (!first_name.trim() || !last_name.trim() || !doctorId || existing_id) return;
    // Already answered "create a new one" for this name — asking again on the
    // next blur would be nagging, and the answer is already recorded.
    if (force_new) return;

    void supabase
      .rpc('find_matching_patient', {
        p_first: normalizeName(first_name),
        p_last: normalizeName(last_name),
        p_dob: date_of_birth || null,
        p_gender: gender || null,
        // Explicit, not implied by the session (0023): a clinic admin has no
        // current_doctor_id(), so without this the duplicate warning silently
        // never fires and the clinic path re-creates patients.
        p_doctor_id: doctorId,
      })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMatch(data[0] as PatientRow);
          setMatchOpen(true);
        }
      });
  }, [state.patient, doctorId, readOnly]);

  // Trigger match check as soon as first + last name are filled; gender/DOB
  // are no longer required because the RPC now matches on name only.
  useEffect(() => {
    if (readOnly || state.patient.existing_id || state.patient.force_new) return;
    if (!state.patient.first_name.trim() || !state.patient.last_name.trim()) return;

    // 400ms debounce so we don't hit the RPC on every keystroke while the
    // doctor is still typing the name.
    const timer = setTimeout(lookupMatch, 400);
    return () => clearTimeout(timer);
    // Deliberately keyed on the names only: re-running on every `lookupMatch`
    // identity (it closes over the whole patient object) would restart the
    // debounce when the doctor edits DOB or gender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.patient.first_name,
    state.patient.last_name,
    state.patient.existing_id,
    doctorId,
    readOnly,
  ]);

  const complete = !!state.patient.first_name.trim() && !!state.patient.last_name.trim();
  // Inline, a match stays on screen until it is answered; the dialog tracked
  // the same thing with `matchOpen`.
  const pending =
    inline && !!match && !state.patient.existing_id && !state.patient.force_new && !readOnly;

  useEffect(() => {
    onMatchPendingChange?.(pending);
  }, [pending, onMatchPendingChange]);

  // Only while a match is on screen, and only for the inline line: the most
  // recent order of that patient, so the line can say which case it was.
  const { data: latest } = useQuery({
    queryKey: ['patient-latest-order', match?.id],
    enabled: pending && !!match,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, status, lab_id, service_snapshot')
        .eq('patient_id', match!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as LatestOrder | null;
    },
  });

  // The orders list offers "continue project" on a completed order only, and
  // the server accepts a continuation only within the same lab.
  const canContinue =
    !!onContinueFrom && !!latest && latest.status === 'COMPLETED' && latest.lab_id === labId;

  useRegisterSection({
    id: PATIENT_SECTION_ID,
    kind: 'wizard',
    label: t('orderCreate.nav.patient'),
    name: t('orderCreate.progress.patient'),
    required: true,
    done: complete && !pending,
  });

  // A new name is a new question: the previous match no longer applies, and
  // the lookup will ask again once the typing stops.
  const setName = (patch: { first_name?: string; last_name?: string }) => {
    if (inline) setMatch(null);
    update({
      patient: { ...state.patient, ...patch, existing_id: undefined, force_new: undefined },
    });
  };

  const chooseExisting = () => {
    if (match) update({ patient: { ...state.patient, existing_id: match.id } });
    setMatchOpen(false);
  };
  const createNew = () => {
    // Recording this is the whole fix. Closing the dialog used to be the
    // entire handler, so the answer never left the component and the server
    // matched on the name regardless.
    update({ patient: { ...state.patient, existing_id: undefined, force_new: true } });
    setMatchOpen(false);
  };

  const gender = state.patient.gender;
  // The design draws two; the old select offered three, and the redesign is
  // not the place to take an answer away, so "other" stays.
  const sexOptions = [
    { value: 'female', label: t('orderCreate.patient.genderOptions.female') },
    { value: 'male', label: t('orderCreate.patient.genderOptions.male') },
    { value: 'other', label: t('orderCreate.patient.genderOptions.other') },
  ];

  const matchName = match ? `${match.first_name} ${match.last_name}`.trim() : '';

  return (
    <SectionCardShell
      id={PATIENT_SECTION_ID}
      badge={
        // Not done while a match waits for its answer — the navigator agrees.
        <SectionBadge done={complete && !pending}>
          <Icon name="person" size={15} />
        </SectionBadge>
      }
      title={t('orderCreate.patient.cardTitle')}
      actions={
        patientAttempted && !complete ? (
          <Box
            component="span"
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              px: 1.125,
              py: 0.375,
              borderRadius: 999,
              color: tone('danger', theme.palette.mode).fg,
              bgcolor: tone('danger', theme.palette.mode).bg,
            }}
          >
            {t('orderCreate.required')}
          </Box>
        ) : undefined
      }
    >
      {readOnly && (
        <Callout
          tone="brand"
          action={
            onCancelContinuation && (
              <PeriLink
                onClick={onCancelContinuation}
                sx={{ fontSize: '0.75rem', lineHeight: 1.55 }}
              >
                {t('orderCreate.patient.notAContinuation')}
              </PeriLink>
            )
          }
        >
          {t('orderCreate.patient.lockedForContinuation')}
        </Callout>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        <Stack spacing={0.625}>
          <WizLabel htmlFor="patient-first-name" required>
            {t('orderCreate.patient.firstName')}
          </WizLabel>
          <TextField
            id="patient-first-name"
            value={state.patient.first_name}
            onChange={(e) => setName({ first_name: e.target.value })}
            // Also check on blur: the debounce is keyed on the names, so a
            // doctor who types the name then tabs straight to DOB would
            // otherwise never see the match.
            onBlur={lookupMatch}
            fullWidth
            required
            disabled={readOnly}
            error={patientAttempted && !state.patient.first_name}
            autoComplete="off"
          />
        </Stack>
        <Stack spacing={0.625}>
          <WizLabel htmlFor="patient-last-name" required>
            {t('orderCreate.patient.lastName')}
          </WizLabel>
          <TextField
            id="patient-last-name"
            value={state.patient.last_name}
            onChange={(e) => setName({ last_name: e.target.value })}
            onBlur={lookupMatch}
            fullWidth
            required
            disabled={readOnly}
            error={patientAttempted && !state.patient.last_name}
            autoComplete="off"
          />
        </Stack>
        <Stack spacing={0.625}>
          <WizLabel htmlFor="patient-dob">{t('orderCreate.patient.dateOfBirth')}</WizLabel>
          <DatePicker
            value={state.patient.date_of_birth ? dayjs(state.patient.date_of_birth) : null}
            onChange={(d: Dayjs | null) =>
              update({
                patient: {
                  ...state.patient,
                  date_of_birth: d && d.isValid() ? d.format('YYYY-MM-DD') : '',
                  existing_id: undefined,
                },
              })
            }
            format="YYYY-MM-DD"
            disableFuture
            disabled={readOnly}
            slotProps={{ textField: { fullWidth: true, id: 'patient-dob' } }}
          />
        </Stack>
        <Stack spacing={0.625}>
          <WizLabel>{t('orderCreate.patient.sex')}</WizLabel>
          <InkSegmented
            value={gender}
            options={sexOptions}
            // Optional: clicking the chosen one takes the answer back.
            allowDeselect
            onChange={(v) => update({ patient: { ...state.patient, gender: v } })}
            disabled={readOnly}
            height={40}
            fullWidth
            ariaLabel={t('orderCreate.patient.sex')}
          />
        </Stack>
      </Box>

      {pending && match && (
        <Box data-form-error={patientAttempted ? 'true' : undefined}>
          <Stack
            direction="row"
            alignItems="flex-start"
            spacing={1}
            sx={{ fontSize: '0.8125rem', lineHeight: 1.5, color: aqua.fg }}
          >
            <Icon name="check" size={16} sx={{ mt: '2px' }} />
            <Box sx={{ minWidth: 0 }}>
              <Box component="span">
                {t('orderCreate.patient.match.found', { name: matchName })}
                {latest &&
                  ` · ${t('orderCreate.patient.match.previousOrder', {
                    code: latest.order_code,
                  })}${latest.service_snapshot?.name ? ` (${latest.service_snapshot.name})` : ''}`}
              </Box>
              <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.5 }}>
                <MatchAction onClick={chooseExisting}>
                  {t('orderCreate.patient.match.useThis')}
                </MatchAction>
                {canContinue && (
                  <MatchAction onClick={() => onContinueFrom!(match.id, latest!.id)}>
                    {t('orderCreate.patient.match.continueFrom')}
                  </MatchAction>
                )}
                <MatchAction onClick={createNew}>
                  {t('orderCreate.patient.match.newPatient')}
                </MatchAction>
              </Stack>
            </Box>
          </Stack>
          {patientAttempted && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, pl: 3 }}>
              {t('orderCreate.patient.match.choose')}
            </Typography>
          )}
        </Box>
      )}

      {state.patient.existing_id && !readOnly && (
        <Callout tone="brand" icon="how_to_reg">
          {t('orderCreate.patient.continuingExisting')}
        </Callout>
      )}
      {state.patient.force_new && !readOnly && (
        <Callout tone="brand" icon="person_add">
          {t('orderCreate.patient.creatingNew')}
        </Callout>
      )}

      {!inline && (
        <Dialog
          open={matchOpen && !state.patient.existing_id && !state.patient.force_new && !readOnly}
          // Dismissing is not an answer, so it must not silently mean "use the
          // existing one" — which is what the server does when nothing is
          // recorded. Backdrop and Escape are disabled; the two buttons are
          // the only ways out.
          disableEscapeKeyDown
          onClose={(_e, reason) => {
            if (reason === 'backdropClick') return;
            setMatchOpen(false);
          }}
        >
          <DialogTitle>{t('orderCreate.patient.match.title')}</DialogTitle>
          <DialogContent>
            <Typography>{t('orderCreate.patient.match.body')}</Typography>
            {match && (
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
                {match.first_name} {match.last_name}
                {match.date_of_birth ? ` · ${match.date_of_birth}` : ''}
                {match.gender ? ` · ${match.gender}` : ''}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={createNew}>{t('orderCreate.patient.match.createNew')}</Button>
            <Button variant="contained" onClick={chooseExisting}>
              {t('orderCreate.patient.match.continue')}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </SectionCardShell>
  );
}

/** One answer to the inline match: an underlined link in the line's aqua. */
function MatchAction({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <PeriLink
      onClick={onClick}
      sx={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}
    >
      {children}
    </PeriLink>
  );
}
