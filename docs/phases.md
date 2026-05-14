# Phase-by-Phase Build Sequence

Maps PRD §21 phases to concrete deliverables. Each phase ends with a working, demoable slice. Estimates are rough order-of-magnitude in developer-days for a single full-stack engineer; halve for a pair.

Legend: 🗄️ DB · 🔐 RLS · ⚙️ Edge fn · 🎨 UI · 🧪 Tests

---

## Phase 0 — Foundation (4-6 days)

**Goal**: empty Vite app boots, connects to Supabase, lints/tests run, deploy pipeline works, theming + i18n + dark mode wired before any feature work.

- [ ] Initialize Vite + React + TS project; ESLint + Prettier config.
- [ ] Install deps from `docs/frontend.md §1` (includes `i18next`, `react-i18next`, `i18next-browser-languagedetector`).
- [ ] Create three Supabase projects: dev, staging, prod.
- [ ] Wire `supabase` CLI; `supabase init` in `/supabase`.
- [ ] First migration: `enums.sql` (all enums from `docs/database.md §2`).
- [ ] **Theming + dark mode**:
  - [ ] `src/theme/tokens.ts` with `buildTheme(mode)` returning both light and dark palettes.
  - [ ] `src/theme/ColorModeProvider.tsx` with `useColorMode` hook, system-preference detection, localStorage persistence.
  - [ ] `<ColorModeToggle>` component.
  - [ ] Replace `<ThemeProvider>` in `main.tsx` with `<ColorModeProvider>`.
  - [ ] Add `<meta name="theme-color">` to `index.html` for mobile chrome.
- [ ] **i18n**:
  - [ ] `src/i18n/index.ts` initializing i18next with `en` / `ka` / `ru`.
  - [ ] `src/locales/{en,ka,ru}/{common,landing,auth,doctor,lab,admin,errors}.json` scaffolds (English populated, others stubbed with the same keys for now).
  - [ ] `<LanguageSwitcher>` component (icon + text variants).
  - [ ] `src/lib/zod-i18n.ts` global Zod error map.
  - [ ] dayjs locales loaded; `i18n.on('languageChanged', …)` syncs `dayjs.locale()` and `<html lang>`.
  - [ ] `Noto Sans Georgian` font in `index.html` with `font-display: swap`.
  - [ ] CI script: every key in `en/*.json` exists in `ka/*.json` and `ru/*.json`; missing keys fail the build.
- [ ] Generate types: `supabase gen types typescript --linked > src/types/database.ts`.
- [ ] Vercel/Netlify deploy on push to `main`.
- [ ] CI: lint + typecheck + unit tests + i18n key parity on PR.
- [ ] 🧪 Smoke test: app renders in light + dark; switching language changes a sample heading; preference survives reload.

**Done when**: app deploys; toggling theme persists across reload and respects `prefers-color-scheme` on first visit; switching language re-renders all chrome; types compile.

---

## Phase 1 — Auth, Roles, Permissions (4-6 days)

**Goal**: anyone can register; their role is set; RLS-protected data is unreadable cross-account.

- [ ] 🗄️ Migration: `users` (incl. `preferred_lang`, `preferred_color_mode`), `doctor_profiles`, `labs` (skeleton with approval status).
- [ ] 🗄️ Trigger: on `auth.users` insert → insert `public.users` row using metadata (role, names, lang from request).
- [ ] 🔐 RLS helper functions: `current_user_role()`, `current_doctor_id()`, `current_user_owns_lab()`.
- [ ] 🔐 Policies for `users`, `doctor_profiles`, `labs` (own-row read/write).
- [ ] 🎨 Pages: `/login`, `/register/doctor`, `/register/lab`, `/forgot-password`.
- [ ] 🎨 `AuthProvider`, `ProtectedRoute`, `RoleGuard`.
- [ ] 🎨 `RoleAwareRedirect`: after login, send to `/doctor`, `/lab`, `/admin`, or `/clinic`.
- [ ] 🎨 Layout shells: `DoctorLayout`, `LabLayout`, `AdminLayout`, `ClinicLayout` with nav.
- [ ] 🎨 Account suspended state — show banner + sign out option.
- [ ] 🧪 E2E: doctor registration → land on `/doctor` → cannot access `/admin`.

**Done when**: two doctors register; doctor A cannot read doctor B's profile via direct API call.

---

## Phase 1.5 — Public Landing Page (2-3 days)

**Goal**: anonymous visitors land on a marketing page that introduces the platform, showcases approved labs, and funnels them to register.

