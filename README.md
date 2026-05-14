# Lab Order

Multi-lab dental order intake & billing-ready platform — React + TypeScript + MUI + Supabase.

## Status

- ✅ Phase 1: Auth, roles, permissions
- ✅ Phase 2: Doctor profile & work locations
- ✅ Phase 3: Lab registration + admin approval queue
- ✅ Phase 4: Lab services + doctor marketplace + lab public profile
- ✅ Phase 5: Template-based form builder + publish flow
- ✅ Phase 6: Doctor order wizard + portfolio + lab order dashboard + order sheet (file uploads deferred)
- ⏳ Phase 7+ — see [docs/phases.md](docs/phases.md)

## Get started

First-time setup: **[SETUP.md](SETUP.md)** — Supabase project, phase 1–3 schema, first platform admin.

After phases 1–3 are running: **[SETUP-PHASE4-6.md](SETUP-PHASE4-6.md)** — phase 4–6 schema migration and end-to-end smoke test.

Once setup is done:

```powershell
npm install
npm run dev
```

App runs at <http://localhost:5173>.

## Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — master plan
- [docs/database.md](docs/database.md) — full schema, RLS, triggers
- [docs/frontend.md](docs/frontend.md) — frontend architecture
- [docs/phases.md](docs/phases.md) — phase-by-phase deliverables
- [SETUP.md](SETUP.md) — first-run checklist
