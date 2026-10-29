import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import type { TrashKeeper } from './trashKeeper';

/**
 * "Move this order to the trash? It will be deleted from your list in 14
 * days. The doctor keeps it." One dialog for the single button and the bulk
 * action.
 */
export function TrashConfirmDialog({
  open,
  count,
  keeper,
  pending,
  errorKey,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  keeper: TrashKeeper;
  pending: boolean;
  /** A `common` key from `trashErrorKey`, when the last attempt failed. */
  errorKey?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  // One order and several are separate keys, not plural forms of one: Russian
  // uses its "one" form for 21 and 31 too, where "this order" would be wrong.
  const single = count === 1;
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {single ? t('trash.confirm.titleSingle') : t('trash.confirm.titleMany', { count })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <DialogContentText>
            {single ? t('trash.confirm.bodySingle') : t('trash.confirm.bodyMany')}{' '}
            {t(`trash.keeps.${keeper}.${single ? 'single' : 'many'}`)}
          </DialogContentText>
          {errorKey && <Alert severity="error">{t(errorKey)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={pending}>
          {t('actions.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={pending}
          startIcon={<Icon name="delete" size={16} />}
        >
          {t('trash.moveToTrash')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Delete now?" / "Empty the trash?": the two that cannot be undone. */
export function PurgeConfirmDialog({
  open,
  count,
  all,
  pending,
  errorKey,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** How many "Empty trash" deletes; null when the page does not know
   *  (loading, or the count failed): the text then names no number. */
  count: number | null;
  /** Empty trash rather than one order. */
  all: boolean;
  pending: boolean;
  errorKey?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {all ? t('trash.emptyConfirm.title') : t('trash.deleteNowConfirm.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <DialogContentText>
            {!all
              ? t('trash.deleteNowConfirm.body')
              : count === null
                ? t('trash.emptyConfirm.bodyAll')
                : t('trash.emptyConfirm.body', { count })}
          </DialogContentText>
          {errorKey && <Alert severity="error">{t(errorKey)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={pending}>
          {t('actions.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={pending}
          startIcon={<Icon name={all ? 'delete_sweep' : 'delete_forever'} size={16} />}
        >
          {all ? t('trash.emptyTrash') : t('trash.deleteNow')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
