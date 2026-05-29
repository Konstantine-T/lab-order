-- One draft per doctor, Supabase-backed. Replaces the old localStorage approach.

create table if not exists public.order_drafts (
  doctor_id    uuid primary key references public.doctor_profiles(id) on delete cascade,
  state_json   jsonb not null,
  step         int not null default 0,
  lab_name     text not null default '',
  service_name text not null default '',
  updated_at   timestamptz not null default now()
);

drop trigger if exists order_drafts_set_updated_at on public.order_drafts;
create trigger order_drafts_set_updated_at
  before update on public.order_drafts
  for each row execute function public.tg_set_updated_at();

alter table public.order_drafts enable row level security;

drop policy if exists order_drafts_doctor_all on public.order_drafts;
create policy order_drafts_doctor_all on public.order_drafts
  for all to authenticated
  using  (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

grant select, insert, update, delete on public.order_drafts to authenticated;
