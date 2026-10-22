-- Newer Supabase projects don't auto-grant Data API access to new tables, so grant
-- explicitly. RLS policies still decide which rows each user sees; anon gets nothing.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.associations, public.buildings, public.units, public.unit_ownerships,
  public.memberships, public.support_grants
to authenticated, service_role;

-- Profiles: users may read (per RLS) and edit only their own name.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- Audit log is written by triggers/functions; readable per RLS.
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;

grant execute on function
  public.is_superadmin(), public.member_role(uuid), public.is_member(uuid), public.is_board(uuid),
  public.has_permission(uuid, public.board_permission),
  public.has_support_grant(uuid, public.support_section, boolean),
  public.owns_unit(uuid),
  public.log_support_view(uuid, public.support_section, text)
to authenticated, service_role;

-- Functions are executable by PUBLIC by default; keep the helpers away from anon.
revoke execute on function
  public.is_superadmin(), public.member_role(uuid), public.is_member(uuid), public.is_board(uuid),
  public.has_permission(uuid, public.board_permission),
  public.has_support_grant(uuid, public.support_section, boolean),
  public.owns_unit(uuid),
  public.log_support_view(uuid, public.support_section, text)
from public, anon;