- [ ] 🎨 Route wiring: `/` (anonymous → `<LandingPage />`, signed-in → role redirect) and `/welcome` (always landing).
- [ ] 🎨 `<LandingPage>` page composing the five section components.
- [ ] 🎨 `<PublicHeader>` — sticky AppBar with scroll-trigger, nav anchors, **Log in** + **Get started** popover (Doctor / Lab).
- [ ] 🎨 `<HeroSection>` — headline, subhead, primary + secondary CTAs, hero illustration; responsive two-column → stacked.
- [ ] 🎨 `<LabsSection>` — fetches up to 8 `APPROVED_ACTIVE` labs via the public-readable RLS policy; renders `<LabCard>`s with logo, name, city, short description; CTA button to register.
- [ ] 🎨 `<LabCard>` extracted to `src/components/LabCard/` so Phase 4 marketplace reuses it.
- [ ] 🎨 `<HowItWorksSection>` — static 3-step strip with MUI icons (Search / Description / Receipt).
- [ ] 🎨 `<PublicFooter>` — three-column nav (Product / Company / Contact) + copyright bar.
- [ ] 🎨 Empty-state for `<LabsSection>` when fewer than ~4 labs exist (skeleton + "More labs joining soon").
- [ ] 🎨 Image lazy-loading, explicit width/height to prevent CLS.
- [ ] 🎨 `<title>` and basic `<meta description>` set in `index.html`.
- [ ] 🎨 Mobile pass: hamburger menu in header, single-column layouts at `xs`.
- [ ] 🎨 `<ColorModeToggle>` and `<LanguageSwitcher>` placed in `<PublicHeader>` (also reachable from the hamburger menu on mobile).
- [ ] 🎨 All landing copy lives in `landing.json` (en/ka/ru); no hard-coded English strings.
- [ ] 🎨 Dark-mode pass: hero illustration uses `currentColor` strokes or ships a dark variant; lab logos rendered on `paper`-colored card so they don't disappear.
- [ ] 🧪 Component test: anonymous load renders all five sections; with no labs returned, `<LabsSection>` shows the empty state, not a crash.
- [ ] 🧪 E2E: anonymous user lands on `/`, clicks **Get started → I'm a Doctor**, completes registration, lands on `/doctor`.

**Done when**: anonymous user sees the landing page on `/`; signed-in user is redirected past it; lab logos render only for approved labs; CTAs reach the correct register pages.

**Watch-outs**:
- Don't fetch any private data on the landing page — must be performant for anonymous users with cold cache.
- The `labs_marketplace_read` policy already permits anonymous SELECT; verify nothing else (services, reviews) leaks into the public query.
- Copywriting is placeholder; flag for stakeholder review before launch.

---

## Phase 2 — Doctor Profile & Work Locations (3-4 days)

- [ ] 🗄️ `doctor_work_locations` table + unique-default index.
- [ ] 🔐 RLS: doctor R/W own; clinic admin reads scoped (deferred to Phase 13).
- [ ] 🎨 `/doctor/profile`: edit personal_id, specialty, license_number, photo upload to `user-avatars` bucket.
- [ ] 🎨 `/doctor/work-locations`: list + create + edit + archive; toggle default.
- [ ] 🎨 Validation: at least one default, personal ID format check.
- [ ] 🧪 Unit: default-location invariant logic.

**Done when**: doctor adds 2 locations, marks one default; cannot have two defaults.

---

## Phase 3 — Lab Registration & Approval (5-7 days)

- [ ] 🗄️ Add all legal/billing columns to `labs` (per PRD §5.2).
- [ ] 🗄️ `lab_profile_is_complete()` SQL function.
- [ ] 🔐 RLS: lab owner R/W own; platform admin all; **public read only when `APPROVED_ACTIVE`**.
- [ ] 🎨 Lab onboarding multi-step form; "Submit for approval" disabled until `lab_profile_is_complete`.
- [ ] 🎨 Lab side: approval-status banner ("Pending review", "Changes requested: <note>", "Suspended").
- [ ] 🎨 `/admin/labs`: queue of `PENDING_APPROVAL` + `CHANGES_REQUESTED` labs with filters.
- [ ] 🎨 `/admin/labs/:id`: approve / request changes (with note) / reject / suspend.
- [ ] 🗄️ Audit: `change_logs` entry on every approval-status transition.
- [ ] 🧪 E2E: lab registers → admin approves → lab visibility flips.

**Done when**: pending lab not visible to doctors; approved lab is.

---

## Phase 4 — Lab Profile & Service Cards (3-4 days)

