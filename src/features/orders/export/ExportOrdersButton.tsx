import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Portal,
  Snackbar,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { uiLang } from '@/features/lab/labText';
import { PHONE_ADD_SX } from '@/features/orders/list/listStyles';
import { EXPORT_CONFIRM_ABOVE, type ExportScope } from './exportTypes';

/**
 * "Export" in an orders page's header: every order the page's filters,
 * search and sort leave, across all its pages, as an `.xlsx` file. The
 * library and the column code load on the first click (`exportOrders`).
 *
 * A labelled outlined button from `sm` up, a square icon button on a phone
 * (PageHeader stretches every action there). The page stays usable while the
 * file is built; the button shows a spinner and takes no second click.
 */
export function ExportOrdersButton({
  scope,
  count,
  orderIds,
  fileTag,
}: {
  /** Null until the page knows whose orders these are: the button waits. */
  scope: ExportScope | null;
  /** How many rows the filters leave; none disables the button. */
  count: number;
  /** Those rows' ids, top to bottom as the page shows them. Read on click. */
  orderIds: () => readonly string[];
  /** The file name's page part: `orders-<fileTag>-YYYY-MM-DD.xlsx`. */
  fileTag: string;
}) {
  const { t, i18n } = useTranslation('common');
  const [busy, setBusy] = useState(false);
  // A large export waits for a yes. The ids outlive `open` so the title keeps
  // its number while the dialog fades out.
  const [confirm, setConfirm] = useState<{ open: boolean; ids: readonly string[] }>({
    open: false,
    ids: [],
  });
  const closeConfirm = () => setConfirm((c) => ({ ...c, open: false }));
  const [failed, setFailed] = useState(false);

  const run = async (ids: readonly string[]) => {
    if (!scope) return;
    closeConfirm();
    setFailed(false);
    setBusy(true);
    try {
      const { exportOrders } = await import('./exportOrders');
      await exportOrders({ scope, ids, t, lang: uiLang(i18n), fileTag });
    } catch (error) {
      // Never shown raw (it may be a PostgREST error in English): the toast
      // below says it failed, the console says why.
      console.error('[orders export]', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const ids = orderIds();
    if (ids.length === 0) return;
    if (ids.length > EXPORT_CONFIRM_ABOVE) setConfirm({ open: true, ids });
    else void run(ids);
  };

  const label = t('orderExport.button');
  const disabled = !scope || count === 0 || busy;
  const icon = busy ? (
    <CircularProgress size={16} color="inherit" aria-hidden />
  ) : (
    <Icon name="download" size={18} />
  );

  return (
    <>
      <Button
        variant="outlined"
        onClick={start}
        disabled={disabled}
        aria-label={label}
        aria-busy={busy}
        sx={PHONE_ADD_SX}
      >
        {icon}
      </Button>
      <Button
        variant="outlined"
        onClick={start}
        disabled={disabled}
        aria-busy={busy}
        startIcon={icon}
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {label}
      </Button>

      <Dialog open={confirm.open} onClose={closeConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>
          {t('orderExport.confirmTitle', {
            n: new Intl.NumberFormat(uiLang(i18n)).format(confirm.ids.length),
          })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t('orderExport.confirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm} color="inherit">
            {t('actions.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void run(confirm.ids)}
            startIcon={<Icon name="download" size={16} />}
          >
            {label}
          </Button>
        </DialogActions>
      </Dialog>

      {/* In a portal: PageHeader's backdrop blur would otherwise pin this
          fixed-position toast to the header instead of the window. */}
      <Portal>
        <Snackbar
          open={failed}
          autoHideDuration={6000}
          onClose={() => setFailed(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setFailed(false)}>
            {t('orderExport.error')}
          </Alert>
        </Snackbar>
      </Portal>
    </>
  );
}
