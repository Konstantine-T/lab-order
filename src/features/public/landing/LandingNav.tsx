import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  alpha,
  Box,
  ButtonBase,
  Drawer,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  useMediaQuery,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandWordmark } from '@/components/BrandMark';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { Icon } from '@/components/design';
import { LANGUAGES } from '@/i18n';
import { PUBLIC_ROUTES } from '@/features/public/publicRoutes';
import { Container, LinkButton } from './primitives';
import {
  NAV_HEIGHT,
  scrollToAnchor,
  scrollToHash,
  scrollToTop,
  useLandingTones,
  useLanguage,
} from './helpers';

/**
 * The landing page's sticky top bar: brand, the section links, and the
 * language / theme / account actions on the right.
 *
 * "Laboratories" goes to the guest catalogue rather than an in-page section:
 * this page is only ever shown to someone without a session, and `/labs` is
 * where they can browse — and start an order — before they have an account.
 *
 * Below `lg` the links fold into a hamburger that drops a sheet from the top
 * (the design's `mnav`), which also carries the language choice, the theme
 * toggle and sign-in; on phones only the brand, "Get started" and the
 * hamburger stay in the bar. The theme toggle is not in the design, which is
 * light-only, but the app has both themes and this is where the other public
 * pages keep it.
 */
export function LandingNav() {
  const { t } = useTranslation('landing');
  const theme = useTheme();
  const tones = useLandingTones();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const [open, setOpen] = useState(false);
  // Closing only by hiding (`open && !wide`) left `open` true, so a tablet
  // rotated to landscape and back got the sheet back, unasked.
  useEffect(() => {
    if (wide) setOpen(false);
  }, [wide]);
  // A scroll asked for from inside the sheet runs once the sheet has gone:
  // while it is open the page is scroll-locked, and focus returns to the
  // hamburger on close.
  const afterClose = useRef<(() => void) | null>(null);

  const links = [
    { to: PUBLIC_ROUTES.marketplace, label: t('nav.labs') },
    { to: '#how', label: t('nav.how') },
    { to: '#doctors', label: t('nav.doctors') },
    { to: '#labs', label: t('nav.labsSection') },
    { to: '#faq', label: t('nav.faq') },
  ];

  const linkSx = {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'text.primary',
    whiteSpace: 'nowrap',
    '&:hover': { color: tones.accent },
  } as const;

  const onSheetAnchor = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const hash = e.currentTarget.getAttribute('href') ?? '';
    afterClose.current = () => scrollToHash(hash);
    setOpen(false);
  };

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
        bgcolor: alpha(tones.ground, 0.94),
        backdropFilter: 'saturate(1.4) blur(8px)',
        WebkitBackdropFilter: 'saturate(1.4) blur(8px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Container>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ height: NAV_HEIGHT, gap: { xs: '12px', sm: '24px' } }}
        >
          <Brand />

          {/* The five links fit the 1120px column next to the right-hand
              cluster only with these gaps; the flex centre absorbs the rest. */}
          <Box
            component="nav"
            aria-label={t('nav.menu')}
            sx={{
              display: { xs: 'none', lg: 'flex' },
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              gap: '24px',
              minWidth: 0,
            }}
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} sx={linkSx}>
                {l.label}
              </NavLink>
            ))}
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            sx={{ ml: 'auto', flexShrink: 0, gap: { xs: '10px', sm: '14px' } }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: '4px' }}>
              <LanguageMenu />
              <ColorModeToggle />
            </Box>
            <Link
              component={RouterLink}
              to="/login"
              underline="none"
              sx={{ ...linkSx, display: { xs: 'none', sm: 'inline' } }}
            >
              {t('nav.signIn')}
            </Link>
            <LinkButton to="/register/doctor" variant="ink" size="sm">
              {t('nav.getStarted')}
            </LinkButton>
            <IconButton
              onClick={() => setOpen(true)}
              aria-label={t('nav.menu')}
              aria-expanded={open}
              aria-controls={open ? 'landing-menu' : undefined}
              sx={{ display: { xs: 'inline-flex', lg: 'none' }, width: 40, height: 40, color: 'text.primary' }}
            >
              <Icon name="menu" size={24} />
            </IconButton>
          </Stack>
        </Stack>
      </Container>

      <Drawer
        id="landing-menu"
        anchor="top"
        open={open && !wide}
        onClose={() => setOpen(false)}
        SlideProps={{
          onExited: () => {
            const run = afterClose.current;
            afterClose.current = null;
            run?.();
          },
        }}
        PaperProps={{
          role: 'dialog',
          'aria-modal': true,
          'aria-label': t('nav.menu'),
          sx: { bgcolor: tones.ground, maxHeight: '100dvh' },
        }}
      >
        <Container>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: NAV_HEIGHT }}>
            <Brand
              onClick={(e) => {
                e.preventDefault();
                afterClose.current = () => scrollToTop();
                setOpen(false);
              }}
            />
            <IconButton
              onClick={() => setOpen(false)}
              aria-label={t('nav.closeMenu')}
              sx={{ width: 40, height: 40, color: 'text.primary' }}
            >
              <Icon name="close" size={24} />
            </IconButton>
          </Stack>
        </Container>

        <Box component="nav" aria-label={t('nav.menu')} sx={{ borderTop: 1, borderColor: 'divider' }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={l.to.startsWith('#') ? onSheetAnchor : () => setOpen(false)}
              sx={{
                ...linkSx,
                display: 'block',
                px: { xs: '20px', sm: '24px' },
                py: '14px',
                fontSize: '0.9375rem',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              {l.label}
            </NavLink>
          ))}
        </Box>

        <Container>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ py: '10px', gap: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <LanguageRow />
            <ColorModeToggle />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: '10px', py: '16px' }}>
            <LinkButton to="/login" variant="outlined" sx={{ flex: 1 }}>
              {t('nav.signIn')}
            </LinkButton>
            <LinkButton to="/register/doctor" variant="ink" sx={{ flex: 1 }}>
              {t('nav.getStarted')}
            </LinkButton>
          </Stack>
        </Container>
      </Drawer>
    </Box>
  );
}

