# Multi-Lab Dental Order Intake Platform — Implementation Plan

> **Stack:** React 18 + TypeScript + Vite · MUI v5 · Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
>
> **Scope:** MVP per PRD (2026-04-28). Order intake, billing-ready. **No** production workflow, technician roles, or compensation modules in MVP.

This document is the master plan. Companion docs:

- [docs/database.md](docs/database.md) — Supabase schema, RLS policies, storage buckets, triggers
- [docs/frontend.md](docs/frontend.md) — React/MUI architecture, routing, state management, key components
- [docs/phases.md](docs/phases.md) — Phase-by-phase build sequence with deliverables

---

## 1. Why This Stack

| Concern | Choice | Reason |
|---|---|---|
| UI framework | React 18 + TS | Industry standard, strong typing, fast iteration |
| Build tool | Vite | Fast dev server, simple config |
| Component library | MUI v5 | Complete component set (DataGrid, X-Date-Pickers, forms), accessible, theme-able |
| Backend | Supabase | Postgres + Auth + Storage + Realtime + RLS in one — replaces ~70% of bespoke backend work |
| Auth | Supabase Auth | Email/password, magic link, JWT-based RLS integration |
| File storage | Supabase Storage | S3-compatible, signed URLs, integrates with RLS |
| Realtime (chat) | Supabase Realtime | Postgres CDC channels, no separate WebSocket server |
| Background jobs | Supabase Edge Functions + `pg_cron` | Monthly platform billing generation, invoice email |
| Email | Resend (called from Edge Functions) | Reliable, simple API |
| Form handling | React Hook Form + Zod | Schema-driven, performant, integrates with MUI |
| Server state | TanStack Query (React Query) | Cache, invalidation, optimistic updates |
| Routing | React Router v6 | Standard, supports nested layouts and route guards |
| Tooth map / FDI | Custom SVG component | No good off-the-shelf option; one-time build |
| PDF (invoices) | `@react-pdf/renderer` | Render invoice templates client- or edge-side |
| Tables | MUI DataGrid (Community or Pro) | Filtering, sorting, pagination out of the box |
| i18n | `react-i18next` + browser language detector | Three launch languages: English, Georgian, Russian |
| Theming | MUI theme + `prefers-color-scheme` | Light/dark mode with system-default detection, user override persisted in localStorage |

---

## 2. Architectural Principles (from PRD §1.1, §20)

These are **load-bearing** and must be enforced from day one:

1. **Multi-lab from day one** — every order references a `lab_id`; no implicit "the lab".
2. **Snapshot, don't reference, for billing-relevant data.** When an order is submitted, the work location, lab details, service details, form configuration, pricing rules, invoice recipient, and platform billing fee must be **copied** into the order record (or a related snapshot row), not joined live. Editing a lab's address tomorrow must not retroactively change last month's invoice.
3. **Form versioning is mandatory.** `lab_forms` has a `current_version_id`; submitted orders store `lab_form_version_id`. Editing a form creates a new version; old orders render against the old version.
4. **Audit everything that touches money or trust.** Order edits, status changes, price changes, invoice generation/cancellation, payment events, lab approval, review moderation, platform billing actions — all logged with actor, role, timestamp, before/after.
5. **Two billing systems, never confused.**
   - **Dental work invoices** (Lab → Doctor/Clinic) — table: `invoices` + `payment_events`
   - **Platform billing invoices** (Platform → Doctor/Clinic/Lab) — separate tables prefixed `platform_billing_*`
6. **Scope-based access.** RLS in Postgres is the source of truth; the frontend only restricts UX. A doctor must not be able to read another doctor's patients even by crafting a direct API call.
7. **No file deletion in MVP.** Users upload a corrected file; old files remain for audit.
8. **In-app notifications first; email only for invoices.**
9. **Future-ready, not future-built.** Tables like `patient_cases` and `parent_order_id` exist but are minimal. Don't build the full workflow engine — leave hooks.

---

## 3. Roles & Access Model

Four roles, stored on `users.role`:

| Role | Self-register? | Approval needed? | Scope |
|---|---|---|---|
| `DOCTOR` | Yes | No | Own patients, own orders, own work locations |
| `LAB_MAIN_ADMIN` | Yes (creates lab) | Lab needs `APPROVED_ACTIVE` to be visible | Own lab's orders, services, forms, invoices |
| `PLATFORM_ADMIN` | No (seeded) | N/A | Everything; lab approval, moderation, platform billing |
| `CLINIC_ADMIN` | No (created by Platform Admin) | N/A | Orders within assigned `doctor_work_location_id` scope; **no** payment perms |

