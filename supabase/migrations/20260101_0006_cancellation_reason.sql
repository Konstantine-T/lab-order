-- Add cancellation_reason to orders (idempotent).
alter table public.orders add column if not exists cancellation_reason text;
