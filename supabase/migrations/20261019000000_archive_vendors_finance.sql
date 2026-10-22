-- Archive, vendors & contracts, finance (budget & reports).
--
-- Who does what (as agreed):
--   Archive  — upload/edit: president + board with `documents`; only the president may share a
--              document with all owners; delete is a soft delete with a reason (files are kept).
--              Owners see documents shared with owners; the board sees all.
--   Vendors  — manage: president + board with `vendors_contracts`; the board sees everything;
--              owners see only the vendor directory (name, field, website, support number).
--   Finance  — manage: president + board with `finance`; the board sees the budget lines;
--              owners see yearly totals of approved budgets only.
--   Superadmin — only through an accepted support request covering that section.

------------------------------------------------------------------------------
-- Vendors and their offers / contracts
------------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 150),
  category text not null check (category in (
    'cleaning_maintenance', 'property_management', 'elevators', 'security',
    'pest_control', 'landscaping', 'pools', 'fire_safety', 'other')),
  contact_name text check (char_length(contact_name) <= 100),
  phone text check (char_length(phone) <= 20),
  email text check (char_length(email) <= 254),
  website text check (website is null or website ~* '^https?://'),
  support_phone text check (char_length(support_phone) <= 20),
  notes text check (char_length(notes) <= 2000),
  show_in_directory boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vendors (association_id, category);

-- An offer (quotation) or a contract: the services it covers and its price.
create table public.vendor_offers (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 200),
  status text not null default 'offer' check (status in ('offer', 'active', 'ended', 'declined')),
  services text[] not null default '{}' check (cardinality(services) <= 60),
  price_amount numeric(14, 2) not null check (price_amount >= 0),
  price_basis text not null check (price_basis in ('per_unit_month', 'per_unit_year', 'per_month', 'per_year')),
  vat_included boolean not null default true,
  start_date date,
  end_date date,
  notes text check (char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index on public.vendor_offers (association_id, vendor_id);

------------------------------------------------------------------------------
-- Archive documents
------------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  category text not null check (category in ('contract', 'invoice', 'minutes', 'decision', 'correspondence', 'other')),
  title text not null check (char_length(btrim(title)) between 2 and 200),
  document_date date,
  notes text check (char_length(notes) <= 2000),
  visibility text not null default 'board' check (visibility in ('board', 'owners')),
  vendor_id uuid references public.vendors (id) on delete set null,
  file_path text not null unique,          -- object in bucket association-archive
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  delete_reason text check (char_length(delete_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- coalesce: a missing reason must fail the check (NULL would otherwise pass it).
  check (deleted_at is null or coalesce(char_length(btrim(delete_reason)), 0) >= 3)
);
create index on public.documents (association_id, category, document_date desc);

------------------------------------------------------------------------------
-- Budgets (one per fiscal year) and their lines
------------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  fiscal_year int not null check (fiscal_year between 2000 and 2100),
  title text check (char_length(title) <= 200),
  status text not null default 'draft' check (status in ('draft', 'approved', 'closed')),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (association_id, fiscal_year)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations (id) on delete cascade,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null check (category in (
    'owner_fees', 'rent', 'other_income',
    'maintenance', 'cleaning', 'security', 'elevators', 'utilities', 'management', 'insurance', 'reserve', 'other_expense')),
  description text check (char_length(description) <= 300),
  planned_amount numeric(14, 2) not null default 0 check (planned_amount >= 0),
  actual_amount numeric(14, 2) not null default 0 check (actual_amount >= 0),
  vendor_id uuid references public.vendors (id) on delete set null,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'income') = (category in ('owner_fees', 'rent', 'other_income')))
);
create index on public.budget_lines (budget_id);

------------------------------------------------------------------------------
-- Integrity triggers
------------------------------------------------------------------------------
-- Child rows always belong to their parent's association; stamps who/when.
create function public.prepare_child_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_assoc uuid;
begin
  if tg_table_name = 'vendor_offers' then
    select association_id into parent_assoc from public.vendors where id = new.vendor_id;
  elsif tg_table_name = 'budget_lines' then
    select association_id into parent_assoc from public.budgets where id = new.budget_id;
  end if;
  if parent_assoc is null then
    raise exception 'parent not found' using errcode = '23503';
  end if;
  new.association_id := parent_assoc;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vendor_offers_prepare before insert or update on public.vendor_offers
  for each row execute function public.prepare_child_row();
create trigger budget_lines_prepare before insert or update on public.budget_lines
  for each row execute function public.prepare_child_row();

-- A linked vendor must belong to the same association.
create function public.check_vendor_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.vendor_id is not null and not exists (
    select 1 from public.vendors where id = new.vendor_id and association_id = new.association_id
  ) then
    raise exception 'vendor must belong to the same association' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger documents_vendor_link before insert or update of vendor_id on public.documents
  for each row execute function public.check_vendor_link();
create trigger budget_lines_vendor_link before insert or update of vendor_id on public.budget_lines
  for each row execute function public.check_vendor_link();

create function public.stamp_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.association_id <> old.association_id then
      raise exception 'rows cannot move between associations' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vendors_stamp before insert or update on public.vendors
  for each row execute function public.stamp_row();
create trigger budgets_stamp before insert or update on public.budgets
  for each row execute function public.stamp_row();

