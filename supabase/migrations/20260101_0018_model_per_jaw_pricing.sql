-- ============================================================================
-- 0018 — Model printing: per-jaw pricing (server-side parity helper)
-- ----------------------------------------------------------------------------
-- The Model printing form (template MODEL and its twin TITANIUM_MILLING) now
-- prices per jaw-model: the arch answer drives quantity (UPPER = 1, LOWER = 1,
-- BOTH = 2) times a single `model_per_jaw_price`. The client computes this in
-- src/utils/pricing.ts (calculatePrice, MODEL branch).
--
-- ⚠️ IMPORTANT — read before assuming this changes anything:
-- This repo does NOT recompute order prices on the server. submit_order /
-- _submit_order_impl / edit_order all STORE the client-supplied
-- `p_generated_total` verbatim as orders.generated_total; the amount actually
-- billed is the lab's later `final_total`. There is no server pricing function
-- to "add a MODEL case" to — nothing recomputes CnB, SG, implants, etc. either.
--
-- So this migration is deliberately behavior-neutral. It only installs a
-- documented helper that mirrors the client MODEL math, ready to wire in IF the
-- owner ever decides to enforce price parity server-side. Nothing calls it yet,
-- so applying this file changes no order, no total, no policy.
--
-- Idempotent: safe to run repeatedly (create or replace).
-- ============================================================================

-- Per-jaw Model subtotal, mirroring calculatePrice's MODEL branch exactly:
--   qty  = (arch = 'BOTH') ? 2 : (arch in ('UPPER','LOWER')) ? 1 : 0
--   unit = pricing.model_per_jaw_price (0 if absent)
--   subtotal = unit * qty
-- Detects a per-jaw Model config the same way the client does — by the presence
-- of `model_per_jaw_price` — so it stays template-code-free.
create or replace function public.model_per_jaw_subtotal(
  p_pricing jsonb,
  p_answers jsonb
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_pricing ? 'model_per_jaw_price' then
      coalesce((p_pricing ->> 'model_per_jaw_price')::numeric, 0)
      * case (p_answers ->> 'arch')
          when 'BOTH' then 2
          when 'UPPER' then 1
          when 'LOWER' then 1
          else 0
        end
    else 0
  end;
$$;

comment on function public.model_per_jaw_subtotal(jsonb, jsonb) is
  'Per-jaw Model price parity helper (arch → qty, BOTH = 2). Mirrors the client '
  'calculatePrice MODEL branch. Not wired into submit_order/edit_order — the app '
  'trusts the client generated_total. Provided for optional future parity checks.';

-- Not exposed to clients — it is an internal parity utility, not an app RPC.
-- (Supabase grants EXECUTE to anon/authenticated by default, so revoke broadly.)
revoke all on function public.model_per_jaw_subtotal(jsonb, jsonb)
  from public, anon, authenticated;

-- To enforce parity later, the owner would call this inside _submit_order_impl /
-- edit_order and compare/replace p_generated_total for Model orders, e.g.:
--
--   if v_template_code in ('MODEL','TITANIUM_MILLING') then
--     p_generated_total := public.model_per_jaw_subtotal(v_pricing_json, p_answers)
--                          + <rush>;
--   end if;
--
-- Left commented on purpose — wiring it in is a separate, deliberate decision.
