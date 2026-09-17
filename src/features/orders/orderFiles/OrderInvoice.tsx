import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Callout, Icon } from '@/components/design';
import type { OrderFileRow } from '@/types/database';
import {
  MAX_ORDER_FILE_BYTES,
  OrderFileError,
  acknowledgeOrderInvoice,
  fileIconFor,
  formatFileSize,
  getOrderFileUrl,
  replaceOrderInvoice,
  type UploadTarget,
} from './orderFilesApi';
import { invoiceState, orderInvoiceKey, useOrderInvoice } from './invoiceState';

/** Translate a failure without leaking a Supabase string at the user. */
function useInvoiceError() {
  const { t } = useTranslation('common');
  return (err: unknown, fallbackName: string) => {
    const kind = err instanceof OrderFileError ? err.kind : 'generic';
    const name = err instanceof OrderFileError ? err.fileName : fallbackName;
    return t(`orderFiles.errors.${kind}` as 'orderFiles.errors.generic', { name });
  };
}

/** Name, size and a download, in one line. Shared by both sides. */
function InvoiceFileLine({ invoice }: { invoice: OrderFileRow }) {
  const { t } = useTranslation('common');
  const describeError = useInvoiceError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      // Private bucket — mint a short-lived URL per click rather than storing one.
      const url = await getOrderFileUrl(invoice.storage_path, invoice.file_name);
      globalThis.open(url, '_blank', 'noopener');
    } catch (e) {
      // Without this the button just stopped spinning and nothing happened —
      // a missing object, an expired session or a blocked popup all looked
      // identical to a dead button.
      //
      // A download failure gets its own wording: the shared map is phrased for
      // uploads, and "couldn't upload" on a download button is worse than no
      // message at all. Permission and network still use the shared text,
      // which reads correctly either way.
      const kind = e instanceof OrderFileError ? e.kind : 'generic';
      setError(
        kind === 'generic'
          ? t('orderFiles.invoice.downloadFailed', { name: invoice.file_name })
          : describeError(e, invoice.file_name),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      {/* Wraps rather than truncates: this sits in the lab's 316px rail, where
          a non-shrinking row would crush its neighbours in Georgian. */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Icon name={fileIconFor(invoice.file_type)} size={18} />
      <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 auto' }}>
        {invoice.file_name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        {formatFileSize(invoice.file_size_bytes)}
      </Typography>
      <Button
        size="small"
        onClick={open}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={14} /> : <Icon name="download" size={15} />}
        sx={{ flexShrink: 0 }}
      >
        {t('orderFiles.invoice.download')}
      </Button>
      </Stack>
      {error && (
        <Typography variant="caption" color="error" sx={{ overflowWrap: 'anywhere' }}>
          {error}
        </Typography>
      )}
    </Stack>
  );
}

/* -------------------------------------------------------------------------- */
/* Lab: attach or replace                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The lab's invoice control, meant to sit directly under the final price.
 *
 * Replacing asks first. It is not a neutral act — the doctor may already have
 * paid against the document being thrown away — and it re-arms their alert.
 */
export function LabInvoiceControl({ order }: { order: UploadTarget }) {
  const { t } = useTranslation('lab');
  const qc = useQueryClient();
  const describeError = useInvoiceError();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: invoice, isLoading } = useOrderInvoice(order.id);

  const upload = useMutation({
    mutationFn: (file: File) => replaceOrderInvoice(order, file),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: orderInvoiceKey(order.id) });
      // The doctor's alert re-arms server-side, so their view is stale too.
      qc.invalidateQueries({ queryKey: ['lab-order', order.id] });
      qc.invalidateQueries({ queryKey: ['unacknowledged-invoices'] });
    },
    onError: (e) => setError(describeError(e, '')),
  });

  const pick = () => inputRef.current?.click();

  const onPicked = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ORDER_FILE_BYTES) {
      setError(describeError(new OrderFileError('tooLarge', file.name), file.name));
      return;
    }
    upload.mutate(file);
  };

  if (isLoading) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {t('orderSheet.invoiceDoc.label')}
      </Typography>

      {invoice ? (
        <>
          <InvoiceFileLine invoice={invoice} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => setConfirmOpen(true)}
            disabled={upload.isPending}
            startIcon={<Icon name="sync" size={15} />}
          >
            {t('orderSheet.invoiceDoc.replace')}
          </Button>
        </>
      ) : (
        <Button
          size="small"
          variant="outlined"
          onClick={pick}
          disabled={upload.isPending}
          startIcon={
            upload.isPending ? <CircularProgress size={14} /> : <Icon name="upload_file" size={15} />
          }
        >
          {t('orderSheet.invoiceDoc.attach')}
        </Button>
      )}

      {error && (
        <Typography variant="caption" color="error" sx={{ overflowWrap: 'anywhere' }}>
          {error}
        </Typography>
      )}

      <Box
        component="input"
        ref={inputRef}
        type="file"
        sx={{ display: 'none' }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onPicked(e.target.files?.[0]);
          // Let the same file be picked again after a failure.
          e.target.value = '';
        }}
      />

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('orderSheet.invoiceDoc.replaceConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('orderSheet.invoiceDoc.replaceConfirm.body')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="inherit">
            {t('orderSheet.invoiceDoc.replaceConfirm.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmOpen(false);
              pick();
            }}
          >
            {t('orderSheet.invoiceDoc.replaceConfirm.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* -------------------------------------------------------------------------- */
/* Doctor / clinic: see it, then say so                                        */
/* -------------------------------------------------------------------------- */

/**
 * The invoice as the doctor sees it, for the block beside the price.
 *
 * Renders nothing when there is no invoice — it is optional, and an empty
 * "Invoice" heading on every order would be noise on most of them.
 *
 * The alert does not clear by opening the order: the owner's decision was an
 * explicit acknowledgement, so it survives navigation and reload until the
 * doctor presses the button.
 */
export function DoctorInvoiceBlock({
  orderId,
  acknowledgedAt,
  onAcknowledged,
}: {
  orderId: string;
  acknowledgedAt: string | null | undefined;
  /** Lets the page refresh the order row the acknowledgement just changed. */
  onAcknowledged?: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const describeError = useInvoiceError();
  const [error, setError] = useState<string | null>(null);

  const { data: invoice } = useOrderInvoice(orderId);
  const { hasInvoice, isUnacknowledged, isReplacement } = invoiceState(invoice, acknowledgedAt);

  const ack = useMutation({
    mutationFn: () => acknowledgeOrderInvoice(orderId),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: orderInvoiceKey(orderId) });
      qc.invalidateQueries({ queryKey: ['nav-alerts'] });
      // The list badge is a separate query; without this the "new invoice"
      // pill sits on the row for up to its staleTime after the doctor has
      // already dealt with it.
      qc.invalidateQueries({ queryKey: ['unacknowledged-invoices'] });
      onAcknowledged?.();
    },
    onError: (e) => setError(describeError(e, '')),
  });

  if (!hasInvoice || !invoice) return null;

  if (!isUnacknowledged) {
    return (
      <Stack spacing={0.75}>
        <Typography variant="caption" color="text.secondary">
          {t('orderDetail.invoice.title')}
        </Typography>
        <InvoiceFileLine invoice={invoice} />
      </Stack>
    );
  }

  return (
    <Callout
      tone="warning"
      icon="receipt_long"
      title={
        isReplacement ? t('orderDetail.invoice.changed') : t('orderDetail.invoice.attached')
      }
    >
      <Stack spacing={1} sx={{ mt: 0.5 }}>
        <InvoiceFileLine invoice={invoice} />
        <Box>
          <Button
            size="small"
            variant="contained"
            onClick={() => ack.mutate()}
            disabled={ack.isPending}
          >
            {t('orderDetail.invoice.gotIt')}
          </Button>
        </Box>
        {error && (
          <Typography variant="caption" color="error" sx={{ overflowWrap: 'anywhere' }}>
            {error}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {tc('orderFiles.invoice.acknowledgeHint')}
        </Typography>
      </Stack>
    </Callout>
  );
}