-- Documents: only the president shares with owners (or changes sharing); soft delete needs a reason.
create function public.prepare_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  service boolean := (select auth.uid()) is null;
  president boolean := public.member_role(new.association_id) = 'president';
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
    new.deleted_at := null;
    new.deleted_by := null;
    new.delete_reason := null;
    if new.visibility = 'owners' and not service and not president then
      raise exception 'only the president can share documents with owners' using errcode = '42501';
    end if;
  else
    if new.association_id <> old.association_id then
      raise exception 'rows cannot move between associations' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.visibility <> old.visibility and not service and not president then
      raise exception 'only the president can change who sees a document' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_at := now();
      new.deleted_by := (select auth.uid());
    elsif new.deleted_at is null and old.deleted_at is not null then
      -- Restored.
      new.deleted_by := null;
      new.delete_reason := null;
    end if;
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_prepare before insert or update on public.documents
  for each row execute function public.prepare_document();

create trigger audit after insert or update or delete on public.vendors for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.vendor_offers for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.documents for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.budgets for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.budget_lines for each row execute function public.audit_row();

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
create function public.can_view_document(a uuid, visibility text, deleted_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select (deleted_at is null and (public.is_board(a) or (visibility = 'owners' and public.is_member(a))))
      or (deleted_at is not null and public.is_board(a))
      or public.has_support_grant(a, 'documents');
$$;

alter table public.vendors enable row level security;
alter table public.vendor_offers enable row level security;
alter table public.documents enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;

create policy "vendors_select" on public.vendors for select to authenticated
  using (public.is_board(association_id) or public.has_support_grant(association_id, 'vendors'));
create policy "vendors_write" on public.vendors for all to authenticated
  using (public.has_permission(association_id, 'vendors_contracts') or public.has_support_grant(association_id, 'vendors', true))
  with check (public.has_permission(association_id, 'vendors_contracts') or public.has_support_grant(association_id, 'vendors', true));

create policy "offers_select" on public.vendor_offers for select to authenticated
  using (public.is_board(association_id) or public.has_support_grant(association_id, 'vendors'));
create policy "offers_write" on public.vendor_offers for all to authenticated
  using (public.has_permission(association_id, 'vendors_contracts') or public.has_support_grant(association_id, 'vendors', true))
  with check (public.has_permission(association_id, 'vendors_contracts') or public.has_support_grant(association_id, 'vendors', true));

create policy "documents_select" on public.documents for select to authenticated
  using (public.can_view_document(association_id, visibility, deleted_at));
create policy "documents_insert" on public.documents for insert to authenticated
  with check (public.has_permission(association_id, 'documents') or public.has_support_grant(association_id, 'documents', true));
create policy "documents_update" on public.documents for update to authenticated
  using (public.has_permission(association_id, 'documents') or public.has_support_grant(association_id, 'documents', true))
  with check (public.has_permission(association_id, 'documents') or public.has_support_grant(association_id, 'documents', true));
-- No delete policy: documents are only soft-deleted.

create policy "budgets_select" on public.budgets for select to authenticated
  using (public.is_board(association_id) or public.has_support_grant(association_id, 'finance'));
create policy "budgets_write" on public.budgets for all to authenticated
  using (public.has_permission(association_id, 'finance') or public.has_support_grant(association_id, 'finance', true))
  with check (public.has_permission(association_id, 'finance') or public.has_support_grant(association_id, 'finance', true));

create policy "budget_lines_select" on public.budget_lines for select to authenticated
  using (public.is_board(association_id) or public.has_support_grant(association_id, 'finance'));
create policy "budget_lines_write" on public.budget_lines for all to authenticated
  using (public.has_permission(association_id, 'finance') or public.has_support_grant(association_id, 'finance', true))
  with check (public.has_permission(association_id, 'finance') or public.has_support_grant(association_id, 'finance', true));

grant select, insert, update, delete on public.vendors, public.vendor_offers, public.budgets, public.budget_lines to authenticated, service_role;
grant select, insert, update on public.documents to authenticated;
grant select, insert, update, delete on public.documents to service_role;

------------------------------------------------------------------------------
-- What owners may see: vendor directory and finance totals
------------------------------------------------------------------------------
create function public.vendor_directory(a uuid)
returns table (id uuid, name text, category text, website text, support_phone text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.name, v.category, v.website, v.support_phone
  from public.vendors v
  where v.association_id = a and v.show_in_directory
    and (public.is_member(a) or public.has_support_grant(a, 'vendors'))
  order by v.category, v.name;
$$;

-- Yearly totals; owners only see approved or closed budgets.
create function public.finance_summary(a uuid)
returns table (budget_id uuid, fiscal_year int, status text,
               planned_income numeric, actual_income numeric, planned_expense numeric, actual_expense numeric)
language sql stable security definer set search_path = '' as $$
  select b.id, b.fiscal_year, b.status,
    coalesce(sum(l.planned_amount) filter (where l.kind = 'income'), 0),
    coalesce(sum(l.actual_amount) filter (where l.kind = 'income'), 0),
    coalesce(sum(l.planned_amount) filter (where l.kind = 'expense'), 0),
    coalesce(sum(l.actual_amount) filter (where l.kind = 'expense'), 0)
  from public.budgets b
  left join public.budget_lines l on l.budget_id = b.id
  where b.association_id = a
    and (
      public.is_board(a) or public.has_support_grant(a, 'finance')
      or (public.is_member(a) and b.status in ('approved', 'closed'))
    )
  group by b.id
  order by b.fiscal_year desc;
$$;

grant execute on function public.vendor_directory(uuid), public.finance_summary(uuid), public.can_view_document(uuid, text, timestamptz)
  to authenticated, service_role;
revoke execute on function public.vendor_directory(uuid), public.finance_summary(uuid), public.can_view_document(uuid, text, timestamptz)
  from public, anon;
