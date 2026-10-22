-- Archive AI analysis: a dashboard of topic tabs written by Claude from the archive's documents.
--
-- Who sees what (as agreed):
--   Historical overview — free for every association. Owners get a version built only from
--              documents shared with owners; the board's version uses every document.
--   Forecast  — the next 2–3 years and recommended actions: premium only, for the president and
--              board members.
--   Superadmin — both, on any plan, but only under an accepted support request covering 'analysis'.
--   Refresh   — the president (or a superadmin under such a grant) at any time; otherwise it runs
--              by itself once the president's chosen interval (7, 30 or 90 days) has passed.
--
-- Pipeline: the `digest-document` edge function reads each document file once (Claude reads the
-- PDF or image) and stores a digest; `analyze-archive` then writes the analysis from the digests.
-- The database reaches the functions through pg_net using two Vault secrets: `project_url` and
-- `internal_functions_secret` (the same value as the functions' INTERNAL_FUNCTIONS_SECRET).

alter table public.associations
  add column analysis_interval_days int not null default 30 check (analysis_interval_days in (7, 30, 90));

-- Calls an internal edge function. Does nothing where pg_net or the Vault secrets are missing.
create function public.call_internal_function(fn text, body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  base text;
  secret text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into base using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into secret using 'internal_functions_secret';
  if base is null or secret is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using rtrim(base, '/') || '/functions/v1/' || fn, body,
          jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', secret);
end;
$$;

-- Whether the functions can be reached (pg_net and both Vault secrets are set up). Until then
-- nothing is queued, so a project without the Anthropic key doesn't collect failing runs.
create function public.analysis_configured()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  n int;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select count(*) from vault.decrypted_secrets where name = any ($1) and nullif(decrypted_secret, $2) is not null'
    into n using array['project_url', 'internal_functions_secret'], '';
  return n = 2;
end;
$$;

------------------------------------------------------------------------------
-- Per-document digests (one per file version)
------------------------------------------------------------------------------
create table public.document_digests (
  document_id uuid primary key references public.documents (id) on delete cascade,
  association_id uuid not null references public.associations (id) on delete cascade,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'skipped', 'failed')),
  attempts int not null default 0,
  digest jsonb,
  error text,
  model text,
  usage jsonb,
  updated_at timestamptz not null default now()
);
create index on public.document_digests (association_id, status);

-- A new or replaced file is read again.
create function public.queue_document_digest()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.file_path is distinct from old.file_path then
    insert into public.document_digests (document_id, association_id, file_path)
    values (new.id, new.association_id, new.file_path)
    on conflict (document_id) do update
      set file_path = excluded.file_path, status = 'pending', attempts = 0, digest = null, error = null, updated_at = now();
    perform public.call_internal_function('digest-document', jsonb_build_object('document_id', new.id));
  end if;
  return null;
end;
$$;

create trigger documents_queue_digest after insert or update of file_path on public.documents
  for each row execute function public.queue_document_digest();

-- Documents uploaded before this migration are picked up by the scheduler.
insert into public.document_digests (document_id, association_id, file_path)
select id, association_id, file_path from public.documents where deleted_at is null;

