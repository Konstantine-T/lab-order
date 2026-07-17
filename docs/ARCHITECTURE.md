# lab-order — Architecture Onboarding Brief

## 1. What this app is

**lab-order** is a multi-tenant B2B marketplace for dental lab-order intake and billing. Doctors browse approved dental laboratories, pick a service, fill out a lab-defined clinical order form (crown & bridge, surgical guide, implant constructions, etc.), and submit an order; labs configure their service catalog + dynamic forms + pricing, then manage the incoming order queue through a status lifecycle and review doctor edits; platform admins onboard/approve labs. It is a single-page React app talking directly to Supabase (Postgres + Auth + Storage) with all privileged writes funneled through SECURITY DEFINER RPCs and access enforced by Row-Level Security. Trilingual (en/ka/ru), light/dark themed, GEL currency.

## 2. Tech stack & how it's wired

| Layer | Choice |
|---|---|
| Build/host | Vite + `@vitejs/plugin-react`, TypeScript strict, deployed as static SPA on Vercel (`vercel.json` rewrites all paths → `/index.html`) |
| UI | React 18 + MUI v5 (`@mui/material`, `@mui/x-date-pickers`, `@mui/x-data-grid`) |
| Server state | TanStack React Query (single shared client in `src/lib/queryClient.ts`) |
| Backend | Supabase — Postgres, Auth, Storage, RLS; reached via `@supabase/supabase-js` singleton in `src/lib/supabase.ts` |
| Forms | react-hook-form + zod (auth/profile/service-config only) — **not** the order forms |
| i18n | react-i18next + i18next-browser-languagedetector, 7 namespaces × 3 langs, zod errors bridged via `src/lib/zod-i18n.ts` |
| Dates | dayjs (locale-synced to i18n) |

