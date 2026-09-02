# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build  (type errors fail the build)
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint .
npm run i18n:check   # locale key parity across en/ka/ru
npm run icons:fetch  # rebuild the Material Symbols woff2 subset from scripts/icon-names.txt
```

There is **no test framework and no CI**. Verification = `typecheck` + `lint` + `i18n:check` + clicking through the app.

Known baseline (don't "fix" these unless asked, don't report them as regressions):

- `i18n:check` is **red**. Most entries are false positives — the flat comparator can't model Russian CLDR plurals (`_few`/`_many`). The real gaps are `doctor: orderCreate.review.formAnswers` (ru) and `lab: orderSheet.moveTo` (ka/ru).
- `lint` reports 0 errors, ~40 warnings.
- **The build is stricter than lint**: `noUnusedLocals`/`noUnusedParameters` are hard `tsc` errors but only ESLint warnings, so lint-clean code can still fail `npm run build`.

## Architecture

React 18 + TS + Vite + MUI v5 SPA, deployed static on Vercel. **There is no server layer** — the browser talks to Supabase (Postgres/Auth/Storage) directly under the anon key via the singleton in [src/lib/supabase.ts](src/lib/supabase.ts). The single exception is one Edge Function, [create-order-chat](supabase/functions/create-order-chat/index.ts) (Telegram userbot).

**Therefore: RLS policies + `SECURITY DEFINER` RPCs are the only authorization boundary.** `RoleGuard`, disabled buttons and client-side state machines are UX, not security. Any new privileged operation belongs in an RPC, not in a client `.update()`.

Domain: a multi-tenant B2B marketplace for dental lab orders. Doctors (or a clinic acting for its doctors) pick a lab service, fill a lab-defined clinical form, and submit; labs configure services/forms/pricing and run the order queue; platform admins approve labs. Trilingual en/ka/ru, light/dark, GEL currency.

**Four roles, four route subtrees** ([src/routes.tsx](src/routes.tsx), all eager imports, no code-splitting). Each is `ProtectedRoute` → `RoleGuard` → `*Layout` (which wraps the shared `AppShell`):

| Role | Area | Pages |
|---|---|---|
| `DOCTOR` | `/doctor` | [src/pages/doctor/](src/pages/doctor/) |
| `LAB_MAIN_ADMIN` | `/lab` | [src/pages/lab/](src/pages/lab/) |
| `PLATFORM_ADMIN` | `/admin` | [src/pages/admin/](src/pages/admin/) |
| `CLINIC_ADMIN` | `/clinic` | [src/pages/clinic/](src/pages/clinic/) — reuses the doctor's `MarketplacePage` / `LabPublicProfilePage` / `OrderEditPage` via a `basePath` prop |

Provider tree ([src/main.tsx](src/main.tsx)): `ColorModeProvider` → `LocalizationProvider` → `QueryClientProvider` → `BrowserRouter` → `AuthProvider`. `AuthProvider` loads `public.users` plus the role's side row (`doctor_profiles` / `labs` / `clinics`) into one `AppUser`.

**Order lifecycle:** marketplace → `OrderCreateWizard` (autosaves to `order_drafts`, dedups the patient via `find_matching_patient`) → `submit_order` RPC (writes `orders` + `order_answers` + snapshots) → the lab drives status on `LabOrderSheetPage` as far as `SENT_TO_CLINIC` → the **doctor** closes the case (`complete_order` / `reopen_order`). Doctor edits after submit go through `edit_order` and surface to the lab as `has_unreviewed_edits`.

`orders` is the hub and carries denormalized `*_snapshot` JSONB (lab, service, work location, invoice recipient, doctor) captured at submit time. **Read historical data from the snapshot, not the live join.** `lab_form_versions` is immutable — change a form by publishing a new version (`publish_lab_form`), never `UPDATE`.

RPCs the client calls: `submit_order`, `clinic_submit_order`, `edit_order`, `complete_order`, `reopen_order`, `find_matching_patient`, `publish_lab_form`, `get_order_chat`, `get_order_staff`, `clinic_doctors`, `my_clinic_invites`, `respond_clinic_invite`, `clinic_remove_doctor`, `clinic_payables_list`, `clinic_payables_by_doctor`, `lab_receivables_list`, `record_payment`, `lab_finance_lock_state`, `set_lab_finance_passcode`, `verify_lab_finance_passcode`, `reset_lab_finance_passcode`, `admin_feedback_list`.

## Conventions

**Order forms are not RHF/zod.** [src/features/orderForms/](src/features/orderForms/) hand-builds one component per clinical template; `OrderForm.tsx` dispatches on `configuration._templateCode`, falling back to the generic [DynamicForm](src/components/DynamicForm.tsx). Each template ships a triad in its `*Types.ts`: `emptyXAnswers`, `coerceXAnswers(unknown)` (defensive hydration of stored answers), `validateX() → Record<field, message>`. Adding a template = new `xTypes.ts` + `XForm.tsx` + a case in **both** `OrderFormBody` and `isOrderFormValid` in `OrderForm.tsx` + seeding `_templateCode` in [buildDefaultConfig.ts](src/features/lab/forms/buildDefaultConfig.ts) + a `platform_form_templates` seed SQL. Answers live in one flat `Record<string, unknown>` shared with appended `custom_question` fields, so keep structured keys distinctive.

**Every other form** (auth, doctor/lab profile, service basics, work locations) uses react-hook-form + zod + `RHFTextField`, which requires a `FormProvider` ancestor. Zod messages are translated through [src/lib/zod-i18n.ts](src/lib/zod-i18n.ts) (`errors` namespace).

**Teeth** are always stored in Universal numbering (1–32). Convert to FDI only for display ([ToothMap.tsx](src/components/ToothMap.tsx)).

**i18n**: every user-visible string is a key. 8 namespaces (`common` is the default, plus `auth`, `doctor`, `lab`, `clinic`, `admin`, `landing`, `errors`) × 3 locales, all statically bundled in [src/i18n/index.ts](src/i18n/index.ts). A key must exist in **all three** locales.

**Design system**: import shared UI from [@/components/design](src/components/design/index.ts) (`PageHeader`, `SectionCard`, `StatCard`, `StatusPill`, `DataTable`, `EmptyState`, …). Icons go through `<Icon name="receipt_long" />` — Material Symbols Rounded, self-hosted as a ~55 KB subset; **add the ligature name to [scripts/icon-names.txt](scripts/icon-names.txt) and run `npm run icons:fetch`**, or the glyph renders as literal text. Don't import `@mui/icons-material` in app code. Colors, radii, spacing and layout constants come from [src/theme/tokens.ts](src/theme/tokens.ts) — no ad-hoc hex.

**React Query**: one shared client (staleTime 30s, no refetch-on-focus, retry 1). Array keys scoped by id (`['lab-order', orderId]`); `supabase.from()` / `.rpc()` called directly in `queryFn` / `mutationFn`; invalidate in `onSuccess` — including the *other* role's keys (a doctor edit must invalidate `lab-*` so the lab dashboard refreshes).

**Pricing** ([src/utils/pricing.ts](src/utils/pricing.ts)) branches by duck-typing the config and answers (`pricingShape()`), so renaming an answer key can silently re-route the math. `calculatePrice` returns `kind: 'CALCULATED' | 'DESCRIBED'` — check `kind` before rendering a number, or a `LAB_DESCRIBED` service will show a confident 0.00.

**Order statuses**: `LAB_SELECTABLE_STATUSES` and `COMPLETABLE_STATUSES` in [src/types/database.ts](src/types/database.ts) are the source of truth (the lab deliberately cannot set `COMPLETED`); [src/features/orders/pipeline.ts](src/features/orders/pipeline.ts) maps the 10 statuses onto the 6 displayed pipeline stages.

**Files**: the `order-files` bucket, path `<lab_id>/<order_id>/<file>` ([orderFilesApi.ts](src/features/orders/orderFiles/orderFilesApi.ts)); service cover images have their own bucket. Never surface a raw Supabase storage error — they are English-only and mention RLS at the user; map to an `OrderFileErrorKind` and translate.

Commit messages follow `type(scope): lowercase summary` (`feat(lab):`, `fix(orders):`, `chore(db):`).

## Database changes

DDL is applied **by hand** — the Supabase dashboard SQL Editor, or `node scripts/apply-sql.mjs <file.sql>` (needs `SUPABASE_ACCESS_TOKEN` in `.env`; the project ref is hardcoded). There is no Supabase CLI dependency, no `config.toml` and no migration runner, so:

- **Write every migration idempotently** (`create or replace`, `if not exists`) — files get replayed.
- The real history is `supabase/migrations/*.sql` (**0007 is absent by design**) *plus* the loose top-level `supabase/*.sql` files; `all-in-one.sql` and `phase4-6.sql` re-bundle earlier migrations. The `SETUP*.md` docs do **not** capture the full apply order.
- **Several functions are redefined in multiple files** and the last one applied wins: `handle_new_user` (0003, 0011), `submit_order` / `_submit_order_impl` (0008, 0010, 0014, 0020), `edit_order` (0009, 0014, 0020), `find_matching_patient` (0008, 0020, 0023). Edit the runtime winner and keep the others in sync. In particular `handle_new_user` carries a **signup-role allow-list guard** (only `DOCTOR` / `LAB_MAIN_ADMIN` / `CLINIC_ADMIN` may self-register; `PLATFORM_ADMIN` is granted out-of-band only) that closed a privilege-escalation hole — it must survive every redefinition.
- [src/types/database.ts](src/types/database.ts) is hand-written, never generated; update it alongside schema changes (it has drifted before).

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — deep 9-section brief. Accurate on the core, but written 2026-07-23: it predates clinic finances, lab staff + Telegram chats, order file uploads, the finance passcode lock, nav alert badges and the `components/design` system, and parts of its §8 gotcha list have since been fixed.
- [docs/SPEC-lab-staff-telegram.md](docs/SPEC-lab-staff-telegram.md) (includes the userbot runbook for `scripts/tg-login.mjs`), [docs/SPEC-clinic-doctors.md](docs/SPEC-clinic-doctors.md), [docs/database.md](docs/database.md), [docs/frontend.md](docs/frontend.md), [docs/phases.md](docs/phases.md).
- [SESSION-HANDOFF.md](SESSION-HANDOFF.md) is a stale July snapshot — its "uncommitted work" section has long since been committed.