- [ ] 🗄️ `lab_services`.
- [ ] 🎨 Lab side `/lab/services`: CRUD service cards (name, turnaround, cover image, sort order, active toggle).
- [ ] 🎨 Doctor side `/doctor/marketplace`: grid of approved labs with logo, city, rating average.
- [ ] 🎨 `/doctor/labs/:labId`: public profile — header, service cards (with hover tooltip), reviews list.
- [ ] 🎨 Service card "Order" button — disabled until linked form is published (set up in Phase 5).
- [ ] 🧪 E2E: doctor browses approved labs only.

---

## Phase 5 — Template-Based Forms (6-8 days)

**Most complex pre-order phase.** Deliverables:

- [ ] 🗄️ `platform_form_templates` + `platform_template_fields`.
- [ ] 🗄️ Seed all 8 templates with their fields (PRD §8.2).
- [ ] 🗄️ `lab_forms` + `lab_form_versions` (with version_number).
- [ ] 🎨 `/lab/forms`: list lab's forms; "Create from template" wizard.
- [ ] 🎨 `/lab/forms/:formId`: editor — toggle enabled/required, set helper text/default per field.
- [ ] 🎨 Pricing tab: pricing model picker, unit/fixed price, material modifiers, rush config.
- [ ] 🎨 Preview tab: renders `<DynamicForm>` read-only with sample data.
- [ ] 🎨 Publish / Unpublish / Archive buttons.
- [ ] 🎨 Save creates new `lab_form_versions` row; never mutates existing.
- [ ] 🎨 Link form to a service (select on form or service).
- [ ] 🧪 Unit: schema generated from configuration validates correctly.

**Done when**: lab creates a Zirconia Crown form, configures pricing, publishes; service card shows "Order" enabled.

---

## Phase 6 — Doctor Order Creation Flow (8-10 days)

The flagship feature. Implements PRD §9.

- [ ] 🗄️ `patients`, `patient_cases`, `orders`, `order_answers`, `order_files`.
- [ ] 🔐 Comprehensive RLS for all four (see `database.md §5`).
- [ ] ⚙️ SQL function `submit_order(payload)` (security definer): patient match/create, snapshot building, price calc, `orders` insert, `order_answers` insert.
- [ ] ⚙️ SQL function `find_matching_patient(first, last, dob)`.
- [ ] 🎨 Wizard at `/doctor/orders/new`:
  - Step 1: Patient (with same-patient match modal: continue / new).
  - Step 2: Lab (preselected if entered from lab profile) + Service.
  - Step 3: `<DynamicForm>` rendering current published version.
  - Step 4: `<FileUploader>` (multi-file), requested due date, rush toggle.
  - Step 5: Invoice recipient (Doctor or Clinic), `<PriceBreakdown>`, Submit.
- [ ] 🎨 Draft persistence in `localStorage`.
- [ ] 🎨 File upload to `order-files` bucket, then `order_files` insert (post-submit).
- [ ] 🎨 Doctor portfolio `/doctor/orders` with all filters (PRD §17.2).
- [ ] 🎨 Doctor order detail `/doctor/orders/:id` (read-only fields + edit button while not COMPLETED).
- [ ] 🧪 E2E: full doctor order creation; verify snapshot fields populated.

**Done when**: doctor places an order; lab dashboard (next phase) shows it.

---

## Phase 7 — Pricing Engine (3-4 days, partly overlapping Phase 5/6)

- [ ] `src/utils/pricing.ts`: `calculatePrice(config, answers, rush): PriceResult`.
- [ ] Postgres `calculate_order_price(config, answers)` mirroring the same math.
- [ ] `<PriceBreakdown>` component.
- [ ] Material modifier UI in form editor.
- [ ] Rush: percentage or fixed amount, applied to subtotal.
- [ ] `pricing_needs_review` flag — set true when (a) order is edited after submit and a price-affecting field changed, or (b) lab confirms a final price differing from generated.
- [ ] 🧪 Unit tests: each pricing model with rush variants and modifiers.

**Done when**: identical inputs in UI and DB produce identical totals.

---

## Phase 8 — Lab Dashboard & Order Sheet (5-7 days)

- [ ] 🎨 `/lab/orders`: DataGrid with columns from PRD §17.1, filter chips for status / payment / debt-only / unread.
- [ ] 🎨 `/lab/orders/:id` order sheet (see `frontend.md §11`):
  - Header with all summary info.
  - Order Details tab with snapshot rendering of `<DynamicForm>` (read-only).
  - Files tab: list with signed-URL download.
  - Status action buttons with confirmation dialogs.
  - "Confirm final price" inline editor.
  - "Confirm due date" picker.
  - Cancel order modal (requires reason).
