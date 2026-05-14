-- Fix the circular FK between lab_services and lab_forms so a service can be
-- deleted (the linked form becomes orphaned but its versions are preserved
-- because orders reference them).

alter table public.lab_forms
  drop constraint if exists lab_forms_service_id_fkey;
alter table public.lab_forms
  add constraint lab_forms_service_id_fkey
    foreign key (service_id) references public.lab_services(id) on delete set null;

alter table public.lab_services
  drop constraint if exists lab_services_linked_form_fk;
alter table public.lab_services
  add constraint lab_services_linked_form_fk
    foreign key (linked_lab_form_id) references public.lab_forms(id) on delete set null;

-- Allow deleting a service even when historical orders reference it. The
-- order's service_snapshot JSONB carries the name/details for history; the
-- live FK becomes NULL so the row stays intact and the lab keeps the audit
-- trail. The column must also become nullable for the SET NULL action to
-- actually succeed (otherwise it hits a NOT NULL violation = 400).
alter table public.orders
  alter column lab_service_id drop not null;

alter table public.orders
  drop constraint if exists orders_lab_service_id_fkey;
alter table public.orders
  add constraint orders_lab_service_id_fkey
    foreign key (lab_service_id) references public.lab_services(id) on delete set null;
