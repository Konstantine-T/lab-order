import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { initialsOf, layout, motion, palette2026, radii, surfaces } from '@/theme/tokens';
import { PeriLink } from './ui';

export type DraftStatus =
  | { kind: 'none' }
  /** Server draft: the time of the last write that landed. */
  | { kind: 'saved'; at: string }
  | { kind: 'failed' }
  /** Guest drafts live in this browser. */
  | { kind: 'savedOnDevice' }
  | { kind: 'notSavedOnDevice' };

/**
 * The new-order form's own header, as the redesign draws it: a back square,
 * "New order" over its breadcrumb, the lab + service the order goes to with a
 * "change" link, and — at the right — where the draft stands.
 *
 * `slot` is the focused shell's header (see `useFocusedShell`): given one,
 * the header is portalled into it and the shell supplies the bar, the sticky
 * position and the avatar. Without one — the guest, inside the public shell —
 * it renders in place as the page's own sticky band.
 */
export function WizardHeader({
  slot,
  backTo,
  ordersTo,
  lab,
  onChangeLabService,
  doctorChip,
  draft,
}: {
  slot: HTMLElement | null;
  backTo: string;
  /** The breadcrumb's "Orders" link; plain text when there is no list. */
  ordersTo?: string;
  lab?: { name: string; service: string };
  onChangeLabService: () => void;
  /** The clinic's "ordering for" chip. */
  doctorChip?: ReactNode;
  draft: DraftStatus;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const theme = useTheme();
  const mode = theme.palette.mode;

  const body = (
    <Stack
      direction="row"
      alignItems="center"
      sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' }, columnGap: 2, rowGap: 1.25, minWidth: 0 }}
    >
      <Stack direction="row" alignItems="center" spacing={1.75} sx={{ minWidth: 0, flexShrink: 0 }}>
        <Box
          component={RouterLink}
          to={backTo}
          aria-label={tc('actions.back')}
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${radii.control}px`,
            border: 1,
            borderColor: surfaces[mode].control,
            color: 'text.primary',
            textDecoration: 'none',
            bgcolor: 'background.paper',
            transition: `border-color ${motion.base}`,
            '&:hover': { borderColor: palette2026.peri },
          }}
        >
          <Icon name="chevron_left" size={22} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: '1.25rem',
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
            }}
            noWrap
          >
            {t('orderCreate.title')}
          </Typography>
          <Typography
            component="nav"
            aria-label={t('orderCreate.breadcrumbA11y')}
            sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4 }}
            noWrap
          >
            {ordersTo ? (
              <Box
                component={RouterLink}
                to={ordersTo}
                sx={{
                  color: 'inherit',
                  textDecoration: 'none',
                  '&:hover': { color: 'text.primary', textDecoration: 'underline' },
                }}
              >
                {t('nav.orders')}
              </Box>
            ) : (
              t('nav.orders')
            )}
            {' / '}
            <span aria-current="page">{t('orderCreate.title')}</span>
          </Typography>
        </Box>
      </Stack>

      {lab && (
        // The lab + service capsule, with the only way back to the catalogue
        // that keeps the order: "change" swaps the pick, the draft stays.
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            order: { xs: 3, md: 0 },
            width: { xs: '100%', md: 'auto' },
            minWidth: 0,
            flexShrink: 1,
            ml: { md: 1.5 },
            py: 0.625,
            pl: 0.75,
            pr: 1.5,
            borderRadius: `${radii.control}px`,
            border: 1,
            borderColor: surfaces[mode].borderSolid,
            bgcolor: surfaces[mode].subtle,
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '8px',
              border: 1,
              borderColor: surfaces[mode].borderSolid,
              bgcolor: 'background.paper',
              color: surfaces[mode].chipText,
              fontSize: '0.6875rem',
              fontWeight: 700,
            }}
          >
            {initialsOf(lab.name)}
          </Box>
          <Typography
            sx={{ fontSize: '0.8125rem', minWidth: 0, flex: 1 }}
            noWrap
            title={`${lab.name} · ${lab.service}`}
          >
            <Box component="b" sx={{ fontWeight: 600 }}>
              {lab.name}
            </Box>{' '}
            · {lab.service}
          </Typography>
          <PeriLink onClick={onChangeLabService} sx={{ fontSize: '0.8125rem', flexShrink: 0 }}>
            {t('orderCreate.change')}
          </PeriLink>
        </Stack>
      )}

      {doctorChip && (
        <Box sx={{ order: { xs: 4, md: 0 }, flexShrink: 0, minWidth: 0 }}>{doctorChip}</Box>
      )}

      <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />

      <DraftLine draft={draft} />
    </Stack>
  );

  if (slot) return createPortal(body, slot);

  return (
    <Box
      sx={{
        position: { xs: 'static', sm: 'sticky' },
        top: 'var(--page-header-top, 0px)',
        zIndex: 40,
        mx: layout.gutterNeg,
        mt: { xs: -2.5, md: -3.25 },
        mb: 3,
        px: layout.gutter,
        py: 1.5,
        bgcolor: alpha(theme.palette.background.default, 0.9),
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {body}
    </Box>
  );
}

/**
 * Where the draft stands. Nothing before the first write: "saved" before
 * anything was typed would be a claim about nothing. On a phone the words give
 * way to the tick and the time; the full sentence stays as its label.
 */
function DraftLine({ draft }: { draft: DraftStatus }) {
  const { t } = useTranslation('doctor');
  if (draft.kind === 'none') return null;

  const failed = draft.kind === 'failed' || draft.kind === 'notSavedOnDevice';
  const text =
    draft.kind === 'saved'
      ? t('orderCreate.draftSavedAt', { time: draft.at })
      : draft.kind === 'failed'
        ? t('orderCreate.draftNotSaved')
        : draft.kind === 'savedOnDevice'
          ? t('orderCreate.guest.savedOnDevice')
          : t('orderCreate.guest.notSaved');

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      role="status"
      aria-label={text}
      sx={{ order: { xs: 2, md: 0 }, ml: { xs: 'auto', md: 0 }, flexShrink: 0, minWidth: 0 }}
    >
      <Icon
        name={failed ? 'cloud_off' : 'check'}
        size={15}
        sx={{ color: failed ? 'warning.main' : 'text.secondary' }}
      />
      <Typography
        component="span"
        sx={{ fontSize: '0.75rem', color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}
        noWrap
      >
        {text}
      </Typography>
      {draft.kind === 'saved' && (
        <Typography
          component="span"
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            display: { xs: 'inline', sm: 'none' },
          }}
        >
          {draft.at}
        </Typography>
      )}
    </Stack>
  );
}
