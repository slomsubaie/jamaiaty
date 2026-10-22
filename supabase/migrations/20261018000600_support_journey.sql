-- The journey of a support request: every step (requested, accepted, rejected, done,
-- cancelled, ended) with who did it, when and their note. Written by database triggers on
-- every status change, so it can't be skipped, edited or deleted from the apps.

create table public.support_grant_events (
  id bigint generated always as identity primary key,
  grant_id uuid not null references public.support_grants (id) on delete cascade,
  association_id uuid not null,
  event text not null check (event in ('requested', 'approved', 'rejected', 'completed', 'cancelled', 'revoked')),
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index on public.support_grant_events (grant_id, created_at);

alter table public.support_grant_events enable row level security;
create policy "support_events_select" on public.support_grant_events for select to authenticated using (
  public.is_superadmin() or public.has_permission(association_id, 'approve_support_access')
);
-- No insert/update/delete policies: only the triggers below write here.
grant select on public.support_grant_events to authenticated;
grant select, insert, delete on public.support_grant_events to service_role;

-- Names on the journey are visible to whoever can see the request.
create policy "profiles_select_support_actors" on public.profiles for select to authenticated using (
  exists (
    select 1 from public.support_grant_events e
    where e.actor_id = profiles.id
      and (public.is_superadmin() or public.has_permission(e.association_id, 'approve_support_access'))
  )
);

-- Note for the current status change, passed by act_on_support_request() for this transaction.
create function public.support_note()
returns text language sql stable set search_path = '' as $$
  select nullif(btrim(current_setting('jamaiah.support_note', true)), '');
$$;

create function public.log_support_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.support_grant_events (grant_id, association_id, event, actor_id, note)
    values (new.id, new.association_id, 'requested', new.requested_by, new.reason);
  elsif new.status is distinct from old.status then
    insert into public.support_grant_events (grant_id, association_id, event, actor_id, note)
    values (
      new.id, new.association_id,
      case
        when new.status = 'revoked' and old.status = 'pending' then 'cancelled'
        else new.status::text
      end,
      (select auth.uid()),
      public.support_note()
    );
  end if;
  return null;
end;
$$;

create trigger support_grants_journey
  after insert or update of status on public.support_grants
  for each row execute function public.log_support_event();

-- Status rules (replaces the previous version):
--   pending  → approved / rejected   by the platform (superadmin); rejecting needs a note
--   pending  → revoked (cancel)      by the association that asked
--   approved → completed (done)      by the platform, with a note; access ends now
--   approved → revoked (end access)  by either side
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
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    if not service and not (
      (old.direction = 'platform_request' and association_side)
      or (old.direction = 'association_request' and platform_side)
    ) then
      raise exception 'only the other side can accept or reject this request' using errcode = '42501';
    end if;
    if new.status = 'rejected' and not service and public.support_note() is null then
      raise exception 'a reason is required to reject a request' using errcode = '23514';
    end if;
    new.decided_by := (select auth.uid());
    new.decided_at := now();
    if new.status = 'approved' then
      -- The countdown starts now, for the duration the association asked for.
      new.expires_at := now() + make_interval(hours => new.duration_hours);
    end if;
  elsif old.status = 'pending' and new.status = 'revoked' then
    if not service and not (
      (old.direction = 'platform_request' and platform_side)
      or (old.direction = 'association_request' and association_side)
    ) then
      raise exception 'only the requester can cancel a pending request' using errcode = '42501';
    end if;
    new.expires_at := now();
  elsif old.status = 'approved' and new.status = 'completed' then
    if not service and not platform_side then
      raise exception 'only the platform can mark a request as done' using errcode = '42501';
    end if;
    if not service and public.support_note() is null then
      raise exception 'a note is required to mark a request as done' using errcode = '23514';
    end if;
    new.expires_at := least(coalesce(old.expires_at, now()), now());
  elsif old.status = 'approved' and new.status = 'revoked' then
    new.expires_at := least(coalesce(old.expires_at, now()), now());
  else
    raise exception 'invalid support grant transition % -> %', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Status change with an optional note (required for reject and done).
-- SECURITY INVOKER: row-level security and the guard above decide who may do what.
create function public.act_on_support_request(p_grant uuid, p_action text, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  target public.support_grant_status;
begin
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  target := case p_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'complete' then 'completed'
    when 'cancel' then 'revoked'
    when 'end' then 'revoked'
  end;
  if target is null then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  perform set_config('jamaiah.support_note', coalesce(p_note, ''), true);
  update public.support_grants set status = target where id = p_grant;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('jamaiah.support_note', '', true);
end;
$$;

grant execute on function public.act_on_support_request(uuid, text, text) to authenticated;
revoke execute on function public.act_on_support_request(uuid, text, text) from public, anon;

-- Journey for requests that existed before this change.
insert into public.support_grant_events (grant_id, association_id, event, actor_id, note, created_at)
select id, association_id, 'requested', requested_by, reason, created_at from public.support_grants;
insert into public.support_grant_events (grant_id, association_id, event, actor_id, created_at)
select id, association_id,
       case when status = 'revoked' and decided_at is null then 'cancelled' else status::text end,
       decided_by, coalesce(decided_at, created_at)
from public.support_grants where status <> 'pending';
