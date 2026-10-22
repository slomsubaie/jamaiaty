-- 1) Acting role: a person with several roles picks one in the app, which sends it as the
--    `x-acting-role` request header: 'superadmin' or '<role>:<association_id>'.
--    It can only narrow privileges to a role the person really holds, never widen them.
--    No header = all of the person's roles combined (scripts, older app versions).
-- 2) Two-way support requests: the platform asks an association for access (the association
--    decides), or an association asks the platform for help (the superadmin decides).

------------------------------------------------------------------------------
-- Acting role helpers
------------------------------------------------------------------------------
create function public.acting_role()
returns text language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-acting-role', '');
$$;

create function public.acting_kind()
returns text language sql stable set search_path = '' as $$
  select split_part(public.acting_role(), ':', 1);
$$;

create function public.acting_association()
returns uuid language sql stable set search_path = '' as $$
  select case when split_part(public.acting_role(), ':', 2) ~ '^[0-9a-fA-F-]{36}$'
              then split_part(public.acting_role(), ':', 2)::uuid end;
$$;

-- Whether a membership row counts under the current acting role.
create function public.role_counts(a uuid, r public.member_role)
returns boolean language sql stable set search_path = '' as $$
  select case
    when public.acting_role() is null then true
    when public.acting_kind() = 'superadmin' then false            -- platform mode: no member powers
    when public.acting_association() is distinct from a then true  -- other associations unaffected
    else r::text = public.acting_kind()
  end;
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_superadmin from public.profiles where id = (select auth.uid())), false)
     and (public.acting_role() is null or public.acting_kind() = 'superadmin');
$$;

create or replace function public.member_role(a uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where association_id = a and user_id = (select auth.uid()) and active and public.role_counts(a, role)
  order by case role when 'president' then 1 when 'board_member' then 2 else 3 end
  limit 1;
$$;

create or replace function public.has_permission(a uuid, perm public.board_permission)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where association_id = a and user_id = (select auth.uid()) and active and public.role_counts(a, role)
      and (role = 'president' or (role = 'board_member' and perm = any (permissions)))
  );
$$;

create or replace function public.owns_unit(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.acting_kind(), '') <> 'superadmin' and exists (
    select 1 from public.unit_ownerships
    where unit_id = u and user_id = (select auth.uid()) and end_date is null
  );
$$;

grant execute on function public.acting_role(), public.acting_kind(), public.acting_association(),
  public.role_counts(uuid, public.member_role) to authenticated, service_role;

------------------------------------------------------------------------------
-- Two-way support requests
------------------------------------------------------------------------------
alter table public.support_grants
  add column direction text not null default 'platform_request'
    check (direction in ('platform_request', 'association_request'));

comment on column public.support_grants.direction is
  'platform_request: the superadmin asked, the association decides. association_request: the association asked for help, the superadmin decides.';

-- Every request starts pending and must be accepted by the other side.
create or replace function public.prepare_support_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    new.requested_by := (select auth.uid());
    new.direction := case when public.is_superadmin() then 'platform_request' else 'association_request' end;
  end if;
  new.status := 'pending';
  new.expires_at := null;
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

create or replace function public.guard_support_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  platform_side boolean := public.is_superadmin();
  association_side boolean := public.has_permission(new.association_id, 'approve_support_access');
  service boolean := (select auth.uid()) is null;
begin
  if new.association_id <> old.association_id or new.sections <> old.sections
     or new.can_edit <> old.can_edit or new.duration_hours <> old.duration_hours
     or new.reason <> old.reason or new.requested_by is distinct from old.requested_by
     or new.direction <> old.direction then
    raise exception 'support grant details cannot be changed' using errcode = '42501';
  end if;
  if new.status <> old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      -- Only the side that did NOT ask may accept or reject.
      if not service and not (
        (old.direction = 'platform_request' and association_side)
        or (old.direction = 'association_request' and platform_side)
      ) then
        raise exception 'only the other side can accept or reject this request' using errcode = '42501';
      end if;
    elsif old.status = 'pending' and new.status = 'revoked' then
      -- The side that asked may cancel its own pending request.
      if not service and not (
        (old.direction = 'platform_request' and platform_side)
        or (old.direction = 'association_request' and association_side)
      ) then
        raise exception 'only the requester can cancel a pending request' using errcode = '42501';
      end if;
    elsif old.status = 'approved' and new.status = 'revoked' then
      null; -- either side may end active access
    else
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

drop policy "support_grants_insert" on public.support_grants;
drop policy "support_grants_decide" on public.support_grants;

create policy "support_grants_insert" on public.support_grants for insert to authenticated with check (
  public.is_superadmin() or public.has_permission(association_id, 'approve_support_access')
);
create policy "support_grants_update" on public.support_grants for update to authenticated
  using (public.is_superadmin() or public.has_permission(association_id, 'approve_support_access'))
  with check (public.is_superadmin() or public.has_permission(association_id, 'approve_support_access'));

-- Names on requests: superadmins see who asked from an association; association approvers
-- see which platform admin asked them.
create policy "profiles_select_support_parties" on public.profiles for select to authenticated using (
  exists (
    select 1 from public.support_grants g
    where (g.requested_by = profiles.id or g.decided_by = profiles.id)
      and (public.is_superadmin() or public.has_permission(g.association_id, 'approve_support_access'))
  )
);
