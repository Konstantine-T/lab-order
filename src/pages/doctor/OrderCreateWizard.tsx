import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Alert, Box, Button, Stack, Typography, useTheme } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { supabase } from '@/lib/supabase';
import { OrderForm, isOrderFormValid } from '@/features/orderForms/OrderForm';
import {
  collectOrderProblems,
  hasProblem,
  orderProblemMessage,
  type OrderProblem,
} from '@/features/doctor/orderValidation';
import { MobilePriceBar } from '@/components/MobilePriceBar';
import { Callout, Icon, SplitLayout } from '@/components/design';
import { calculatePrice } from '@/utils/pricing';
import { layout, palette2026, radii, surfaces } from '@/theme/tokens';
import type {
  DoctorWorkLocationRow,
  LabFormVersionRow,
  LabRow,
  LabServiceRow,
  PatientRow,
  PricingConfig,
  RushType,
} from '@/types/database';
import { initialState, type WizardState } from '@/features/doctor/orderCreate/types';
import { normalizePatientPayload } from '@/features/doctor/orderCreate/patientName';
import { uploadOrderFile } from '@/features/orders/orderFiles/orderFilesApi';
import { scrollToFirstError } from '@/features/orderForms/scrollToFirstError';
import {
  loadDraft,
  clearDraft,
  type DraftBrokenness,
} from '@/features/doctor/orderCreate/draftStorage';
import { WorkLocationDialog } from '@/features/doctor/workLocations/WorkLocationDialog';
import { createWorkLocation } from '@/features/doctor/workLocations/workLocationsApi';
import type { WorkLocationInput } from '@/features/doctor/workLocations/schema';
import { GuestSubmitDialog } from '@/features/public/GuestSubmitDialog';
import {
  clearGuestDraft,
  readGuestDraft,
  useGuestDraftAutosave,
} from '@/features/public/guestDraft';
import { catalogPaths } from '@/features/public/publicRoutes';
import { useFocusedShell } from '@/layouts/shellFocus';
import { useSections, type SectionEntry } from '@/features/orderForms/wizard/sectionRegistry';
import { SectionRegistryProvider } from '@/features/orderForms/wizard/SectionRegistryProvider';
import { SectionNavigator } from '@/features/orderForms/wizard/SectionNavigator';
import { WizardHeader, type DraftStatus } from '@/features/orderForms/wizard/WizardHeader';
import { PatientStep } from '@/features/orderForms/wizard/PatientCard';
import { FilesCard } from '@/features/orderForms/wizard/FilesCard';
import { DUE_SECTION_ID, SummaryRail } from '@/features/orderForms/wizard/SummaryRail';
import { minTurnaroundDays } from '@/features/orderForms/wizard/dueDate';
import { useServerDraftAutosave } from '@/features/orderForms/wizard/useServerDraftAutosave';
import { useStickyChromeHeight } from '@/features/orderForms/wizard/scroll';
import { joinList, requiredProgress } from '@/features/orderForms/wizard/progress';
import { SectionBadge, SectionCardShell } from '@/features/orderForms/primitives';

// The patient card moved beside the wizard's other parts; the edit page still
// imports it from here.
export { PatientStep };

/** Effective rush surcharge derived from the lab's pricing config + the
 * doctor's rush toggle. Returns undefined → calculatePrice falls back to no
 * rush. */
function effectiveRush(
  pricing: PricingConfig | undefined,
  rushRequested: boolean,
): { type: RushType; value: number } | undefined {
  if (!rushRequested) return { type: 'NONE', value: 0 };
  const r = pricing?.rush;
  if (!r || r.type === 'NONE') return { type: 'NONE', value: 0 };
  return { type: r.type, value: r.value ?? 0 };
}

/**
 * The order form, for whoever is placing the order.
 *
 * A doctor orders for themselves; a clinic admin orders for one of their
 * linked doctors, chosen up front and carried in `?doctor=`. Everything below
 * that choice — patient, form, pricing, drafts, files — is identical, which is
 * the point: the clinic used to have a thinner parallel screen, and the two
 * drifted. `basePath` swaps the routes and the submit RPC; nothing else.
 *
 * `guest` is the third mode: no session at all. The form, the pricing and the
 * validation are exactly the doctor's — the lab's catalogue is readable
 * without an account (0034) — but there is no doctor to look patients up
 * for, no work locations to pick from, nowhere to upload a file to, and
 * nothing to submit as. The draft lives in this browser instead of
 * `order_drafts`, and Send opens the sign-in dialog; the doctor's wizard then
 * picks the draft up through `?resume=1`.
 *
 * The page is the 2026-09 redesign's: its own header in place of the site's
 * top bar (`useFocusedShell` — the guest keeps the public bar), then three
 * columns on a desktop — the section navigator, the form, the summary rail —
 * which stack into one below `lg`.
 */