- [ ] 🗄️ Trigger: writes to `order_change_logs` on status / price / due-date changes.
- [ ] 🎨 History tab showing change log timeline.
- [ ] 🧪 E2E: lab moves order through all statuses up to READY_FOR_DELIVERY.

---

## Phase 9 — Chat & Notifications (4-5 days)

- [ ] 🗄️ `order_messages`, `notifications` tables.
- [ ] 🔐 RLS: messages readable by participants only.
- [ ] 🗄️ Triggers: status change / price change / invoice created / payment / file upload / receipt confirmed → insert SYSTEM `order_messages` row + relevant `notifications` rows.
- [ ] 🎨 `<OrderChat>` component with realtime subscription (see `frontend.md §9.7`).
- [ ] 🎨 Chat tab in order sheet (lab) and order detail (doctor).
- [ ] 🎨 File attachments in chat (uploaded to `chat-attachments`, recorded in `order_files` with `file_source='CHAT'`).
- [ ] 🎨 `<NotificationBell>` in app bar with realtime updates.
- [ ] 🧪 E2E: doctor sends message; lab receives in <2s.

**Done when**: realtime chat works in both directions; system messages appear automatically.

---

## Phase 10 — Dental Work Invoices, Payments, Debt (5-7 days)

- [ ] 🗄️ `invoices`, `payment_events`.
- [ ] 🔐 RLS: lab inserts/reads own; doctor reads own; clinic admin reads scoped (no insert).
- [ ] 🗄️ Trigger to recompute `orders.paid_total` and `payment_status` on `payment_events` change.
- [ ] 🎨 `/lab/orders/:id` Invoice tab:
  - "Generate invoice" button (enabled once `final_total` confirmed).
  - PDF preview using `@react-pdf/renderer`.
  - "Add payment" form: amount, method, date, note.
  - Payment events list.
- [ ] ⚙️ Edge function `send-invoice-email` — generates PDF, sends via Resend, attaches/links signed URL.
- [ ] 🎨 `/lab/invoices` and `/lab/debts` list views.
- [ ] 🎨 `/doctor/invoices` and `/doctor/debts` list views.
- [ ] 🎨 If invoice generated and order edits change price → set `invoice_needs_revision`; UI prompts lab to issue revised invoice (mark old as `CANCELLED`, issue new).
- [ ] 🧪 E2E: lab generates invoice → records partial payment → debt updated.

**Done when**: lab generates invoice, records payments, debt math correct everywhere it's shown.

---

## Phase 11 — Delivery, Receipt, Try-In, Continuation (3-4 days)

- [ ] 🎨 Lab side: status buttons `READY_FOR_DELIVERY`, `SENT_TO_CLINIC`.
- [ ] 🎨 Doctor side: "Confirm receipt" → `RECEIVED_BY_CLINIC`. (Clinic admin can do this too once Phase 13 lands.)
- [ ] 🎨 If service is temporary phase type, `TRY_IN_PHASE` with feedback form (APPROVED / CORRECTION_NEEDED / REMAKE_NEEDED + comment).
- [ ] 🎨 On try-in APPROVED for temporary: prompt "Create final continuation order?" → pre-fills wizard with same patient + lab.
- [ ] 🗄️ `parent_order_id` linking; both orders are independent records.
- [ ] 🧪 E2E: full lifecycle SUBMITTED → COMPLETED with try-in.

---

## Phase 12 — Reviews & Moderation (3-4 days)

- [ ] 🗄️ `reviews` with eligibility trigger (only on COMPLETED orders).
- [ ] 🗄️ Trigger: setting `reported_at` flips status to `REPORTED_HIDDEN`.
- [ ] 🔐 RLS: public read where `status='PUBLISHED'`; doctor inserts own; lab updates only `reported_*`; admin updates moderation fields.
- [ ] 🎨 Doctor: "Leave review" button on completed order → rating + comment + display mode.
- [ ] 🎨 Lab profile shows published reviews.
- [ ] 🎨 Lab side: "Report review" with reason → review hidden.
- [ ] 🎨 `/admin/reviews`: queue of `REPORTED_HIDDEN` → restore / keep hidden / remove.
- [ ] 🎨 Display mode rendering: anonymous shows "Verified Doctor" / hides identity but stores it.
- [ ] 🧪 Unit: cannot review without a completed order with the same lab.

---

## Phase 13 — Optional Clinic Admin (3-4 days)

