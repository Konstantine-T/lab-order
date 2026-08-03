import { IconButton, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { useColorMode } from '@/theme/ColorModeProvider';

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const { t } = useTranslation('common');
  const label = mode === 'light' ? t('theme.switchToDark') : t('theme.switchToLight');

  return (
    <Tooltip title={label}>
      <IconButton onClick={toggle} color="inherit" aria-label={t('theme.toggle')}>
        {mode === 'light' ? <Icon name="dark_mode" size={20} /> : <Icon name="light_mode" size={20} />}
      </IconButton>
    </Tooltip>
  );
}