export function OrderCreateWizard({
  basePath = '/doctor',
  guest = false,
}: {
  basePath?: string;
  guest?: boolean;
}) {
  const { t, i18n } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const isClinic = !guest && basePath === '/clinic';
  // Who the order is FOR. The clinic admin picks this first; a doctor is
  // always acting for themselves; a guest is nobody yet.
  const doctorId = guest
    ? undefined
    : isClinic
      ? params.get('doctor') || ''
      : user?.doctor_profile?.id;
  // Who is DOING the ordering — the draft's owner, so a clinic admin's autosave
  // never lands on the draft its doctor is halfway through (0023).
  const authorUserId = user?.id;

  const labParam = params.get('lab') ?? '';
  const serviceParam = params.get('service') ?? '';
  // Set when continuing a project: pre-fill + lock the patient, link lineage.
  const patientParam = params.get('patient') ?? '';
  const continuesParam = params.get('continues') ?? '';
  const isContinuation = !!patientParam;

  // The order built in this browser without an account — for the guest who
  // closed the tab and came back, and for the doctor who has just signed in
  // to send it (`?resume=1`). Read once, synchronously, so the first render
  // already holds the answers; the server draft below is then told to keep
  // its hands off.
  const [resumed] = useState(() => {
    if (!guest && params.get('resume') !== '1') return null;
    const draft = readGuestDraft();
    return draft && draft.labId === labParam && draft.serviceId === serviceParam ? draft : null;
  });

  const [state, setState] = useState<WizardState>(() => ({
    ...(resumed ? resumed.state : initialState),
    lab_id: labParam,
    lab_service_id: serviceParam,
  }));
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [patientAttempted, setPatientAttempted] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  // Attachments picked while filling the form. Deliberately NOT in `state`:
  // the draft autosaves as JSON and a File can't be serialized, so a resumed
  // draft simply starts with an empty list.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [failedUploads, setFailedUploads] = useState<string[]>([]);
  const [dismissedBroken, setDismissedBroken] = useState(false);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  // A duplicate-patient match on screen and not yet answered (inline now, a
  // dialog before): sending waits for the answer, as the dialog made it.
  const [matchPending, setMatchPending] = useState(false);
  // The continuation was started from the patient card's match line, here —
  // not arrived at from an order or patient page — so it may be undone.
  const [continuedInline, setContinuedInline] = useState(false);
  const draftHydratedRef = useRef(!!resumed);
  const continuePatientRef = useRef(false);
  // The patient as the doctor typed it before continuing inline — what the
  // undo puts back once the locked row's seed has overwritten it.
  const typedPatientRef = useRef<WizardState['patient'] | null>(null);
  const queryClient = useQueryClient();

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  // Once a signed-in doctor holds it in React state the browser copy has done
  // its job: from here the server autosave carries the order, and leaving a
  // second, older copy behind would only re-trigger the resume redirect —
  // with stale answers — on the next visit. A guest keeps theirs; it is the
  // only copy they have. Not in the state initialiser: StrictMode runs that
  // twice, and the second run would find nothing.
  useEffect(() => {
    if (resumed && !guest) clearGuestDraft();
  }, [resumed, guest]);

  // Where "change lab / service" and the initial bounce go. The acting doctor
  // rides along so the marketplace can keep ordering on their behalf.
  const paths = catalogPaths(guest, basePath);
  const marketplacePath = isClinic
    ? `${paths.marketplace}${doctorId ? `?doctor=${doctorId}` : ''}`
    : paths.marketplace;

  // Nothing picked yet → send them to pick it. A clinic admin who arrives
  // without a doctor goes one step further back, to the doctor picker.
  useEffect(() => {
    if (isClinic && !doctorId) {
      // Carry any lab/service already chosen, so picking the doctor resumes
      // here instead of restarting the flow.
      const carry = labParam && serviceParam ? `?lab=${labParam}&service=${serviceParam}` : '';
      navigate(`${basePath}/orders/new${carry}`, { replace: true });
      return;
    }
    if (!labParam || !serviceParam) {
      navigate(marketplacePath, { replace: true });
    }
  }, [isClinic, doctorId, labParam, serviceParam, navigate, basePath, marketplacePath]);

  // Load draft from Supabase once.
  const { data: draftData, isSuccess: draftLoaded } = useQuery({
    queryKey: ['doctor-draft', doctorId, authorUserId],
    enabled: !!doctorId && !!authorUserId,
    queryFn: () => loadDraft(doctorId!, authorUserId!),
    staleTime: Infinity,
    gcTime: 0,
  });

  // Hydrate wizard state from draft when it arrives (once, if lab/service match).
  useEffect(() => {
    if (!draftLoaded || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (
      draftData &&
      draftData.state.lab_id === labParam &&
      draftData.state.lab_service_id === serviceParam
    ) {
      // Clear existing_id so the patient-match dialog re-shows on resume.
      // The stored draft.step is ignored now — single page, no steps.
      setState({
        ...draftData.state,
        patient: { ...draftData.state.patient, existing_id: undefined },
      });
    }
  }, [draftLoaded, draftData, labParam, serviceParam]);

  // Continue-project: load the locked patient and seed it as an existing
  // patient (existing_id set → no match dialog). By the time we're here the
  // draft-collision modal has already cleared any conflicting draft.
  const { data: continuePatientRow } = useQuery({
    queryKey: ['continue-patient', patientParam, doctorId],
    enabled: !!patientParam && !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientParam)
        .eq('doctor_id', doctorId!)
        .maybeSingle();
      if (error) throw error;
      return data as PatientRow | null;
    },
  });

  useEffect(() => {
    if (!isContinuation || continuePatientRef.current || !continuePatientRow) return;
    continuePatientRef.current = true; // seed once
    update({
      patient: {
        first_name: continuePatientRow.first_name,
        last_name: continuePatientRow.last_name,
        date_of_birth: continuePatientRow.date_of_birth ?? '',
        gender: continuePatientRow.gender ?? '',
        existing_id: continuePatientRow.id,
      },
    });
  }, [isContinuation, continuePatientRow]);

  // ----- Data queries -------------------------------------------------------
  const { data: locations = [] } = useQuery({
    queryKey: ['doctor-locations-for-order', doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_work_locations')
        .select('*')
        .eq('doctor_id', doctorId!)
        .is('archived_at', null)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DoctorWorkLocationRow[];
    },
  });

  // Default work location once known
  useEffect(() => {
    if (!state.doctor_work_location_id && locations[0]) {
      update({ doctor_work_location_id: locations[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  // The single service the doctor picked from the marketplace, plus its
  // linked form's current version. We don't need to load all labs/services
  // anymore — the lab + service are baked in via URL params.
  const { data: selectedService } = useQuery({
    queryKey: ['orderable-service', state.lab_service_id, state.lab_id],
    enabled: !!state.lab_service_id && !!state.lab_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_services')
        .select(
          '*, lab_forms!lab_services_linked_form_fk(id, status, current_version_id, title)',
        )
        .eq('id', state.lab_service_id)
        .eq('lab_id', state.lab_id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (LabServiceRow & {
            lab_forms: { id: string; status: string; current_version_id: string | null; title: string } | null;
          })
        | null;
    },
  });

  const { data: lab } = useQuery({
    queryKey: ['orderable-lab', state.lab_id],
    enabled: !!state.lab_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name, city, logo_url, contact_email')
        .eq('id', state.lab_id)
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<LabRow, 'id' | 'public_name' | 'city' | 'logo_url' | 'contact_email'> | null;
    },
  });

  const linkedForm = selectedService?.lab_forms;

  const { data: version } = useQuery({
    queryKey: ['order-form-version', linkedForm?.current_version_id],
    enabled: !!linkedForm?.current_version_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_form_versions')
        .select('*')
        .eq('id', linkedForm!.current_version_id!)
        .maybeSingle();
      if (error) throw error;
      return data as LabFormVersionRow | null;
    },
  });

  // ----- Broken-draft detection ------------------------------------------------
  // The orderable-lab and orderable-service queries already filter by
  // is_active / approval_status, so a null result means unavailable.
  const draftBrokenness = useMemo<DraftBrokenness | null>(() => {
    if (!draftLoaded || !draftData) return null;
    if (!lab) return { broken: true, reason: 'lab_unavailable' as const };
    if (!selectedService) return { broken: true, reason: 'service_unavailable' as const };
    const form = selectedService.lab_forms;
    if (!form || form.status !== 'PUBLISHED') {
      return { broken: true, reason: 'form_unavailable' as const };
    }
    return { broken: false };
  }, [draftLoaded, draftData, lab, selectedService]);

  const isBroken = (draftBrokenness?.broken ?? false) && !dismissedBroken;

  // ----- Autosave (debounced, starts after draft is loaded) ----------------
  // Once the order is submitted, stop autosaving. Otherwise the hook's
  // unmount flush re-creates the draft row we just deleted in onSuccess,
  // and OrdersListPage's modal pops up again for a phantom draft.
  // step is hard-coded to 0 now — the wizard is a single page with no steps,
  // but the draft schema (and OrdersListPage's resume modal) still expect the
  // column, so we keep writing 0 to avoid a migration.
  const serverDraft = useServerDraftAutosave(
    draftLoaded && !submittedOrderId ? doctorId : undefined,
    authorUserId,
    state,
    0,
    lab?.public_name ?? '',
    selectedService?.name ?? '',
  );

  // The guest's equivalent: this browser, not `order_drafts`. Off in every
  // other mode — the hook is a no-op when disabled, so it can sit here
  // unconditionally and keep the hook order stable.
  const guestSave = useGuestDraftAutosave(guest && !submittedOrderId, {
    labId: labParam,
    serviceId: serviceParam,
    formVersionId: version?.id ?? null,
    state,
  });

  // ----- Validation ---------------------------------------------------------
  // Single page now: the checks that used to gate each step transition run once
  // on Submit. We flip all three "attempted" flags up front so every section
  // surfaces its inline errors at once, then return on the first hard failure
  // for the top-level banner + scroll.
  const [problems, setProblems] = useState<OrderProblem[]>([]);
  const collectProblems = () =>
    collectOrderProblems({
      patient: state.patient,
      answers: state.answers,
      doctor_work_location_id: state.doctor_work_location_id,
      requested_due_date: state.requested_due_date,
      configuration: version?.configuration_json,
      pricing: version?.pricing_configuration_json,
      minDays: minTurnaroundDays(
        selectedService?.average_turnaround_days,
        version?.pricing_configuration_json,
        state.rush_requested,
      ),
      // A guest has no locations by definition, and is told so in words; a
      // red field on top would be nagging about something they cannot do yet.
      noLocations: guest || locations.length === 0,
    });
  // Once a submit has failed, keep the named problems in sync with what the
  // doctor is typing — a field they have just fixed must stop being red
  // without waiting for a second submit.
  const liveProblems = problems.length === 0 ? problems : collectProblems();

  const validateAll = (): boolean => {
    setError(null);
    setPatientAttempted(true);
    setSubmitAttempted(true);

    // A form the lab hasn't published isn't the doctor's to fix, so it stays a
    // standalone message rather than a line in a list of things to go correct.
    if (!linkedForm || linkedForm.status !== 'PUBLISHED') {
      setProblems([]);
      setError(t('orderCreate.labService.noPublishedForm'));
      return false;
    }

    const found = collectProblems();

    setProblems(found);
    if (found.length > 0) {
      scrollToFirstError();
      return false;
    }
    return true;
  };

  // The lab republished its form between the guest saving and the doctor
  // resuming. `lab_form_versions` is immutable, so a republish is a new id;
  // the answers were given against the old one. They are kept — the work is
  // theirs — but every field is checked and shown, so nothing is sent against
  // questions they never saw. Only once: the doctor may then fix things
  // without the banner re-flipping on every keystroke.
  const formChanged =
    !!resumed?.formVersionId && !!version && version.id !== resumed.formVersionId;
  const driftCheckedRef = useRef(false);
  useEffect(() => {
    if (!formChanged || driftCheckedRef.current) return;
    driftCheckedRef.current = true;
    setPatientAttempted(true);
    setSubmitAttempted(true);
    setProblems(collectProblems());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formChanged]);

  const handleSubmit = () => {
    const valid = validateAll();
    if (matchPending) {
      // The patient card now marks the unanswered match as the error to fix;
      // when nothing else is wrong, that is where the doctor is taken.
      if (valid) scrollToFirstError();
      return;
    }
    if (!valid) return;
    if (guest) {
      // A complete order that only lacks an account. The draft is written
      // before the dialog opens — before any sign-in attempt, before any
      // navigation to register — so what the dialog says about it is true.
      guestSave.saveNow();
      setGuestDialogOpen(true);
      return;
    }
    submit.mutate();
  };

  // "Add work location" inside the wizard: a doctor who has none — a fresh
  // registration, most often one resuming a guest order — used to be sent to
  // the work locations page, mid-order. The new one is selected on return;
  // the default-location effect above would pick it anyway when it is the
  // only one, but selecting it by id also covers a doctor adding a second.
  const addLocation = useMutation({
    mutationFn: async (values: WorkLocationInput) => {
      if (!doctorId) throw new Error('Missing doctor profile');
      return createWorkLocation(doctorId, values);
    },
    onSuccess: (id) => {
      update({ doctor_work_location_id: id });
      void queryClient.invalidateQueries({ queryKey: ['doctor-locations-for-order', doctorId] });
      void queryClient.invalidateQueries({ queryKey: ['doctor-work-locations', doctorId] });
    },
  });

  // ----- Derived rush -------------------------------------------------------
  const rush = effectiveRush(version?.pricing_configuration_json, state.rush_requested);

  // If the lab disables rush after the doctor opted in (e.g. they edit a saved
  // draft after a pricing change), drop the toggle silently.
  useEffect(() => {
    if (!version) return;
    const labRushType = version.pricing_configuration_json?.rush?.type ?? 'NONE';
    if (state.rush_requested && labRushType === 'NONE') {
      update({ rush_requested: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, state.rush_requested]);

  // ----- Submit -------------------------------------------------------------
  const generatedTotal = useMemo(() => {
    if (!version) return null;
    const result = calculatePrice(version.pricing_configuration_json, state.answers, rush);
    return result.kind === 'CALCULATED' ? result.total : null;
  }, [version, state.answers, rush]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!version) throw new Error('No form version');
      const submittedRush = rush ?? { type: 'NONE' as RushType, value: 0 };
      // clinic_submit_order (0014) re-checks the doctor-clinic link server-side
      // and attributes the order to the doctor, not to the admin who typed it.
      const { data, error } = await supabase.rpc(
        isClinic ? 'clinic_submit_order' : 'submit_order',
        {
        ...(isClinic ? { p_doctor_id: doctorId } : {}),
        p_lab_id: state.lab_id,
        p_lab_service_id: state.lab_service_id,
        p_doctor_work_location_id: state.doctor_work_location_id,
        // Normalized so the server's dedup guard sees the same string the
        // wizard's match lookup did — otherwise "გივი " and "გივი" become two
        // patients.
        p_patient: normalizePatientPayload(state.patient),
        p_lab_form_version_id: version.id,
        p_invoice_recipient_type: state.invoice_recipient_type,
        p_requested_due_date: state.requested_due_date || null,
        // Optional. Null means "that day, any time" — the window only exists
        // when the doctor asked for one.
        p_requested_due_time: state.requested_due_time || null,
        p_rush_type: submittedRush.type,
        p_rush_value: submittedRush.type === 'NONE' ? null : submittedRush.value,
        p_answers: state.answers,
        p_generated_total: generatedTotal,
        p_continues_order_id: continuesParam || null,
        },
      );
      if (error) throw error;
      const orderId = data as string;

      // Files can only be uploaded once the order exists: the storage path and
      // every RLS policy on the bucket key off the order id. A failure here is
      // NOT fatal — the order is already placed, so we collect the names and
      // let the doctor re-attach from the order page.
      if (pendingFiles.length > 0 && user) {
        const failed: string[] = [];
        for (const f of pendingFiles) {
          try {
            await uploadOrderFile({ id: orderId, lab_id: state.lab_id }, f, user.id, user.role);
          } catch {
            failed.push(f.name);
          }
        }
        if (failed.length) setFailedUploads(failed);
      }
      return orderId;
    },
    onSuccess: async (orderId) => {
      // Delete the draft row, then nuke the cached value so other mounted
      // pages (e.g. OrdersListPage in browser back/forward cache) don't see
      // a phantom draft. setQueryData is for already-mounted readers,
      // invalidate is for the next fresh read.
      if (doctorId && authorUserId) {
        try {
          await clearDraft(doctorId, authorUserId);
        } catch {
          // Swallow — the DB delete might race with submit, but the order
          // already exists, so the doctor isn't blocked. The cache update
          // below still runs.
        }
        queryClient.setQueryData(['doctor-draft', doctorId, authorUserId], null);
        queryClient.invalidateQueries({ queryKey: ['doctor-draft', doctorId, authorUserId] });
        queryClient.removeQueries({ queryKey: ['draft-broken-check'] });
      }
      // Already gone if this order was resumed from a guest draft; cheap to
      // say again, and it is the rule: a sent order leaves nothing behind.
      clearGuestDraft();
      setSubmittedOrderId(orderId);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  // ----- Page chrome --------------------------------------------------------
  // The site's top bar steps aside for the form's own header — for a doctor or
  // a clinic; the guest keeps the public bar. Not on the success screen, which
  // leads back into the app.
  const headerSlot = useFocusedShell(!guest && !submittedOrderId);
  const chromeHeight = useStickyChromeHeight(!submittedOrderId);

  // "Continue from that order", from the patient card's match line: the same
  // lineage the orders list's "continue project" starts — the patient locked,
  // `continues` sent as p_continues_order_id — without leaving the form.
  const continueFrom = useCallback(
    (patientId: string, orderId: string) => {
      typedPatientRef.current = state.patient;
      // The patient is the matched one from this moment, not only once the
      // locked row has loaded and seeded the card.
      setState((s) => ({
        ...s,
        patient: { ...s.patient, existing_id: patientId, force_new: undefined },
      }));
      setContinuedInline(true);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('patient', patientId);
          next.set('continues', orderId);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, state.patient],
  );

  // …and back out of it. The link sits one mis-click from "this is the
  // patient", so what it started can be undone: the lineage goes, the patient
  // unlocks as the doctor typed it — not with the matched patient's date of
  // birth and sex, which a "new patient" answer would then quietly keep — and
  // the match line asks its question again. A continuation begun on an order
  // or patient page was chosen there, and keeps no such way out.
  const cancelContinuation = useCallback(() => {
    const typed = typedPatientRef.current;
    typedPatientRef.current = null;
    setContinuedInline(false);
    continuePatientRef.current = false;
    setState((s) => ({
      ...s,
      patient: { ...(typed ?? s.patient), existing_id: undefined, force_new: undefined },
    }));
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('patient');
        next.delete('continues');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  // ----- Progress -----------------------------------------------------------
  // The navigator's dots and its "required N / M" note run the submit gate's
  // own checks, live — not only after a failed submit.
  const configuration = version?.configuration_json;
  const pricingConfig = version?.pricing_configuration_json;
  const currentProblems = collectProblems();
  const formValid = !!configuration && !hasProblem(currentProblems, 'formAnswers');
  // Whether the form asks for anything at all, judged on empty answers so the
  // count does not change as the doctor fills it in.
  const formHasRequired = useMemo(
    () => !!configuration && !isOrderFormValid(configuration, {}, pricingConfig),
    [configuration, pricingConfig],
  );
  const patientDone =
    !!state.patient.first_name.trim() && !!state.patient.last_name.trim() && !matchPending;
  const dueDone = !hasProblem(currentProblems, 'dueDate');
  const locationDone = !!state.doctor_work_location_id;

  const resolveSection = useCallback(
    (e: SectionEntry) => {
      if (e.done !== undefined) return e.done;
      // A required section whose template does not say: done once the whole
      // form validates — or, once a submit attempt has put every error on
      // screen, once this section shows none.
      if (e.required) return formValid || (submitAttempted && !e.invalid);
      return !!e.filled;
    },
    [formValid, submitAttempted],
  );

  const lang = i18n.resolvedLanguage ?? i18n.language;
  const progressText = (sections: SectionEntry[]): string => {
    const p = requiredProgress({
      patient: { name: t('orderCreate.progress.patient'), done: patientDone },
      form:
        configuration && (formHasRequired || !formValid)
          ? { name: t('orderCreate.progress.form'), valid: formValid, sections }
          : undefined,
      due: { name: t('orderCreate.progress.dueDate'), done: dueDone },
      // A guest picks a location only after signing in.
      location: guest
        ? undefined
        : { name: t('orderCreate.progress.workLocation'), done: locationDone },
    });
    const count = t('orderCreate.progress.count', { done: p.done, total: p.total });
    if (p.missing.length === 0) return `${count} ${t('orderCreate.progress.ready')}`;
    const names = p.missing.map((n) => inSentence(n, lang));
    const list = joinList(names, t('orderCreate.progress.and'));
    return `${count} ${t('orderCreate.progress.left', { list })}`;
  };

  if (submittedOrderId) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 520, mx: 'auto', py: 8 }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'success.main',
            color: '#fff',
          }}
        >
          <Icon name="check" size={34} />
        </Box>
        <Typography variant="h3" component="h1" sx={{ textAlign: 'center' }}>
          {t('orderCreate.review.submitSuccess')}
        </Typography>
        {/* The order is placed either way — a failed attachment must not read
            as a failed order, so this is a warning, not an error. */}
        {failedUploads.length > 0 && (
          <Callout tone="warning">
            {tc('orderFiles.errors.partialSubmit', { names: failedUploads.join(', ') })}
          </Callout>
        )}
        <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
          <Button
            variant="contained"
            onClick={() => navigate(`${basePath}/orders/${submittedOrderId}`)}
          >
            {tc('actions.viewDetails')}
          </Button>
          <Button variant="outlined" onClick={() => navigate(`${basePath}/orders`)}>
            {t('nav.orders')}
          </Button>
        </Stack>
      </Stack>
    );
  }

  // Selected work location — drives the clinic-code warning in the invoice card.
  const selectedLoc = locations.find((l) => l.id === state.doctor_work_location_id);

  const patientName = `${state.patient.first_name} ${state.patient.last_name}`.trim();

  // Nothing before the first write: "saved" before anything was typed would
  // be a claim about nothing.
  const draftStatus: DraftStatus = guest
    ? guestSave.status === 'failed'
      ? { kind: 'notSavedOnDevice' }
      : guestSave.status === 'saved'
        ? { kind: 'savedOnDevice' }
        : { kind: 'none' }
    : serverDraft.failed
      ? { kind: 'failed' }
      : serverDraft.savedAt
        ? { kind: 'saved', at: formatClock(serverDraft.savedAt) }
        : { kind: 'none' };

  const railTop = Math.max(layout.railTop, chromeHeight);

  return (
    <>
      <WizardHeader
        slot={headerSlot}
        backTo={marketplacePath}
        ordersTo={guest ? undefined : `${basePath}/orders`}
        lab={
          lab && selectedService
            ? { name: lab.public_name, service: selectedService.name }
            : undefined
        }
        onChangeLabService={() => navigate(marketplacePath)}
        doctorChip={
          isClinic && doctorId ? (
            <ActingDoctorChip
              doctorId={doctorId}
              compact
              // Carry the lab and service, so switching doctor lands straight
              // back here rather than restarting at the marketplace.
              changeTo={`${basePath}/orders/new${
                labParam && serviceParam ? `?lab=${labParam}&service=${serviceParam}` : ''
              }`}
            />
          ) : undefined
        }
        draft={draftStatus}
      />

      <SectionRegistryProvider resolve={resolveSection}>
        <SplitLayout
          rail={
            <SummaryRail
              state={state}
              update={update}
              locations={locations}
              version={version}
              rush={rush}
              selectedLoc={selectedLoc}
              averageTurnaroundDays={selectedService?.average_turnaround_days ?? null}
              problems={liveProblems}
              patientName={patientName}
              submitting={submit.isPending}
              disabled={isBroken}
              showError={submitAttempted && !!error}
              onSubmit={handleSubmit}
              guest={guest}
              sendDone={dueDone && (guest || locationDone)}
              onAddLocation={
                isClinic || guest ? undefined : () => setLocationDialogOpen(true)
              }
            />
          }
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '180px minmax(0, 1fr)' },
              gap: 2.5,
              alignItems: 'start',
            }}
          >
            {/* Stretched to the form's height so the pinned card has a track
                to travel along. */}
            <Box sx={{ display: { xs: 'none', lg: 'block' }, alignSelf: 'stretch' }}>
              <SectionNavigator
                top={railTop}
                railIds={[DUE_SECTION_ID]}
                progress={progressText}
              />
            </Box>

            {/* Gap, not margins: the first child is hidden on a desktop, and a
                margin-based stack would still indent the column by one step. */}
            <Stack spacing={1.75} useFlexGap sx={{ minWidth: 0 }}>
              {/* The navigator's note, for the screens that have no navigator. */}
              <ProgressLine progress={progressText} />

              {/* The doctor just signed in or registered to send this. Say so,
                  and say what is left — checking it over — rather than dropping
                  them on a filled form with no word of where it came from. */}
              {resumed && !guest && !formChanged && (
                <Callout tone="brand" icon="how_to_reg">
                  {t('orderCreate.guest.resumed')}
                </Callout>
              )}
              {formChanged && (
                <Callout tone="warning" title={t('orderCreate.guest.formChangedTitle')}>
                  {t('orderCreate.guest.formChangedBody')}
                </Callout>
              )}

              {isBroken && (
                <Callout tone="warning" title={t('orderCreate.brokenDraft.alert')}>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" onClick={() => setDismissedBroken(true)}>
                      {t('orderCreate.brokenDraft.keepAnswers')}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={async () => {
                        if (doctorId && authorUserId) await clearDraft(doctorId, authorUserId);
                        setDismissedBroken(false);
                        setState({ ...initialState, lab_id: labParam, lab_service_id: serviceParam });
                      }}
                    >
                      {t('orderCreate.brokenDraft.discard')}
                    </Button>
                  </Stack>
                </Callout>
              )}

              {error && <Alert severity="error">{error}</Alert>}

              {/* Named, and all of them at once. One line when there is one
                  thing to fix; a list when there are several, in the order they
                  appear down the page so it reads as a route through the form. */}
              {liveProblems.length > 0 && (
                <Alert severity="error">
                  {liveProblems.length === 1 ? (
                    orderProblemMessage(liveProblems[0], t)
                  ) : (
                    <>
                      {t('orderCreate.fixTheseFields')}
                      <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.5 }}>
                        {liveProblems.map((p, i) => (
                          <li key={i}>{orderProblemMessage(p, t)}</li>
                        ))}
                      </Box>
                    </>
                  )}
                </Alert>
              )}

              {/* What the doctor picked, in full, before they fill anything in.
                  The tile they clicked clamps its description to three lines so
                  the grid stays even; this is where the rest of it lives, and
                  the only place before the patient form where they can still
                  read it. */}
              {selectedService?.short_description && (
                <SectionCardShell
                  badge={
                    <SectionBadge>
                      <Icon name="category" size={15} />
                    </SectionBadge>
                  }
                  title={selectedService.name}
                >
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      color: 'text.secondary',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                    }}
                  >
                    {selectedService.short_description}
                  </Typography>
                </SectionCardShell>
              )}

              <PatientStep
                state={state}
                update={update}
                doctorId={doctorId ?? ''}
                patientAttempted={patientAttempted}
                readOnly={isContinuation}
                matchMode="inline"
                labId={state.lab_id}
                onContinueFrom={continueFrom}
                onCancelContinuation={continuedInline ? cancelContinuation : undefined}
                onMatchPendingChange={setMatchPending}
              />

              {version && (
                <FormStep
                  state={state}
                  update={update}
                  version={version}
                  showErrors={submitAttempted}
                />
              )}

              <FilesCard
                labEmail={lab?.contact_email}
                files={pendingFiles}
                onChange={setPendingFiles}
                disabled={submit.isPending}
                guest={guest}
                onSignIn={
                  guest
                    ? () => {
                        // Written now, not on the debounce: the sign-in page
                        // is a navigation away, and the doctor's wizard picks
                        // the draft up from this browser once they are in.
                        guestSave.saveNow();
                        navigate('/login');
                      }
                    : undefined
                }
              />
            </Stack>
          </Box>
        </SplitLayout>
      </SectionRegistryProvider>

      {/* Page level, not inside the rail: below `lg` the rail drops under the
          form, so the running total would scroll away as the doctor fills it. */}
      <MobilePriceBar
        pricing={version?.pricing_configuration_json}
        answers={state.answers}
        rush={rush}
      />

      {guest && (
        <GuestSubmitDialog
          open={guestDialogOpen}
          onClose={() => setGuestDialogOpen(false)}
          saveStatus={guestSave.status}
        />
      )}

      {!guest && !isClinic && (
        <WorkLocationDialog
          open={locationDialogOpen}
          onClose={() => setLocationDialogOpen(false)}
          onSubmit={(values) => addLocation.mutateAsync(values).then(() => undefined)}
        />
      )}
    </>
  );
}

