-- Enums (Phase 1–3 subset). Add more in later phases.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('DOCTOR', 'LAB_MAIN_ADMIN', 'PLATFORM_ADMIN', 'CLINIC_ADMIN');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('ACTIVE', 'SUSPENDED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'lab_approval_status') then
    create type public.lab_approval_status as enum (
      'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED_ACTIVE', 'REJECTED', 'SUSPENDED'
    );
  end if;
end $$;
