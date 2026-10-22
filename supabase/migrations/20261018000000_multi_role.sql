-- Multiple roles per person per association: e.g. the president is usually also an owner.
-- Each role is its own membership row; a person can't be both president and board member
-- (the president already holds every board power).

alter table public.memberships drop constraint memberships_association_id_user_id_key;
alter table public.memberships add constraint memberships_association_user_role_key unique (association_id, user_id, role);

-- Highest active role: president > board_member > owner.
create or replace function public.member_role(a uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where association_id = a and user_id = (select auth.uid()) and active
  order by case role when 'president' then 1 when 'board_member' then 2 else 3 end
  limit 1;
$$;

create function public.guard_membership_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active and new.role in ('president', 'board_member') and exists (
    select 1 from public.memberships
    where association_id = new.association_id and user_id = new.user_id and active and id <> new.id
      and role in ('president', 'board_member') and role <> new.role
  ) then
    raise exception 'a president cannot also be a board member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger memberships_guard_roles
  before insert or update on public.memberships
  for each row execute function public.guard_membership_roles();

-- Superadmin management: only a superadmin may grant or revoke it, and the platform must
-- always keep at least one. Called by the manage-superadmin Edge Function (service role)
-- after it has checked the caller; also guarded here for direct calls.
create function public.set_superadmin(target uuid, grant_it boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_superadmin() then
    raise exception 'only a superadmin can manage superadmins' using errcode = '42501';
  end if;
  if not grant_it and (select count(*) from public.profiles where is_superadmin and id <> target) = 0 then
    raise exception 'the platform must keep at least one superadmin' using errcode = '23514';
  end if;
  update public.profiles set is_superadmin = grant_it where id = target;
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values ((select auth.uid()), case when grant_it then 'grant_superadmin' else 'revoke_superadmin' end, 'profiles', target, '{}');
end;
$$;

grant execute on function public.set_superadmin(uuid, boolean) to authenticated, service_role;
revoke execute on function public.set_superadmin(uuid, boolean) from public, anon;

-- Superadmins can see each other's profiles (for the superadmin list).
create policy "profiles_select_superadmins" on public.profiles for select to authenticated
  using (is_superadmin and public.is_superadmin());