------------------------------------------------------------------------------
-- Analysis runs and their results
------------------------------------------------------------------------------
create table public.archive_analyses (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  kind text not null check (kind in ('manual', 'auto')),
  include_forecast boolean not null default false,
  -- Parts still being written: 'owners', 'board', 'forecast'.
  parts_pending text[] not null default '{}',
  requested_by uuid references public.profiles (id) on delete set null,
  document_count int,
  pending_document_count int,
  -- Newest document or digest change the run was based on.
  source_watermark timestamptz,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index on public.archive_analyses (association_id, created_at desc);
-- One run at a time per association.
create unique index archive_analyses_one_active on public.archive_analyses (association_id)
  where status in ('queued', 'running');

-- Historical overview, one per audience. Owners' rows only ever come from owner-visible documents.
create table public.archive_analysis_results (
  analysis_id uuid not null references public.archive_analyses (id) on delete cascade,
  association_id uuid not null references public.associations (id) on delete cascade,
  audience text not null check (audience in ('owners', 'board')),
  result jsonb not null,
  model text,
  usage jsonb,
  created_at timestamptz not null default now(),
  primary key (analysis_id, audience)
);
create index on public.archive_analysis_results (association_id, audience, created_at desc);

-- Forecast and recommendations (board documents). A table of its own so the premium/board rule
-- is enforced by the database.
create table public.archive_forecasts (
  analysis_id uuid primary key references public.archive_analyses (id) on delete cascade,
  association_id uuid not null references public.associations (id) on delete cascade,
  result jsonb not null,
  model text,
  usage jsonb,
  created_at timestamptz not null default now()
);
create index on public.archive_forecasts (association_id, created_at desc);

create trigger audit after insert or update on public.archive_analyses
  for each row execute function public.audit_row();

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
create function public.is_premium(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.associations where id = a and plan = 'premium');
$$;

alter table public.document_digests enable row level security;
alter table public.archive_analyses enable row level security;
alter table public.archive_analysis_results enable row level security;
alter table public.archive_forecasts enable row level security;

-- document_digests: no policies. Only the edge functions (service role) read them, so content of
-- board-only documents can never reach owners through a digest.

create policy "analyses_select" on public.archive_analyses for select to authenticated
  using (public.is_member(association_id) or public.has_support_grant(association_id, 'analysis'));

create policy "analysis_results_select" on public.archive_analysis_results for select to authenticated using (
  (audience = 'owners' and public.is_member(association_id))
  or (audience = 'board' and public.is_board(association_id))
  or public.has_support_grant(association_id, 'analysis')
);

create policy "forecasts_select" on public.archive_forecasts for select to authenticated using (
  (public.is_board(association_id) and public.is_premium(association_id))
  or public.has_support_grant(association_id, 'analysis')
);

-- Written only by the edge functions.
grant select on public.archive_analyses, public.archive_analysis_results, public.archive_forecasts to authenticated;
grant select, insert, update, delete on public.document_digests, public.archive_analyses,
  public.archive_analysis_results, public.archive_forecasts to service_role;

------------------------------------------------------------------------------
-- Starting and finishing runs
------------------------------------------------------------------------------
-- Newest change the analysis depends on: a document edit, share, delete or a finished digest.
create function public.archive_source_watermark(a uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(
    (select max(updated_at) from public.documents where association_id = a),
    (select max(updated_at) from public.document_digests where association_id = a and status in ('done', 'skipped'))
  );
$$;

create function public.queue_archive_analysis(a uuid, run_kind text, requester uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  run uuid;
begin
  insert into public.archive_analyses (association_id, kind, include_forecast, requested_by)
  values (
    a, run_kind,
    -- A superadmin under grant gets the forecast on any plan (they own the platform).
    public.is_premium(a) or (run_kind = 'manual' and public.has_support_grant(a, 'analysis')),
    requester
  )
  returning id into run;
  perform public.call_internal_function('analyze-archive', jsonb_build_object('analysis_id', run));
  return run;
end;
$$;

-- "Refresh" button: the president, or a superadmin under an 'analysis' grant.
create function public.request_archive_analysis(a uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not (public.member_role(a) = 'president' or public.has_support_grant(a, 'analysis')) then
    raise exception 'only the president can refresh the analysis' using errcode = '42501';
  end if;
  if not public.analysis_configured() then
    raise exception 'analysis_not_configured' using errcode = '55000';
  end if;
  if exists (select 1 from public.archive_analyses where association_id = a and status in ('queued', 'running')) then
    raise exception 'analysis_in_progress' using errcode = '55P03';
  end if;
  if not exists (select 1 from public.documents where association_id = a and deleted_at is null) then
    raise exception 'analysis_no_documents' using errcode = '22023';
  end if;
  -- Keeps the AI cost predictable.
  if (select count(*) from public.archive_analyses
      where association_id = a and kind = 'manual' and created_at > now() - interval '1 day') >= 3 then
    raise exception 'analysis_daily_limit' using errcode = '54000';
  end if;
  return public.queue_archive_analysis(a, 'manual', (select auth.uid()));
end;
$$;

-- Called by analyze-archive when one part ends. The run is done once every part has ended,
-- and failed only if no part produced a result.
create function public.finish_analysis_part(run uuid, part text, failure text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  remaining text[];
  final_status text;
begin
  update public.archive_analyses
     set parts_pending = array_remove(parts_pending, part),
         error = case when failure is null then error else concat_ws('; ', error, part || ': ' || left(failure, 500)) end
   where id = run and status = 'running'
  returning parts_pending into remaining;
  if remaining is null then
    return null;
  end if;
  if cardinality(remaining) > 0 then
    return 'running';
  end if;
  update public.archive_analyses x
     set status = case
           when exists (select 1 from public.archive_analysis_results r where r.analysis_id = x.id)
             or exists (select 1 from public.archive_forecasts f where f.analysis_id = x.id) then 'done'
           else 'failed' end,
         finished_at = now()
   where id = run
  returning status into final_status;
  return final_status;
end;
$$;

-- A document stops being shared with owners (or is deleted): the owners' overview may mention it,
-- so it is withdrawn at once and rebuilt without it.
create function public.withdraw_owner_analysis()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.visibility = 'owners' and old.deleted_at is null
     and (new.visibility <> 'owners' or new.deleted_at is not null) then
    delete from public.archive_analysis_results where association_id = new.association_id and audience = 'owners';
    if public.analysis_configured() and not exists (select 1 from public.archive_analyses
                   where association_id = new.association_id and status in ('queued', 'running')) then
      begin
        perform public.queue_archive_analysis(new.association_id, 'auto', null);
      exception when unique_violation then
        null; -- a run started at the same moment; it checks sharing before writing
      end;
    end if;
  end if;
  return null;
end;
$$;

create trigger documents_withdraw_owner_analysis after update of visibility, deleted_at on public.documents
  for each row execute function public.withdraw_owner_analysis();

------------------------------------------------------------------------------
-- Hourly scheduler: retries digests and runs analyses whose interval has passed
------------------------------------------------------------------------------
create function public.run_analysis_schedule()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if not public.analysis_configured() then
    return;
  end if;
  -- Runs or digests stuck because a function crashed or timed out.
  update public.archive_analyses set status = 'failed', error = coalesce(error, 'timed out'), finished_at = now()
   where status in ('queued', 'running') and created_at < now() - interval '1 hour';
  update public.document_digests set status = 'failed', error = coalesce(error, 'timed out'), updated_at = now()
   where status = 'running' and updated_at < now() - interval '30 minutes';

  -- Files not read yet (older documents, lost calls, earlier failures): at most 3 attempts each.
  for r in
    select g.document_id from public.document_digests g
    join public.documents d on d.id = g.document_id and d.deleted_at is null
    where g.status in ('pending', 'failed') and g.attempts < 3 and g.updated_at < now() - interval '5 minutes'
    order by g.updated_at
    limit 50
  loop
    perform public.call_internal_function('digest-document', jsonb_build_object('document_id', r.document_id));
  end loop;

  for r in
    select a.id from public.associations a
    where a.status = 'active'
      and not exists (select 1 from public.archive_analyses x
                      where x.association_id = a.id and x.status in ('queued', 'running'))
      -- The president's interval has passed since the last analysis (or there has never been one).
      and not exists (select 1 from public.archive_analyses x
                      where x.association_id = a.id and x.status = 'done'
                        and x.finished_at > now() - make_interval(days => a.analysis_interval_days))
      -- A failed run is retried a day later at the earliest.
      and not exists (select 1 from public.archive_analyses x
                      where x.association_id = a.id and x.status = 'failed' and x.created_at > now() - interval '1 day')
      and exists (select 1 from public.documents d where d.association_id = a.id and d.deleted_at is null)
      -- Something changed since the last analysis; an unchanged archive isn't paid for twice.
      and public.archive_source_watermark(a.id) > coalesce(
            (select max(x.source_watermark) from public.archive_analyses x
             where x.association_id = a.id and x.status = 'done'), '-infinity'::timestamptz)
      -- Wait until every file has been read.
      and not exists (select 1 from public.document_digests g
                      join public.documents d on d.id = g.document_id and d.deleted_at is null
                      where g.association_id = a.id
                        and (g.status in ('pending', 'running') or (g.status = 'failed' and g.attempts < 3)))
  loop
    begin
      perform public.queue_archive_analysis(r.id, 'auto', null);
    exception when unique_violation then
      null; -- a refresh started at the same moment
    end;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('archive-analysis', '17 * * * *', 'select public.run_analysis_schedule()');
  end if;
end;
$$;

grant execute on function public.is_premium(uuid), public.request_archive_analysis(uuid) to authenticated, service_role;
revoke execute on function public.is_premium(uuid), public.request_archive_analysis(uuid) from public, anon;

grant execute on function
  public.analysis_configured(), public.call_internal_function(text, jsonb), public.archive_source_watermark(uuid),
  public.queue_archive_analysis(uuid, text, uuid), public.finish_analysis_part(uuid, text, text),
  public.run_analysis_schedule()
to service_role;
revoke execute on function
  public.analysis_configured(), public.call_internal_function(text, jsonb), public.archive_source_watermark(uuid),
  public.queue_archive_analysis(uuid, text, uuid), public.finish_analysis_part(uuid, text, text),
  public.run_analysis_schedule()
from public, anon, authenticated;
