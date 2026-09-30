import { useEffect, useRef, useState } from 'react';
import { IconButton, InputAdornment, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * A copy button for the end of a read-only text field — the doctor's notes
 * and answers to the lab's own questions, as the lab reads them on the order
 * sheet.
 *
 * Renders nothing for an empty answer: there is nothing to copy.
 */
export function CopyAdornment({ text }: { text: string | null | undefined }) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!text?.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context, permission denied) — the
      // text is still right there to select by hand.
    }
  };

  return (
    <InputAdornment
      position="end"
      sx={{
        // A single-line field is centred by default, which is right. In a
        // multiline one that floats the button halfway down a ten-row notes
        // box, so pin it to the first line instead: flex-start puts it at the
        // top padding, and half of InputBase's 1.4375em line-height centres it
        // on that line whatever the padding and font size.
        '.MuiInputBase-multiline > &': { alignSelf: 'flex-start', mt: '0.71875em' },
      }}
    >
      <Tooltip title={copied ? t('actions.copied') : t('actions.copy')}>
        <IconButton size="small" edge="end" onClick={copy} aria-label={t('actions.copy')}>
          <Icon name={copied ? 'check' : 'content_copy'} size={18} />
        </IconButton>
      </Tooltip>
    </InputAdornment>
  );
}
