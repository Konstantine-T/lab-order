import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  alpha,
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { FeedbackButton } from '@/components/FeedbackButton';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Icon } from '@/components/design/Icon';
import { BrandWordmark } from '@/components/BrandMark';
import { useAuth } from '@/auth/AuthProvider';
import { brand as brandTokens, layout, palette2026, radii, surfaces } from '@/theme/tokens';
import { UserAvatar } from './AccountMenu';

export type NavEntry = {
  to: string;
  label: string;
  /** Material Symbols Rounded ligature name, e.g. `receipt_long`. */
  icon: string;
  end?: boolean;
  /** Optional count pill rendered at the right of the row. */
  badge?: ReactNode;
  /** Other path prefixes this entry owns, for the top-nav shell's active
   *  state — e.g. a lab's profile belongs to "Labs". */
  also?: string[];
};

const SIDEBAR_WIDTH = layout.sidebarWidth;
const CONTENT_MAX = layout.contentMax;

/**
 * The lab and platform-admin shell: a fixed white sidebar and a content
 * column. There is no desktop top bar — page titles live inside the content
 * column via `PageHeader`. (Doctors and clinics get `TopNavShell` instead; the
 * lab's seven sections do not fit a top bar.)
 *
 * Below `md` the sidebar collapses into a temporary drawer and a slim top bar
 * appears to hold its trigger.
 */
export function AppShell({ navEntries }: { navEntries: NavEntry[] }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null);
  const { user, signOut } = useAuth();
  const { t } = useTranslation('common');
  const { pathname } = useLocation();

  // Navigating from inside the temporary drawer must close it, or the new page
  // renders behind a still-open overlay.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Lab and clinic admins get an organisation card under the logo, as in the
  // mockups. Doctors and platform admins have no organisation to show.
  const org = user?.lab ?? user?.clinic ?? null;
  const orgInitials = org
    ? org.public_name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase()
    : '';

  const sidebar = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        component={RouterLink}
        to="/"
        sx={{ px: 2.25, pt: 2.25, pb: 1.75, textDecoration: 'none' }}
      >
        <BrandWordmark />
      </Stack>

      {org && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            mx: 1.5,
            mb: 1,
            px: 1.25,
            py: 1,
            borderRadius: `${radii.control}px`,
            bgcolor: surfaces[theme.palette.mode].subtle,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${brandTokens.main}, ${palette2026.aqua})`,
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            {orgInitials}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }} noWrap>
              {org.public_name}
            </Typography>
            {user?.lab && (
              <Typography
                sx={{ fontSize: '0.625rem', fontWeight: 600, color: 'success.main' }}
                noWrap
              >
                {t(`labApprovalStatus.${user.lab.approval_status}`)}
              </Typography>
            )}
          </Box>
        </Stack>
      )}

      <Box sx={{ px: 1.5, flex: 1, overflowY: 'auto' }}>
        <List disablePadding>
          {navEntries.map((entry) => (
            <ListItem key={entry.to} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                component={NavLink}
                to={entry.to}
                end={entry.end}
                sx={{
                  color: 'text.secondary',
                  '& .MuiListItemIcon-root': { minWidth: 32, color: 'inherit' },
                  '& .MuiListItemText-primary': { fontSize: '0.84375rem', fontWeight: 500 },
                  '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  '&.active': {
                    bgcolor: surfaces[theme.palette.mode].chip,
                    color: 'text.primary',
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                    // The FILL axis is how the mockups mark the active item;
                    // there is no separate filled glyph to swap in.
                    '& .material-symbols-rounded': { fontVariationSettings: "'FILL' 1" },
                  },
                }}
              >
                <ListItemIcon>
                  <Icon name={entry.icon} size={20} />
                </ListItemIcon>
                <ListItemText primary={entry.label} />
                {entry.badge}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.25} sx={{ mb: 0.5 }}>
          <FeedbackButton />
          <ColorModeToggle />
          <LanguageSwitcher variant="icon" />
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          onClick={(e) => setUserAnchor(e.currentTarget)}
          sx={{
            px: 1.25,
            py: 1,
            borderRadius: `${radii.control}px`,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <UserAvatar size={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700 }} noWrap>
              {user?.first_name} {user?.last_name}
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }} noWrap>
              {user ? t(`roles.${user.role}`) : ''}
            </Typography>
          </Box>
          <Icon name="unfold_more" size={18} sx={{ color: 'text.secondary' }} />
        </Stack>
      </Box>

      <Menu
        anchorEl={userAnchor}
        open={!!userAnchor}
        onClose={() => setUserAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography variant="subtitle2">
            {user?.first_name} {user?.last_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {user?.email}
          </Typography>
        </Box>
        <Divider sx={{ mx: 1 }} />
        <MenuItem onClick={() => void signOut()}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Icon name="logout" size={18} />
          </ListItemIcon>
          <ListItemText>{t('actions.signOut')}</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              borderRight: 0,
              backgroundImage: 'none',
            },
          }}
        >
          {sidebar}
        </Drawer>
      ) : (
        <Box
          component="nav"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            bgcolor: 'background.paper',
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          {sidebar}
        </Box>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
        {isMobile && (
          <AppBar
            position="sticky"
            elevation={0}
            sx={{
              bgcolor: alpha(theme.palette.background.default, 0.88),
              backdropFilter: 'saturate(180%) blur(10px)',
              WebkitBackdropFilter: 'saturate(180%) blur(10px)',
              color: 'text.primary',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Toolbar sx={{ minHeight: layout.mobileBar, height: layout.mobileBar }}>
              <IconButton
                edge="start"
                color="inherit"
                onClick={() => setMobileOpen(true)}
                aria-label="open navigation"
              >
                <Icon name="menu" size={22} />
              </IconButton>
              <Box
                component={RouterLink}
                to="/"
                sx={{ ml: 1, display: 'flex', textDecoration: 'none' }}
              >
                <BrandWordmark size={26} />
              </Box>
            </Toolbar>
          </AppBar>
        )}

        <Box
          sx={{
            maxWidth: CONTENT_MAX,
            mx: 'auto',
            px: layout.gutter,
            // `PageHeader` cancels this top padding to reach the column's top
            // edge; pages without one keep it.
            pt: { xs: 2.5, md: 3.25 },
            pb: 10,
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