Clinic Admin is optional and **never blocks the doctor flow**. A doctor can submit an order to any approved lab without any clinic admin existing.

---

## 4. MVP Module Map

```
┌─ Public / Marketing ───────────────────────────────────┐
│ Phase 1.5: landing page (header, hero, labs, info,     │
│            footer) — public, no auth                   │
└────────────────────────────────────────────────────────┘
┌─ Auth & Roles ─────────────────────────────────────────┐
│ Phase 1: registration, login, password reset, RLS base │
└────────────────────────────────────────────────────────┘
┌─ Doctor side ──────────────────────────────────────────┐
│ Phase 2: profile + work locations                      │
│ Phase 6: order creation flow                           │
│ Phase 11: receipt confirmation, try-in feedback        │
│ Phase 12: reviews                                      │
└────────────────────────────────────────────────────────┘
┌─ Lab side ─────────────────────────────────────────────┐
│ Phase 3: registration + legal/billing + approval queue │
│ Phase 4: public profile + service cards                │
│ Phase 5: template-based form builder (config only)     │
│ Phase 7: pricing engine                                │
│ Phase 8: dashboard + order sheet                       │
│ Phase 10: invoice generation, payment events           │
└────────────────────────────────────────────────────────┘
┌─ Cross-cutting ────────────────────────────────────────┐
│ Phase 9: order chat + notifications                    │
│ Phase 13: optional clinic admin                        │
│ Phase 14: platform billing module                      │
└────────────────────────────────────────────────────────┘
┌─ Platform Admin ───────────────────────────────────────┐
│ Throughout: lab approval, moderation, billing config,  │
│ user suspension, basic stats                           │
└────────────────────────────────────────────────────────┘
```

See [docs/phases.md](docs/phases.md) for detailed deliverables per phase.

---

## 5. Repo Layout

```
lab-order/
├── IMPLEMENTATION_PLAN.md          ← this file
├── docs/
│   ├── database.md
│   ├── frontend.md
│   └── phases.md
├── supabase/
│   ├── migrations/                 ← SQL migrations, numbered
│   ├── functions/                  ← Edge Functions (TS)
│   │   ├── generate-platform-billing/
│   │   ├── send-invoice-email/
│   │   └── _shared/
│   ├── seed.sql                    ← seed: 8 platform templates, platform admin user
│   └── config.toml
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme/
│   │   ├── tokens.ts               ← buildTheme(mode) — light + dark palettes
│   │   └── ColorModeProvider.tsx   ← theme provider + dark-mode context
│   ├── i18n/
│   │   └── index.ts                ← i18next init, language detection, dayjs locale sync
│   ├── locales/
│   │   ├── en/                     ← common, landing, auth, doctor, lab, admin, errors
│   │   ├── ka/
│   │   └── ru/
│   ├── lib/
│   │   ├── supabase.ts             ← client init
│   │   ├── queryClient.ts          ← React Query config
│   │   ├── zod-i18n.ts             ← Zod global error map → i18n
│   │   └── auth.ts                 ← session helpers
│   ├── types/
│   │   ├── database.ts             ← generated from supabase
│   │   └── domain.ts               ← branded types, enums
│   ├── auth/
│   │   ├── AuthProvider.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── RoleGuard.tsx
│   ├── features/
│   │   ├── doctor/
│   │   │   ├── profile/
│   │   │   ├── work-locations/
│   │   │   ├── order-create/      ← multi-step wizard
│   │   │   ├── orders/             ← portfolio
│   │   │   └── patients/
│   │   ├── lab/
│   │   │   ├── registration/
│   │   │   ├── profile/
│   │   │   ├── services/
│   │   │   ├── forms/              ← template-based form config
│   │   │   ├── orders-dashboard/
│   │   │   ├── order-sheet/
│   │   │   ├── invoices/
│   │   │   └── debts/
│   │   ├── platform-admin/
│   │   │   ├── lab-approval/
│   │   │   ├── moderation/
│   │   │   ├── clinic-admins/
│   │   │   ├── billing-settings/
│   │   │   └── billing-invoices/
│   │   ├── clinic-admin/
│   │   ├── chat/                   ← order-specific chat
│   │   ├── notifications/
│   │   ├── reviews/
│   │   └── marketplace/            ← lab browsing for doctors
│   ├── components/
│   │   ├── ToothMap/               ← FDI SVG component
│   │   ├── FileUploader/
│   │   ├── DataTable/              ← MUI DataGrid wrapper
│   │   ├── FormFields/             ← RHF + MUI bindings
│   │   ├── PriceBreakdown/
│   │   ├── StatusChip/
│   │   ├── ColorModeToggle.tsx     ← light/dark switcher
│   │   ├── LanguageSwitcher.tsx    ← en/ka/ru menu
│   │   └── LabCard/                ← shared between landing + doctor marketplace
│   ├── hooks/
│   │   ├── useUser.ts
│   │   ├── useRole.ts
│   │   ├── useOrders.ts
│   │   └── useRealtimeChat.ts
│   ├── pages/                      ← route-level page components
│   │   ├── doctor/
│   │   ├── lab/
│   │   ├── platform-admin/
│   │   ├── clinic-admin/
│   │   └── public/
│   │       ├── LandingPage.tsx
│   │       ├── sections/
│   │       │   ├── PublicHeader.tsx
│   │       │   ├── HeroSection.tsx
│   │       │   ├── LabsSection.tsx
│   │       │   ├── HowItWorksSection.tsx
│   │       │   └── PublicFooter.tsx
│   │       └── LandingPage.test.tsx
│   ├── routes.tsx                  ← React Router config
│   └── utils/
│       ├── pricing.ts              ← shared pricing math (used in UI estimate)
│       ├── snapshot.ts             ← snapshot helpers
│       └── format.ts
├── tests/
│   ├── e2e/                        ← Playwright
│   └── unit/
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
└── playwright.config.ts
```

