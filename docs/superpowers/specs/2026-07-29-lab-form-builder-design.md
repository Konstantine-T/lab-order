# Lab Form Builder ("Custom Form") — Design

> Status: **DESIGN — approved, awaiting spec review** (2026-07-29)
> Origin: owner request — *"a form builder that lets the lab ask any questions it wants, in any quantity; the doctor's answers are just inputs the doctor fills in."*

## 1. Goal

Give a **lab** the ability to build an order form **entirely from its own questions** when it creates a service — instead of only picking one of the six hand-coded clinical templates. Each question is authored by the lab (free-text label + a chosen input type); the **doctor** fills in the answers. Any number of questions, any of the supported input types.

This makes the app's existing-but-partial "custom question" mechanism a first-class, standalone builder, and closes the known validation gap on generic forms.

## 2. Scope

**In scope (v1)**
- A new **"Custom Form"** template the lab picks in the service builder, **alongside** the existing clinical templates (Crown & Bridge, Surgical Guide, …). It starts as a **blank canvas**.
- A builder UI where the lab adds/edits/reorders **any number** of questions.
- Input-type palette (per question): **short text · paragraph · number · yes/no · dropdown (single choice) · multiple choice · date**.
- Choice inputs (dropdown / multiple choice) carry a **lab-defined options list**.
- Per-question settings: **required** toggle, optional **help text**.
- Doctor-side rendering + **required-field validation enforced at submit** (fixes the current generic-form gap).
- **Fixed price** per service (lab sets one amount).

**Out of scope (v1, future)**
- Clinical building blocks: interactive tooth map, per-tooth **material pricing**, implant connection tree, conditional "mm" inputs. These stay bespoke in the six clinical templates.
- File-upload input (blocked on the deferred upload feature).
- Rewriting the existing clinical templates in terms of the builder.
- Per-question conditional logic (show/hide based on another answer).

## 3. Reused vs. new

| Concern | Reuse | New |
|---|---|---|
| Template identity | revive reserved `OTHER_CUSTOM` code (display name "Custom Form") | seed its `platform_form_templates` row (no seed fields — blank) |
| Config shape | `FormConfiguration` / `FieldConfig` (`src/types/database.ts`) — already has `code`, `type`, `label`, `enabled`, `required`, `helper_text`, `options`, `visible_to_doctor` | — |
| Doctor renderer | `DynamicForm` / `FieldRenderer` (`src/components/DynamicForm.tsx`) — already renders `text`, `textarea`, `number`, `select`, `chip_multi_select`, `checkbox` | add a `date` case (MUI date picker; dayjs already in app) |
| Answers storage | flat `{questionCode: value}` → `order_answers` via `submit_order`'s `jsonb_each` | **no DB schema change** |
| Pricing | `FIXED_PRICE` path in `calculatePrice` / `isPricingComplete` | — |
| Picker | `TemplateGrid` | remove `OTHER_CUSTOM` from its exclusion list |
| Builder UI | `FieldsPanel` add-custom-question pattern (`cq_<ts>` codes) | a richer builder panel for the Custom Form (type select, options editor, required, help, reorder) |

## 4. Design detail

### 4.1 Template
- Seed `platform_form_templates (code='OTHER_CUSTOM', name='Custom Form', description='Build your own form from any questions.')` via an idempotent `supabase/template-custom-form.sql`, applied with `scripts/apply-sql.mjs`. No `platform_template_fields` (blank canvas).
- Remove `OTHER_CUSTOM` from the `TemplateGrid` `.not('code','in', …)` exclusion list.
- `buildDefaultConfig`: for `OTHER_CUSTOM`, return `{ configuration: { fields: [], _templateCode: 'OTHER_CUSTOM' }, pricing: { model: 'FIXED_PRICE', rush: { type: 'NONE' } } }`.

