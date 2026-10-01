import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { FormProvider, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { CardStack, PageHeader, SectionCard } from '@/components/design';
import { RHFTextField } from '@/components/RHFTextField';
import { LANGUAGES } from '@/i18n';
import { LabApprovalBanner } from '@/features/lab/LabApprovalBanner';
import { LabAccountCard } from '@/features/lab/LabAccountCard';
import { LabPriceListCard } from '@/features/lab/priceList/LabPriceListCard';
import { clearNotice, leaveNotice, readNotice } from '@/features/lab/remountNotice';
import { classifyLabProfileError } from '@/features/lab/labProfileErrors';
import {
  LAB_TEXT_LANGS,
  LAB_TEXT_MAX,
  coercePublicTranslations,
} from '@/features/lab/labText';
import { isLabProfileComplete, labProfileSchema } from '@/features/lab/labProfileSchema';
import type { LabPublicTranslations, LabRow, LabTextLang } from '@/types/database';

// One translation slot. Optional throughout: a blank field falls back to the
// base text, so nothing here is ever required.
const translationSlot = z.object({
  public_name: z
    .string()
    .max(LAB_TEXT_MAX.public_name)
    .superRefine((v, ctx) => {
      if (v.trim() && v.trim().length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: 2, type: 'string', inclusive: true });
      }
    }),
  short_description: z.string().max(LAB_TEXT_MAX.short_description),
});

// The page's form: the lab profile plus the translation slots. Extended here
// rather than in labProfileSchema, whose required fields are the approval
// gate (isLabProfileComplete on the admin review page) and must not learn
// about translations — they are optional for every lab, approved or not.
const pageSchema = labProfileSchema.extend({
  public_translations: z.object({ ka: translationSlot, en: translationSlot, ru: translationSlot }),
});
type PageInput = z.infer<typeof pageSchema>;
type TranslationSlots = PageInput['public_translations'];

const toSlots = (raw: unknown): TranslationSlots => {
  const tr = coercePublicTranslations(raw);
  // Every branch seeded with '' — an undefined one would make its inputs
  // uncontrolled until the first keystroke.
  const slot = (l: LabTextLang) => ({
    public_name: tr[l]?.public_name ?? '',
    short_description: tr[l]?.short_description ?? '',
  });
  return { ka: slot('ka'), en: slot('en'), ru: slot('ru') };
};

/** What the RPC is sent: blanks dropped, so an untouched language is absent. */
const fromSlots = (slots: TranslationSlots): LabPublicTranslations => {
  const out: LabPublicTranslations = {};
  for (const l of LAB_TEXT_LANGS) {
    const name = slots[l].public_name.trim();
    const desc = slots[l].short_description.trim();
    if (name || desc) {
      out[l] = {
        ...(name && { public_name: name }),
        ...(desc && { short_description: desc }),
      };
    }
  }
  return out;
};

const hasText = (slot: { public_name: string; short_description: string } | undefined) =>
  !!slot && (slot.public_name.trim() !== '' || slot.short_description.trim() !== '');

const empty: PageInput = {
  public_name: '',
  short_description: '',
  logo_url: '',
  legal_name: '',
  identification_code: '',
  legal_address: '',
  working_address: '',
  city: '',
  country: '',
  contact_person_name: '',
  contact_phone: '',
  contact_email: '',
  bank_name: '',
  bank_account_iban: '',
  payment_instructions: '',
  public_translations: toSlots(null),
};

const fromLab = (lab: LabRow): PageInput => ({
  public_name: lab.public_name ?? '',
  short_description: lab.short_description ?? '',
  logo_url: lab.logo_url ?? '',
  legal_name: lab.legal_name ?? '',
  identification_code: lab.identification_code ?? '',
  legal_address: lab.legal_address ?? '',
  working_address: lab.working_address ?? '',
  city: lab.city ?? '',
  country: lab.country ?? '',
  contact_person_name: lab.contact_person_name ?? '',
  contact_phone: lab.contact_phone ?? '',
  contact_email: lab.contact_email ?? '',
  bank_name: lab.bank_name ?? '',
  bank_account_iban: lab.bank_account_iban ?? '',
  payment_instructions: lab.payment_instructions ?? '',
  public_translations: toSlots(lab.public_translations),
});