---

## 6. Critical Implementation Concerns

### 6.1 Pricing engine
Lives in **two places**:
- `src/utils/pricing.ts` — calculates the **estimated** price client-side as the doctor fills the form. This is the "generated total".
- A Postgres function `calculate_order_price(order_id)` — recomputes the same number server-side at submission so it can't be tampered with. The lab later confirms `final_total` (which may differ from `generated_total`).

Models: `UNIT_BASED`, `FIXED_PRICE`, `MATERIAL_MODIFIER`, `MANUAL_QUOTE_REQUIRED`. Rush is applied to the **subtotal**, not per-tooth (PRD §12.2).

### 6.2 Form versioning & snapshots
Submitting an order writes:
- `orders.lab_form_version_id` → FK to `lab_form_versions.id` (immutable)
- `orders.work_location_snapshot` (JSONB) → frozen copy of the doctor's clinic info at submission time
- `orders.lab_snapshot` (JSONB) → frozen copy of lab legal/billing info
- `orders.pricing_snapshot` (JSONB) → frozen pricing config

Rendering an old order = read the snapshot, **not** the live tables.

### 6.3 Same-patient match
On order create, after entering patient first/last/DOB, query `patients` scoped to `doctor_id`. If a match exists, prompt: *Continue existing case* or *New independent order*. Continuation sets `parent_order_id` and `patient_case_id`; the new order is otherwise independent (no auto-attached files).

### 6.4 Order chat
- Table: `order_messages` with `order_id`, `sender_user_id`, `sender_role`, `message_type` (`USER`, `SYSTEM`), `message_text`, `attachment_url?`.
- Realtime: subscribe to `order_messages:order_id=eq.X` via Supabase Realtime.
- System messages are inserted by Postgres triggers on status change, price change, invoice creation, payment, file upload, etc. The trigger writes to `order_messages` with `message_type = 'SYSTEM'`.

### 6.5 Platform billing
- `pg_cron` scheduled job runs on the 1st of each month → calls Edge Function `generate-platform-billing`.
- Edge Function reads `platform_billing_settings` (active rows), counts orders per target for the previous month, writes `platform_billing_periods` + `platform_billing_breakdown_items` + `platform_billing_invoices` with status `GENERATED`.
- **Invoices are NOT auto-emailed.** Platform Admin reviews in dashboard, clicks **Approve & Send** → status becomes `APPROVED_SENT`, Edge Function `send-invoice-email` fires.
- Cancellation requires a mandatory reason; cancelled invoices are not deleted.

