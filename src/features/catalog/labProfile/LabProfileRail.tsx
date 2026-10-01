import type { ReactNode } from 'react';
import { Box, Button, Link, Stack, Typography, type Theme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { whatsappUrl } from '@/features/labs/whatsapp';
import { brand, palette2026, surfaces } from '@/theme/tokens';
import { mapsUrl, panelSx, telHref } from './format';
import type { ProfileLab } from './useLabProfile';

const linkSx = {
  fontWeight: 600,
  color: (theme: Theme) =>
    theme.palette.mode === 'light' ? palette2026.periText : brand.soft,
} as const;

/**
 * "Order from this lab": every order starts from one of the lab's services,
 * so the button takes the doctor to the list rather than to a blank form.
 */
export function LabOrderCard({
  onChooseService,
  disabled,
}: {
  onChooseService: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('doctor');
  return (
    <Stack spacing={1.5} sx={[panelSx, { p: 2.75 }]}>
      <Typography component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
        {t('labProfile.orderCard.title')}
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.55 }}>
        {t('labProfile.orderCard.body')}
      </Typography>
      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={disabled}
        onClick={onChooseService}
        startIcon={<Icon name="add" size={19} />}
      >
        {t('labProfile.orderCard.cta')}
      </Button>
    </Stack>
  );
}

function ContactRow({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="flex-start"
      sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5, minWidth: 0 }}
    >
      <Icon name={icon} size={16} sx={{ color: (theme) => surfaces[theme.palette.mode].textMuted, mt: '1px', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Stack>
  );
}

/**
 * Phone (a `tel:` link, plus WhatsApp when the number makes one), email, and
 * the working address with a Google Maps search for it. Renders nothing when
 * the lab has published none of them.
 */
export function LabContactCard({ lab }: { lab: ProfileLab }) {
  const { t } = useTranslation('doctor');
  const phone = lab.contact_phone?.trim() || null;
  const email = lab.contact_email?.trim() || null;
  const address = lab.working_address?.trim() || null;
  const city = lab.city?.trim() || null;
  const tel = phone ? telHref(phone) : null;
  const wa = phone ? whatsappUrl(phone) : null;
  const map = mapsUrl(address, city);
  const place = [address, city].filter(Boolean).join(', ');

  if (!phone && !email && !place) return null;

  return (
    <Stack spacing={1.25} sx={[panelSx, { px: 2.75, py: 2.5 }]}>
      <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.35 }}>
        {t('labProfile.contact.title')}
      </Typography>

      {phone && (
        <ContactRow icon="call">
          {tel ? (
            <Link href={tel} color="inherit" underline="hover">
              {phone}
            </Link>
          ) : (
            phone
          )}
          {wa && (
            <>
              {' · '}
              {/* How these labs are actually reached: the chat, not the dial. */}
              <Link
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                aria-label={t('labProfile.contact.whatsappA11y')}
                sx={linkSx}
              >
                WhatsApp
              </Link>
            </>
          )}
        </ContactRow>
      )}

      {email && (
        <ContactRow icon="mail">
          <Link href={`mailto:${email}`} color="inherit" underline="hover">
            {email}
          </Link>
        </ContactRow>
      )}

      {place && (
        <ContactRow icon="location_on">
          {place}
          {map && (
            <>
              {' · '}
              <Link
                href={map}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                aria-label={t('labProfile.contact.mapA11y')}
                sx={linkSx}
              >
                {t('labProfile.contact.map')}
              </Link>
            </>
          )}
        </ContactRow>
      )}
    </Stack>
  );
}
