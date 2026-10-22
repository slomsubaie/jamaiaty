-- Custom sections: folders (top-level folders are "sections", e.g. "المرافق") that can hold
-- subfolders, notes, links and files (e.g. "مواعيد النادي الرياضي").
--
-- Who can manage: the president, board members with the `custom_sections` permission, and a
-- superadmin holding an approved support grant for 'sections' with can_edit.
-- Who can view: per folder — 'owners' (every member) or 'board' (president + board members);
-- a superadmin can view under an approved 'sections' grant.

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  visibility text not null default 'owners' check (visibility in ('owners', 'board')),
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.folders (association_id, parent_id);

create table public.folder_items (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  folder_id uuid not null references public.folders (id) on delete cascade,
  kind text not null check (kind in ('note', 'link', 'file')),
  title text not null check (length(trim(title)) between 1 and 200),
  body text,                                -- note text, or an optional description
  url text check (url is null or url ~* '^https?://'),
  file_path text unique,                    -- storage object path in bucket association-files
  file_name text,                           -- original file name, shown to users
  mime_type text,
  size_bytes bigint,
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'link' or url is not null),
  check (kind <> 'file' or file_path is not null)
);
create index on public.folder_items (folder_id);

------------------------------------------------------------------------------
-- Access helpers
------------------------------------------------------------------------------
create function public.can_manage_sections(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission(a, 'custom_sections')
      or public.has_support_grant(a, 'sections', true);
$$;

-- Takes the row's own columns so it also works for a row being inserted (INSERT ... RETURNING).
create function public.can_view_section(a uuid, visibility text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_board(a)
      or (visibility = 'owners' and public.is_member(a))
      or public.has_support_grant(a, 'sections');
$$;

create function public.can_view_folder(f uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_view_section(association_id, visibility) from public.folders where id = f), false);
$$;

------------------------------------------------------------------------------
-- Integrity: same association, no cycles, children never more visible than parents
------------------------------------------------------------------------------
create function public.prepare_folder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent record;
  cursor_id uuid;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    if new.association_id <> old.association_id then
      raise exception 'a folder cannot move between associations' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  if new.parent_id is not null then
    select association_id, visibility into parent from public.folders where id = new.parent_id;
    if not found or parent.association_id <> new.association_id then
      raise exception 'parent folder must belong to the same association' using errcode = '23514';
    end if;
    if parent.visibility = 'board' then
      new.visibility := 'board';
    end if;
    -- Reject moving a folder under itself or one of its descendants.
    cursor_id := new.parent_id;
    while cursor_id is not null loop
      if cursor_id = new.id then
        raise exception 'a folder cannot be moved inside itself' using errcode = '23514';
      end if;
      select parent_id into cursor_id from public.folders where id = cursor_id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger folders_prepare
  before insert or update on public.folders
  for each row execute function public.prepare_folder();

-- Making a folder board-only hides everything under it as well.
create function public.cascade_folder_visibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility = 'board' and old.visibility <> 'board' then
    update public.folders set visibility = 'board' where parent_id = new.id and visibility <> 'board';
  end if;
  return null;
end;
$$;

create trigger folders_cascade_visibility
  after update of visibility on public.folders
  for each row execute function public.cascade_folder_visibility();

create function public.prepare_folder_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The item always belongs to its folder's association.
  select association_id into new.association_id from public.folders where id = new.folder_id;
  if new.association_id is null then
    raise exception 'folder not found' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.kind <> old.kind then
      raise exception 'an item cannot change kind' using errcode = '23514';
    end if;
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create trigger folder_items_prepare
  before insert or update on public.folder_items
  for each row execute function public.prepare_folder_item();

create trigger audit after insert or update or delete on public.folders
  for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.folder_items
  for each row execute function public.audit_row();

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
alter table public.folders enable row level security;
alter table public.folder_items enable row level security;

create policy "folders_select" on public.folders for select to authenticated
  using (public.can_view_section(association_id, visibility));
create policy "folders_insert" on public.folders for insert to authenticated
  with check (public.can_manage_sections(association_id));
create policy "folders_update" on public.folders for update to authenticated
  using (public.can_manage_sections(association_id))
  with check (public.can_manage_sections(association_id));
create policy "folders_delete" on public.folders for delete to authenticated
  using (public.can_manage_sections(association_id));

create policy "folder_items_select" on public.folder_items for select to authenticated
  using (public.can_view_folder(folder_id));
create policy "folder_items_insert" on public.folder_items for insert to authenticated
  with check (public.can_manage_sections(association_id));
create policy "folder_items_update" on public.folder_items for update to authenticated
  using (public.can_manage_sections(association_id))
  with check (public.can_manage_sections(association_id));
create policy "folder_items_delete" on public.folder_items for delete to authenticated
  using (public.can_manage_sections(association_id));

grant select, insert, update, delete on public.folders, public.folder_items to authenticated, service_role;
grant execute on function public.can_manage_sections(uuid), public.can_view_folder(uuid), public.can_view_section(uuid, text)
  to authenticated, service_role;
revoke execute on function public.can_manage_sections(uuid), public.can_view_folder(uuid), public.can_view_section(uuid, text)
  from public, anon;

------------------------------------------------------------------------------
-- Full CRUD on associations: the superadmin may delete one (cascades to all its data).
------------------------------------------------------------------------------
create policy "associations_delete" on public.associations for delete to authenticated
  using (public.is_superadmin());
