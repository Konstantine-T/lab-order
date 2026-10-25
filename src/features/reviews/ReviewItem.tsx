import type { ReactNode } from 'react';
import { Box, Rating, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { pickText, useUiLang } from '@/features/lab/labText';
import { shortDate } from '@/features/orders/detail/format';
import { surfaces } from '@/theme/tokens';
import { starSx } from './reviewDraft';

/** The fields every reader of a review sees (the public RPC's columns). */
export type ReviewView = {
  rating: number;
  comment: string | null;
  reviewer_display: string;
  service_name: string | null;
  service_translations: unknown;
  lab_reply: string | null;
  lab_replied_at: string | null;
  created_at: string;
  edited: boolean;
};

const textSx = {
  fontSize: '0.875rem',
  lineHeight: 1.6,
  // Line breaks kept, long text never truncated, a long Georgian word wraps.
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
} as const;

/**
 * One review as everyone reads it: stars, "Irakli K.", the date, the service
 * in the reader's language, the comment, "edited", and the lab's reply as an
 * indented block. The lab's and the admin's pages add their own pills
 * (`badges`), actions (`footer`) and, for the lab, an inline reply editor in
 * place of the reply (`reply`).
 */
export function ReviewItem({
  review,
  labName,
  hideReviewer,
  badges,
  reply,
  footer,
}: {
  review: ReviewView;
  /** For "Reply from <lab>". */
  labName: string;
  /** The doctor's own card: their name adds nothing. */
  hideReviewer?: boolean;
  badges?: ReactNode;
  /** Replaces the reply block (the lab's editor). */
  reply?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation('doctor');
  const lang = useUiLang();
  const service = pickText(review.service_name, review.service_translations, 'name', lang).trim();
  const reviewer = review.reviewer_display.trim() || t('reviews.anonymous');

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.5 }}>
        <Rating
          value={review.rating}
          readOnly
          size="small"
          sx={starSx}
          getLabelText={(v: number) => t('reviews.starLabel', { count: v })}
        />
        {!hideReviewer && (
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {reviewer}
          </Typography>
        )}
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
          {shortDate(review.created_at)}
          {review.edited && ` · ${t('reviews.edited')}`}
        </Typography>
        {badges}
      </Stack>

      {service && (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {service}
        </Typography>
      )}

      {review.comment && <Typography sx={textSx}>{review.comment}</Typography>}

      {reply ??
        (review.lab_reply && (
          <ReplyBlock labName={labName} text={review.lab_reply} at={review.lab_replied_at} />
        ))}

      {footer}
    </Stack>
  );
}

/** "Reply from <lab>", indented under the review. */
export function ReplyBlock({
  labName,
  text,
  at,
}: {
  labName: string;
  text: string;
  at: string | null;
}) {
  const { t } = useTranslation('doctor');
  return (
    <Box
      sx={(theme) => ({
        mt: 0.5,
        ml: { xs: 1, sm: 2 },
        pl: 1.75,
        py: 0.25,
        borderLeft: 3,
        borderColor: surfaces[theme.palette.mode].borderSolid,
      })}
    >
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
        {t('reviews.replyFrom', { lab: labName })}
        {at && (
          <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
            {` · ${shortDate(at)}`}
          </Box>
        )}
      </Typography>
      <Typography sx={{ ...textSx, color: 'text.secondary' }}>{text}</Typography>
    </Box>
  );
}
