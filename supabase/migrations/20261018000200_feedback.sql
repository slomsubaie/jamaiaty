-- Complaints & suggestions form (public, no login needed).
-- Submissions are written only by the submit-feedback Edge Function (service role) after
-- validation, spam and rate-limit checks. The database re-checks every field below, and
-- only superadmins can read or update submissions.

create table public.feedback (
  id bigint generated always as identity primary key,
  reference text unique,                                  -- shown to the sender, e.g. JM-000123
  kind text not null check (kind in ('complaint', 'suggestion', 'inquiry', 'praise')),
  topic text check (topic in ('login', 'association', 'sections', 'support', 'other')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  email text not null check (
    char_length(email) <= 254
    and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  phone text check (phone ~ '^\+9665[0-9]{8}$'),
  association_name text check (char_length(association_name) <= 150),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'in_review', 'resolved')),
  user_id uuid references public.profiles (id) on delete set null,  -- when sent while logged in
  ip_hash text,                                           -- salted SHA-256, never the raw IP
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.feedback (created_at desc);
create index on public.feedback (ip_hash, created_at desc);
create index on public.feedback (lower(email), created_at desc);

-- Reference number from the id, set on insert.
create function public.prepare_feedback()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reference := 'JM-' || lpad(new.id::text, 6, '0');
    new.status := 'new';
  else
    -- Only the status may change after submission.
    if row(new.kind, new.topic, new.full_name, new.email, new.phone, new.association_name, new.message, new.reference, new.created_at)
       is distinct from
       row(old.kind, old.topic, old.full_name, old.email, old.phone, old.association_name, old.message, old.reference, old.created_at) then
      raise exception 'feedback content cannot be changed' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger feedback_prepare
  before insert or update on public.feedback
  for each row execute function public.prepare_feedback();

alter table public.feedback enable row level security;

-- No insert policy: browsers can't write directly; only the Edge Function (service role) can.
create policy "feedback_select_superadmin" on public.feedback for select to authenticated
  using (public.is_superadmin());
create policy "feedback_update_superadmin" on public.feedback for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

grant select, update (status) on public.feedback to authenticated;
grant select, insert, update on public.feedback to service_role;
grant usage on sequence public.feedback_id_seq to service_role;