### 6.6 Audit logging
A `change_logs` table (and `order_change_logs` for order-specific). Trigger-based logging on critical tables (`orders`, `invoices`, `payment_events`, `labs.approval_status`, `reviews`). Application code adds the `reason` field where required.

### 6.7 File uploads
- Supabase Storage buckets: `order-files` (private), `lab-logos` (public), `chat-attachments` (private).
- File size limit: 100 MB (configurable). Allowed types per PRD §13: STL, ZIP, JPG/JPEG, PNG, PDF, MP4.
- `order_files` row stores metadata; `file_url` is the storage path. Frontend fetches signed URLs on demand.
- **No deletion** in MVP; UI hides the delete button.

### 6.8 Tooth map (FDI)
Custom SVG component. Adult dentition (32 teeth, FDI numbering 11-48). Click to toggle selection. Stored as `int[]` in `order_answers.answer_json` for fields of type `tooth_selection`.

---

## 7. Environment & Secrets

`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Edge Function secrets (set via `supabase secrets set`):
```
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
APP_BASE_URL=https://...
```

Three Supabase projects: `dental-lab-dev`, `dental-lab-staging`, `dental-lab-prod`.

---

## 8. Build Sequence (high-level)

The PRD's 16 phases collapse into 5 release milestones:

| Milestone | Phases | What ships |
|---|---|---|
| **M1: Foundations** | 0, 1, 1.5 | Auth, role guards, RLS skeleton, theme, layout shell, public landing page |
| **M2: Onboarding** | 2, 3 | Doctor profile + work locations, lab registration + approval |
| **M3: Catalog & Forms** | 4, 5, 7 | Lab profile, services, template forms, pricing engine |
| **M4: Order Lifecycle** | 6, 8, 9, 11 | Order creation, lab dashboard, order sheet, chat, notifications, delivery/try-in |
| **M5: Money & Governance** | 10, 12, 13, 14 | Invoices, payments, debt, reviews, clinic admin, platform billing |
| **M6: Polish** | 15 | E2E tests, pilot, bug bash |

Each milestone is independently demoable. See [docs/phases.md](docs/phases.md) for task-level breakdown.

---

## 9. What We're Explicitly NOT Building (PRD §3.2)

Re-stating to keep scope honest:
- ❌ Production workflow / workflow builder
- ❌ Technician role, dashboard, assignment, earnings
- ❌ CAD / milling / sintering / ceramic stages
- ❌ Stage evidence rules
- ❌ Compensation analytics
- ❌ QR production sheets
- ❌ Full archival PDF report
- ❌ Online payment gateway (record payments manually only)
- ❌ Custom drag-and-drop form builder (use 8 fixed templates)
- ❌ Email auto-send for platform billing (admin must approve first)

If a PR adds any of these, it's out of scope.

---

## 10. Open Questions for Stakeholder

Before Phase 0 starts, get answers:

1. **Currency**: PRD says GEL only in MVP — confirm no multi-currency UI needed at all (not even display).
2. ~~**Language/i18n**: PRD is in English; will the UI also be English-only at launch, or Georgian/Russian needed?~~ **Decided**: ship English + Georgian + Russian from day one. See `docs/frontend.md §7a`.
3. **Invoice numbering scheme**: Per-lab sequential? Global? Tax authority requirements?
4. **Platform Admin seeding**: How is the first Platform Admin created? (Supabase SQL seed → set `role = 'PLATFORM_ADMIN'` on a known email.)
5. **Email sender domain**: Need DKIM/SPF set up for Resend.
6. **MUI license**: DataGrid Community is free; DataGrid Pro is paid. Do we have budget for Pro (column pinning, row grouping)?
7. **Hosting**: Vercel/Netlify for the React app? Supabase handles backend.
8. **Personal ID format validation**: Specific to Georgia (11 digits)? Need exact regex.

---

## 11. Definition of Done (per feature)

- [ ] Database migration written and reversible
- [ ] RLS policies cover all roles for the new tables
- [ ] TypeScript types regenerated from Supabase
- [ ] React Query hooks for read/write
- [ ] MUI components built; mobile-responsive (doctor flow especially)
- [ ] Audit logging for any state-mutating action
- [ ] Snapshot logic for any billing-relevant data
- [ ] Unit tests for pricing/snapshot/audit logic
- [ ] At least one Playwright happy-path test
- [ ] PR description references PRD section
