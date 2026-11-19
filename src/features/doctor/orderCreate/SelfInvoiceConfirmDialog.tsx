import { useId, useRef } from 'react';
import { Button, Dialog, DialogActions, DialogTitle } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { revealElement } from '@/features/orderForms/scrollToFirstError';

/**
 * "Are you sure you want the invoice made out to you?", asked of a doctor in
 * a clinic they can order for, every time an order is about to be invoiced to
 * them instead: on Send in the wizard, and on Save when an edit moves the
 * invoice to them. A clinic is the default, so this catches the doctor who
 * switched away from it by mistake. Never asked of a doctor with no such
 * clinic, a clinic admin or a buying lab: they have no other choice.
 *
 * Cancel, Escape and the backdrop all leave the form as it is. Once the dialog
 * has gone, the invoice choice (`revealId`) is brought into view, since that
 * is what the doctor came back to change. Focus starts on Cancel, so an Enter
 * pressed out of habit does not send.
 */
export function SelfInvoiceConfirmDialog({
  open,
  onConfirm,
  onCancel,
  revealId,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** The element holding the invoice choice. */
  revealId: string;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const titleId = useId();
  const cancelled = useRef(false);

  const cancel = () => {
    cancelled.current = true;
    onCancel();
  };

  return (
    <Dialog
      open={open}
      onClose={cancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      TransitionProps={{
        // After the fade, when focus is back on the button that opened it.
        onExited: () => {
          if (!cancelled.current) return;
          cancelled.current = false;
          const el = document.getElementById(revealId);
          if (el) revealElement(el);
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ fontSize: '1.0625rem', lineHeight: 1.45, pb: 1 }}>
        {t('orderCreate.invoice.confirmSelf')}
      </DialogTitle>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={cancel} color="inherit" autoFocus>
          {tc('actions.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            cancelled.current = false;
            onConfirm();
          }}
        >
          {t('orderCreate.invoice.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