/** "14:32", in the reader's own clock. */
function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * A section name inside a sentence. English and Russian labels are title
 * case ("Shade") and read wrong mid-sentence; Georgian has no case. An
 * acronym ("CAD design") is left alone.
 */
function inSentence(name: string, lang: string): string {
  if (lang.startsWith('ka') || name.length < 2) return name;
  const [a, b] = name;
  return b === b.toLowerCase() ? a.toLowerCase() + name.slice(1) : name;
}

/**
 * The navigator's progress note on its own, for phones and tablets, where the
 * navigator is hidden and the form is one column.
 */
function ProgressLine({ progress }: { progress: (sections: SectionEntry[]) => string }) {
  const theme = useTheme();
  const sections = useSections();
  const text = progress(sections);
  if (!text) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="flex-start"
      aria-live="polite"
      sx={{
        display: { xs: 'flex', lg: 'none' },
        px: 1.75,
        py: 1.25,
        borderRadius: `${radii.card}px`,
        border: 1,
        borderColor: surfaces[theme.palette.mode].borderSolid,
        bgcolor: 'background.paper',
        fontSize: '0.75rem',
        lineHeight: 1.5,
        color: 'text.secondary',
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 8,
          height: 8,
          mt: '5px',
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: palette2026.aqua,
        }}
      />
      <span>{text}</span>
    </Stack>
  );
}

