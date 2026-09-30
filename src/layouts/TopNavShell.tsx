import { useState } from 'react';
import { Link as RouterLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Box, Button, ButtonBase, Stack, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { BrandWordmark } from '@/components/BrandMark';
import { layout, motion, surfaces } from '@/theme/tokens';
import type { NavEntry } from './AppShell';
import { AccountMenu, UserAvatar, type MenuLink } from './AccountMenu';

/** Whether `entry` owns the current page — its own path, or one of `also`. */
function isActive(entry: NavEntry, pathname: string) {
  if (matchPath({ path: entry.to, end: entry.end ?? false }, pathname)) return true;
  return (entry.also ?? []).some((p) => matchPath({ path: p, end: false }, pathname));
}

/**
 * The doctor and clinic shell from the 2026-09 redesign: a white top bar with
 * the wordmark, a handful of text links, the new-order button and the avatar,
 * over a single wide column. Below `md` the links move to a bottom tab bar.
 *
 * Everything that is not one of those links — secondary pages, language,
 * light/dark, feedback, sign-out — lives in the avatar menu. The wordmark is
 * the way home.
 *
 * The bar is static, like `PublicShell`'s: `PageHeader` and the order form's
 * price rail already pin themselves, and a third band would leave a laptop
 * with little page. `--page-header-top` tells `PageHeader` there is nothing to
 * clear above it; `--bottom-nav-height` tells anything pinned to the bottom of
 * a phone (the price bar, toasts) what to sit on.
 */
export function TopNavShell({
  homeTo,
  nav,
  tabs,
  menuLinks,
  newOrder,
}: {
  homeTo: string;
  /** The text links in the desktop bar. */
  nav: NavEntry[];
  /** The phone's bottom tabs. */
  tabs: NavEntry[];
  menuLinks?: MenuLink[];
  newOrder?: { to: string; label: string };
}) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const tabBarHeight = `calc(${layout.tabBar}px + env(safe-area-inset-bottom, 0px))`;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        '--page-header-top': '0px',
        '--bottom-nav-height': { xs: tabBarHeight, md: '0px' },
      }}
    >
      <Box
        component="header"
        sx={{
          position: 'relative',
          zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            maxWidth: layout.wideMax,
            mx: 'auto',
            px: layout.gutter,
            height: { xs: layout.mobileBar, md: 64 },
            gap: { xs: 1.5, md: 3, lg: 4.5 },
          }}
        >
          <Box
            component={RouterLink}
            to={homeTo}
            aria-label={t('nav.home')}
            sx={{ display: 'flex', textDecoration: 'none', flexShrink: 0 }}
          >
            <BrandWordmark />
          </Box>

          <Stack
            component="nav"
            aria-label={t('nav.main')}
            direction="row"
            alignItems="center"
            sx={{
              display: { xs: 'none', md: 'flex' },
              flex: 1,
              minWidth: 0,
              gap: { md: 2.5, lg: 3.25 },
            }}
          >
            {nav.map((entry) => {
              const active = isActive(entry, pathname);
              return (
                <Box
                  key={entry.to}
                  component={RouterLink}
                  to={entry.to}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'text.primary' : 'text.secondary',
                    transition: `color ${motion.fast}`,
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {entry.label}
                  {entry.badge}
                </Box>
              );
            })}
          </Stack>

          <Box sx={{ flex: 1, display: { md: 'none' } }} />

          {newOrder && (
            <Button
              component={RouterLink}
              to={newOrder.to}
              variant="contained"
              startIcon={<Icon name="add" size={18} />}
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                height: 38,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {newOrder.label}
            </Button>
          )}

          <ButtonBase
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label={t('nav.accountMenu')}
            aria-haspopup="menu"
            sx={{ borderRadius: '50%', flexShrink: 0 }}
          >
            <UserAvatar />
          </ButtonBase>
        </Stack>
      </Box>

      <AccountMenu
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        links={menuLinks}
      />

      <Box component="main">
        <Box
          sx={{
            maxWidth: layout.wideMax,
            mx: 'auto',
            px: layout.gutter,
            // `PageHeader` cancels this top padding to reach the column's top
            // edge; pages without one keep it.
            pt: { xs: 2.5, md: 3.25 },
            pb: { xs: `calc(80px + ${tabBarHeight})`, md: 10 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <Box
        component="nav"
        aria-label={t('nav.main')}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          // Below MUI's modal layer (1300) so menus and dialogs cover it.
          zIndex: theme.zIndex.appBar,
          height: tabBarHeight,
          pb: 'env(safe-area-inset-bottom, 0px)',
          px: 0.5,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {tabs.map((entry) => {
          const active = isActive(entry, pathname);
          return (
            <Box
              key={entry.to}
              component={RouterLink}
              to={entry.to}
              aria-current={active ? 'page' : undefined}
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                textDecoration: 'none',
                // "ლაბორატორიები" is the longest label and gets a quarter of
                // the phone's width.
                fontSize: 'clamp(9.5px, 2.7vw, 11px)',
                letterSpacing: '-0.01em',
                fontWeight: 600,
                color: active ? 'text.primary' : surfaces[mode].textMuted,
                '& .material-symbols-rounded': {
                  fontVariationSettings: active ? "'FILL' 1" : undefined,
                },
              }}
            >
              <Box sx={{ position: 'relative', display: 'flex' }}>
                <Icon name={entry.icon} size={22} />
                {entry.badge && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -6,
                      left: 14,
                      display: 'flex',
                      '& > *': { ml: 0 },
                    }}
                  >
                    {entry.badge}
                  </Box>
                )}
              </Box>
              {/* Never ellipsised: on the narrowest phones the longest label
                  is a pixel or two wider than its quarter, and centred text
                  spills that evenly into its neighbours' spare room. */}
              <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                {entry.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
