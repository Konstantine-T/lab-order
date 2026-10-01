import { useCallback, useRef } from 'react';
import { Alert, Box, CircularProgress, Link, Stack, useMediaQuery, useTheme } from '@mui/material';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ActingDoctorChip } from '@/features/clinic/ActingDoctorChip';
import { catalogPaths } from '@/features/public/publicRoutes';
import { Callout, SplitLayout } from '@/components/design';
import { useLabText } from '@/features/lab/labText';
import { LabHeaderCard } from '@/features/catalog/labProfile/LabHeaderCard';
import { ServicesPriceCard } from '@/features/catalog/labProfile/ServicesPriceCard';
import { LabContactCard, LabOrderCard } from '@/features/catalog/labProfile/LabProfileRail';
import { serviceOrderHref } from '@/features/catalog/labProfile/orderLink';
import { catalogueQuery } from '@/features/catalog/useCatalogueFilters';
import {
  useProfileLab,
  useProfileServices,
} from '@/features/catalog/labProfile/useLabProfile';

/**
 * A lab's public profile and its orderable services (design page 4). Shared by
 * the doctor, by a clinic admin ordering for one of their doctors, and by a
 * guest with no account; `basePath` / `guest` decide where the breadcrumb and
 * every order button point. Every query here runs under a policy that admits
 * `anon` (0004, 0034, 0039 — the lab columns are the guest-readable ones).
 */
export function LabPublicProfilePage({
  basePath = '/doctor',
  guest = false,
}: {
  basePath?: string;
  guest?: boolean;
}) {
  const { labId } = useParams<{ labId: string }>();
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const { labText } = useLabText();
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const paths = catalogPaths(guest, basePath);
  const servicesHeading = useRef<HTMLHeadingElement | null>(null);

  // Set when the doctor arrived here via "Continue project" — carry them onto
  // the order CTA so the wizard pre-fills + locks the patient and links lineage.
  const continuePatient = searchParams.get('patient');
  const continuesOrder = searchParams.get('continues');
  // Clinic path: the doctor this order is being placed for.
  const doctorParam = searchParams.get('doctor');

  const { data: lab, isLoading: labLoading } = useProfileLab(labId);
  const { data: services = [], isLoading: servicesLoading } = useProfileServices(labId);

  const orderHref = useCallback(
    (serviceId: string) =>
      serviceOrderHref(paths.orderNew, labId ?? '', serviceId, {
        doctor: doctorParam,
        patient: continuePatient,
        continues: continuesOrder,
      }),
    [paths.orderNew, labId, doctorParam, continuePatient, continuesOrder],
  );

  const chooseService = useCallback(() => {
    const el = servicesHeading.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.closest('#lab-services')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, []);

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
            {labText(lab, 'public_name')}
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

      <SplitLayout
        rail={
          <>
            {/* Two columns only: on a single column the list is the next thing
                on the page, and each row has its own order button. */}
            {wide && <LabOrderCard onChooseService={chooseService} disabled={!anyOrderable} />}
            <LabContactCard lab={lab} />
          </>
        }
      >
        <LabHeaderCard lab={lab} services={services} />
        <ServicesPriceCard
          ref={servicesHeading}
          services={services}
          loading={servicesLoading}
          orderHref={orderHref}
        />
      </SplitLayout>
    </Stack>
  );
}
