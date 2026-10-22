-- Core multi-tenant schema: profiles, associations, buildings/units, ownerships,
-- per-association memberships, superadmin support grants, audit log.
-- Every table has RLS; access follows the agreed permission matrix (see README).

------------------------------------------------------------------------------
-- Types
------------------------------------------------------------------------------
create type public.member_role as enum ('president', 'board_member', 'owner');

create type public.board_permission as enum (
  'documents',
  'vendors_contracts',
  'finance',
  'owners_units',
  'announcements',
  'approve_support_access'
);

-- Sections a superadmin support grant can cover.
create type public.support_section as enum ('all', 'units', 'members', 'documents', 'vendors', 'finance');

create type public.support_grant_status as enum ('pending', 'approved', 'rejected', 'revoked');

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text unique,                       -- E.164, e.g. +966500000001
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.associations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  mullak_number text,                      -- registration number in REGA's Mullak platform
  plan text not null default 'base' check (plan in ('base', 'premium')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  benchmark_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (association_id, name)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  building_id uuid references public.buildings (id) on delete set null,
  unit_number text not null,
  floor text,
  area_m2 numeric(10, 2),
  mullak_unit_ref text,                    -- unit reference in Mullak
  created_at timestamptz not null default now(),
  unique nulls not distinct (association_id, building_id, unit_number)
);

