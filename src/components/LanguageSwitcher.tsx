import { useState, type MouseEvent } from 'react';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { LANGUAGES, type LanguageCode } from '@/i18n';
import { GlobeIcon } from './GlobeIcon';

const SUPPORTED_CODES = LANGUAGES.map((l) => l.code) as readonly string[];

/**
 * Custom-icon language picker.
 *
 * - Renders the globe icon as an IconButton in the AppBar.
 * - Click → Menu with the supported languages, current one highlighted.
 * - Pick → calls `i18n.changeLanguage` with the validated code. NEVER navigates,
 *   modifies the URL, or touches React Router. The page stays put.
 *
 * The `variant` prop is kept for backward compatibility with existing call
 * sites; it doesn't change the rendering anymore.
 */
export function LanguageSwitcher(_props: { variant?: 'icon' | 'text' } = {}) {
  const { i18n, t } = useTranslation('common');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const rawCurrent = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const currentCode: LanguageCode = (
    SUPPORTED_CODES.includes(rawCurrent) ? rawCurrent : 'en'
  ) as LanguageCode;

  const handleSelect = (code: string) => {
    setAnchor(null);
    if (!SUPPORTED_CODES.includes(code)) return; // ignore anything weird
    if (code === currentCode) return;
    void i18n.changeLanguage(code);
  };

  return (
    <>
      <Tooltip title={t('language.label')}>
        <IconButton
          color="inherit"
          onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
          aria-label={t('language.label')}
          size="medium"
        >
          <GlobeIcon size={20} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LANGUAGES.map(({ code, label, flag }) => {
          const isSelected = code === currentCode;
          return (
            <MenuItem
              key={code}
              selected={isSelected}
              onClick={() => handleSelect(code)}
            >
              <ListItemIcon>{flag}</ListItemIcon>
              <ListItemText>{label}</ListItemText>
              {isSelected && <Icon name="check" size={18} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
