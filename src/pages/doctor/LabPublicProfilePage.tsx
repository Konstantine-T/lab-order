import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Box, CircularProgress, Link, Stack } from '@mui/material';
import { Link as RouterLink, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { catalogPaths } from '@/features/public/publicRoutes';
import { Callout } from '@/components/design';
import { useLabText } from '@/features/lab/labText';
import { LabHeaderCard } from '@/features/catalog/labProfile/LabHeaderCard';
import { ServicesPriceCard } from '@/features/catalog/labProfile/ServicesPriceCard';
import {
  LabAboutCard,
  LabContactCard,
  LabOrderCard,
  LabWorksWithCard,
  ProfileRail,
} from '@/features/catalog/labProfile/LabProfileRail';
import { LabProfileTabs } from '@/features/catalog/labProfile/LabProfileTabs';
import {
  jumpToSection,
  labHasContact,
  SECTION,
  sectionScrollMargin,
} from '@/features/catalog/labProfile/format';
import { serviceOrderHref } from '@/features/catalog/labProfile/orderLink';
import { catalogueQuery } from '@/features/catalog/useCatalogueFilters';
import { useLabRating } from '@/features/reviews/useLabRating';
import {
  localizeProfileServices,
  useProfileLab,
  useProfileServices,
} from '@/features/catalog/labProfile/useLabProfile';

// Its own chunk (0044): this page is in the guest entry bundle. A failed load
// simply shows no reviews rather than breaking the profile.
const LabReviewsCard = lazy(() =>
  import('@/features/reviews/LabReviewsCard').catch(() => ({ default: () => null })),
);

/** The mockup's right-hand column; wider than `SplitLayout`'s, for its order card. */
const RAIL_WIDTH = 352;

/**
 * A lab's public profile and its orderable services (lab.html, with no cover
 * yet). Shared by the doctor, by a clinic admin ordering for one of their
 * doctors, and by a guest with no account; `basePath` / `guest` decide where the
 * breadcrumb and every order button point. Every query here runs under a policy
 * that admits `anon` (0004, 0034, 0039 — the lab columns are the guest-readable
 * ones).
 */
export function LabPublicProfilePage({
  basePath = '/doctor',
  guest = false,
  paths: pathsOverride,
}: {
  basePath?: string;
  guest?: boolean;
  /** Where the links go, when not under `basePath` (a lab buying: `/lab/marketplace`). */
  paths?: ReturnType<typeof catalogPaths>;
}) {
  const { labId } = useParams<{ labId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText, lang } = useLabText();
  const [searchParams] = useSearchParams();
  const { hash, key: locationKey } = useLocation();
  const paths = pathsOverride ?? catalogPaths(guest, basePath);

  // Set when the doctor arrived here via "Continue project" — carry them onto
  // the order CTA so the wizard pre-fills + locks the patient and links lineage.
  const continuePatient = searchParams.get('patient');
  const continuesOrder = searchParams.get('continues');
  // Clinic path: the doctor this order is being placed for.
  const doctorParam = searchParams.get('doctor');

  const { data: lab, isLoading: labLoading } = useProfileLab(labId);
  const { data: baseServices, isLoading: servicesLoading } = useProfileServices(labId);
  const { data: rating } = useLabRating(labId);
  // Every card below reads the services in the reader's language (0042).
  const services = useMemo(
    () => localizeProfileServices(baseServices ?? [], lang),
    [baseServices, lang],
  );

  const orderHref = useCallback(
    (serviceId: string) =>
      serviceOrderHref(paths.orderNew, labId ?? '', serviceId, {
        doctor: doctorParam,
        patient: continuePatient,
        continues: continuesOrder,
      }),
    [paths.orderNew, labId, doctorParam, continuePatient, continuesOrder],
  );

  const chooseService = useCallback(() => jumpToSection(SECTION.services), []);

  // A catalogue card's order button lands here on `#lab-services`; React
  // Router never scrolls to a hash, so do it once the list has rendered (it
  // isn't there behind the spinner). Once per arrival: keyed to the navigation,
  // so a later refetch never yanks the page back.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (hash !== `#${SECTION.services}` || labLoading || servicesLoading) return;
    if (scrolledFor.current === locationKey) return;
    scrolledFor.current = locationKey;
    chooseService();
  }, [hash, locationKey, labLoading, servicesLoading, chooseService]);

  if (labLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!lab) return <Alert severity="error">{tc('errors.notFound')}</Alert>;

  // Back to the list this lab was opened from: the clinic's doctor and the
  // catalogue's filters ride along on the lab's URL.
  const marketplaceHref = `${paths.marketplace}${catalogueQuery(searchParams)}`;
  const anyOrderable = services.some((s) => s.orderable);
  const labName = labText(lab, 'public_name');
  const description = labText(lab, 'short_description').trim();
  const hasAbout = !!description || labHasContact(lab);

  const tabs = [
    { id: SECTION.services, label: t('labProfile.services'), count: services.length },
    // The list shows from the first review (J4); only its average waits for three.
    ...(rating?.count
      ? [{ id: SECTION.reviews, label: t('reviews.sectionTitle'), count: rating.count }]
      : []),
    ...(hasAbout ? [{ id: SECTION.about, label: t('labProfile.tabAbout') }] : []),
  ];

  return (
    <Stack spacing={2.25}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ flexWrap: 'wrap', gap: 1.5, minHeight: 32 }}
      >
        <Stack
          component="nav"
          aria-label={t('orderDetail.breadcrumb')}
          direction="row"
          spacing={1}
          sx={{ fontSize: '0.8125rem', color: 'text.secondary', minWidth: 0 }}
        >
          <Link
            component={RouterLink}
            to={marketplaceHref}
            underline="hover"
            sx={{ color: 'text.secondary', fontWeight: 500, flexShrink: 0 }}
          >
            {t('nav.marketplace')}
          </Link>
          <span aria-hidden>›</span>
          <Box
            component="span"
            aria-current="page"
            sx={{ color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {labName}
          </Box>
        </Stack>
        {!guest && doctorParam && (
          <ActingDoctorChip doctorId={doctorParam} changeTo={`${basePath}/orders/new`} />
        )}
      </Stack>

      {(continuePatient || continuesOrder) && (
        // Two ways to land here carrying a patient. Only one is a
        // continuation: without `continues` this is a plain new order for the
        // patient, so saying "continuing a project" would be a lie.
        <Callout tone="brand" icon="link">
          {continuesOrder ? t('labProfile.continuingFor') : t('labProfile.newOrderFor')}
        </Callout>
      )}

      <LabHeaderCard
        lab={lab}
        services={services}
        rating={rating}
        onOrder={chooseService}
        canOrder={anyOrderable}
      />

      <LabProfileTabs tabs={tabs} label={labName} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: `minmax(0, 1fr) ${RAIL_WIDTH}px`,
          },
          gap: '26px',
          alignItems: 'start',
        }}
      >
        <Stack spacing={2.75} sx={{ minWidth: 0 }}>
          <ServicesPriceCard services={services} loading={servicesLoading} orderHref={orderHref} />
          <Suspense fallback={null}>
            <LabReviewsCard labId={lab.id} labName={labName} />
          </Suspense>
        </Stack>

        <ProfileRail>
          <LabOrderCard
            lab={lab}
            services={services}
            onChooseService={chooseService}
            disabled={!anyOrderable}
          />
          <LabWorksWithCard services={services} />
          {hasAbout && (
            <Stack
              id={SECTION.about}
              spacing={2.25}
              sx={{ scrollMarginTop: sectionScrollMargin }}
            >
              {description && <LabAboutCard description={description} />}
              <LabContactCard lab={lab} />
            </Stack>
          )}
        </ProfileRail>
      </Box>
    </Stack>
  );
}
