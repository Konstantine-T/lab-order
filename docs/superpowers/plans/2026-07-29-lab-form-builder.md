# Lab Form Builder ("Custom Form") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lab build an order form entirely from its own questions (any number, any input type from a fixed palette); doctors fill in the answers.

**Architecture:** Revive the reserved `OTHER_CUSTOM` platform template as a blank "Custom Form" the lab picks alongside the clinical templates. The lab authors questions in a new `CustomFormBuilder` panel that emits the existing `FormConfiguration`/`FieldConfig[]` shape; the doctor side reuses the existing `DynamicForm` renderer (plus a new `date` input) and the existing (currently-unwired) `validateFormAnswers` for required-field gating. Answers persist unchanged through `submit_order` → `order_answers`.

**Tech Stack:** React 18 + TypeScript (strict), MUI v5, `@mui/x-date-pickers` + dayjs (already installed), i18next (en/ka/ru), Supabase (Management API via `scripts/apply-sql.mjs`).

## Global Constraints

- **No test runner exists** in this repo. Each task's gate is `npm run typecheck` (must print no errors) and, when locale JSON changed, `npm run i18n:check` (must not introduce new missing-key lines beyond the pre-existing `doctor`/`lab` red). The final task is a manual end-to-end drive.
- **Build is stricter than lint:** `tsc -b` treats unused locals/params as hard errors. No unused imports.
- **Every user-facing string is an i18n key** present in **all three** locales (`en`, `ka`, `ru`). Question labels / options / help text are lab-authored free text stored in config JSON — NOT i18n keys.
- **Order forms are not react-hook-form/zod.** The custom form uses the plain `FormConfiguration` config + `DynamicForm` renderer.
- **Immutable form versions** — editing a published form publishes a new `lab_form_versions` row; never mutate historical config. (Existing behavior; no change needed.)
- **DDL is applied via** `node scripts/apply-sql.mjs <file.sql>` (Management API + token in `.env`). Idempotent SQL only.
- Currency GEL; brand token usage via MUI theme (no ad-hoc hex).

---

### Task 1: Make "Custom Form" a selectable blank template

**Files:**
- Create: `supabase/template-custom-form.sql`
- Modify: `src/features/lab/forms/TemplateGrid.tsx:24`

**Interfaces:**
- Produces: a live `platform_form_templates` row `code='OTHER_CUSTOM'`; the picker query no longer excludes `OTHER_CUSTOM`.

- [ ] **Step 1: Write the seed SQL**

Create `supabase/template-custom-form.sql`:

```sql
-- ============================================================================
-- Custom Form platform template (code OTHER_CUSTOM).
--
-- A blank, lab-built form: it has NO platform_template_fields. The lab authors
-- every question in the service builder (CustomFormBuilder), and the doctor
-- fills them in via the generic DynamicForm renderer.
--
-- Idempotent: safe to re-run.
-- ============================================================================

insert into public.platform_form_templates (code, name, description)
values (
  'OTHER_CUSTOM',
  'Custom Form',
  'Build your own form from any questions.'
)
on conflict (code) do update
   set name        = excluded.name,
       description = excluded.description;

-- Verification (Custom Form is intentionally field-less).
select code, name,
       (select count(*) from public.platform_template_fields f where f.template_id = t.id) as fields
  from public.platform_form_templates t
 where code = 'OTHER_CUSTOM';
```

- [ ] **Step 2: Apply it to the live DB**

Run: `node scripts/apply-sql.mjs supabase/template-custom-form.sql`
Expected: `HTTP 201` and a row `{"code":"OTHER_CUSTOM","name":"Custom Form","fields":"0"}`.

- [ ] **Step 3: Un-exclude `OTHER_CUSTOM` in the picker**

In `src/features/lab/forms/TemplateGrid.tsx`, the query at line 24 currently reads:

```ts
        .not('code', 'in', '(ZIRCONIA_ON_IMPLANT,TEMPORARY_ON_IMPLANT,MOCKUP_WAXUP,REMOVABLE_PROSTHESIS,OTHER_CUSTOM)')
```