Only two runtime env vars exist, both `VITE_`-prefixed and client-exposed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.example`). There is **no server/API layer** — the browser calls Postgres directly under the anon key; correctness and authorization depend entirely on RLS + RPCs. No test framework, no CI (`.github/` absent) despite docs referencing Vitest/Playwright.

**Path alias:** `@/*` → `src/*` (mirrored in `tsconfig.app.json` and `vite.config.ts`).

## 3. Architecture at a glance

**Four roles** (`src/types/database.ts` `UserRole`), each mapped 1:1 to a route area:

| Role | Area | Layout |
|---|---|---|
| `DOCTOR` | `/doctor` | `DoctorLayout` |
| `LAB_MAIN_ADMIN` | `/lab` | `LabLayout` |
| `PLATFORM_ADMIN` | `/admin` | `AdminLayout` |
| `CLINIC_ADMIN` | `/clinic` | `ClinicLayout` (stub) |

**Provider tree** (composed once in `src/main.tsx`, outermost → innermost):
`StrictMode` → `ColorModeProvider` (MUI theme + CssBaseline) → `LocalizationProvider` (dayjs) → `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `App`. `App.tsx` just renders `<AppRoutes/>`. Side-effect imports `./i18n` and `./lib/zod-i18n` run before render.

**Routing** (`src/routes.tsx`, all imports eager — no code-splitting): public auth pages (unguarded) + four role subtrees, each wrapped identically as `<ProtectedRoute>` (session check) → `<RoleGuard allow={[oneRole]}>` (role check) → `<Layout/>`. Layouts wrap the shared `AppShell` (fixed AppBar + Drawer + `<Outlet/>`) with a per-area `NavEntry[]` built from i18n. Index route `/` is `RoleAwareRedirect`, dispatching each role to its home area.

## 4. Data model

Identity is rooted in Supabase `auth.users`; a `handle_new_user()` trigger fans out on signup to create `public.users` (+ role-specific `doctor_profiles` or `labs`).

**Core relationships:**
- `users` 1:1→ `doctor_profiles` 1:N→ `doctor_work_locations` (one default via partial unique index) and 1:N→ `patients` 1:N→ `patient_cases`.
- `users` 1:N→ `labs` (approval lifecycle: `PENDING_APPROVAL` → `CHANGES_REQUESTED` / `APPROVED_ACTIVE` / `REJECTED` / `SUSPENDED`; marketplace-visible only when `APPROVED_ACTIVE && is_active`).
- `labs` 1:N→ `lab_services` 1:N linked to `lab_forms` 1:N→ `lab_form_versions` (immutable, versioned; hold `configuration_json: FieldConfig[]` + `pricing_configuration_json: PricingConfig`). Forms seeded from `platform_form_templates`/`platform_template_fields`.
- **`orders`** is the hub, referencing doctor, lab, work-location, patient, (optional) case, service, and form-version. Two self-refs: `parent_order_id` and `continues_order_id` (project lineage). Children: `order_answers` (EAV: one row per `(order_id, field_code)` with `answer_json`), `order_files` (`order-files` storage bucket, path `<lab_id>/<order_id>/<file>`), `order_edits` (audit log with pre-edit `snapshot_json`). `order_drafts` is one wizard draft per doctor.
- Orders carry **denormalized JSONB snapshots** (`work_location_snapshot`, `lab_snapshot`, `service_snapshot`, `invoice_recipient_snapshot`, `doctor_snapshot`) captured at submit time, plus edit counters (`edit_count`, `has_unreviewed_edits`, `last_edited_at`). 10-value `order_status`; `COMPLETED`/`CANCELLED` are terminal.

**RLS model:** helper fns `current_user_role()`, `current_doctor_id()`, `current_user_owns_lab()` keep policies one-line. Anon/authenticated read the marketplace (approved labs + active services + published forms). Doctors read/write their own rows and their own orders (non-terminal only). Lab owners read/write their catalog and read+update orders on their `lab_id` (non-terminal), plus read the patient and doctor-user rows their orders reference. `PLATFORM_ADMIN` has full read/update. **All order/answer/edit writes go through RPCs** (`submit_order`, `edit_order`, `find_matching_patient`, `publish_lab_form`) — there is no direct INSERT policy on orders. `CLINIC_ADMIN` exists in the enum but has **no policies and no provisioning** (dead).

**Schema source-of-truth caveat:** the numbered `supabase/migrations/` (0001–0010, **no 0007**) plus loose top-level `supabase/*.sql` files (`add-doctor-snapshot.sql`, `users-rls-lab-can-see-order-doctors.sql`, etc.) are the real history; `phase4-6.sql` re-bundles several migrations. The two SETUP docs are incomplete. See §8.

## 5. Key subsystems

**Order-forms engine** — `src/features/orderForms/`. Dispatcher `OrderForm.tsx` switches on `configuration._templateCode` to render one of six hand-built structured forms (`CrownAndBridgeForm`, `ImplantRestorationForm`, `SurgicalGuideForm`, `EspForm`, `ModelForm`, `GingivalReductionGuideForm`), else falls back to generic `src/components/DynamicForm.tsx`. **Not RHF/zod** — each form ships a triad in its `*Types.ts`: `emptyXAnswers`, `coerceXAnswers(unknown)` (defensive hydration), `validateX() → {field: message}` dict. Shared `src/components/ToothMap.tsx` (Universal 1–32 storage, FDI display), `TreatmentBuilder.tsx` (material brush), `primitives.tsx`, `scrollToFirstError.ts`. `OrderForm` also exports `isOrderFormValid()` (the wizard's submit gate).

**Doctor flow** — `src/pages/doctor/` + `src/features/orders/` + `src/features/doctor/orderCreate/`. Entry points: `MarketplacePage` → `LabPublicProfilePage` → `OrderCreateWizard.tsx` (single scrolling page; hosts exported `PatientStep`/`FormStep`, autosaves drafts, calls `submit_order`). Also `OrderEditPage`, `OrderDetailPage`, `OrdersListPage`, `PatientsPage`, `WorkLocationsPage`, `DoctorProfilePage`. Shared cards in `src/features/orders/` (`OrderRowCard`, `OrderLineage`, `OrdersPaginator`). Draft plumbing in `orderCreate/draftStorage.ts` + `useContinueProject.tsx`.

**Lab flow** — `src/pages/lab/` + `src/features/lab/`. Entry points: `LabDashboardPage` (approval-gated stats), `LabOrdersDashboardPage` (queue with inline status Select), `LabOrderSheetPage` (per-order status/price/due-date, edit-diff review, cancel), `LabServicesPage` / `LabServiceCreatePage` / `LabServiceEditPage` (template-driven service+form+pricing builder), `LabProfilePage` (onboarding), `LabEditedOrdersPage`. Support: `LabApprovalBanner`, `labProfileSchema.ts`, `services/serviceBasicsSchema.ts`, `forms/buildDefaultConfig.ts` (seeds config+pricing), `orderEdits/diff.ts`.

**Admin flow** — `src/pages/admin/`. `AdminHomePage` (pending-lab count), `LabApprovalQueuePage` (DataGrid), `LabReviewPage` (approve/request-changes/reject/suspend state machine writing `labs` directly, gated by `labProfileSchema.isLabProfileComplete()`).

**Frontend infra** — `src/i18n/index.ts` (7 namespaces × 3 langs, all statically bundled), `src/theme/tokens.ts` + `ColorModeProvider.tsx` (light/dark/system, brand lavender `#9292FF`), `src/lib/queryClient.ts` (staleTime 30s, retry 1, no focus refetch), `src/lib/zod-i18n.ts`. Shared components: `RHFTextField`, `NumberField`, `FullPageSpinner`, `LanguageSwitcher`, `ColorModeToggle`, `OrderStatusChip`, `LabStatusChip`. Pricing engine `src/utils/pricing.ts` (`calculatePrice`/`isPricingComplete`/`formatGEL`) + `src/components/PriceBreakdown.tsx`.

## 6. Lifecycle: "doctor creates an order" end to end

1. **Discover** — `MarketplacePage.tsx` runs a React Query for `APPROVED_ACTIVE && is_active` labs → `LabCard` → `LabPublicProfilePage.tsx` loads the lab + active services; a service is orderable only if its linked `lab_form` is `PUBLISHED`. Click navigates to `/doctor/orders/new?lab=&service=` (+`patient`/`continues` for a continuation).
2. **Wizard** — `OrderCreateWizard.tsx` reads the URL params, loads lab/service + the form's current `lab_form_versions` row, and hydrates `WizardState` (from an `order_drafts` row if lab/service match). `useDebouncedDraftAutosave` (`draftStorage.ts`) persists state to `order_drafts` (1s debounce + unmount flush).
3. **Fill form** — `FormStep` renders `OrderForm` (§5) with `configuration_json`/`pricing_configuration_json`; answers live as a flat `Record<string,unknown>`. `PatientStep` debounces name entry (400ms) and calls the `find_matching_patient` RPC for name-based dedup (link vs. create dialog). Live estimate via `calculatePrice` + `PriceBreakdown`.
4. **Submit** — validation runs `isOrderFormValid()`; on failure `scrollToFirstError()`. On success the client computes `generated_total` and calls the **`submit_order` RPC** with the patient object, flat answers JSON (`p_answers`), work location, due date, rush, and optional `p_continues_order_id`.
5. **Server** — `submit_order` (SECURITY DEFINER) validates lab/service/location/form-version, dedups-or-creates the patient (name-only, case-insensitive), builds recipient + doctor snapshots, and inserts `orders` + `order_answers`.
6. **RLS** — the RPC runs as definer so the insert bypasses the absent INSERT policy; subsequent reads by doctor and lab are governed by `current_doctor_id()` / `current_user_owns_lab()` policies.
7. **Post-success** — the draft is deleted and its query cache cleared/invalidated (guarded against autosave resurrection); order appears in the doctor's `OrdersListPage` and the lab's `LabOrdersDashboardPage`.

## 7. Conventions a contributor must follow

- **Order forms** use the bespoke `coerce/validate/errors-dict` pattern — never react-hook-form/zod here. Add a template by creating `xTypes.ts` (triad + `TEMPLATE_CODE_X`) + `XForm.tsx`, wiring the dispatch case in `OrderForm.tsx`, and seeding `_templateCode` in `buildDefaultConfig.ts`. **Other** forms (auth, lab/doctor profile, service basics, work locations) use RHF + zod + `RHFTextField` (requires a `FormProvider` ancestor).
- **Teeth** are always stored Universal (1–32); convert to FDI only for display.
- **i18n**: every user string is a key. Namespaces are per-area: `common` (default), `auth`, `doctor`, `lab`, `admin`, `landing`, `errors` (zod). Keys must exist in all three locales — `npm run i18n:check` (`scripts/check-i18n-parity.mjs`) gates parity (but see §8).
- **Theming**: consume tokens via MUI `sx`/theme, never ad-hoc hex; all tokens live in `src/theme/tokens.ts`.
- **React Query**: array query keys scoped by id (`['lab-order', orderId]`, `['admin-labs', filter]`); direct `supabase.from()`/`.rpc()` in `queryFn`/`mutationFn`; `invalidateQueries` in `onSuccess`. Cross-side invalidation matters — `edit_order` success invalidates `lab-*` keys so lab dashboards refresh.
- **Order integrity**: read historical data from `*_snapshot` JSON (coalescing live join name → snapshot fallback); write orders only via RPCs. Immutable form versions — edit a form by publishing a new version, never UPDATE.
- **File layout**: pages in `src/pages/<role>/`, cross-cutting feature logic in `src/features/`, shared presentational components in `src/components/`, hand-written DB types in `src/types/database.ts`.

## 8. Gotchas, tech debt & open questions (most important first)

1. **Schema provisioning is not captured by the SETUP docs.** `SETUP.md` + `SETUP-PHASE4-6.md` cover only `all-in-one.sql` + `phase4-6.sql`, but the code depends on later scripts: migrations 0005–0010 **and** loose top-level files (`add-doctor-snapshot.sql`, `users-rls-lab-can-see-order-doctors.sql`, `phase4-6-fix-fk.sql`, etc.). Applying only the two docs yields RPCs referencing a **missing `orders.doctor_snapshot` column**. There is no manifest defining canonical apply order.
2. **`submit_order` is redefined ≥4 times with drifting behavior** across `phase4-6.sql`, `0008`, `0010`, and `add-doctor-snapshot.sql`; `phase4-6.sql` also duplicates migrations 0005/0006/0008/0009/0010. Editing one copy silently drifts from the other; live behavior depends on apply order.
3. **Patient dedup is name-only + case-insensitive**, ignores DOB/gender, and runs server-side even if the wizard dialog was skipped — two different people with the same name under one doctor silently merge onto one patient row (a `cleanup-patient-duplicates.sql` exists, implying this has bitten).
4. **Client-computed `generated_total` and the 50%-final-price floor are trusted client-side.** Whether `submit_order`/`edit_order` recompute price server-side is unverified — a pricing-integrity concern. Likewise `calculatePrice` branches by **duck-typing answer/pricing shapes** (not an explicit discriminator) and is claimed to be mirrored server-side; renaming a key can silently mis-price.
5. **Admin approval + lab status transitions write the `labs` table directly from the browser**; client state-machine guards are bypassable, so authorization rests entirely on RLS (not visible in the reviewed files).
6. **No guard-layer enforcement of `account_status`/lab `approval_status`.** A `SUSPENDED` user or non-approved lab passes `RoleGuard`; any such gating must live in RLS or page logic. `AuthProvider`'s `lastUserIdRef` dedupe also means a role/approval change is not reflected until `refreshUser({force})` or a full reload (**stale-profile risk**).
7. **`has_unreviewed_edits` is cleared merely by opening the order sheet** (ref-guarded, best-effort) — no explicit confirm. Where the flag is cleared and where `final_total`/`payment_status`/`confirmed_due_date`/`pricing_needs_review` are written isn't in the reviewed SQL (likely direct RLS UPDATEs).
8. **Everything is client-side fetched/filtered/paginated** (marketplace, orders, patients, edited-orders load the full list once) — won't scale with volume. Lineage/continue-project does an N+1 sequential round-trip per ancestor hop (cap 20).
9. **Order forms: several validation holes.** Generic-only forms aren't required-validated by the submit gate (`isOrderFormValid` returns `true` unconditionally); appended `custom_question` fields get no `showErrors`/validation; `SurgicalGuideForm` ignores its configuration (sections always on/required); implant positions need both `submittedPositions` membership AND completeness. Structured answer keys and custom-question codes share one flat namespace — bare CnB/implant keys (`shade`, `notation`) could collide.
10. **`src/types/database.ts` is hand-written and drifts** (e.g. `PricingModel` lists 2 of 4 enum values). "Regenerate via `supabase gen types`" has never been run; no `supabase/config.toml`, no CLI dep.
11. **No code-splitting** — all routes/layouts eager-imported; all 21 locale JSONs eagerly bundled (lab.json ~25–44KB/locale and growing).
12. **`npm run i18n:check` is currently red.** Mostly false positives from Russian CLDR plural categories (`_few`/`_many`) the flat comparator can't distinguish, but real en-only gaps hide in the noise (`doctor orderCreate.review.formAnswers`, `lab ordersDashboard.columns.*`, `orderSheet.moveTo`).
13. **Build is stricter than lint** — `tsc -b` treats `noUnusedLocals`/`noUnusedParameters` as hard errors while ESLint only warns; lint-clean code can fail deploy. No Node version pinned (local is non-LTS Node 25).
14. **Smaller items:** `PublicAuthLayout` isn't wired into `routes.tsx` (each public page imports it); authenticated users aren't bounced from `/login`; `ClinicLayout` is an un-i18n'd stub; `supabase.ts` only `console.error`s (doesn't throw) on missing env vars; `LabStatusChip` vs `LabApprovalBanner` use inconsistent status colors; email-confirmation must be turned off manually in Supabase; first `PLATFORM_ADMIN` seeded by hand (`seed_admin.sql`); Google Fonts loaded from CDN (breaks offline/strict-CSP); a stray 322KB `labs.zip` sits in repo root; file-upload UI is deferred (bucket exists, no UI).

**Open questions worth resolving early:** canonical schema apply order & updated SETUP docs; server-side price authority; where account/lab-status gating actually lives; whether `patient_cases` is superseded by `continues_order_id` lineage (no RPC creates cases); is `CLINIC_ADMIN` planned or dead; supported Node version and intended CI.

## 9. Map of where things live

| Area | Path |
|---|---|
| Composition root / providers | `src/main.tsx` |
| Route tree + guards wiring | `src/routes.tsx` |
| Auth (context + guards) | `src/auth/` — `AuthProvider.tsx`, `ProtectedRoute.tsx`, `RoleGuard.tsx`, `RoleAwareRedirect.tsx` |
| Layouts / app chrome | `src/layouts/` — `AppShell.tsx`, `DoctorLayout.tsx`, `LabLayout.tsx`, `AdminLayout.tsx`, `ClinicLayout.tsx`, `PublicAuthLayout.tsx` |
| Doctor pages | `src/pages/doctor/` |
| Lab pages | `src/pages/lab/` |
| Admin pages | `src/pages/admin/` |
| Doctor order-create feature | `src/features/doctor/orderCreate/` |
| Shared order components | `src/features/orders/` |
| Lab feature logic | `src/features/lab/` (`forms/`, `services/`, `orderEdits/`) |
| Dynamic order-forms engine | `src/features/orderForms/` (+ `src/components/DynamicForm.tsx`, `ToothMap.tsx`) |
| Pricing | `src/utils/pricing.ts`, `src/components/PriceBreakdown.tsx` |
| Supabase client | `src/lib/supabase.ts` |
| React Query client | `src/lib/queryClient.ts` |
| Theming | `src/theme/tokens.ts`, `src/theme/ColorModeProvider.tsx` |
| i18n | `src/i18n/index.ts`, `src/locales/{en,ka,ru}/`, `src/lib/zod-i18n.ts` |
| Hand-written DB types | `src/types/database.ts` |
| SQL schema (real history) | `supabase/migrations/0001–0010` (no 0007) |
| SQL bundles / patches | `supabase/all-in-one.sql`, `supabase/phase4-6.sql`, loose `supabase/*.sql` |
| Setup / spec docs | `SETUP.md`, `SETUP-PHASE4-6.md`, `IMPLEMENTATION_PLAN.md`, `docs/{database,frontend,phases}.md` |
| Build/tooling config | `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc.json`, `vercel.json`, `package.json` |
| i18n CI script | `scripts/check-i18n-parity.mjs` (`npm run i18n:check`) |
