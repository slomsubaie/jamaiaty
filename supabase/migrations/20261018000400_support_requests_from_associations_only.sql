-- Support requests go one way: the association (president, or a board member with the
-- support permission) asks the platform for help, and a superadmin accepts or rejects.
-- Superadmins can no longer create requests themselves.

drop policy "support_grants_insert" on public.support_grants;
create policy "support_grants_insert" on public.support_grants for insert to authenticated with check (
  public.has_permission(association_id, 'approve_support_access')
);

-- New requests are always from the association.
create or replace function public.prepare_support_grant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    new.requested_by := (select auth.uid());
  end if;
  new.direction := 'association_request';
  new.status := 'pending';
  new.expires_at := null;
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

-- Requests from the old two-way flow still awaiting the association are closed.
update public.support_grants set status = 'rejected', decided_at = now()
where direction = 'platform_request' and status = 'pending';
