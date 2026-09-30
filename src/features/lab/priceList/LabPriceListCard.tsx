import { useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { FileChip, Icon, SectionCard } from '@/components/design';
import { LANGUAGES } from '@/i18n';
import { LAB_TEXT_LANGS } from '@/features/lab/labText';
import type { LabPriceLists, LabTextLang } from '@/types/database';
import {
  PRICE_LIST_ACCEPT,
  PriceListError,
  fetchPriceLists,
  priceListUrl,
  removePriceList,
  uploadPriceList,
} from './priceListApi';

const langLabel = (lang: LabTextLang) => LANGUAGES.find((l) => l.code === lang)?.label ?? lang;

/**
 * The lab's price lists: one optional file per language, uploaded and removed
 * on the spot rather than on the profile's Save — like the service cover
 * image, the row can only point at a file that is already stored.
 *
 * Available in every approval state: a price list is operational content, not
 * identity, so an approved lab manages it without a new review (0038).
 *
 * Reads its own query instead of `user.lab`: refreshing the AuthProvider user
 * re-mounts the whole page, which would throw away whatever the lab was
 * typing in the profile form around this card.
 */
export function LabPriceListCard({ labId }: { labId: string }) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const target = useRef<LabTextLang | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listsKey = ['lab-price-lists', labId];
  const { data: lists = {}, isLoading, isError } = useQuery({
    queryKey: listsKey,
    queryFn: () => fetchPriceLists(labId),
  });

  const onSaved = (next: LabPriceLists) => {
    setError(null);
    queryClient.setQueryData(listsKey, next);
    // Every doctor-facing surface that shows the button reads the same column.
    void queryClient.invalidateQueries({ queryKey: ['marketplace-labs'] });
    void queryClient.invalidateQueries({ queryKey: ['public-lab', labId] });
  };
  const onFailed = (e: unknown) => {
    const kind = e instanceof PriceListError ? e.kind : 'generic';
    setError(t(`profile.priceLists.errors.${kind}`));
  };

  const upload = useMutation({
    mutationFn: ({ lang, file }: { lang: LabTextLang; file: File }) =>
      uploadPriceList(labId, lang, file),
    onSuccess: onSaved,
    onError: onFailed,
  });
  const remove = useMutation({
    mutationFn: ({ lang }: { lang: LabTextLang }) => removePriceList(labId, lang),
    onSuccess: onSaved,
    onError: onFailed,
  });

  const busyLang = upload.isPending
    ? upload.variables?.lang
    : remove.isPending
      ? remove.variables?.lang
      : undefined;
  const busy = busyLang !== undefined;

  const pick = (lang: LabTextLang) => {
    target.current = lang;
    inputRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    const lang = target.current;
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !lang) return;
    setError(null);
    upload.mutate({ lang, file });
  };

  return (
    <SectionCard icon="receipt_long" title={t('profile.sections.priceLists')}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {t('profile.priceLists.hint')}
        </Typography>

        <input
          ref={inputRef}
          type="file"
          accept={PRICE_LIST_ACCEPT}
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        ) : isError ? (
          <Alert severity="error">{tc('errors.loadFailed')}</Alert>
        ) : (
          <Stack spacing={1.5}>
            {LAB_TEXT_LANGS.map((lang) => {
              const entry = lists[lang];
              const label = langLabel(lang);
              const isPdf = entry?.path.endsWith('.pdf');
              return (
                <Stack
                  key={lang}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 1, sm: 2 }}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                >
                  <Typography
                    sx={{ width: { sm: 96 }, flexShrink: 0, fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    {label}
                  </Typography>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {entry ? (
                      <FileChip
                        icon={isPdf ? 'description' : 'image'}
                        name={entry.name}
                        size={t('profile.priceLists.uploadedOn', {
                          date: dayjs(entry.uploaded_at).format('D MMM YYYY'),
                        })}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('profile.priceLists.none')}
                      </Typography>
                    )}
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}
                  >
                    {busyLang === lang ? (
                      <CircularProgress size={20} sx={{ mx: 1 }} />
                    ) : entry ? (
                      <>
                        <Button
                          size="small"
                          component="a"
                          href={priceListUrl(entry)}
                          target="_blank"
                          rel="noopener noreferrer"
                          startIcon={<Icon name="open_in_new" size={15} />}
                          aria-label={`${t('profile.priceLists.open')} — ${label}`}
                        >
                          {t('profile.priceLists.open')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Icon name="upload" size={15} />}
                          onClick={() => pick(lang)}
                          disabled={busy}
                          aria-label={`${t('profile.priceLists.replace')} — ${label}`}
                        >
                          {t('profile.priceLists.replace')}
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => remove.mutate({ lang })}
                          disabled={busy}
                          aria-label={`${t('profile.priceLists.remove')} — ${label}`}
                        >
                          {t('profile.priceLists.remove')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Icon name="upload" size={15} />}
                        onClick={() => pick(lang)}
                        disabled={busy}
                        aria-label={`${t('profile.priceLists.upload')} — ${label}`}
                      >
                        {t('profile.priceLists.upload')}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </SectionCard>
  );
}
