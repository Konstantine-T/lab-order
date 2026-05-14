# Phase 4–6 Setup

What landed: lab service catalog, doctor marketplace + lab public profile, template-based form builder, end-to-end order creation wizard, doctor portfolio, lab order dashboard + order sheet.

Prerequisites: phases 1–3 already running ([SETUP.md](SETUP.md)).

Follow the steps in order.

---

## Part A — Database

### 1. Run the schema migration
1. Open Supabase **SQL Editor** → **+ New query**.
2. Paste the entire contents of [`supabase/phase4-6.sql`](supabase/phase4-6.sql).
3. Click **Run**. Should finish in a few seconds with `Success. No rows returned`.

The script is idempotent — safe to re-run.

### 2. Verify
Run in SQL Editor:
```sql
-- Tables
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'platform_form_templates','platform_template_fields',
    'lab_services','lab_forms','lab_form_versions',
    'patients','patient_cases',
    'orders','order_answers','order_files'
  );

-- Should return 10 rows.

-- Templates were seeded
select code, name from public.platform_form_templates order by code;
-- Should return 8 rows: ZIRCONIA_CROWN, TEMPORARY_CROWN, ZIRCONIA_ON_IMPLANT, …

-- RPCs are registered
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('submit_order','find_matching_patient','publish_lab_form');
-- Should return 3 rows.

-- Storage bucket exists
select id, name, public, file_size_limit from storage.buckets where id = 'order-files';
```

### 3. Storage bucket sanity check
The migration creates the `order-files` bucket but file uploads aren't wired into the UI yet (deferred to a later phase — see "Out of scope" below). The bucket and policies are in place so we don't have to revisit storage when we add the upload UI.

---

## Part B — App

### 4. Install + run
The frontend gained no new dependencies. Just run:
```powershell
npm run dev
```

If you want a clean slate after editing migrations:
```powershell
npm install
npm run dev
```

---

## Part C — Smoke test (manual, end-to-end)

This walks through the full new flow with three accounts you set up in phases 1–3.

### 5. As the lab admin

#### Create a service
1. Sign in as the lab account.
2. Open **Services** in the sidebar.
3. Click **Add service**.
4. Fill: name = "Zirconia Crown", short description = something, average turnaround = 7, phase = Standalone, leave linked form blank for now, **Active** on. **Save**.

#### Create + publish a form
1. Open **Forms** → **Create form**.
2. Step 1: pick **Zirconia Crown** template → Next.
3. Step 2: title = "Zirconia Crown order form", linked service = the service you just created → **Create**.
4. You're dropped into the form editor in **DRAFT**.
5. **Fields** tab: turn off any fields you don't want. Mark `teeth` and `shade` as required.
6. **Pricing** tab: model = Unit price × tooth count, unit price = 120, count field = `teeth` (auto-selected), rush = None.
7. **Preview** tab: confirm the form renders and the price breakdown shows GEL 0 with no teeth selected.
8. Click **Publish** → confirm. Status flips to **PUBLISHED**.

#### Link the form back to the service
1. Back to **Services**. Edit the Zirconia Crown service.
2. **Linked order form** dropdown — pick the form you just published. Save.

### 6. As the doctor

#### See the marketplace
1. Sign in as the doctor.
2. Open **Labs** in the sidebar — you should see the lab card.
3. Click it → lab public profile shows the Zirconia Crown service with an **Order** button (enabled because the form is published).

#### Place an order
1. Click **Order**. You're dropped into the **New order** wizard with the lab + service preselected.
2. **Patient**: enter first name, last name, DOB → Next.
3. **Lab & service**: confirm both selected → Next.
4. **Order form**: select 4 teeth on the tooth map (e.g. 11, 12, 21, 22), pick a shade. Watch the price breakdown update to **GEL 480** (4 × 120). → Next.
5. **Files & due date**: pick a work location, pick a due date a week out, leave Rush at None. → Next.
6. **Review & submit**: invoice = "Invoice me (doctor)". Click **Submit order**.
7. Success screen → **View details** → you land on `/doctor/orders/<id>`.
8. Click back → go to **Orders** list. Your order is there with status SUBMITTED, total GEL 480.

### 7. Back as the lab

1. Sign in as the lab.
2. Dashboard shows **Open orders: 1**.
3. **Orders** in sidebar → see the new order in the table.
4. Click the row → order sheet.
5. Read-only: tooth map with the 4 teeth selected, shade, price breakdown.
6. **Actions** card:
   - Click **RECEIVED** → status moves to RECEIVED.
   - Click **IN PROGRESS** → status moves.
   - Set final price = `500` → click **Set final price**. Final total replaces the estimated total in the breakdown.
   - Set confirmed due date → click **Confirm due date**.
   - Click **READY FOR DELIVERY** → click **SENT TO CLINIC**.

### 8. Back as the doctor

1. Open the order detail. The lab's status changes are visible.
2. Final total = GEL 500 in the price breakdown.

If all of that worked, phases 4–6 are done.

---

## Part D — What's intentionally not built (yet)

These are deliberately deferred and tracked in [docs/phases.md](docs/phases.md):

| Feature | Phase | Why deferred |
|---|---|---|
| File uploads in the order wizard | 6 | Storage bucket + policies are wired; UI component is the only missing piece. Will add in a small follow-up. |
| Continuation / patient-history orders | 6/11 | Schema supports `parent_order_id` and `patient_case_id`. UI wiring deferred. |
| Material modifiers (per-material delta on top of unit price) | 7 | Pricing model `MATERIAL_MODIFIER` exists in DB; UI uses unit price for now. |
| Order chat | 9 | Separate phase. |
| Try-in feedback / receipt confirmation | 11 | Status transitions exist (`TRY_IN_PHASE`, `RECEIVED_BY_CLINIC`). UI for explicit feedback comes next. |
| Invoices, payments, debt | 10 | Big enough to be its own phase. |
| Reviews, clinic admin, platform billing | 12-14 | Later phases per PRD. |

If anything in the smoke test doesn't behave the way the doc says, that's a real bug — paste back what you see.

---

## Part E — Common issues

**"permission denied for table X" when loading a page after the migration**
Re-run the GRANT block — it's at section 7 of `phase4-6.sql`. Should be applied automatically by running the script once, but if you only ran a portion, paste the full thing.

**Doctor sees empty marketplace even though a lab is approved**
Make sure the lab has at least one **active** service AND that service is linked to a **published** form. The "Order" button is greyed out until both are true; the lab card itself should still show.

**`lab_form_versions rows are immutable`**
Expected — the trigger blocks updating an existing version. The save logic creates a new version row. If you see this in the console, it's because you're trying to update directly via the table editor; use the form editor or the `publish_lab_form` RPC instead.

**`Form version not found or not published`**
The wizard reached step 3 with a service whose linked form isn't in `PUBLISHED` status. Go back to the lab, publish the form, then retry.

**Patient match dialog doesn't appear**
It only fires when first name + last name + date of birth are all set. Empty DOB skips the check. If you want to test it, register two patients with the same name + DOB.

---

## Part F — Resetting between tests

If you want to clear all orders without losing your accounts/labs/services:
```sql
truncate public.order_answers, public.order_files, public.orders restart identity cascade;
truncate public.patients restart identity cascade;
```

If you want to also clear forms/services:
```sql
truncate public.lab_form_versions, public.lab_forms restart identity cascade;
truncate public.lab_services restart identity cascade;
```

(The 8 platform templates are seeded in the migration and won't be touched.)
