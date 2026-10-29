import { Button, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import type { TrashScope } from './trashApi';
import { useTrashCount } from './trashQueries';

/** "Trash (N)" at the foot of an orders list (C2). N = what is still restorable. */
export function TrashLink({ scope, to }: { scope: TrashScope | null; to: string }) {
  const { t } = useTranslation('common');
  const count = useTrashCount(scope);
  if (!scope) return null;
  return (
    <Stack direction="row" justifyContent="center" sx={{ mt: 1 }}>
      <Button
        component={RouterLink}
        to={to}
        size="small"
        color="inherit"
        startIcon={<Icon name="delete" size={16} />}
        sx={{ color: 'text.secondary', fontWeight: 600 }}
      >
        {t('trash.link', { n: count })}
      </Button>
    </Stack>
  );
}
