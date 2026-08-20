import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DropZone, FileChip, Icon } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import type { OrderFileRow } from '@/types/database';
import {
  MAX_ORDER_FILE_BYTES,
  OrderFileError,
  fileIconFor,
  formatFileSize,
  getOrderFileUrl,
  listOrderFiles,
  removeOrderFile,
  uploadOrderFile,
} from './orderFilesApi';

export const orderFilesKey = (orderId: string) => ['order-files', orderId] as const;

/** Translate an upload failure. Anything we didn't classify falls back to the
 *  generic message rather than leaking a Supabase string at the user. */
function useFileError() {
  const { t } = useTranslation('common');
  return (err: unknown, fallbackName: string) => {
    const kind = err instanceof OrderFileError ? err.kind : 'generic';
    const name = err instanceof OrderFileError ? err.fileName : fallbackName;
    return t(`orderFiles.errors.${kind}` as 'orderFiles.errors.generic', { name });
  };
}

/* -------------------------------------------------------------------------- */
/* Pre-submit: no order exists yet, so nothing can be uploaded.                */
/* -------------------------------------------------------------------------- */

/**
 * The picker used while an order is still being filled in.
 *
 * It deliberately does NOT upload: the storage path and every RLS policy on the
 * bucket are keyed on the order id, which doesn't exist until submit returns.
 * So we hold the File objects and the page uploads them afterwards.
 */
export function PendingOrderFilesField({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('common');
  const [dragging, setDragging] = useState(false);
  const [tooBig, setTooBig] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (incoming: File[]) => {
    if (incoming.length === 0) return;
    // Reject oversize here so the doctor learns now, not after submitting.
    const ok = incoming.filter((f) => f.size <= MAX_ORDER_FILE_BYTES);
    setTooBig(incoming.filter((f) => f.size > MAX_ORDER_FILE_BYTES).map((f) => f.name));
    if (ok.length) onChange([...files, ...ok]);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) add(Array.from(e.dataTransfer?.files ?? []));
  };

  return (
    <Stack spacing={1.5}>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = ''; // so re-picking the same file fires change again
        }}
      />

      <DropZone
        title={t('orderFiles.dropHint')}
        hint={t('orderFiles.sizeHint', { size: formatFileSize(MAX_ORDER_FILE_BYTES) })}
        active={dragging}
        disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      />

      {tooBig.length > 0 && (
        <Typography variant="caption" color="error">
          {t('orderFiles.errors.tooLarge', { name: tooBig.join(', ') })}
        </Typography>
      )}

      <Stack spacing={1}>
        {files.map((f, i) => (
          <FileChip
            key={`${f.name}-${i}`}
            icon={fileIconFor(f.type)}
            name={f.name}
            size={formatFileSize(f.size)}
            action={
              <IconButton
                size="small"
                aria-label={t('orderFiles.remove')}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                sx={{ ml: 'auto' }}
              >
                <Icon name="close" size={16} />
              </IconButton>
            }
          />
        ))}
      </Stack>
    </Stack>
  );
}

/* -------------------------------------------------------------------------- */
/* Attached: the order exists, so uploads happen immediately.                  */
/* -------------------------------------------------------------------------- */

export function OrderFilesField({
  orderId,
  labId,
  canUpload = false,
  canRemove,
  readOnlyEmptyText,
}: {
  orderId: string;
  labId: string;
  canUpload?: boolean;
  /** Per-file, so the lab can be offered removal only on its own uploads. */
  canRemove?: (file: OrderFileRow) => boolean;
  readOnlyEmptyText?: string;
}) {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();
  const describeError = useFileError();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: orderFilesKey(orderId),
    queryFn: () => listOrderFiles(orderId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: orderFilesKey(orderId) });

  const upload = useMutation({
    mutationFn: async (picked: File[]) => {
      if (!user) throw new Error('not_authenticated');
      // Sequential, so one failure doesn't take the rest of the batch with it.
      const failures: unknown[] = [];
      for (const f of picked) {
        try {
          await uploadOrderFile({ id: orderId, lab_id: labId }, f, user.id, user.role);
        } catch (e) {
          failures.push(e);
        }
      }
      if (failures.length) throw failures[0];
    },
    onSettled: invalidate,
    onSuccess: () => setError(null),
    onError: (e) => setError(describeError(e, '')),
  });

  const remove = useMutation({
    mutationFn: (file: OrderFileRow) => removeOrderFile(file),
    onSettled: invalidate,
    onError: (e) => setError(describeError(e, '')),
  });

  const open = async (file: OrderFileRow) => {
    setBusyPath(file.storage_path);
    try {
      // Private bucket — mint a short-lived URL per click rather than storing one.
      const url = await getOrderFileUrl(file.storage_path);
      globalThis.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(describeError(e, file.file_name));
    } finally {
      setBusyPath(null);
    }
  };

  const add = (incoming: File[]) => {
    if (incoming.length > 0) upload.mutate(incoming);
  };

  return (
    <Stack spacing={1.5}>
      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <DropZone
            title={t('orderFiles.dropHint')}
            hint={
              upload.isPending
                ? t('orderFiles.uploading')
                : t('orderFiles.sizeHint', { size: formatFileSize(MAX_ORDER_FILE_BYTES) })
            }
            active={dragging}
            disabled={upload.isPending}
            onClick={() => !upload.isPending && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!upload.isPending) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!upload.isPending) add(Array.from(e.dataTransfer?.files ?? []));
            }}
          />
        </>
      )}

      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : files.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {readOnlyEmptyText ?? t('orderFiles.empty')}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {files.map((f) => (
            <FileChip
              key={f.id}
              icon={fileIconFor(f.file_type)}
              name={f.file_name}
              size={formatFileSize(f.file_size_bytes)}
              action={
                <Stack direction="row" spacing={0.25} sx={{ ml: 'auto' }}>
                  <Tooltip title={t('orderFiles.download')}>
                    <span>
                      <IconButton
                        size="small"
                        aria-label={t('orderFiles.download')}
                        disabled={busyPath === f.storage_path}
                        onClick={() => void open(f)}
                      >
                        <Icon name="download" size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {canRemove?.(f) && (
                    <Tooltip title={t('orderFiles.remove')}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={t('orderFiles.remove')}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(f)}
                        >
                          <Icon name="delete" size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
