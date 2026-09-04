import type { ReactNode } from 'react';
import { Link, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * "Can't upload a file? Email it to <lab>."
 *
 * Rendered under every doctor-facing dropzone so the escape hatch sits where
 * the problem happens. The lab's address has always existed on its public
 * profile, which is several clicks away from the moment a 300 MB scan refuses
 * to go up.
 *
 * Deliberately a quiet caption rather than a Callout: it is a standing fact,
 * not a warning, and a tinted panel on every file section would read as
 * "something is wrong" on every order.
 *
 * Not rendered on the lab's own order sheet — showing a lab its own address is
 * noise.
 */
export function LabContactLine({
  email,
  orderCode,
}: {
  email: string | null | undefined;
  /**
   * Prefills the mail subject so an emailed file can be matched to an order
   * without the lab having to ask. Absent in the create wizard: the order does
   * not exist yet, so the copy asks for the patient's name instead.
   */
  orderCode?: string;
}) {
  const { t } = useTranslation('common');
  // `labs.contact_email` is nullable. A labelled empty value is worse than
  // nothing, so there is no empty state here at all.
  if (!email) return null;

  const href = orderCode
    ? `mailto:${email}?subject=${encodeURIComponent(
        t('orderFiles.labContactSubject', { code: orderCode }),
      )}`
    : `mailto:${email}`;

  const link = (
    <Link href={href} sx={{ wordBreak: 'break-all' }}>
      {email}
    </Link>
  );

  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', mt: 1.25, lineHeight: 1.5 }}
    >
      {orderCode ? (
        <Sentence
          i18nKey="orderFiles.labContactWithCode"
          values={{ code: orderCode }}
          link={link}
        />
      ) : (
        <Sentence i18nKey="orderFiles.labContactNoCode" link={link} />
      )}
    </Typography>
  );
}

/**
 * Stands in for the address while the sentence is translated, then gets
 * swapped for the link. A character no copy will ever contain, so the split
 * cannot land in the middle of a real word.
 */
const EMAIL_SLOT = '\u0000';

/**
 * Renders a translated sentence with the address as a link inside it.
 *
 * Not react-i18next's own `<Trans>`: that wants the markup baked into every
 * locale string. Interpolating a sentinel and splitting on it keeps the locale
 * files plain text and lets each language put the address where its own word
 * order wants it.
 */
function Sentence({
  i18nKey,
  values,
  link,
}: {
  i18nKey: string;
  values?: Record<string, unknown>;
  link: ReactNode;
}) {
  const { t } = useTranslation('common');
  const [before, after = ''] = t(i18nKey, { ...values, email: EMAIL_SLOT }).split(EMAIL_SLOT);
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}
