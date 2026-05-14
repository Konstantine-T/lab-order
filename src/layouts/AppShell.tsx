import { useState, type ReactNode } from 'react';
import { Link as RouterLink, NavLink, Outlet } from 'react-router-dom';
import {
  alpha,
  AppBar,
  Avatar,
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
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';
import { ColorModeToggle } from '@/components/ColorModeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/auth/AuthProvider';

export type NavEntry = {
  to: string;
  label: string;
  icon?: ReactNode;
  end?: boolean;
};

const DRAWER_WIDTH = 248;

export function AppShell({ navEntries, brand }: { navEntries: NavEntry[]; brand: string }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarAnchor, setAvatarAnchor] = useState<HTMLElement | null>(null);
  const { user, signOut } = useAuth();
  const { t } = useTranslation('common');

  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
    : '?';

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ minHeight: { xs: 64, md: 64 }, px: 3 }}>
        <Typography
          variant="h6"
          noWrap
          component={RouterLink}
          to="/"
          sx={{
            color: 'text.primary',
            textDecoration: 'none',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              display: 'inline-block',
            }}
          />
          {brand}
        </Typography>
      </Toolbar>
      <Box sx={{ flex: 1, py: 1.5, px: 1.5 }}>
        <List disablePadding>
          {navEntries.map((entry) => (
            <ListItem key={entry.to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={entry.to}
                end={entry.end}
                onClick={() => setMobileOpen(false)}
                sx={{
                  borderRadius: 2,
                  px: 1.5,
                  py: 1,
                  color: 'text.secondary',
                  '& .MuiListItemIcon-root': {
                    minWidth: 36,
                    color: 'text.secondary',
                    transition: 'color 160ms ease',
                  },
                  '& .MuiListItemText-primary': {
                    fontSize: '0.92rem',
                    fontWeight: 500,
                  },
                  '&:hover': {
                    bgcolor: 'action.hover',
                    color: 'text.primary',
                    '& .MuiListItemIcon-root': { color: 'text.primary' },
                  },
                  '&.active': {
                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.1 : 0.16),
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                    '& .MuiListItemText-primary': { fontWeight: 600 },
                  },
                }}
              >
                {entry.icon && <ListItemIcon>{entry.icon}</ListItemIcon>}
                <ListItemText primary={entry.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t2) => t2.zIndex.drawer + 1,
          bgcolor: alpha(theme.palette.background.paper, 0.85),
          color: 'text.primary',
          backdropFilter: 'saturate(180%) blur(12px)',
          WebkitBackdropFilter: 'saturate(180%) blur(12px)',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 64 } }}>
          {isMobile && (
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => setMobileOpen((v) => !v)}
              sx={{ mr: 1 }}
              aria-label="open navigation"
            >
              <MenuIcon />
            </IconButton>
          )}
          {isMobile && (
            <Typography
              variant="h6"
              noWrap
              sx={{ flexGrow: 1, fontWeight: 700, letterSpacing: '-0.01em' }}
            >
              {brand}
            </Typography>
          )}
          {!isMobile && <Box sx={{ flex: 1 }} />}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ColorModeToggle />
            <LanguageSwitcher variant="icon" />
            <Tooltip title={user ? `${user.first_name} ${user.last_name}` : ''}>
              <IconButton
                onClick={(e) => setAvatarAnchor(e.currentTarget)}
                size="small"
                sx={{ ml: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  {initials}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={avatarAnchor}
              open={!!avatarAnchor}
              onClose={() => setAvatarAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="body2" fontWeight={600}>
                  {user?.first_name} {user?.last_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
              <Divider sx={{ mx: 1 }} />
              <MenuItem onClick={() => void signOut()}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('actions.signOut')}</ListItemText>
              </MenuItem>
            </Menu>
          </Stack>
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              borderRight: 0,
              borderColor: 'divider',
              backgroundImage: 'none',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: 1,
              borderColor: 'divider',
              backgroundImage: 'none',
              bgcolor: 'background.paper',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          bgcolor: 'background.default',
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2.5, md: 4 }, maxWidth: 1280, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
