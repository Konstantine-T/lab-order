import { Box, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { PendingOrderFilesField } from '@/features/orders/orderFiles/OrderFilesField';
import { LabContactLine } from '@/features/orders/orderFiles/LabContactLine';
import { MAX_ORDER_FILE_BYTES, formatFileSize } from '@/features/orders/orderFiles/orderFilesApi';
import { radii, surfaces } from '@/theme/tokens';
import { SectionBadge, SectionCardShell } from '../primitives';
import { useRegisterSection } from './sectionRegistry';
import { PeriLink } from './ui';

export const FILES_SECTION_ID = 'order-files';

/** Stands in for the sign-in link while the sentence is translated. */
const LINK_SLOT = '\u0000';

/**
 * The wizard's Files card: files are picked here and uploaded once the order
 * exists — see the submit mutation.
 *
 * Not offered to a guest. A `File` cannot follow the draft into localStorage,
 * and the bucket's policies need an order to key off, so there is no honest
 * way to hold a guest's attachments across the sign-in redirect. The guest
 * sees where the drop zone will be and a sign-in link that saves the draft
 * first — better than a dropzone that quietly loses them.
 *
 * The lab's address stays under both: a ticket asked for it wherever a
 * doctor is asked for files, and the header no longer carries it.
 */
export function FilesCard({
  files,
  onChange,
  disabled,
  labEmail,
  guest,
  onSignIn,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  labEmail?: string | null;
  guest?: boolean;
  /** Guest only: save the draft, then go and sign in. */
  onSignIn?: () => void;
}) {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const mode = theme.palette.mode;

  useRegisterSection({
    id: FILES_SECTION_ID,
    kind: 'wizard',
    label: t('orderCreate.filesAndDue.files'),
    name: t('orderCreate.filesAndDue.files'),
    // Optional: an order can go without attachments.
    required: false,
    done: !guest && files.length > 0,
  });

  const [before, after = ''] = t('orderCreate.guest.filesSignIn', { link: LINK_SLOT }).split(
    LINK_SLOT,
  );

  return (
    <SectionCardShell
      id={FILES_SECTION_ID}
      badge={
        <SectionBadge done={!guest && files.length > 0}>
          <Icon name="upload" size={15} />
        </SectionBadge>
      }
      title={t('orderCreate.filesAndDue.files')}
    >
      {guest ? (
        <Stack
          alignItems="center"
          spacing={0.5}
          sx={{
            p: 2,
            borderRadius: `${radii.control}px`,
            border: '1px dashed',
            borderColor: surfaces[mode].dashed,
            bgcolor: surfaces[mode].subtle,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.45 }}>
            {t('orderCreate.guest.filesDropTitle', { size: formatFileSize(MAX_ORDER_FILE_BYTES) })}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5 }}>
            {before}
            {onSignIn ? (
              <PeriLink onClick={onSignIn}>{t('orderCreate.guest.signIn')}</PeriLink>
            ) : (
              t('orderCreate.guest.signIn')
            )}
            {after}
          </Typography>
        </Stack>
      ) : (
        <Box
          sx={{
            // The shared drop zone, brought to the redesign's proportions —
            // control radius, a shorter box, a smaller glyph. Its colours and
            // drag states are its own and stay.
            '& input[type="file"] + .MuiStack-root': {
              borderRadius: `${radii.control}px`,
              py: 2,
              '& .material-symbols-rounded': { fontSize: 24, width: 24, height: 24 },
            },
          }}
        >
          <PendingOrderFilesField files={files} onChange={onChange} disabled={disabled} />
        </Box>
      )}
      {/* No order code yet — the order doesn't exist until submit, so the copy
          asks for the patient's name instead of a number that can't be quoted. */}
      <LabContactLine email={labEmail} />
    </SectionCardShell>
  );
}
