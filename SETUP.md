# Setup — run this once before `npm run dev`

This walks you through Supabase setup for Phases 1–3 (auth, doctor profile + work locations, lab onboarding + admin approval).

Follow each step in order. Don't skip.

---

## Part A — Supabase project

### 1. Create the project
1. Go to <https://supabase.com> → **Sign in** → **New project**.
2. Name: `lab-order-dev` (you can create staging/prod later — start with dev).
3. Pick a strong DB password and **store it somewhere safe** — you won't need it for the app, but you may need it later.
4. Region: pick the closest to your users.
5. Wait until the project is fully provisioned (≈2 minutes).

### 2. Get the URL + anon key
1. In the Supabase dashboard, open **Project Settings → API**.
2. Copy these two values:
   - **Project URL** → goes into `VITE_SUPABASE_URL`.
   - **anon public** key → goes into `VITE_SUPABASE_ANON_KEY`.
3. In the project root (this folder), create a file called `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
   (`.env.example` is a reference — `.env` is gitignored, never commit it.)

### 3. Configure Auth — disable email confirmation for dev
For local development we want users to be able to log in immediately after registering.

1. Open **Authentication → Providers → Email** in the dashboard.
2. **Turn OFF** "Confirm email" (toggle it off).
3. **Save**.

> When you go to production you should turn this back on. For now, keep it off so you can register and immediately sign in.

### 4. Configure password reset redirect
1. **Authentication → URL Configuration**.
2. **Site URL**: `http://localhost:5173`
3. **Redirect URLs**: add `http://localhost:5173/reset-password`
4. **Save**.

---

## Part B — Run the schema migration

### 5. Open the SQL editor
1. In the Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **+ New query**.

### 6. Paste and run the schema
1. Open the file [`supabase/all-in-one.sql`](supabase/all-in-one.sql) from this repo.
2. Copy its **entire** contents.
3. Paste into the Supabase SQL Editor.
4. Click **Run** (bottom right).
5. You should see `Success. No rows returned`.

> The script is **idempotent** — safe to re-run. It uses `if not exists` and `drop policy if exists` everywhere.

### 7. Verify
Run this in the SQL Editor:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('users','doctor_profiles','doctor_work_locations','labs');
```
You should see 4 rows.

---

## Part C — Create your first Platform Admin

The system has no platform admins by default. Create one now:

### 8. Register a normal account first
1. Run the app (Part D below) and visit `/register/doctor`.
2. Register with the email you want as admin (e.g. `admin@yourcompany.com`).
3. Sign in to confirm the registration worked. (You'll be redirected to `/doctor`.)

### 9. Promote that user to PLATFORM_ADMIN
1. Back to the Supabase **SQL Editor**.
2. Open [`supabase/seed_admin.sql`](supabase/seed_admin.sql) and paste it.
3. Replace `YOUR_ADMIN_EMAIL_HERE@example.com` with the email you just registered (in **both** places).
4. Click **Run**. You should see one row with `role = 'PLATFORM_ADMIN'`.
5. **Sign out** in the app, then **sign in again** with that email.
6. You should now land on `/admin`.

> Anyone with this account can now approve labs.

---

## Part D — Run the app

### 10. Install + start
From this folder:
```powershell
npm install
npm run dev
```
Open <http://localhost:5173>.

---

## Part E — Smoke test the three phases

Run through these in order to verify everything wired up:

### Phase 1 — Auth & roles
- [ ] `/register/doctor` — register a doctor account → land on `/doctor`.
- [ ] Sign out → `/register/lab` — register a lab account → land on `/lab`.
- [ ] Sign out → log in as the **platform admin** → land on `/admin`.
- [ ] As doctor, try to visit `/admin` directly → redirected to `/forbidden`. ✅

### Phase 2 — Doctor profile + work locations
- [ ] Sign in as the doctor.
- [ ] Visit `/doctor/profile` — fill specialty + license, change language + theme, **Save**.
- [ ] Visit `/doctor/work-locations` — add a clinic, mark it default. Add a second one and toggle the default star.
- [ ] Archive one — confirm it disappears from the list.

### Phase 3 — Lab onboarding + admin approval
- [ ] Sign in as the lab account.
- [ ] You should see a **yellow "Pending approval" banner** on `/lab`.
- [ ] Go to `/lab/profile` — fill **all** legal/billing fields — **Save**.
- [ ] Sign out, sign in as the **platform admin**.
- [ ] On `/admin`, the pending count card should show **1**.
- [ ] Click → `/admin/labs` — see the lab in the queue → click the row.
- [ ] Click **Request changes**, write a note, send it.
- [ ] Sign in as the lab — banner now says "Changes requested" with your note.
- [ ] Edit something on `/lab/profile` and click **Submit for approval** → banner returns to "Pending approval".
- [ ] Sign in as admin → click **Approve** on that lab.
- [ ] Sign in as the lab — the banner disappears (replaced by an "Approved" status).

If all of those work end-to-end, Phases 1–3 are done.

---

## Common issues

**"Invalid email or password" right after registration**
→ You forgot Part A step 3 (disable email confirmation). Open Auth → Providers → Email → turn off "Confirm email". Then reset the user password from Auth → Users, or just register again.

**`Only platform admins can change approval_status`**
→ The lab's frontend is trying to set a status it shouldn't. Make sure you're signed in as PLATFORM_ADMIN when approving.

**Doctor sees admin banner / lab dashboard**
→ Auth metadata didn't get attached at signup. Check the Auth → Users record's "User Metadata" includes `role`. If the row in `public.users` has the wrong `role`, fix it manually with `update public.users set role = 'DOCTOR' where email = '...'`.

**Empty list on `/admin/labs`**
→ Make sure you're signed in as `PLATFORM_ADMIN` (the role on `public.users`, not just `auth.users`). Check with:
```sql
select role from public.users where email = 'YOUR_EMAIL';
```

**Reset everything and start fresh**
1. **Authentication → Users**: select all users → **Delete**.
2. SQL Editor: `truncate public.labs, public.doctor_work_locations, public.doctor_profiles, public.users restart identity cascade;`
3. Re-run from Step 8.

---

## What's next (later phases)

- **Phase 4**: Lab public profile + service cards (doctor marketplace).
- **Phase 5**: Template-based form builder (8 platform templates).
- **Phase 6**: Doctor order creation flow.

These will require more migrations. When the time comes, generate types from your live schema:
```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase gen types typescript --linked > src/types/database.ts
```
This replaces the hand-written shim in `src/types/database.ts` with autogenerated types covering every table.