/** The wordmark, back to the top of this page. */
function Brand({ onClick }: { onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      component={RouterLink}
      to={PUBLIC_ROUTES.landing}
      aria-label="Dentallabs.ge"
      underline="none"
      onClick={onClick ?? scrollToTop}
      sx={{
        display: 'flex',
        flexShrink: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: '6px',
        // The design's header lockup is a size up from the shells' 30px / 17px.
        '& img': { width: { xs: 32, sm: 36 }, height: { xs: 32, sm: 36 } },
        '& img + span': { fontSize: { xs: '1.0625rem', sm: '1.1875rem' } },
      }}
    >
      <BrandWordmark />
    </Link>
  );
}

/** A section anchor or a router link, styled alike. */
function NavLink({
  to,
  children,
  onClick,
  sx,
}: {
  to: string;
  children: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  sx: SxProps<Theme>;
}) {
  if (to.startsWith('#')) {
    return (
      <Link href={to} onClick={onClick ?? scrollToAnchor} underline="none" sx={sx}>
        {children}
      </Link>
    );
  }
  return (
    <Link component={RouterLink} to={to} onClick={onClick} underline="none" sx={sx}>
      {children}
    </Link>
  );
}

/**
 * The bar's language button: it shows the language in use ("ქარ ▾"), not a
 * globe, so a visitor can tell at a glance which one they are reading.
 */
function LanguageMenu() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const { code, change } = useLanguage();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = LANGUAGES.find((l) => l.code === code);

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`${t('nav.language')}: ${current?.label ?? code}`}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        sx={{
          height: 36,
          px: '8px',
          gap: '4px',
          borderRadius: '8px',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
          '&.Mui-focusVisible': { outline: `2px solid ${tones.accent}`, outlineOffset: '2px' },
        }}
      >
        {t(`nav.langShort.${code}`)}
        <Icon name="expand_more" size={16} />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LANGUAGES.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === code}
            lang={l.code}
            onClick={() => {
              setAnchor(null);
              change(l.code);
            }}
            sx={{ gap: 2, justifyContent: 'space-between', minWidth: 148 }}
          >
            {l.label}
            {l.code === code && <Icon name="check" size={18} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** The sheet's language choice: all three at once, the current one in ink. */
function LanguageRow() {
  const { t } = useTranslation('landing');
  const { code, change } = useLanguage();
  return (
    <Stack
      direction="row"
      alignItems="center"
      role="group"
      aria-label={t('nav.language')}
      sx={{ gap: '4px', flexWrap: 'wrap', minWidth: 0 }}
    >
      {LANGUAGES.map((l) => {
        const on = l.code === code;
        return (
          <ButtonBase
            key={l.code}
            lang={l.code}
            aria-pressed={on}
            onClick={() => change(l.code)}
            sx={{
              height: 36,
              px: '10px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: on ? 600 : 500,
              color: on ? 'text.primary' : 'text.secondary',
              bgcolor: on ? 'action.selected' : 'transparent',
            }}
          >
            {l.label}
          </ButtonBase>
        );
      })}
    </Stack>
  );
}
