import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
  type PopoverOrigin,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design/Icon';
import { FeedbackFlow } from '@/components/FeedbackButton';
import { useCanSendFeedback } from '@/components/useCanSendFeedback';
import { useAuth } from '@/auth/AuthProvider';
import { LANGUAGES } from '@/i18n';
import { useColorMode } from '@/theme/ColorModeProvider';
import { tone } from '@/theme/tokens';

export type MenuLink = {
  to: string;
  label: string;
  icon: string;
  /** For a page the desktop bar already links to. */
  mobileOnly?: boolean;
};

/** The signed-in user's initials on the redesign's aqua disc. */
export function UserAvatar({ size = 36 }: { size?: number }) {
  const theme = useTheme();
  const { user } = useAuth();
  const aqua = tone('success', theme.palette.mode);
  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: aqua.bg,
        color: aqua.fg,
        fontSize: size >= 34 ? '0.8125rem' : '0.75rem',
        fontWeight: 700,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {initials}
    </Box>
  );
}

/**
 * Everything the doctor and clinic top bar has no room for: the secondary
 * pages, language, light/dark, feedback and sign-out.
 *
 * The feedback dialog is rendered beside the menu, not in it — the menu
 * unmounts its items on close, which is exactly when the dialog opens.
 */
export function AccountMenu({
  anchorEl,
  onClose,
  links = [],
  anchorOrigin = { vertical: 'bottom', horizontal: 'right' },
  transformOrigin = { vertical: 'top', horizontal: 'right' },
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  links?: MenuLink[];
  anchorOrigin?: PopoverOrigin;
  transformOrigin?: PopoverOrigin;
}) {
  const { t, i18n } = useTranslation('common');
  const { user, signOut } = useAuth();
  const { mode, toggle } = useColorMode();
  const canSendFeedback = useCanSendFeedback();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const currentLang = i18n.resolvedLanguage ?? i18n.language;

  return (
    <>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={onClose}
        anchorOrigin={anchorOrigin}
        transformOrigin={transformOrigin}
        slotProps={{ paper: { sx: { minWidth: 264, mt: 0.75 } } }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.25 }}>
          <Typography variant="subtitle2" noWrap>
            {user?.first_name} {user?.last_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {user?.email}
          </Typography>
          {/* The top bar has no organisation card, so the clinic is named here. */}
          {user?.clinic && (
            <Typography variant="caption" color="text.secondary" display="block" noWrap>
              {user.clinic.public_name}
            </Typography>
          )}
        </Box>

        {links.length > 0 && <Divider sx={{ mx: 1 }} />}
        {links.map((link) => (
          <MenuItem
            key={link.to}
            component={RouterLink}
            to={link.to}
            onClick={onClose}
            sx={link.mobileOnly ? { display: { md: 'none' } } : undefined}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Icon name={link.icon} size={18} />
            </ListItemIcon>
            <ListItemText>{link.label}</ListItemText>
          </MenuItem>
        ))}

        <Divider sx={{ mx: 1 }} />

        {/* A segmented row rather than three menu items: the menu stays short
            and the current language is visible without opening anything. */}
        <Box sx={{ px: 2, pt: 0.75, pb: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
            {t('language.label')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            fullWidth
            value={currentLang}
            onChange={(_, code: string | null) => {
              if (code && code !== currentLang) void i18n.changeLanguage(code);
            }}
          >
            {LANGUAGES.map(({ code, label }) => (
              <ToggleButton
                key={code}
                value={code}
                sx={{ py: 0.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none' }}
              >
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Stays open on click, so the switch is seen to happen. */}
        <MenuItem onClick={toggle}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Icon name={mode === 'light' ? 'dark_mode' : 'light_mode'} size={18} />
          </ListItemIcon>
          <ListItemText>
            {mode === 'light' ? t('theme.switchToDark') : t('theme.switchToLight')}
          </ListItemText>
        </MenuItem>

        {canSendFeedback && (
          <MenuItem
            onClick={() => {
              onClose();
              setFeedbackOpen(true);
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Icon name="feedback" size={18} />
            </ListItemIcon>
            <ListItemText>{t('feedback.title')}</ListItemText>
          </MenuItem>
        )}

        <Divider sx={{ mx: 1 }} />
        <MenuItem onClick={() => void signOut()}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Icon name="logout" size={18} />
          </ListItemIcon>
          <ListItemText>{t('actions.signOut')}</ListItemText>
        </MenuItem>
      </Menu>

      {canSendFeedback && (
        <FeedbackFlow open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      )}
    </>
  );
}