### 4.2 Builder (lab side)
- In the service builder, when the picked template is `OTHER_CUSTOM`, the **Fields** tab shows the **Custom Form builder** instead of the structured toggles: a list of question cards + an **"Add question"** button.
- Each question card edits one `FieldConfig`:
  - **Question text** → `label` (required; a form can't be published with a blank question label).
  - **Input type** → maps to `type`: short text→`text`, paragraph→`textarea`, number→`number`, yes/no→`checkbox`, dropdown→`select`, multiple choice→`chip_multi_select`, date→`date`.
  - **Options editor** → `options: string[]`, shown only for `select` / `chip_multi_select`.
  - **Required** → `required`.
  - **Help text** → `helper_text`.
  - Delete + **reorder** (up/down or drag); array order is the render order.
  - `code` is a stable generated id (`q_<n>` / uuid); `enabled: true`, `visible_to_doctor: true`.
- **Preview** tab already renders `OrderForm` → works once the dispatcher routes `OTHER_CUSTOM` to `DynamicForm`.

### 4.3 Doctor side + validation
- `OrderForm` dispatcher: `OTHER_CUSTOM` (and the generic fallback) render `DynamicForm`, now **passing `showErrors` and computed `errors`** (today the fallback passes neither).
- New `validateGenericForm(configuration, values): Record<string,string>` — for each `enabled && visible_to_doctor && required` field with an empty value, produce a "required" message keyed by field `code`.
- `isOrderFormValid`: replace the unconditional `return true` tail with `Object.keys(validateGenericForm(configuration, values)).length === 0`, so required custom questions gate submit (also improves every other generic form).
- Empty-value rule per type: `''`/`undefined`/`null` empty; empty array empty for multi-select; `false` is a **valid** answer for yes/no (don't treat as empty).

### 4.4 Pricing
- `PricingPanel` for `OTHER_CUSTOM`: show the single **fixed price** input (the existing `FIXED_PRICE` branch). `isPricingComplete` already requires `fixed_price > 0` to publish.

### 4.5 Read-only
- Order detail, order edit, and the lab order sheet reuse `OrderForm`/`DynamicForm` in `readOnly` mode — custom answers render automatically with no extra work.

### 4.6 i18n
- Builder chrome + input-type labels: new keys in `lab.json` (`customForm.*`) across **en/ka/ru**, gated by `npm run i18n:check`.
- **Question labels, options, and help text are lab-authored free text** stored in the form config JSON — not i18n keys. (A lab writes them in its own language.)

## 5. Data flow (end to end)

1. Lab creates a service → picks **Custom Form** → builder produces a `FormConfiguration` of `FieldConfig[]` → saved as an immutable `lab_form_versions.configuration_json` (same path as every template).
2. Doctor opens the service → `OrderForm` routes `OTHER_CUSTOM` → `DynamicForm` renders each question as its input.
3. Submit → `isOrderFormValid` runs `validateGenericForm` (required gate) → `submit_order` stores the flat answers into `order_answers`.
4. Lab/doctor/clinic read the order → `DynamicForm` read-only shows the answers.

## 6. Risks & edge cases
- **Answer-key collisions** — generated `code`s must be unique and stable across edits (never reuse a code for a different question); editing a published form creates a new immutable version (existing behavior), so historical answers keep their meaning.
- **Type change on an existing question** — changing a question's input type after answers exist could orphan values; acceptable because edits create a new form version and don't retro-alter submitted orders.
- **Empty options** — a `select`/`chip_multi_select` with zero options is a publish-blocker (validate in the builder).
- **`false`/`0` are valid answers** — required-check must not treat them as empty.

## 7. Verification
- `npm run typecheck`, `npm run i18n:check` (no new red).
- Manual: build a Custom Form with one of each input type → publish → place an order as a doctor → required fields block submit when empty → submit → answers appear on the order for lab/doctor.
- RLS/storage unchanged (reuses `submit_order` + `order_answers`).

## 8. Open questions
- Template code: reuse reserved **`OTHER_CUSTOM`** (recommended) vs. a fresh `CUSTOM_FORM` code. Design assumes `OTHER_CUSTOM`.
- Reorder UX: simple up/down buttons (lower effort) vs. drag-and-drop. Design assumes up/down for v1.
