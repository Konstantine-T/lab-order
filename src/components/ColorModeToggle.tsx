import { IconButton, Tooltip } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeProvider';

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const { t } = useTranslation('common');
  const label = mode === 'light' ? t('theme.switchToDark') : t('theme.switchToLight');

  return (
    <Tooltip title={label}>
      <IconButton onClick={toggle} color="inherit" aria-label={t('theme.toggle')}>
        {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
