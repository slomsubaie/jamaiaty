-- Private bucket for files inside custom sections.
-- Object path: <association_id>/<folder_id>/<item_id>.<ext>  (original name kept in folder_items.file_name)

insert into storage.buckets (id, name, public, file_size_limit)
values ('association-files', 'association-files', false, 52428800)  -- 50 MB per file
on conflict (id) do nothing;

-- Parses the path safely; malformed paths simply deny access.
create function public.section_file_access(object_name text, for_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(object_name, '/');
  assoc uuid;
  folder uuid;
begin
  if array_length(parts, 1) <> 3 then
    return false;
  end if;
  begin
    assoc := parts[1]::uuid;
    folder := parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not exists (select 1 from public.folders where id = folder and association_id = assoc) then
    return false;
  end if;
  if for_write then
    return public.can_manage_sections(assoc);
  end if;
  return public.can_view_folder(folder);
end;
$$;

grant execute on function public.section_file_access(text, boolean) to authenticated, service_role;
revoke execute on function public.section_file_access(text, boolean) from public, anon;

create policy "section_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'association-files' and public.section_file_access(name, false));
create policy "section_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'association-files' and public.section_file_access(name, true));
create policy "section_files_update" on storage.objects for update to authenticated
  using (bucket_id = 'association-files' and public.section_file_access(name, true))
  with check (bucket_id = 'association-files' and public.section_file_access(name, true));
create policy "section_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'association-files' and public.section_file_access(name, true));
