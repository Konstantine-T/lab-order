# Session Handoff — 2026-07-16

> Context for the next Claude Code session. If you're a fresh session, **read this first**, then `docs/ARCHITECTURE.md` for the codebase map.

## Project
**lab-order** — multi-lab dental order intake & billing SPA (React 18 + TS + Vite + MUI + Supabase, i18n en/ka/ru). No server layer; the browser talks directly to Supabase with the anon key, and **RLS + SECURITY DEFINER triggers are the only authorization boundary.**

### How to run
- Deps installed. `.env` has the Supabase URL + anon key (gitignored).
- `npm run dev` → app on **http://localhost:5174** (port 5173 is taken by an unrelated local app "Statue GLB Lab"). Log in at `/login`.
- Supabase project: **lab-order-dev** (org Dentalmall), ref `zukelhnhdaoiufzkkjmm`. The schema is already applied to this project. DDL is run manually via the dashboard **SQL Editor** (the `window.monaco` editor model can be set programmatically; only the `postgres` role can run DDL — the anon key cannot).
- Verify commands: `npm run typecheck` (clean), `npm run i18n:check` (**pre-existing red** in `doctor`/`lab` namespaces — RU plural false-positives + real en gaps; NOT from this session's work).

## What this session did
1. **Set up & started** the project (install, typecheck, `.env`, dev server) and verified the app renders + Supabase connects.
2. **Investigated the codebase** with a multi-agent workflow → wrote **`docs/ARCHITECTURE.md`** (9-section architecture brief). Read it to onboard fast.
3. **Built clinic self-registration** (user chose "Option A: self-registration", mirroring doctor/lab — NOT the Phase-13 admin-provisioned `clinic_admin_scopes` design in the docs). See file list below.
4. **Applied the clinic DB migration** live to Supabase (clinics table + RLS + trigger extension). Verified: table exists, RLS on, 4 policies.
5. **Ran a swarm review** of the feature (41 agents) → found a **CRITICAL** vuln.
6. **Fixed the critical vuln + quick wins**, applied to code AND live DB, and verified with a real attack test.

## ⚠️ Security fix applied this session (IMPORTANT — verify it stays fixed)
**Client-supplied `role` privilege escalation.** `handle_new_user()` read `role` from client signup metadata with no allow-list — anyone could `signUp({ data: { role: 'PLATFORM_ADMIN' } })` and take over. **Fixed** by adding an allow-list guard (only `DOCTOR`/`LAB_MAIN_ADMIN`/`CLINIC_ADMIN` self-registerable; else `raise exception`).
- Applied in code to **both** `supabase/migrations/20260101_0003_triggers.sql` and `20260101_0011_clinics.sql` (the function is redefined in both — **keep the guard in sync**).
- **Applied to the live DB** and verified: a `PLATFORM_ADMIN` signup now returns HTTP 500 "Database error saving new user", 0 rows created, still only 1 legit admin.
- `PLATFORM_ADMIN` must only be granted out-of-band (SQL / service role).

## Current working-tree state (NOTHING COMMITTED)
Branch `main`, last commit `3f7325f`. All changes are uncommitted:

**New files:** `supabase/migrations/20260101_0011_clinics.sql`, `src/pages/public/ClinicRegisterPage.tsx`, `src/locales/{en,ka,ru}/clinic.json`, `docs/ARCHITECTURE.md`, `SESSION-HANDOFF.md`
**Modified:** `src/auth/AuthProvider.tsx` (loads clinic row), `src/routes.tsx` (`/register/clinic`), `src/pages/public/LoginPage.tsx` (register button), `src/types/database.ts` (`ClinicRow`), `src/i18n/index.ts` (clinic namespace), `src/locales/{en,ka,ru}/auth.json` (clinic + success copy), `src/pages/clinic/ClinicHomePage.tsx` (localized), `supabase/migrations/20260101_0003_triggers.sql` (security guard)

## Next steps (TODO)
1. **Positive live signup test** — register a real clinic through the UI (`/register/clinic`), confirm `users`+`clinics` rows are created and it lands on `/clinic`. (Only remaining unverified path; needs a real password so the human should do it.)
2. **Commit** the feature + security fix (suggest a branch, not main). User hadn't decided yet.
3. **Remaining swarm findings** (all LOW/NIT, deferred): #3 no clinic profile page (legal/contact columns unfillable — or soften the register `infoNote`), #4 Zod validation errors untranslated in ka/ru, #5 `/register/clinic` reachable while logged in (no redirect guard like LoginPage), #7 `ClinicLayout` nav hardcoded English, #9 `current_user_owns_clinic()` is dead code, #10 no in-app clinic deletion, #11 no admin UI for clinics. Full report was in the swarm output.

## Gotchas
- `handle_new_user()` and (per ARCHITECTURE.md §8) `submit_order` are each defined in multiple SQL files — edits must stay in sync; the highest-numbered migration wins at runtime.
- The dev server, when started by the agent as a background task, gets reaped between turns in this environment — run `npm run dev` in your own terminal for a persistent server.
- The SETUP docs don't fully capture schema provisioning (see ARCHITECTURE.md §8 #1).
