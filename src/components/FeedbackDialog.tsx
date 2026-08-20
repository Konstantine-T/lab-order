import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Icon } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { FeedbackRow } from '@/types/database';
import {
  FEEDBACK_BUCKET,
  FEEDBACK_IMAGE_TYPES,
  MAX_FEEDBACK_IMAGES,
  MAX_FEEDBACK_IMAGE_BYTES,
  feedbackImagePath,
  formatBytes,
  isAllowedFeedbackImage,
} from '@/utils/feedbackImages';

const MAX_MESSAGE_LENGTH = 2000;

/** A picked file plus the object URL previewing it. The URL is owned by this
 *  component and revoked when the attachment goes away. */
type Attachment = { file: File; previewUrl: string };

/** Why a batch of picked files was rejected. Kept as a code so the message can
 *  be translated at render time. */
type RejectReason = 'type' | 'size' | 'count';

export function FeedbackDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [rejected, setRejected] = useState<RejectReason | null>(null);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs outlive React state unless we revoke them by hand. The unmount
  // cleanup has to see the live list, not the one closed over on first render.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => attachmentsRef.current.forEach((a) => globalThis.URL.revokeObjectURL(a.previewUrl)),
    [],
  );

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    const images = incoming.filter(isAllowedFeedbackImage);
    const withinSize = images.filter((f) => f.size <= MAX_FEEDBACK_IMAGE_BYTES);
    const room = Math.max(MAX_FEEDBACK_IMAGES - attachments.length, 0);
    const accepted = withinSize.slice(0, room);

    // One reason wins, most-specific first: a wrong type is more useful to
    // report than the count limit it also happened to trip.
    setRejected(
      images.length < incoming.length
        ? 'type'
        : withinSize.length < images.length
          ? 'size'
          : accepted.length < withinSize.length
            ? 'count'
            : null,
    );

    if (accepted.length > 0) {
      setAttachments((prev) => [
        ...prev,
        ...accepted.map((file) => ({ file, previewUrl: globalThis.URL.createObjectURL(file) })),
      ]);
    }
  };

  const removeAt = (index: number) =>
    setAttachments((prev) => {
      const gone = prev[index];
      if (gone) globalThis.URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((_, i) => i !== index);
    });

  // Screenshots arrive on the clipboard, so pasting anywhere in the dialog is
  // the primary path — the Attach button is the fallback for saved files.
  const handlePaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('not_authenticated');

      // Upload first: the row stores the storage keys, so they have to exist
      // before the insert. A failed upload aborts before anything is written.
      const imagePaths: string[] = [];
      for (const { file } of attachments) {
        const path = feedbackImagePath(user.id, file.type);
        const { error } = await supabase.storage
          .from(FEEDBACK_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        imagePaths.push(path);
      }

      // No .select() — senders have no SELECT policy on feedback, so a
      // RETURNING clause would be blocked by RLS. A bare insert sends
      // Prefer: return=minimal, which is what this needs.
      const payload: Pick<
        FeedbackRow,
        'user_id' | 'message' | 'page_path' | 'lang' | 'image_paths'
      > = {
        user_id: user.id,
        message: message.trim(),
        page_path: pathname,
        // The language detector can return a region tag ("en-US"); the column
        // stores the plain two-letter code used everywhere else.
        lang: (i18n.resolvedLanguage ?? i18n.language).slice(0, 2),
        image_paths: imagePaths,
      };
      const { error } = await supabase.from('feedback').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      attachments.forEach((a) => globalThis.URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);
      setMessage('');
      setRejected(null);
      setFailed(false);
      onSent();
      onClose();
    },
    onError: () => setFailed(true),
  });

  const canSubmit = message.trim().length > 0 && !send.isPending;
  const atLimit = attachments.length >= MAX_FEEDBACK_IMAGES;

  const handleClose = () => {
    if (send.isPending) return;
    setFailed(false);
    setRejected(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('feedback.title')}</DialogTitle>
      <DialogContent
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atLimit) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        sx={{
          position: 'relative',
          ...(dragging && {
            outline: '2px dashed',
            outlineColor: (theme) => theme.palette.primary.main,
            outlineOffset: '-6px',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
          }),
        }}
      >
        {failed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('errors.generic')}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={4}
          maxRows={10}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          placeholder={t('feedback.placeholder')}
          inputProps={{ maxLength: MAX_MESSAGE_LENGTH }}
          helperText={`${message.length}/${MAX_MESSAGE_LENGTH}`}
          sx={{ mt: 1 }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={FEEDBACK_IMAGE_TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            // Reset so re-picking the same file fires change again.
            e.target.value = '';
          }}
        />

        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            startIcon={<Icon name="image" size={18} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={atLimit || send.isPending}
          >
            {t('feedback.attach')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t('feedback.attachHint', {
              max: MAX_FEEDBACK_IMAGES,
              size: formatBytes(MAX_FEEDBACK_IMAGE_BYTES),
            })}
          </Typography>
        </Stack>

        {rejected && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
            {t(`feedback.reject.${rejected}`, {
              max: MAX_FEEDBACK_IMAGES,
              size: formatBytes(MAX_FEEDBACK_IMAGE_BYTES),
            })}
          </Typography>
        )}

        {attachments.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
            {attachments.map((a, i) => (
              <Box
                key={a.previewUrl}
                sx={{
                  position: 'relative',
                  width: 88,
                  height: 88,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
              >
                <Box
                  component="img"
                  src={a.previewUrl}
                  alt={a.file.name}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <IconButton
                  size="small"
                  aria-label={t('feedback.removeImage')}
                  onClick={() => removeAt(i)}
                  disabled={send.isPending}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    bgcolor: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  }}
                >
                  <Icon name="close" size={14} />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={send.isPending}>
          {t('actions.cancel')}
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => send.mutate()}>
          {t('actions.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
