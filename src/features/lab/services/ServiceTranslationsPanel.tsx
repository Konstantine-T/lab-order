import { Box, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FieldLabel, StatusPill } from '@/components/design';
import { radii, surfaces } from '@/theme/tokens';
import {
  completeness,
  EDITOR_LANGS,
  readTranslation,
  serviceNameTooShort,
  translationRows,
  writeTranslation,
  type EditorLang,
  type ServiceBase,
  type TrDraft,
  type TrGroup,
  type TrRow,
} from './serviceTranslationsModel';

const GROUPS: TrGroup[] = ['service', 'questions', 'pricing'];

/** Base text · English · Russian, side by side from `md`; stacked below it. */
const COLUMNS = { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' };

/**
 * The service editor's Translations tab: every string the lab wrote that a
 * doctor reads, its own text read-only beside an English and a Russian input.
 * One pass once the service is built, rather than language tabs on every
 * builder card (owner's choice). Optional throughout: a blank input means the
 * doctor sees the lab's own text.
 *
 * Edits stay in the page's draft; the page's one Save writes them — the
 * service's through `set_lab_service_translations`, the rest inside the form
 * version it already saves.
 */
export function ServiceTranslationsPanel({
  base,
  draft,
  onChange,
}: {
  /** The service's own name / description / turnaround label, as typed now. */
  base: ServiceBase;
  draft: TrDraft;
  onChange: (next: TrDraft) => void;
}) {
  const { t } = useTranslation('lab');
  const rows = translationRows(base, draft.config, draft.pricing);
  const progress = completeness(draft, rows);
  const shortName = new Set(serviceNameTooShort(draft.service));

  const langName = (lang: EditorLang) => t(`services.translations.columns.${lang}`);

  return (
    <Stack spacing={3}>
      <Stack spacing={1.25}>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {t('services.translations.hint')}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {EDITOR_LANGS.map((lang) => {
            const { done, total } = progress[lang];
            return (
              <StatusPill key={lang} tone={total > 0 && done === total ? 'success' : 'neutral'} dot>
                {langName(lang)} · {t('services.translations.progress', { done, total })}
              </StatusPill>
            );
          })}
        </Stack>
      </Stack>

      {GROUPS.map((group) => {
        const groupRows = rows.filter((r) => r.group === group);
        if (groupRows.length === 0) return null;
        return (
          <Stack key={group} spacing={1.5} component="section">
            <Typography variant="subtitle2" component="h3">
              {t(`services.translations.groups.${group}`)}
            </Typography>
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: COLUMNS.md,
                columnGap: 2,
              }}
              aria-hidden
            >
              <FieldLabel>{t('services.translations.base')}</FieldLabel>
              {EDITOR_LANGS.map((lang) => (
                <FieldLabel key={lang}>{langName(lang)}</FieldLabel>
              ))}
            </Box>
            {groupRows.map((row) => (
              <TranslationRow
                key={row.key}
                row={row}
                draft={draft}
                onChange={onChange}
                langName={langName}
                tooShort={(lang) =>
                  row.target.kind === 'service' && row.target.field === 'name' && shortName.has(lang)
                }
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}

function TranslationRow({
  row,
  draft,
  onChange,
  langName,
  tooShort,
}: {
  row: TrRow;
  draft: TrDraft;
  onChange: (next: TrDraft) => void;
  langName: (lang: EditorLang) => string;
  tooShort: (lang: EditorLang) => boolean;
}) {
  const { t } = useTranslation('lab');
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const s = surfaces[theme.palette.mode];
  const caption = rowCaption(row, t);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        columnGap: 2,
        rowGap: 1.25,
        alignItems: 'start',
        pt: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          px: 1.5,
          py: 1,
          borderRadius: `${radii.control}px`,
          bgcolor: s.subtle,
        }}
      >
        <FieldLabel sx={{ mb: 0.25 }}>
          {caption}
          {!wide && ` · ${t('services.translations.base')}`}
        </FieldLabel>
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            lineHeight: 1.5,
            // A long price description stays readable without pushing the
            // inputs a screen away.
            maxHeight: row.multiline ? 160 : undefined,
            overflowY: row.multiline ? 'auto' : undefined,
          }}
        >
          {row.base}
        </Typography>
      </Box>
      {EDITOR_LANGS.map((lang) => {
        const error = tooShort(lang);
        return (
          <TextField
            key={lang}
            size="small"
            fullWidth
            label={wide ? undefined : langName(lang)}
            // Wide rows have no label (the column heading names the language),
            // so an empty box needs a placeholder to read as a field at all.
            placeholder={wide ? t('services.translations.placeholder', { lang: langName(lang) }) : undefined}
            value={readTranslation(draft, row.target, lang)}
            onChange={(e) => onChange(writeTranslation(draft, row.target, lang, e.target.value))}
            multiline={row.multiline}
            minRows={row.multiline ? 3 : undefined}
            error={error}
            helperText={error ? t('services.translations.nameTooShort') : undefined}
            inputProps={{ maxLength: row.max, 'aria-label': `${caption} · ${langName(lang)}` }}
            sx={{ minWidth: 0 }}
          />
        );
      })}
    </Box>
  );
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** What a row is, in words the lab already sees in the builder. */
function rowCaption(row: TrRow, t: TranslateFn): string {
  const n = row.number != null ? ` ${row.number}` : '';
  switch (row.target.kind) {
    case 'service':
      return row.target.field === 'name'
        ? t('services.fields.name')
        : row.target.field === 'short_description'
          ? t('services.fields.shortDescription')
          : t('services.fields.averageTurnaroundLabel');
    case 'field':
      return row.target.key === 'label'
        ? `${t('customForm.questionLabel')}${n}`
        : t('forms.editor.field.helperText');
    case 'option':
      return `${t('customForm.optionPlaceholder')}${n}`;
    case 'material':
      return t('forms.editor.pricing.materialName');
    case 'priceDescription':
      return t('forms.editor.pricing.priceDescription');
  }
}