Change it to (drop `OTHER_CUSTOM`):

```ts
        .not('code', 'in', '(ZIRCONIA_ON_IMPLANT,TEMPORARY_ON_IMPLANT,MOCKUP_WAXUP,REMOVABLE_PROSTHESIS)')
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/template-custom-form.sql src/features/lab/forms/TemplateGrid.tsx
git commit -m "feat(custom-form): seed OTHER_CUSTOM template and show it in the picker"
```

---

### Task 2: Add the `date` input renderer

**Files:**
- Modify: `src/components/DynamicForm.tsx` (imports near top; new `case 'date'` in `FieldRenderer`'s switch, before `default:` at line ~264)

**Interfaces:**
- Produces: `DynamicForm`/`FieldRenderer` renders `field.type === 'date'` as an MUI `DatePicker`, storing an ISO `YYYY-MM-DD` string (or `null`).

- [ ] **Step 1: Add imports**

At the top of `src/components/DynamicForm.tsx`, after the existing `import { ToothMap } from './ToothMap';` line, add:

```ts
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
```

- [ ] **Step 2: Add the `date` case**

In `FieldRenderer`, immediately before the `default:` case (currently line 264), insert:

```tsx
    case 'date':
      return (
        <DatePicker
          label={`${field.label}${field.required ? ' *' : ''}`}
          value={value ? dayjs(value as string) : null}
          onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : null)}
          readOnly={!!readOnly}
          slotProps={{
            textField: { fullWidth: true, helperText: helper, error: !!error },
          }}
        />
      );
```

(No new provider needed — `LocalizationProvider` with the dayjs adapter is already mounted in `src/main.tsx`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/DynamicForm.tsx
git commit -m "feat(custom-form): add date input renderer to DynamicForm"
```

---

### Task 3: Enforce required fields on generic/custom forms

**Files:**
- Modify: `src/features/orderForms/OrderForm.tsx` (import; the generic fallback `return`; the `isOrderFormValid` tail)

**Interfaces:**
- Consumes: `validateFormAnswers(configuration, values): Record<string,string>` — already exported from `src/components/DynamicForm.tsx` (line 279); returns `{ [fieldCode]: 'Required' }` for every `enabled && required` field whose value is `undefined`/`null`/`''`/empty-array. (`false` and `0` are treated as answered.)
- Produces: the generic `DynamicForm` render receives inline `errors`; `isOrderFormValid` returns `false` when a required custom/generic field is empty.

- [ ] **Step 1: Import the validator**

In `src/features/orderForms/OrderForm.tsx`, change the DynamicForm import (line 2) from:

```ts
import { DynamicForm } from '@/components/DynamicForm';
```

to:

```ts
import { DynamicForm, validateFormAnswers } from '@/components/DynamicForm';
```

- [ ] **Step 2: Pass errors into the generic fallback**

The generic fallback at the end of `OrderForm` (currently lines ~232-239) reads:

```tsx
  return (
    <DynamicForm
      configuration={configuration}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
```

Replace it with:

```tsx
  return (
    <DynamicForm
      configuration={configuration}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
      errors={showErrors ? validateFormAnswers(configuration, values) : undefined}
    />
  );
```

- [ ] **Step 3: Gate submit in `isOrderFormValid`**

The `isOrderFormValid` function currently ends (line ~272) with:

```ts
  return true;
}
```

Replace that final `return true;` with:

```ts
  return Object.keys(validateFormAnswers(configuration, values)).length === 0;
}
```

(Structured templates still return early from their own branches above; only the generic/`OTHER_CUSTOM` path reaches this line.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/orderForms/OrderForm.tsx
git commit -m "feat(custom-form): enforce required fields on generic/custom order forms"
```

---

### Task 4: CustomFormBuilder component + FieldsPanel dispatch + i18n

**Files:**
- Create: `src/features/lab/forms/CustomFormBuilder.tsx`
- Modify: `src/features/lab/forms/FieldsPanel.tsx` (add import; early-return dispatch inside `FieldsPanel`, before its `return (`)
- Modify: `src/locales/en/lab.json`, `src/locales/ka/lab.json`, `src/locales/ru/lab.json` (add a `customForm` block)

**Interfaces:**
- Produces: `CustomFormBuilder({ config, onChange })` renders an editable question list and emits an updated `FormConfiguration`; exports `CUSTOM_INPUT_TYPES` and `isCustomFormComplete(config): boolean` (the latter used by Task 5).
- Consumes: `FormConfiguration`, `FieldConfig` from `@/types/database`.

- [ ] **Step 1: Create the builder component**

Create `src/features/lab/forms/CustomFormBuilder.tsx`:

```tsx
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useTranslation } from 'react-i18next';
import type { FieldConfig, FormConfiguration } from '@/types/database';

/** Input types a lab can pick for a custom-form question. Each value maps 1:1
 *  to a FieldRenderer case in DynamicForm. */
export const CUSTOM_INPUT_TYPES = [
  'text',
  'textarea',
  'number',
  'checkbox',
  'select',
  'chip_multi_select',
  'date',
] as const;
export type CustomInputType = (typeof CUSTOM_INPUT_TYPES)[number];

const CHOICE_TYPES: string[] = ['select', 'chip_multi_select'];

function makeCode(): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `q_${rnd}`;
}

/** A custom form is publishable when it has ≥1 question, every question has a
 *  non-blank label, and every choice question has ≥1 non-blank option. */
export function isCustomFormComplete(config: FormConfiguration): boolean {
  if (!config.fields.length) return false;
  return config.fields.every((f) => {
    if (!f.label.trim()) return false;
    if (CHOICE_TYPES.includes(f.type)) {
      return (f.options ?? []).some((o) => o.trim().length > 0);
    }
    return true;
  });
}

export function CustomFormBuilder({
  config,
  onChange,
}: {
  config: FormConfiguration;
  onChange: (next: FormConfiguration) => void;
}) {
  const { t } = useTranslation('lab');
  const fields = config.fields;

  const update = (i: number, patch: Partial<FieldConfig>) =>
    onChange({
      ...config,
      fields: fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    });

  const remove = (i: number) =>
    onChange({ ...config, fields: fields.filter((_, idx) => idx !== i) });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...config, fields: next });
  };

  const add = () =>
    onChange({
      ...config,
      fields: [
        ...fields,
        {
          code: makeCode(),
          type: 'text',
          label: '',
          enabled: true,
          required: false,
          visible_to_doctor: true,
          options: [],
        },
      ],
    });

  return (
    <Stack spacing={2}>
      {fields.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('customForm.empty')}
        </Typography>
      )}
      {fields.map((f, i) => (
        <QuestionCard
          key={f.code}
          field={f}
          index={i}
          total={fields.length}
          onUpdate={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
          onMove={(dir) => move(i, dir)}
        />
      ))}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={add}
        sx={{ alignSelf: 'flex-start' }}
      >
        {t('customForm.addQuestion')}
      </Button>
    </Stack>
  );
}

function QuestionCard({
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FieldConfig;
  index: number;
  total: number;
  onUpdate: (patch: Partial<FieldConfig>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation('lab');
  const isChoice = CHOICE_TYPES.includes(field.type);
  const options = field.options ?? [];

  const setOption = (i: number, val: string) =>
    onUpdate({ options: options.map((o, idx) => (idx === i ? val : o)) });
  const addOption = () => onUpdate({ options: [...options, ''] });
  const removeOption = (i: number) =>
    onUpdate({ options: options.filter((_, idx) => idx !== i) });

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            label={t('customForm.questionLabel')}
            placeholder={t('customForm.questionPlaceholder')}
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            size="small"
            fullWidth
            inputProps={{ maxLength: 300 }}
          />
          <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={onRemove}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>{t('customForm.inputType')}</InputLabel>
            <Select
              label={t('customForm.inputType')}
              value={field.type}
              onChange={(e) => onUpdate({ type: e.target.value })}
            >
              {CUSTOM_INPUT_TYPES.map((it) => (
                <MenuItem key={it} value={it}>
                  {t(`customForm.inputTypes.${it}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={field.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
              />
            }
            label={t('forms.editor.field.required')}
          />
        </Stack>

        {isChoice && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('customForm.options')}
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {options.map((opt, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    size="small"
                    fullWidth
                    placeholder={t('customForm.optionPlaceholder')}
                  />
                  <IconButton size="small" color="error" onClick={() => removeOption(i)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addOption}
                sx={{ alignSelf: 'flex-start' }}
              >
                {t('customForm.addOption')}
              </Button>
            </Stack>
          </Box>
        )}

        <TextField
          label={t('customForm.helpText')}
          value={field.helper_text ?? ''}
          onChange={(e) => onUpdate({ helper_text: e.target.value })}
          size="small"
          fullWidth
        />
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Dispatch to the builder in FieldsPanel**

In `src/features/lab/forms/FieldsPanel.tsx`, add the import near the other feature imports (after the `import type { FieldConfig, FormConfiguration }` line):

```ts
import { CustomFormBuilder } from './CustomFormBuilder';
```

Then, inside the `FieldsPanel` function, immediately before its `return (` (currently line 67), add:

```tsx
  if (config._templateCode === 'OTHER_CUSTOM') {
    return <CustomFormBuilder config={config} onChange={onChange} />;
  }
```

- [ ] **Step 3: Add the `customForm` i18n block (en)**

In `src/locales/en/lab.json`, add a top-level `"customForm"` key (place it anywhere valid, e.g. right after the existing `"cnbForm"` block's closing brace):

```json
  "customForm": {
    "empty": "No questions yet. Add your first question below.",
    "addQuestion": "Add question",
    "questionLabel": "Question",
    "questionPlaceholder": "Type your question…",
    "inputType": "Answer type",
    "inputTypes": {
      "text": "Short text",
      "textarea": "Paragraph",
      "number": "Number",
      "checkbox": "Yes / No",
      "select": "Dropdown",
      "chip_multi_select": "Multiple choice",
      "date": "Date"
    },
    "options": "Options",
    "optionPlaceholder": "Option",
    "addOption": "Add option",
    "helpText": "Help text (optional)"
  },
```

- [ ] **Step 4: Add the `customForm` block (ka)**

In `src/locales/ka/lab.json`, add the same-shaped block:

```json
  "customForm": {
    "empty": "ჯერ კითხვები არ არის. დაამატე პირველი კითხვა ქვემოთ.",
    "addQuestion": "კითხვის დამატება",
    "questionLabel": "კითხვა",
    "questionPlaceholder": "ჩაწერე შენი კითხვა…",
    "inputType": "პასუხის ტიპი",
    "inputTypes": {
      "text": "მოკლე ტექსტი",
      "textarea": "აბზაცი",
      "number": "რიცხვი",
      "checkbox": "დიახ / არა",
      "select": "ჩამოსაშლელი სია",
      "chip_multi_select": "მრავალი არჩევანი",
      "date": "თარიღი"
    },
    "options": "ვარიანტები",
    "optionPlaceholder": "ვარიანტი",
    "addOption": "ვარიანტის დამატება",
    "helpText": "დამხმარე ტექსტი (არასავალდებულო)"
  },
```

- [ ] **Step 5: Add the `customForm` block (ru)**

In `src/locales/ru/lab.json`, add:

```json
  "customForm": {
    "empty": "Вопросов пока нет. Добавьте первый вопрос ниже.",
    "addQuestion": "Добавить вопрос",
    "questionLabel": "Вопрос",
    "questionPlaceholder": "Введите ваш вопрос…",
    "inputType": "Тип ответа",
    "inputTypes": {
      "text": "Короткий текст",
      "textarea": "Абзац",
      "number": "Число",
      "checkbox": "Да / Нет",
      "select": "Выпадающий список",
      "chip_multi_select": "Множественный выбор",
      "date": "Дата"
    },
    "options": "Варианты",
    "optionPlaceholder": "Вариант",
    "addOption": "Добавить вариант",
    "helpText": "Подсказка (необязательно)"
  },
```

- [ ] **Step 6: Typecheck + i18n parity**

Run: `npm run typecheck` → no errors.
Run: `node -e "['en','ka','ru'].forEach(l=>require('./src/locales/'+l+'/lab.json'))"` → no throw (valid JSON).
Run: `node scripts/check-i18n-parity.mjs 2>&1 | grep -i customForm || echo "customForm balanced"` → prints `customForm balanced`.

- [ ] **Step 7: Commit**

```bash
git add src/features/lab/forms/CustomFormBuilder.tsx src/features/lab/forms/FieldsPanel.tsx src/locales/en/lab.json src/locales/ka/lab.json src/locales/ru/lab.json
git commit -m "feat(custom-form): CustomFormBuilder panel + FieldsPanel dispatch + i18n"
```

---

### Task 5: Publish gating + template display name

**Files:**
- Modify: `src/pages/lab/LabServiceCreatePage.tsx` (import `isCustomFormComplete`; extend `canPublish`)
- Modify: `src/locales/en/common.json`, `src/locales/ka/common.json`, `src/locales/ru/common.json` (add `templates.OTHER_CUSTOM`)

**Interfaces:**
- Consumes: `isCustomFormComplete(config)` from `@/features/lab/forms/CustomFormBuilder` (Task 4).

- [ ] **Step 1: Block publishing an incomplete custom form**

In `src/pages/lab/LabServiceCreatePage.tsx`, add the import near the other `@/features/lab/forms/...` imports:

```ts
import { isCustomFormComplete } from '@/features/lab/forms/CustomFormBuilder';
```

Then change the `canPublish` derivation (currently lines ~175-176):

```ts
  const canPublish =
    canSave && isPricingComplete(pricing ?? undefined, templateRow?.code);
```

to:

```ts
  const canPublish =
    canSave &&
    isPricingComplete(pricing ?? undefined, templateRow?.code) &&
    (templateRow?.code !== 'OTHER_CUSTOM' || (!!config && isCustomFormComplete(config)));
```

- [ ] **Step 2: Add localized template name/description/help (en)**

In `src/locales/en/common.json`, inside the `"templates"` object, add an `OTHER_CUSTOM` entry (e.g. after `TITANIUM_MILLING`):

```json
    "OTHER_CUSTOM": {
      "name": "Custom Form",
      "description": "Build your own form from any questions.",
      "help": "A blank form you build yourself. Add any number of questions, pick each answer's input type (text, number, yes/no, dropdown, multiple choice, date), mark required ones, then set a fixed price."
    }
```

(Add a comma after the previous block's closing brace as needed so the JSON stays valid.)

- [ ] **Step 3: Add template i18n (ka)**

In `src/locales/ka/common.json`, inside `"templates"`, add:

```json
    "OTHER_CUSTOM": {
      "name": "მორგებული ფორმა",
      "description": "ააგე შენი ფორმა ნებისმიერი კითხვებით.",
      "help": "ცარიელი ფორმა, რომელსაც თავად აგებ. დაამატე ნებისმიერი რაოდენობის კითხვა, თითოეულ პასუხს აირჩიე ტიპი (ტექსტი, რიცხვი, დიახ/არა, ჩამოსაშლელი, მრავალი არჩევანი, თარიღი), მონიშნე სავალდებულო და დააყენე ფიქსირებული ფასი."
    }
```

- [ ] **Step 4: Add template i18n (ru)**

In `src/locales/ru/common.json`, inside `"templates"`, add:

```json
    "OTHER_CUSTOM": {
      "name": "Своя форма",
      "description": "Соберите свою форму из любых вопросов.",
      "help": "Пустая форма, которую вы собираете сами. Добавьте любое число вопросов, выберите тип ответа (текст, число, да/нет, список, множественный выбор, дата), отметьте обязательные и задайте фиксированную цену."
    }
```

- [ ] **Step 5: Typecheck + JSON + parity**

Run: `npm run typecheck` → no errors.
Run: `node -e "['en','ka','ru'].forEach(l=>require('./src/locales/'+l+'/common.json'))"` → no throw.
Run: `node scripts/check-i18n-parity.mjs 2>&1 | grep -i OTHER_CUSTOM || echo "OTHER_CUSTOM balanced"` → prints `OTHER_CUSTOM balanced`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/lab/LabServiceCreatePage.tsx src/locales/en/common.json src/locales/ka/common.json src/locales/ru/common.json
git commit -m "feat(custom-form): block publish until custom form is complete; localize template name"
```

---

### Task 6: End-to-end verification

**Files:** none (manual drive).

- [ ] **Step 1: Start the app**

Run `npm run dev` in a persistent terminal; open `http://localhost:5173`, log in as a lab (`LAB_MAIN_ADMIN`).

- [ ] **Step 2: Build a custom form**

Lab → Services → Create → pick **Custom Form**. In the Fields tab, add one question of **each** input type (short text, paragraph, number, yes/no, dropdown [add 2 options], multiple choice [add 2 options], date). Mark at least one **required**. Set a **fixed price** in the Pricing tab. Confirm **Publish** is disabled until every question has a label, choice questions have options, and a price is set. Publish.

- [ ] **Step 3: Order it as a doctor**

Log in as a doctor, open that lab's service, and confirm every question renders with the right input. Try to submit with the required field empty → submit is blocked / shows the error. Fill it, submit.

- [ ] **Step 4: Confirm the answers persist**

Open the order as the lab (order sheet) and as the doctor (order detail); confirm all custom answers render read-only.

- [ ] **Step 5: Final gates**

Run: `npm run typecheck` → no errors.
Run: `npm run i18n:check` → no NEW red beyond the pre-existing `doctor`/`lab` gaps.

- [ ] **Step 6: Commit (if any doc/tidy changes)** — otherwise nothing to commit; the feature is complete.

---

## Self-Review

**Spec coverage:**
- Blank "Custom Form" template alongside clinical templates (spec §2, §4.1) → Task 1.
- Any number of questions, add/edit/reorder/delete (§4.2) → Task 4 (`CustomFormBuilder`).
- Input palette: short text, paragraph, number, yes/no, dropdown, multiple choice, date (§2) → Task 2 (date renderer) + Task 4 (`CUSTOM_INPUT_TYPES` → existing renderers).
- Options list for choice types, required toggle, help text (§4.2) → Task 4 (`QuestionCard`).
- Doctor renders via `DynamicForm`; required enforced at submit (§4.3) → Task 3.
- Fixed price (§4.4) → no code (PricingPanel already renders it); publish gated in Task 5.
- Read-only views (§4.5) → reuse `DynamicForm` readOnly; no code (covered by Task 3's dispatch path).
- Storage unchanged, no schema change (§4, §5) → confirmed; no task needed.
- i18n en/ka/ru (§4.6) → Task 4 (`customForm.*`) + Task 5 (`templates.OTHER_CUSTOM`).
- Edge cases: empty options / blank label publish-block (§6) → Task 5 (`isCustomFormComplete`); `false`/`0` valid (§6) → Task 3 (reuses `validateFormAnswers`, which only treats `''`/null/undefined/empty-array as empty).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `CustomFormBuilder({config,onChange})`, `isCustomFormComplete(config)`, `CUSTOM_INPUT_TYPES`, and `validateFormAnswers(configuration, values)` are used with the same names/signatures across Tasks 3–5. Field-type string values (`text`/`textarea`/`number`/`checkbox`/`select`/`chip_multi_select`/`date`) match `FieldRenderer`'s `case` labels. ✓

**Known follow-ups (out of v1 scope, noted for later):** the service **edit** page (`LabServiceEditPage`) publish path is not gated by `isCustomFormComplete` here (create-only); per-question conditional logic and drag-reorder are deferred.