type TextTab = 'base' | LabTextLang;

/** The inputs each tab draws, in order — what to focus when it holds an error. */
const tabFields = (tab: TextTab) =>
  tab === 'base'
    ? (['public_name', 'short_description'] as const)
    : ([`public_translations.${tab}.public_name`, `public_translations.${tab}.short_description`] as const);

const tabHasError = (errors: FieldErrors<PageInput>, tab: TextTab): boolean =>
  tab === 'base'
    ? !!(errors.public_name || errors.short_description)
    : !!errors.public_translations?.[tab];

const NOTICE = 'lab-profile-saved';

const langLabel = (lang: LabTextLang) => LANGUAGES.find((l) => l.code === lang)?.label ?? lang;

export function LabProfilePage() {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const lab = user?.lab;

  // Saving refreshes the AppUser silently, so the page stays mounted; the
  // confirmation is still left in remountNotice should a re-mount happen.
  const [success, setSuccess] = useState<string | null>(() => readNotice(NOTICE));
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TextTab>('base');
  const [savingTranslations, setSavingTranslations] = useState(false);
  // An input to focus once its tab has rendered (see revealError).
  const [focusField, setFocusField] = useState<string | null>(null);

  const methods = useForm<PageInput>({
    resolver: zodResolver(pageSchema),
    defaultValues: empty,
    mode: 'onChange',
  });

  // Re-seed the form when the stored profile — or the lab's review status —
  // changes, compared as text. Not whenever the AppUser object is replaced:
  // the account card's save refreshes it with the very same lab, and a reset
  // then would wipe whatever the lab is typing here.
  const stored = useMemo(() => (lab ? fromLab(lab) : null), [lab]);
  const storedKey = lab && stored ? JSON.stringify([lab.approval_status, stored]) : '';
  const seeded = useRef<PageInput | null>(null);
  useEffect(() => {
    if (!storedKey) return;
    const [, next] = JSON.parse(storedKey) as [string, PageInput];
    const prev = seeded.current;
    seeded.current = next;
    // Translation slots the lab typed survive a re-seed that did not change
    // the stored ones — the status moving under an open page (see onWriteError):
    // an approved lab can still save them, and they are not the locked part.
    const keepTyped =
      !!prev && JSON.stringify(prev.public_translations) === JSON.stringify(next.public_translations);
    methods.reset(
      keepTyped ? { ...next, public_translations: methods.getValues('public_translations') } : next,
    );
  }, [storedKey, methods]);

  // A field on a tab that was not showing gets focus once its tab is drawn:
  // `revealError` sets both in one render, so the input exists by now.
  useEffect(() => {
    if (!focusField) return;
    document.querySelector<HTMLElement>(`[name="${focusField}"]`)?.focus();
    setFocusField(null);
  }, [focusField]);

  const { errors } = methods.formState;

  if (!lab) return null;

  const editable =
    lab.approval_status === 'PENDING_APPROVAL' || lab.approval_status === 'CHANGES_REQUESTED';
  // Owner decision: an approved lab keeps its name, legal, contact and bank
  // details locked as before, but may translate its public profile without a
  // new review. `set_lab_public_translations` (0037) is that write path.
  const approved = lab.approval_status === 'APPROVED_ACTIVE';
  const locked = !editable;
  const canTranslate = editable || approved;
  const showResubmit = lab.approval_status === 'CHANGES_REQUESTED';

  const watched = methods.watch();
  const isComplete = isLabProfileComplete(watched);

  const done = async (message: string) => {
    leaveNotice(NOTICE, message);
    setSuccess(message);
    // The catalogue surfaces that show this lab's name and description.
    for (const key of [
      ['marketplace-labs'],
      ['public-lab', lab.id],
      ['orderable-lab', lab.id],
      ['landing-labs'],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    // Silent: a spinner would re-mount the page, and with it the account card
    // below, throwing away anything typed there.
    await refreshUser({ silent: true });
  };

  /**
   * A refused write, as a sentence the lab can act on — never the raw
   * Postgres message, which is English-only and names triggers at the user.
   * `fallback` is the message for an unrecognised failure.
   */
  const onWriteError = async (e: unknown, fallback: string) => {
    const kind = classifyLabProfileError(e);
    setError(kind === 'generic' ? fallback : t(`profile.errors.${kind}`));
    // The page was opened before an admin decided on the lab. Reload the lab
    // so the page shows its real status — locked fields back to what is on
    // file; typed translations kept (see the re-seed above).
    if (kind === 'locked') await refreshUser({ silent: true });
  };

  const saveTranslations = async (slots: TranslationSlots): Promise<boolean> => {
    const { error: e } = await supabase.rpc('set_lab_public_translations', {
      p_lab_id: lab.id,
      p_translations: fromSlots(slots),
    });
    if (e) {
      await onWriteError(e, t('profile.translations.saveFailed'));
      return false;
    }
    return true;
  };

  /**
   * Validation failed somewhere the lab may not be looking: the public name
   * and description are split across tabs, and a field on a hidden tab can
   * neither show its error nor take focus. Switch to the first tab that holds
   * one — the current tab if it does — and focus its first invalid input.
   * Fields outside the tabs are always drawn and show their own errors.
   */
  const revealError = (errs: FieldErrors<PageInput>) => {
    const order: TextTab[] = [tab, 'base', ...LAB_TEXT_LANGS];
    const target = order.find((x) => tabHasError(errs, x));
    if (!target) return;
    setTab(target);
    const field = tabFields(target).find((name) => methods.getFieldState(name).invalid);
    if (field) setFocusField(field);
  };

  /** The whole profile: only while the lab is still in review. */
  const persist = async (values: PageInput): Promise<boolean> => {
    if (!editable) return false;
    const { error: e } = await supabase
      .from('labs')
      .update({
        public_name: values.public_name,
        short_description: values.short_description || null,
        logo_url: values.logo_url || null,
        legal_name: values.legal_name || null,
        identification_code: values.identification_code || null,
        legal_address: values.legal_address || null,
        working_address: values.working_address || null,
        city: values.city || null,
        country: values.country || null,
        contact_person_name: values.contact_person_name || null,
        contact_phone: values.contact_phone || null,
        contact_email: values.contact_email || null,
        bank_name: values.bank_name || null,
        bank_account_iban: values.bank_account_iban || null,
        payment_instructions: values.payment_instructions || null,
      })
      .eq('id', lab.id);
    if (e) {
      await onWriteError(e, t('profile.errors.generic'));
      return false;
    }
    // A lab that never touched the tabs makes no second write.
    const before = JSON.stringify(fromSlots(toSlots(lab.public_translations)));
    if (JSON.stringify(fromSlots(values.public_translations)) === before) return true;
    return saveTranslations(values.public_translations);
  };

  const handleSave = async (values: PageInput) => {
    setError(null);
    setSuccess(null);
    clearNotice(NOTICE);
    if (await persist(values)) await done(t('profile.saveSuccess'));
  };

  /** An approved lab: the translations alone, the rest stays as it is. */
  const handleSaveTranslations = async () => {
    setError(null);
    setSuccess(null);
    clearNotice(NOTICE);
    // Validate only the translation slots: a locked field the lab cannot
    // change must not block the part it can.
    const valid = await methods.trigger('public_translations');
    if (!valid) {
      revealError(methods.formState.errors);
      return;
    }
    setSavingTranslations(true);
    try {
      if (await saveTranslations(methods.getValues('public_translations'))) {
        await done(t('profile.translations.saved'));
      }
    } finally {
      setSavingTranslations(false);
    }
  };

  const submitForApproval = async (): Promise<boolean> => {
    const { error: e } = await supabase
      .from('labs')
      .update({ approval_status: 'PENDING_APPROVAL', approval_note: null })
      .eq('id', lab.id);
    if (e) {
      await onWriteError(e, t('profile.errors.generic'));
      return false;
    }
    return true;
  };

  const handleResubmit = async (values: PageInput) => {
    setError(null);
    setSuccess(null);
    clearNotice(NOTICE);
    if (!(await persist(values))) return;
    if (await submitForApproval()) await done(t('profile.submitSuccess'));
  };

  const slots = watched.public_translations;
  const onLangTab = tab !== 'base';
  const tabLang = onLangTab ? tab : null;

  return (
    <>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <CardStack sx={{ maxWidth: 900 }}>
      <LabApprovalBanner status={lab.approval_status} note={lab.approval_note} />
      {approved && <Alert severity="info">{t('profile.lockedAfterApproval')}</Alert>}

      {success && <Alert severity="success">{success}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      {/* Directly above the public-profile card, but outside the lab form on
          purpose: it has its own <form> (a nested one would submit the lab's),
          its own table, and no approval lock — see LabAccountCard. */}
      <LabAccountCard />

      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(handleSave, revealError)} noValidate>
          <Stack
            spacing={3}
            // Locked fields are still the lab's reference copy of its own IBAN
            // and legal details: keep them legible rather than MUI's faint
            // disabled grey.
            sx={(theme) => ({
              '& .MuiInputBase-input.Mui-disabled': {
                WebkitTextFillColor: theme.palette.text.secondary,
              },
              '& .MuiInputLabel-root.Mui-disabled': { color: theme.palette.text.secondary },
            })}
          >
            <SectionCard icon="store" title={t('profile.sections.public')}>
                <Stack spacing={2}>
                  <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                      value={tab}
                      onChange={(_, v: TextTab) => setTab(v)}
                      variant="scrollable"
                      scrollButtons="auto"
                      allowScrollButtonsMobile
                      aria-label={t('profile.translations.tabsA11y')}
                    >
                      <Tab
                        value="base"
                        label={
                          <TabLabel
                            text={t('profile.translations.tabBase')}
                            state={tabHasError(errors, 'base') ? 'invalid' : null}
                            stateText={t('profile.translations.invalid')}
                          />
                        }
                      />
                      {LAB_TEXT_LANGS.map((l) => {
                        const state = tabHasError(errors, l)
                          ? 'invalid'
                          : hasText(slots?.[l])
                            ? 'filled'
                            : 'missing';
                        return (
                          <Tab
                            key={l}
                            value={l}
                            label={
                              <TabLabel
                                text={langLabel(l)}
                                state={state}
                                stateText={t(`profile.translations.${state}`)}
                              />
                            }
                          />
                        );
                      })}
                    </Tabs>
                  </Box>

                  <Typography variant="body2" color="text.secondary">
                    {t('profile.translations.hint')}
                  </Typography>

                  {tabLang ? (
                    <>
                      <RHFTextField
                        key={`${tabLang}.public_name`}
                        name={`public_translations.${tabLang}.public_name`}
                        label={`${t('profile.fields.publicName')} · ${langLabel(tabLang)}`}
                        placeholder={watched.public_name}
                        disabled={!canTranslate}
                        inputProps={{ lang: tabLang, maxLength: LAB_TEXT_MAX.public_name }}
                      />
                      <RHFTextField
                        key={`${tabLang}.short_description`}
                        name={`public_translations.${tabLang}.short_description`}
                        label={`${t('profile.fields.shortDescription')} · ${langLabel(tabLang)}`}
                        placeholder={watched.short_description}
                        multiline
                        minRows={2}
                        disabled={!canTranslate}
                        inputProps={{ lang: tabLang, maxLength: LAB_TEXT_MAX.short_description }}
                      />
                    </>
                  ) : (
                    <>
                      <RHFTextField
                        key="base.public_name"
                        name="public_name"
                        label={t('profile.fields.publicName')}
                        required
                        disabled={locked}
                      />
                      <RHFTextField
                        key="base.short_description"
                        name="short_description"
                        label={t('profile.fields.shortDescription')}
                        multiline
                        minRows={2}
                        disabled={locked}
                      />
                    </>
                  )}
                  <RHFTextField
                    name="logo_url"
                    label={t('profile.fields.logoUrl')}
                    disabled={locked}
                  />

                  {approved && (
                    <Stack direction="row" justifyContent="flex-end">
                      <Button
                        type="button"
                        variant="contained"
                        onClick={() => void handleSaveTranslations()}
                        disabled={savingTranslations}
                      >
                        {t('profile.translations.save')}
                      </Button>
                    </Stack>
                  )}
                </Stack>
            </SectionCard>

            <LabPriceListCard labId={lab.id} canPublish={editable || approved} />

            <SectionCard icon="description" title={t('profile.sections.legal')}>
                <Stack spacing={2}>
                  <RHFTextField
                    name="legal_name"
                    label={t('profile.fields.legalName')}
                    required
                    disabled={locked}
                  />
                  <RHFTextField
                    name="identification_code"
                    label={t('profile.fields.identificationCode')}
                    required
                    disabled={locked}
                  />
                  <RHFTextField
                    name="legal_address"
                    label={t('profile.fields.legalAddress')}
                    required
                    disabled={locked}
                  />
                  <RHFTextField
                    name="working_address"
                    label={t('profile.fields.workingAddress')}
                    required
                    disabled={locked}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField
                      name="city"
                      label={t('profile.fields.city')}
                      required
                      disabled={locked}
                    />
                    <RHFTextField
                      name="country"
                      label={t('profile.fields.country')}
                      required
                      disabled={locked}
                    />
                  </Stack>
                </Stack>
            </SectionCard>

            <SectionCard icon="call" title={t('profile.sections.contact')}>
                <Stack spacing={2}>
                  <RHFTextField
                    name="contact_person_name"
                    label={t('profile.fields.contactPersonName')}
                    required
                    disabled={locked}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <RHFTextField
                      name="contact_phone"
                      label={t('profile.fields.contactPhone')}
                      required
                      disabled={locked}
                    />
                    <RHFTextField
                      name="contact_email"
                      type="email"
                      label={t('profile.fields.contactEmail')}
                      required
                      disabled={locked}
                    />
                  </Stack>
                </Stack>
            </SectionCard>

            <SectionCard icon="payments" title={t('profile.sections.billing')}>
                <Stack spacing={2}>
                  <RHFTextField
                    name="bank_name"
                    label={t('profile.fields.bankName')}
                    required
                    disabled={locked}
                  />
                  <RHFTextField
                    name="bank_account_iban"
                    label={t('profile.fields.bankAccountIban')}
                    required
                    disabled={locked}
                  />
                  <RHFTextField
                    name="payment_instructions"
                    label={t('profile.fields.paymentInstructions')}
                    multiline
                    minRows={3}
                    required
                    disabled={locked}
                  />
                </Stack>
            </SectionCard>

            {/* An approved lab saves its translations inside the card above;
                nothing else on this form is its to change. */}
            {!approved && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  type="submit"
                  variant={showResubmit ? 'outlined' : 'contained'}
                  disabled={methods.formState.isSubmitting || locked}
                >
                  {tc('actions.save')}
                </Button>
                <Box sx={{ flex: 1 }} />
                {showResubmit && (
                  <Button
                    variant="contained"
                    disabled={!isComplete || methods.formState.isSubmitting}
                    onClick={() => void methods.handleSubmit(handleResubmit, revealError)()}
                  >
                    {t('profile.submitForApproval')}
                  </Button>
                )}
              </Stack>
            )}

            {editable && !isComplete && (
              <Alert severity="info">{t('profile.incompleteWarning')}</Alert>
            )}
          </Stack>
        </form>
      </FormProvider>
      </CardStack>
    </>
  );
}

/**
 * A tab's name and a dot: for a language, whether it has any text yet; for
 * any tab, red while one of its fields is invalid — the error itself shows
 * only on the tab, so the dot is what says where it is.
 */
function TabLabel({
  text,
  state,
  stateText,
}: {
  text: string;
  state: 'filled' | 'missing' | 'invalid' | null;
  stateText: string;
}) {
  const color =
    state === 'invalid' ? 'error.main' : state === 'filled' ? 'success.main' : 'text.disabled';
  return (
    <Stack direction="row" alignItems="center" spacing={0.875} component="span">
      <span>{text}</span>
      {state && (
        <>
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              flexShrink: 0,
              border: 1.5,
              borderColor: color,
              bgcolor: state === 'missing' ? 'transparent' : color,
            }}
          />
          <Box component="span" sx={visuallyHidden}>
            {stateText}
          </Box>
        </>
      )}
    </Stack>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