- [ ] 🗄️ `clinic_admin_scopes` table.
- [ ] 🔐 RLS extension: clinic admin SELECT on `orders`, `patients` (read-only via order join), `invoices`, `order_messages`, `order_files` filtered by `current_clinic_admin_locations()`.
- [ ] 🎨 `/admin/clinic-admins`: platform admin creates a new clinic admin user (invite by email) and assigns work locations.
- [ ] 🎨 Clinic admin layout `/clinic`: dashboard listing in-scope orders.
- [ ] 🎨 Clinic admin can: read orders, participate in chat, upload files, confirm receipt, submit try-in feedback.
- [ ] 🎨 Clinic admin **cannot**: record payments, change final price, generate invoices.
- [ ] 🧪 E2E: clinic admin sees only assigned-clinic orders.

---

## Phase 14 — Platform Billing (5-7 days)

- [ ] 🗄️ All `platform_billing_*` tables (database.md §3.11).
- [ ] 🔐 RLS: only `PLATFORM_ADMIN` writes; targets read their own invoices.
- [ ] ⚙️ Edge function `generate-platform-billing` triggered by `pg_cron` on the 1st at 02:00. Idempotent (skips if period already exists).
- [ ] ⚙️ Edge function `send-platform-invoice-email` — manual invocation only, after admin approval.
- [ ] 🎨 `/admin/billing/settings`: list active settings; create new (target type, target picker, fee, basis, period, effective_from).
- [ ] 🎨 `/admin/billing/invoices`: GENERATED queue with totals + breakdown drawer; actions: **Approve & Send**, **Cancel** (with mandatory reason), **Record Payment**, **Manual Adjustment**.
- [ ] 🎨 Lab side `/lab/platform-billing`: read-only view of own invoices.
- [ ] 🧪 E2E: cron-triggered generation → admin approves & sends → lab sees invoice → admin records payment → debt cleared.

---

## Phase 15 — QA, Pilot, Launch (5-10 days)

- [ ] Full E2E sweep covering PRD §22 acceptance criteria.
- [ ] Permission test matrix: every role × every protected route × every protected mutation.
- [ ] Pricing fuzz tests: random inputs, verify UI total == DB total.
- [ ] Snapshot integrity test: edit lab address after order submission → snapshot unchanged on order/invoice.
- [ ] Audit log completeness test: every mutation listed in PRD §20.2 produces a log row.
- [ ] Mobile UX pass on doctor flow.
- [ ] Pilot with 2 labs + 5 doctors, fictitious patients only.
- [ ] Bug bash; fix top 10 issues.
- [ ] Production cutover plan.

---

## Cross-Cutting Tasks (run in parallel as needed)

| Task | When |
|---|---|
| Type generation script (CI step) | Phase 0, refresh after each migration |
| Audit-log triggers for all critical tables | Roll out per phase as tables come online |
| Snapshot helpers (`src/utils/snapshot.ts`) | Phase 6 (orders) and reused later |
| MUI DataGrid wrapper `<DataTable>` | Phase 8 (first heavy table) |
| Email templates (Resend) | Phase 10 (invoices), Phase 14 (platform invoices) |
| i18n scaffolding (if needed per stakeholder Q2) | After M2 if scope confirmed |
| Performance: index review, query analysis | M5 |

---

## Risks & Watch-Outs

- **RLS gaps**: easy to forget a table. Add a `pgtap` test in CI: every public table has RLS enabled and at least one policy.
- **Snapshot drift**: a tempting refactor is to "just join the live data". Don't. Snapshots must be additive (rendering reads JSONB fields). Add a regression test.
- **Form versioning bugs**: editing a form must never mutate an existing version. Enforce by `lab_form_versions` being insert-only after publish (RLS or trigger).
- **Realtime auth**: Supabase realtime respects RLS as of recent versions, but verify — write a test where doctor B tries to subscribe to doctor A's order channel.
- **File size**: STL and MP4 can be large. Confirm bucket limit and add client-side size guard before upload.
- **Platform billing idempotency**: cron may fire twice. Use `unique (billing_setting_id, period_start)` and `on conflict do nothing` in the Edge function.
- **MUI DataGrid Community vs Pro**: column pinning and grouping are Pro-only. Confirm with stakeholders before relying on them.

---

## Pilot Acceptance Gate

Pilot launches after Phase 14. The system passes acceptance when, with two pilot labs and five pilot doctors over a 2-week run:

- [ ] ≥20 real orders submitted end-to-end without manual intervention.
- [ ] All invoices generated and at least 80% with a recorded payment.
- [ ] Zero RLS leak incidents (verified via audit query).
- [ ] One full month-end platform billing cycle generates correctly.
- [ ] Mobile order creation works for all pilot doctors.