// ============================================================================
// The clinical form
// ============================================================================
// Exported for reuse on the edit page — same dental form, one card per
// numbered section.
export function FormStep({
  state,
  update,
  version,
  showErrors,
}: {
  state: WizardState;
  update: (p: Partial<WizardState>) => void;
  version: LabFormVersionRow;
  showErrors?: boolean;
}) {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  // The running total lives in the summary rail, where the mockups put it —
  // this step is purely the clinical form, one card per numbered section.
  return (
    <Stack spacing={1.75}>
      {/* A standing fact about what the labs accept, not a warning: a quiet
          line in the redesign's info style rather than a tinted panel. */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-start"
        sx={{
          px: 1.75,
          py: 1.25,
          borderRadius: `${radii.card}px`,
          border: 1,
          borderColor: surfaces[theme.palette.mode].borderSolid,
          bgcolor: 'background.paper',
        }}
      >
        <Icon name="info" size={16} sx={{ color: palette2026.peri, mt: '1px' }} />
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>
          {t('orderCreate.digitalImpressionsNote')}
        </Typography>
      </Stack>
      <OrderForm
        configuration={version.configuration_json}
        pricing={version.pricing_configuration_json}
        values={state.answers}
        onChange={(answers) => update({ answers })}
        showErrors={showErrors}
      />
    </Stack>
  );
}
