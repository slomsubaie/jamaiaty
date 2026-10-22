-- Private bucket for archive documents. Object path: <association_id>/<random>.<ext>
-- (the original, often Arabic, file name is kept in documents.file_name).

insert into storage.buckets (id, name, public, file_size_limit)
values ('association-archive', 'association-archive', false, 52428800)  -- 50 MB per file
on conflict (id) do nothing;

create function public.archive_file_access(object_name text, for_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(object_name, '/');
  assoc uuid;
begin
  if array_length(parts, 1) <> 2 then
    return false;
  end if;
  begin
    assoc := parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if for_write then
    return public.has_permission(assoc, 'documents') or public.has_support_grant(assoc, 'documents', true);
  end if;
  -- Reading follows the document's visibility.
  return exists (
    select 1 from public.documents d
    where d.file_path = object_name and d.association_id = assoc
      and public.can_view_document(d.association_id, d.visibility, d.deleted_at)
  );
end;
$$;

grant execute on function public.archive_file_access(text, boolean) to authenticated, service_role;
revoke execute on function public.archive_file_access(text, boolean) from public, anon;

create policy "archive_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'association-archive' and public.archive_file_access(name, false));
create policy "archive_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'association-archive' and public.archive_file_access(name, true));
create policy "archive_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'association-archive' and public.archive_file_access(name, true));