create table public.unit_ownerships (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  share_pct numeric(5, 2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  start_date date not null default current_date,
  end_date date,                           -- set when the unit is sold; history is kept
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on public.unit_ownerships (user_id) where end_date is null;
create index on public.unit_ownerships (unit_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  permissions public.board_permission[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (association_id, user_id),
  check (role = 'board_member' or cardinality(permissions) = 0)
);
create index on public.memberships (user_id) where active;
-- Exactly one active president per association.
create unique index memberships_one_president
  on public.memberships (association_id) where role = 'president' and active;

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  reason text not null,
  sections public.support_section[] not null default '{all}',
  can_edit boolean not null default false,
  duration_hours int not null default 24 check (duration_hours in (24, 72, 168)),
  status public.support_grant_status not null default 'pending',
  expires_at timestamptz,                  -- set when approved
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.support_grants (association_id, status);

create table public.audit_log (
  id bigint generated always as identity primary key,
  association_id uuid,                     -- no FK: the trail must outlive deleted rows
  actor_id uuid,
  action text not null,                    -- insert | update | delete | support_view | ...
  table_name text,
  record_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (association_id, created_at desc);

------------------------------------------------------------------------------
-- Helper functions used by RLS (security definer avoids policy recursion)
------------------------------------------------------------------------------
create function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_superadmin from public.profiles where id = (select auth.uid())), false);
$$;

create function public.member_role(a uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where association_id = a and user_id = (select auth.uid()) and active;
$$;

create function public.is_member(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.member_role(a) is not null;
$$;

-- President or board member (board members see everything board-visible).
create function public.is_board(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.member_role(a) in ('president', 'board_member');
$$;

-- President always holds every permission; board members only those ticked.
create function public.has_permission(a uuid, perm public.board_permission)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where association_id = a and user_id = (select auth.uid()) and active
      and (role = 'president' or (role = 'board_member' and perm = any (permissions)))
  );
$$;

-- Active, approved, unexpired support grant for the calling superadmin.
create function public.has_support_grant(a uuid, section public.support_section, for_edit boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() and exists (
    select 1 from public.support_grants g
    where g.association_id = a
      and g.status = 'approved'
      and g.expires_at > now()
      and (section = any (g.sections) or 'all' = any (g.sections))
      and (not for_edit or g.can_edit)
  );
$$;

-- Units the caller currently owns (owners see only their own units).
create function public.owns_unit(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.unit_ownerships
    where unit_id = u and user_id = (select auth.uid()) and end_date is null
  );
$$;

------------------------------------------------------------------------------
-- New auth user → profile (phone and name come from the admin createUser call)
------------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (
    new.id,
    case when new.phone is null or new.phone = '' then null else '+' || ltrim(new.phone, '+') end,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Guards
------------------------------------------------------------------------------
-- Only superadmins (or the service role, where auth.uid() is null) may change plan/status.
create function public.guard_association_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_superadmin()
     and (new.plan is distinct from old.plan or new.status is distinct from old.status) then
    raise exception 'only the platform admin can change plan or status' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger associations_guard_admin_fields
  before update on public.associations
  for each row execute function public.guard_association_admin_fields();

-- Approving sets the expiry; only status/decision fields may change after creation.
create function public.guard_support_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.association_id <> old.association_id or new.sections <> old.sections
     or new.can_edit <> old.can_edit or new.duration_hours <> old.duration_hours
     or new.reason <> old.reason or new.requested_by is distinct from old.requested_by then
    raise exception 'support grant details cannot be changed' using errcode = '42501';
  end if;
  if new.status <> old.status then
    if not (old.status = 'pending' and new.status in ('approved', 'rejected'))
       and not (old.status = 'approved' and new.status = 'revoked') then
      raise exception 'invalid support grant transition % -> %', old.status, new.status using errcode = '42501';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
    if new.status = 'approved' then
      new.expires_at := now() + make_interval(hours => new.duration_hours);
    elsif new.status = 'revoked' then
      new.expires_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger support_grants_guard
  before update on public.support_grants
  for each row execute function public.guard_support_grant();

-- A president or delegated board member may also grant access directly (pre-approved).
create function public.prepare_support_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    new.decided_by := (select auth.uid());
    new.decided_at := now();
    new.expires_at := now() + make_interval(hours => new.duration_hours);
  else
    new.status := 'pending';
    new.expires_at := null;
  end if;
  return new;
end;
$$;

create trigger support_grants_prepare
  before insert on public.support_grants
  for each row execute function public.prepare_support_grant();

------------------------------------------------------------------------------
-- Audit trail
------------------------------------------------------------------------------
create function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb;
  changed text[];
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    select array_agg(n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key);
  end if;
  insert into public.audit_log (association_id, actor_id, action, table_name, record_id, details)
  values (
    (case when tg_table_name = 'associations' then rec ->> 'id' else rec ->> 'association_id' end)::uuid,
    (select auth.uid()), lower(tg_op), tg_table_name, (rec ->> 'id')::uuid,
    case when changed is null then '{}'::jsonb else jsonb_build_object('changed', changed) end
  );
  return null;
end;
$$;

create trigger audit after insert or update or delete on public.associations
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.buildings
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.units
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.unit_ownerships
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.memberships
  for each row execute function public.audit_row();
create trigger audit after insert or update on public.support_grants
  for each row execute function public.audit_row();

-- Called by the apps whenever a superadmin opens a page under a support grant.
create function public.log_support_view(a uuid, section public.support_section, page text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_support_grant(a, section) then
    raise exception 'no active support grant' using errcode = '42501';
  end if;
  insert into public.audit_log (association_id, actor_id, action, details)
  values (a, (select auth.uid()), 'support_view', jsonb_build_object('section', section, 'page', page));
end;
$$;

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.associations enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.unit_ownerships enable row level security;
alter table public.memberships enable row level security;
alter table public.support_grants enable row level security;
alter table public.audit_log enable row level security;

-- profiles: yourself; members of associations where you are board; presidents (for the
-- superadmin's association list); everyone in an association under a 'members' support grant.
create policy "profiles_select" on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id and m.active
      and (public.is_board(m.association_id)
           or (m.role = 'president' and public.is_superadmin())
           or public.has_support_grant(m.association_id, 'members'))
  )
);
-- Users may only edit their own name; is_superadmin/phone are not user-editable.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- associations: members see their association; superadmin sees platform metadata of all.
create policy "associations_select" on public.associations for select to authenticated
  using (public.is_member(id) or public.is_superadmin());
create policy "associations_insert" on public.associations for insert to authenticated
  with check (public.is_superadmin());
create policy "associations_update" on public.associations for update to authenticated
  using (public.member_role(id) = 'president' or public.is_superadmin())
  with check (public.member_role(id) = 'president' or public.is_superadmin());

-- buildings & units: board sees all; owners see their own; superadmin only under grant.
create policy "buildings_select" on public.buildings for select to authenticated using (
  public.is_board(association_id)
  or public.has_support_grant(association_id, 'units')
  or exists (select 1 from public.units u where u.building_id = buildings.id and public.owns_unit(u.id))
);
create policy "buildings_write" on public.buildings for all to authenticated
  using (public.has_permission(association_id, 'owners_units') or public.has_support_grant(association_id, 'units', true))
  with check (public.has_permission(association_id, 'owners_units') or public.has_support_grant(association_id, 'units', true));

create policy "units_select" on public.units for select to authenticated using (
  public.is_board(association_id)
  or public.has_support_grant(association_id, 'units')
  or public.owns_unit(id)
);
create policy "units_write" on public.units for all to authenticated
  using (public.has_permission(association_id, 'owners_units') or public.has_support_grant(association_id, 'units', true))
  with check (public.has_permission(association_id, 'owners_units') or public.has_support_grant(association_id, 'units', true));

create policy "ownerships_select" on public.unit_ownerships for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_board(association_id)
  or public.has_support_grant(association_id, 'units')
);
create policy "ownerships_write" on public.unit_ownerships for all to authenticated
  using (public.has_permission(association_id, 'owners_units'))
  with check (public.has_permission(association_id, 'owners_units'));

-- memberships: own rows; board sees all in the association; superadmin sees presidents.
create policy "memberships_select" on public.memberships for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_board(association_id)
  or (role = 'president' and public.is_superadmin())
  or public.has_support_grant(association_id, 'members')
);
-- The president manages board members and owners (presidency transfer is a separate flow).
create policy "memberships_president_write" on public.memberships for all to authenticated
  using (public.member_role(association_id) = 'president' and role <> 'president')
  with check (public.member_role(association_id) = 'president' and role <> 'president');
-- Board members with owners_units manage owners only.
create policy "memberships_board_owners_write" on public.memberships for all to authenticated
  using (public.has_permission(association_id, 'owners_units') and role = 'owner')
  with check (public.has_permission(association_id, 'owners_units') and role = 'owner');

-- support_grants
create policy "support_grants_select" on public.support_grants for select to authenticated using (
  public.has_permission(association_id, 'approve_support_access')
  or public.is_superadmin()
);
-- Superadmin requests (pending); approvers may create an already-approved grant.
create policy "support_grants_insert" on public.support_grants for insert to authenticated with check (
  (public.is_superadmin() and status = 'pending' and requested_by = (select auth.uid()))
  or public.has_permission(association_id, 'approve_support_access')
);
create policy "support_grants_decide" on public.support_grants for update to authenticated
  using (public.has_permission(association_id, 'approve_support_access'))
  with check (public.has_permission(association_id, 'approve_support_access'));

-- audit_log: president sees their association; superadmin sees platform-wide. Inserts only via triggers/functions.
create policy "audit_select" on public.audit_log for select to authenticated using (
  public.member_role(association_id) = 'president' or public.is_superadmin()
);
