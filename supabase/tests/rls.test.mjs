// Runs the real migrations in an in-memory Postgres (PGlite) with a minimal stub of
// Supabase's auth schema, then checks the permission matrix as different users.
// Run: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    phone text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Like current hosted Supabase: no default grants on new tables; migrations grant explicitly.
  -- pg_net and Vault, as set up for the archive analysis (calls go nowhere).
  create schema net;
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
    timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values ('project_url', 'http://localhost'), ('internal_functions_secret', 'test');
`;

let db;
const ids = {};

async function sql(text, params) {
  return (await db.query(text, params)).rows;
}

/** Runs fn as the given user with RLS applied; `acting` mimics the app's x-acting-role header. */
async function as(userId, fn, acting) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.query(`select set_config('request.headers', $1, false)`, [acting ? JSON.stringify({ "x-acting-role": acting }) : ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.headers', '', false)`);
  }
}

/** The association asks the platform for help and the superadmin accepts; returns the grant id. */
async function approvedGrant(associationId, sections, canEdit = false) {
  const [{ id }] = await as(ids.pres, () => sql(
    `insert into public.support_grants (association_id, reason, sections, can_edit) values ($1, 'مساعدة', $2, $3) returning id`,
    [associationId, `{${sections.join(",")}}`, canEdit]));
  await as(ids.super, () => sql(`update public.support_grants set status = 'approved' where id = $1`, [id]));
  return id;
}

async function createUser(name, phone) {
  const [u] = await sql(
    `insert into auth.users (phone, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [phone, name],
  );
  return u.id;
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, pattern ?? /row-level security|permission denied|only the platform admin|cannot be changed|no active support grant/);
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }

  ids.super = await createUser("مدير المنصة", "966500000009");
  await sql(`update public.profiles set is_superadmin = true where id = $1`, [ids.super]);
  ids.pres = await createUser("الرئيس", "966500000001");
  ids.owner = await createUser("مالك", "966500000002");
  ids.board = await createUser("عضو بلا صلاحيات", "966500000003");
  ids.boardOwners = await createUser("عضو الملاك", "966500000004");
  ids.otherPres = await createUser("رئيس آخر", "966500000005");

  [{ id: ids.a }] = await sql(`insert into public.associations (name, city) values ('جمعية أ', 'الرياض') returning id`);
  [{ id: ids.z }] = await sql(`insert into public.associations (name, city) values ('جمعية ز', 'جدة') returning id`);
  [{ id: ids.bld }] = await sql(`insert into public.buildings (association_id, name) values ($1, 'A') returning id`, [ids.a]);
  [{ id: ids.u1 }] = await sql(
    `insert into public.units (association_id, building_id, unit_number) values ($1, $2, '101') returning id`, [ids.a, ids.bld]);
  [{ id: ids.u2 }] = await sql(
    `insert into public.units (association_id, building_id, unit_number) values ($1, $2, '102') returning id`, [ids.a, ids.bld]);
  [{ id: ids.uz }] = await sql(`insert into public.units (association_id, unit_number) values ($1, '1') returning id`, [ids.z]);

  await sql(
    `insert into public.memberships (association_id, user_id, role, permissions) values
      ($1, $2, 'president', '{}'), ($1, $3, 'owner', '{}'), ($1, $4, 'board_member', '{}'),
      ($1, $5, 'board_member', '{owners_units}'), ($6, $7, 'president', '{}')`,
    [ids.a, ids.pres, ids.owner, ids.board, ids.boardOwners, ids.z, ids.otherPres],
  );
  await sql(`insert into public.unit_ownerships (association_id, unit_id, user_id) values ($1, $2, $3)`,
    [ids.a, ids.u1, ids.owner]);
});

after(async () => db?.close());

describe("profiles", () => {
  test("auth trigger creates profile with E.164 phone and name", async () => {
    const [p] = await sql(`select phone, full_name from public.profiles where id = $1`, [ids.owner]);
    assert.deepEqual(p, { phone: "+966500000002", full_name: "مالك" });
  });

  test("user can rename themself but cannot make themself superadmin", async () => {
    await as(ids.owner, () => sql(`update public.profiles set full_name = 'مالك ١' where id = $1`, [ids.owner]));
    await rejects(as(ids.owner, () => sql(`update public.profiles set is_superadmin = true where id = $1`, [ids.owner])));
  });

  test("owner sees only their own profile; president sees members", async () => {
    const own = await as(ids.owner, () => sql(`select id from public.profiles`));
    assert.deepEqual(own.map((r) => r.id), [ids.owner]);
    const pres = await as(ids.pres, () => sql(`select id from public.profiles`));
    assert.equal(pres.length, 4);
  });
});

describe("owner", () => {
  test("sees only their own association and unit", async () => {
    const assocs = await as(ids.owner, () => sql(`select id from public.associations`));
    assert.deepEqual(assocs.map((r) => r.id), [ids.a]);
    const units = await as(ids.owner, () => sql(`select id from public.units`));
    assert.deepEqual(units.map((r) => r.id), [ids.u1]);
  });

  test("cannot add units or members", async () => {
    await rejects(as(ids.owner, () =>
      sql(`insert into public.units (association_id, unit_number) values ($1, '999')`, [ids.a])));
    await rejects(as(ids.owner, () =>
      sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'owner')`, [ids.a, ids.otherPres])));
  });

  test("cannot read audit log", async () => {
    const rows = await as(ids.owner, () => sql(`select * from public.audit_log`));
    assert.equal(rows.length, 0);
  });
});

describe("board member", () => {
  test("without owners_units sees all units but cannot add one", async () => {
    const units = await as(ids.board, () => sql(`select id from public.units`));
    assert.equal(units.length, 2);
    await rejects(as(ids.board, () =>
      sql(`insert into public.units (association_id, unit_number) values ($1, '201')`, [ids.a])));
  });

  test("with owners_units can add units and owners, but not board members", async () => {
    await as(ids.boardOwners, () =>
      sql(`insert into public.units (association_id, building_id, unit_number) values ($1, $2, '202')`, [ids.a, ids.bld]));
    const newcomer = await createUser("مالك جديد", "966500000006");
    await as(ids.boardOwners, () =>
      sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'owner')`, [ids.a, newcomer]));
    const another = await createUser("عضو جديد", "966500000007");
    await rejects(as(ids.boardOwners, () =>
      sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'board_member')`, [ids.a, another])));
  });

  test("cannot touch another association", async () => {
    const units = await as(ids.boardOwners, () => sql(`select id from public.units where association_id = $1`, [ids.z]));
    assert.equal(units.length, 0);
    await rejects(as(ids.boardOwners, () =>
      sql(`insert into public.units (association_id, unit_number) values ($1, 'x')`, [ids.z])));
  });
});

describe("president", () => {
  test("can add board members but not a second president", async () => {
    const u = await createUser("أمين الصندوق", "966500000008");
    await as(ids.pres, () => sql(
      `insert into public.memberships (association_id, user_id, role, permissions) values ($1, $2, 'board_member', '{finance}')`,
      [ids.a, u]));
    await rejects(as(ids.pres, () => sql(
      `update public.memberships set role = 'president' where association_id = $1 and user_id = $2`, [ids.a, u])));
  });

  test("can edit association details but not plan/status", async () => {
    await as(ids.pres, () => sql(`update public.associations set mullak_number = 'M-1' where id = $1`, [ids.a]));
    await rejects(as(ids.pres, () => sql(`update public.associations set plan = 'premium' where id = $1`, [ids.a])));
  });

  test("sees the association's audit log", async () => {
    const rows = await as(ids.pres, () => sql(`select action, table_name from public.audit_log where association_id = $1`, [ids.a]));
    assert.ok(rows.length > 0);
  });
});

describe("superadmin support access", () => {
  test("without a grant: sees association metadata and presidents only, no units", async () => {
    const assocs = await as(ids.super, () => sql(`select id from public.associations`));
    assert.equal(assocs.length, 2);
    const units = await as(ids.super, () => sql(`select id from public.units`));
    assert.equal(units.length, 0);
    const profiles = await as(ids.super, () => sql(`select id from public.profiles order by id`));
    assert.deepEqual(new Set(profiles.map((r) => r.id)), new Set([ids.super, ids.pres, ids.otherPres]));
    await rejects(as(ids.super, () => sql(`select public.log_support_view($1, 'units', '/units')`, [ids.a])));
  });

  test("only the association can ask for support; the superadmin can't create requests", async () => {
    await rejects(as(ids.super, () => sql(
      `insert into public.support_grants (association_id, reason, sections) values ($1, 'أريد الوصول', '{units}')`, [ids.a])));
    // A board member without the support permission can't ask either.
    await rejects(as(ids.board, () => sql(
      `insert into public.support_grants (association_id, reason, sections) values ($1, 'x', '{units}')`, [ids.a])));
  });

  test("president asks → pending gives no access; the president can't accept their own request", async () => {
    [{ id: ids.grant }] = await as(ids.pres, () => sql(
      `insert into public.support_grants (association_id, reason, sections) values ($1, 'مشكلة في الوحدات', '{units}') returning id`, [ids.a]));
    const [{ direction, status, requested_by }] = await sql(`select direction, status, requested_by from public.support_grants where id = $1`, [ids.grant]);
    assert.deepEqual({ direction, status, requested_by }, { direction: "association_request", status: "pending", requested_by: ids.pres });
    assert.equal((await as(ids.super, () => sql(`select id from public.units`))).length, 0);
    await assert.rejects(as(ids.pres, () =>
      sql(`update public.support_grants set status = 'approved' where id = $1`, [ids.grant])), /only the other side/);
  });

  test("superadmin accepts → read-only access to the requested section, logged views", async () => {
    const [g] = await as(ids.super, () =>
      sql(`update public.support_grants set status = 'approved' where id = $1 returning expires_at, decided_by`, [ids.grant]));
    assert.equal(g.decided_by, ids.super);
    assert.ok(g.expires_at > new Date());

    const units = await as(ids.super, () => sql(`select id from public.units where association_id = $1`, [ids.a]));
    assert.ok(units.length >= 2);
    // Other association and other sections stay closed.
    assert.equal((await as(ids.super, () => sql(`select id from public.units where association_id = $1`, [ids.z]))).length, 0);
    const owners = await as(ids.super, () => sql(`select id from public.memberships where association_id = $1 and role = 'owner'`, [ids.a]));
    assert.equal(owners.length, 0);
    // Read-only.
    await rejects(as(ids.super, () =>
      sql(`insert into public.units (association_id, unit_number) values ($1, '777')`, [ids.a])));

    await as(ids.super, () => sql(`select public.log_support_view($1, 'units', '/units')`, [ids.a]));
    const [log] = await sql(`select actor_id from public.audit_log where action = 'support_view'`);
    assert.equal(log.actor_id, ids.super);
  });

  test("grant details cannot be widened after approval", async () => {
    await rejects(as(ids.pres, () =>
      sql(`update public.support_grants set sections = '{all}' where id = $1`, [ids.grant])));
  });

  test("expired grant gives no access", async () => {
    await sql(`alter table public.support_grants disable trigger support_grants_guard`);
    await sql(`update public.support_grants set expires_at = now() - interval '1 minute' where id = $1`, [ids.grant]);
    await sql(`alter table public.support_grants enable trigger support_grants_guard`);
    assert.equal((await as(ids.super, () => sql(`select id from public.units`))).length, 0);
  });

  test("association asks the platform for help: only the superadmin accepts; either side can end it", async () => {
    const [{ id, direction, status }] = await as(ids.pres, () => sql(
      `insert into public.support_grants (association_id, reason, sections, status) values ($1, 'دعم', '{all}', 'approved') returning id, direction, status`, [ids.a]));
    assert.equal(direction, "association_request");
    assert.equal(status, "pending", "a request can't approve itself");
    assert.equal((await as(ids.super, () => sql(`select id from public.units`))).length, 0);
    await assert.rejects(as(ids.pres, () => sql(`update public.support_grants set status = 'approved' where id = $1`, [id])), /only the other side/);
    await as(ids.super, () => sql(`update public.support_grants set status = 'approved' where id = $1`, [id]));
    assert.ok((await as(ids.super, () => sql(`select id from public.units`))).length > 0);
    await as(ids.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [id]));
    assert.equal((await as(ids.super, () => sql(`select id from public.units`))).length, 0);
  });

  test("the requester can cancel a pending request; the other side can't", async () => {
    const [{ id }] = await as(ids.pres, () => sql(
      `insert into public.support_grants (association_id, reason, sections) values ($1, 'إلغاء', '{units}') returning id`, [ids.a]));
    await assert.rejects(as(ids.super, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [id])), /only the requester/);
    await as(ids.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [id]));
    const [{ status }] = await sql(`select status from public.support_grants where id = $1`, [id]);
    assert.equal(status, "revoked");
  });

});

describe("custom sections", () => {
  const f = {};

  before(async () => {
    ids.boardSections = await createUser("عضو الأقسام", "966500000010");
    await sql(`insert into public.memberships (association_id, user_id, role, permissions) values ($1, $2, 'board_member', '{custom_sections}')`,
      [ids.a, ids.boardSections]);
  });

  test("president creates sections, subfolders, notes and links", async () => {
    [{ id: f.facilities }] = await as(ids.pres, () =>
      sql(`insert into public.folders (association_id, name) values ($1, 'المرافق') returning id`, [ids.a]));
    [{ id: f.gym }] = await as(ids.pres, () =>
      sql(`insert into public.folders (association_id, parent_id, name) values ($1, $2, 'النادي الرياضي') returning id`, [ids.a, f.facilities]));
    [{ id: f.boardOnly }] = await as(ids.pres, () =>
      sql(`insert into public.folders (association_id, name, visibility) values ($1, 'ملاحظات المجلس', 'board') returning id`, [ids.a]));
    [{ id: f.note }] = await as(ids.pres, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, body) values ($1, $2, 'note', 'المواعيد', '6 ص - 11 م') returning id`, [ids.a, f.gym]));
    await as(ids.pres, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, url) values ($1, $2, 'link', 'الحجز', 'https://example.com') returning id`, [ids.a, f.gym]));
    [{ id: f.secret }] = await as(ids.pres, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, body) values ($1, $2, 'note', 'سري', 'x') returning id`, [ids.a, f.boardOnly]));
    const [row] = await sql(`select created_by, updated_by from public.folder_items where id = $1`, [f.note]);
    assert.equal(row.created_by, ids.pres);
  });

  test("owner sees owners-visible content only and cannot change anything", async () => {
    const folders = await as(ids.owner, () => sql(`select name from public.folders order by name`));
    assert.deepEqual(folders.map((r) => r.name).sort(), ["المرافق", "النادي الرياضي"].sort());
    const items = await as(ids.owner, () => sql(`select title from public.folder_items`));
    assert.ok(!items.some((i) => i.title === "سري"));
    assert.equal(items.length, 2);
    await rejects(as(ids.owner, () => sql(`insert into public.folders (association_id, name) values ($1, 'x')`, [ids.a])));
    const upd = await as(ids.owner, () => sql(`update public.folder_items set title = 'y' where id = $1 returning id`, [f.note]));
    assert.equal(upd.length, 0);
    const del = await as(ids.owner, () => sql(`delete from public.folders where id = $1 returning id`, [f.facilities]));
    assert.equal(del.length, 0);
  });

  test("owner of another association sees nothing", async () => {
    const rows = await as(ids.otherPres, () => sql(`select id from public.folders`));
    assert.equal(rows.length, 0);
    await rejects(as(ids.otherPres, () => sql(`insert into public.folders (association_id, name) values ($1, 'x')`, [ids.a])));
  });

  test("board member without custom_sections can view board folders but not manage", async () => {
    const rows = await as(ids.board, () => sql(`select id from public.folders`));
    assert.equal(rows.length, 3);
    await rejects(as(ids.board, () => sql(`insert into public.folders (association_id, name) values ($1, 'x')`, [ids.a])));
  });

  test("board member with custom_sections has full CRUD", async () => {
    const [{ id }] = await as(ids.boardSections, () =>
      sql(`insert into public.folders (association_id, name) values ($1, 'المسبح') returning id`, [ids.a]));
    await as(ids.boardSections, () => sql(`update public.folders set name = 'المسبح والحمام' where id = $1`, [id]));
    const [{ id: item }] = await as(ids.boardSections, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, body) values ($1, $2, 'note', 'مواعيد', 'x') returning id`, [ids.a, id]));
    await as(ids.boardSections, () => sql(`update public.folder_items set body = '7 ص - 10 م' where id = $1`, [item]));
    await as(ids.boardSections, () => sql(`delete from public.folders where id = $1`, [id]));
    const [{ count }] = await sql(`select count(*)::int from public.folder_items where id = $1`, [item]);
    assert.equal(count, 0, "items are deleted with their folder");
  });

  test("children are never more visible than their parent", async () => {
    const [{ visibility }] = await as(ids.pres, () =>
      sql(`insert into public.folders (association_id, parent_id, name, visibility) values ($1, $2, 'فرعي', 'owners') returning visibility`, [ids.a, f.boardOnly]));
    assert.equal(visibility, "board");
    await as(ids.pres, () => sql(`update public.folders set visibility = 'board' where id = $1`, [f.facilities]));
    const [gym] = await sql(`select visibility from public.folders where id = $1`, [f.gym]);
    assert.equal(gym.visibility, "board");
    assert.equal((await as(ids.owner, () => sql(`select id from public.folders`))).length, 0);
    await as(ids.pres, () => sql(`update public.folders set visibility = 'owners' where id in ($1, $2)`, [f.facilities, f.gym]));
  });

  test("folders cannot be moved inside themselves or across associations", async () => {
    await assert.rejects(as(ids.pres, () => sql(`update public.folders set parent_id = $1 where id = $2`, [f.gym, f.facilities])), /inside itself/);
    const [{ id: zFolder }] = await sql(`insert into public.folders (association_id, name) values ($1, 'z') returning id`, [ids.z]);
    await assert.rejects(as(ids.pres, () =>
      sql(`insert into public.folders (association_id, parent_id, name) values ($1, $2, 'x')`, [ids.a, zFolder])), /same association|row-level/);
  });

  test("an item's association always follows its folder", async () => {
    const [{ association_id }] = await as(ids.pres, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, body) values ($1, $2, 'note', 'ت', 'x') returning association_id`, [ids.a, f.gym]));
    assert.equal(association_id, ids.a);
    // Claiming another association doesn't let a president write into it.
    const [{ id: zFolder }] = await sql(`select id from public.folders where association_id = $1`, [ids.z]);
    await rejects(as(ids.pres, () =>
      sql(`insert into public.folder_items (association_id, folder_id, kind, title, body) values ($1, $2, 'note', 'x', 'x')`, [ids.a, zFolder])));
  });

  test("superadmin: nothing without a grant, read-only with a read grant, CRUD with an edit grant", async () => {
    assert.equal((await as(ids.super, () => sql(`select id from public.folders where association_id = $1`, [ids.a]))).length, 0);

    const readGrant = await approvedGrant(ids.a, ["sections"]);
    assert.ok((await as(ids.super, () => sql(`select id from public.folders where association_id = $1`, [ids.a]))).length >= 3);
    await rejects(as(ids.super, () => sql(`insert into public.folders (association_id, name) values ($1, 'x')`, [ids.a])));
    await as(ids.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [readGrant]));

    const editGrant = await approvedGrant(ids.a, ["sections"], true);
    const [{ id }] = await as(ids.super, () => sql(`insert into public.folders (association_id, name) values ($1, 'من الدعم') returning id`, [ids.a]));
    await as(ids.super, () => sql(`delete from public.folders where id = $1`, [id]));
    // An edit grant for sections doesn't open other areas.
    assert.equal((await as(ids.super, () => sql(`select id from public.units where association_id = $1`, [ids.a]))).length, 0);
    await as(ids.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [editGrant]));
    assert.equal((await as(ids.super, () => sql(`select id from public.folders where association_id = $1`, [ids.a]))).length, 0);
  });

  test("storage: files follow folder visibility and management rights", async () => {
    await sql(`insert into storage.buckets (id, name) values ('association-files', 'association-files') on conflict do nothing`);
    const gymPath = `${ids.a}/${f.gym}/${crypto.randomUUID()}.pdf`;
    const boardPath = `${ids.a}/${f.boardOnly}/${crypto.randomUUID()}.pdf`;
    await rejects(as(ids.owner, () => sql(`insert into storage.objects (bucket_id, name) values ('association-files', $1)`, [gymPath])));
    await as(ids.pres, () => sql(`insert into storage.objects (bucket_id, name) values ('association-files', $1)`, [gymPath]));
    await as(ids.pres, () => sql(`insert into storage.objects (bucket_id, name) values ('association-files', $1)`, [boardPath]));
    await rejects(as(ids.pres, () => sql(`insert into storage.objects (bucket_id, name) values ('association-files', 'not/a-uuid/x.pdf')`)));

    const seen = await as(ids.owner, () => sql(`select name from storage.objects`));
    assert.deepEqual(seen.map((r) => r.name), [gymPath]);
    const del = await as(ids.owner, () => sql(`delete from storage.objects where name = $1 returning id`, [gymPath]));
    assert.equal(del.length, 0);
    const delPres = await as(ids.pres, () => sql(`delete from storage.objects where name = $1 returning id`, [gymPath]));
    assert.equal(delPres.length, 1);
  });

  test("only the superadmin can delete an association", async () => {
    const [{ id }] = await sql(`insert into public.associations (name, city) values ('مؤقتة', 'x') returning id`);
    await sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'president')`, [id, ids.owner]);
    const byPres = await as(ids.owner, () => sql(`delete from public.associations where id = $1 returning id`, [id]));
    assert.equal(byPres.length, 0);
    const bySuper = await as(ids.super, () => sql(`delete from public.associations where id = $1 returning id`, [id]));
    assert.equal(bySuper.length, 1);
  });
});

describe("multiple roles and superadmin management", () => {
  test("the president can also be an owner; the highest role wins", async () => {
    await as(ids.pres, () => sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'owner')`, [ids.a, ids.pres]));
    const [{ role }] = await as(ids.pres, () => sql(`select public.member_role($1) as role`, [ids.a]));
    assert.equal(role, "president");
    const rows = await as(ids.pres, () => sql(`select role from public.memberships where association_id = $1 and user_id = $2 order by role`, [ids.a, ids.pres]));
    assert.deepEqual(rows.map((r) => r.role).sort(), ["owner", "president"]);
  });

  test("a board member can also be an owner, but a president cannot also be a board member", async () => {
    await as(ids.pres, () => sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'owner')`, [ids.a, ids.board]));
    const [{ role }] = await as(ids.board, () => sql(`select public.member_role($1) as role`, [ids.a]));
    assert.equal(role, "board_member");
    await assert.rejects(
      sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'board_member')`, [ids.a, ids.pres]),
      /cannot also be a board member/,
    );
    await assert.rejects(
      sql(`insert into public.memberships (association_id, user_id, role) values ($1, $2, 'owner')`, [ids.a, ids.board]),
      /duplicate key|unique/,
    );
  });

  test("removing the board role keeps the owner role", async () => {
    await as(ids.pres, () => sql(`delete from public.memberships where association_id = $1 and user_id = $2 and role = 'board_member'`, [ids.a, ids.board]));
    const [{ role }] = await as(ids.board, () => sql(`select public.member_role($1) as role`, [ids.a]));
    assert.equal(role, "owner");
  });

  test("only a superadmin can grant superadmin", async () => {
    await rejects(as(ids.pres, () => sql(`select public.set_superadmin($1, true)`, [ids.owner])), /only a superadmin/);
    await as(ids.super, () => sql(`select public.set_superadmin($1, true)`, [ids.pres]));
    const [{ is_superadmin }] = await sql(`select is_superadmin from public.profiles where id = $1`, [ids.pres]);
    assert.equal(is_superadmin, true);
    // The president is now superadmin + president + owner at once.
    const [{ role }] = await as(ids.pres, () => sql(`select public.member_role($1) as role`, [ids.a]));
    assert.equal(role, "president");
    const supers = await as(ids.super, () => sql(`select id from public.profiles where is_superadmin`));
    assert.equal(supers.length, 2);
    const [log] = await sql(`select actor_id from public.audit_log where action = 'grant_superadmin'`);
    assert.equal(log.actor_id, ids.super);
  });

  test("the last superadmin cannot be removed", async () => {
    await as(ids.super, () => sql(`select public.set_superadmin($1, false)`, [ids.pres]));
    await assert.rejects(as(ids.super, () => sql(`select public.set_superadmin($1, false)`, [ids.super])), /at least one superadmin/);
  });
});

describe("acting role (x-acting-role header)", () => {
  test("a superadmin who is also president can act as either, never both at once", async () => {
    await sql(`update public.profiles set is_superadmin = true where id = $1`, [ids.pres]);
    // No header: all roles combined.
    assert.equal((await as(ids.pres, () => sql(`select public.is_superadmin() as v`)))[0].v, true);
    assert.equal((await as(ids.pres, () => sql(`select public.member_role($1) as r`, [ids.a])))[0].r, "president");

    // Acting as superadmin: platform powers only — association data needs a grant.
    const asSuper = (fn) => as(ids.pres, fn, "superadmin");
    assert.equal((await asSuper(() => sql(`select public.is_superadmin() as v`)))[0].v, true);
    assert.equal((await asSuper(() => sql(`select public.member_role($1) as r`, [ids.a])))[0].r, null);
    assert.equal((await asSuper(() => sql(`select id from public.units where association_id = $1`, [ids.a]))).length, 0);
    assert.equal((await asSuper(() => sql(`select id from public.associations`))).length >= 2, true, "sees platform metadata");

    // Acting as president of A: no superadmin powers.
    const asPres = (fn) => as(ids.pres, fn, `president:${ids.a}`);
    assert.equal((await asPres(() => sql(`select public.is_superadmin() as v`)))[0].v, false);
    assert.equal((await asPres(() => sql(`select id from public.associations`))).map((r) => r.id).includes(ids.z), false);
    await rejects(asPres(() => sql(`insert into public.associations (name, city) values ('x', 'y')`)));
    await sql(`update public.profiles set is_superadmin = false where id = $1`, [ids.pres]);
  });

  test("acting as owner gives an owner's view, even for the president", async () => {
    const asOwner = (fn) => as(ids.pres, fn, `owner:${ids.a}`);
    assert.equal((await asOwner(() => sql(`select public.member_role($1) as r`, [ids.a])))[0].r, "owner");
    assert.equal((await asOwner(() => sql(`select public.has_permission($1, 'owners_units') as v`, [ids.a])))[0].v, false);
    await rejects(asOwner(() => sql(`insert into public.units (association_id, unit_number) values ($1, 'x-owner')`, [ids.a])));
    const boardFolders = await asOwner(() => sql(`select id from public.folders where visibility = 'board' and association_id = $1`, [ids.a]));
    assert.equal(boardFolders.length, 0, "board-only folders hidden while acting as owner");
  });

  test("a role you don't hold grants nothing", async () => {
    const r = await as(ids.owner, () => sql(`select public.member_role($1) as r, public.is_superadmin() as s`, [ids.a]), `president:${ids.a}`);
    assert.deepEqual(r[0], { r: null, s: false });
    const s2 = await as(ids.owner, () => sql(`select public.is_superadmin() as s`), "superadmin");
    assert.equal(s2[0].s, false);
  });
});

describe("complaints & suggestions (feedback)", () => {
  const insert = (fields = {}) => sql(
    `insert into public.feedback (kind, full_name, email, message) values ($1, $2, $3, $4) returning id, reference, status`,
    [fields.kind ?? "suggestion", fields.full_name ?? "سليمان", fields.email ?? "a@b.co", fields.message ?? "اقتراح"]);

  test("browsers can't write submissions directly; only the server function can", async () => {
    await rejects(as(ids.owner, () => sql(`insert into public.feedback (kind, full_name, email, message) values ('complaint', 'xx', 'a@b.co', 'm')`)));
  });

  test("a reference number is assigned and status starts as new", async () => {
    const [row] = await insert();
    assert.match(row.reference, /^JM-\d{6}$/);
    assert.equal(row.status, "new");
  });

  test("the database itself enforces the limits", async () => {
    await assert.rejects(insert({ message: "x".repeat(1001) }), /check constraint/);
    await assert.rejects(insert({ email: "not-an-email" }), /check constraint/);
    await assert.rejects(insert({ full_name: " " }), /check constraint/);
    await assert.rejects(insert({ kind: "hack" }), /check constraint/);
    const [ok] = await insert({ message: "x".repeat(1000) });
    assert.ok(ok.id);
  });

  test("SQL-injection text is stored as plain text, nothing is executed", async () => {
    const evil = "'); drop table public.feedback; -- <script>alert(1)</script>";
    const [{ id }] = await insert({ message: evil, full_name: "Robert'); DROP TABLE x;--" });
    const [row] = await sql(`select message, full_name from public.feedback where id = $1`, [id]);
    assert.equal(row.message, evil);
    const [{ n }] = await sql(`select count(*)::int as n from public.feedback`);
    assert.ok(n >= 3, "table still exists with its rows");
  });

  test("only superadmins can read; they can change the status but not the content", async () => {
    assert.equal((await as(ids.owner, () => sql(`select id from public.feedback`))).length, 0);
    assert.equal((await as(ids.pres, () => sql(`select id from public.feedback`))).length, 0);
    const rows = await as(ids.super, () => sql(`select id from public.feedback order by id`));
    assert.ok(rows.length >= 3);
    await as(ids.super, () => sql(`update public.feedback set status = 'resolved' where id = $1`, [rows[0].id]));
    await rejects(as(ids.super, () => sql(`update public.feedback set message = 'changed' where id = $1`, [rows[0].id])));
    // Acting as a member role, platform powers are off.
    assert.equal((await as(ids.super, () => sql(`select id from public.feedback`), `owner:${ids.a}`)).length, 0);
  });
});

describe("support request journey (notes, done, countdown)", () => {
  const ask = async (reason = "مشكلة") => (await as(ids.pres, () => sql(
    `insert into public.support_grants (association_id, reason, sections, duration_hours, can_edit) values ($1, $2, '{sections}', 72, true) returning id`,
    [ids.a, reason])))[0].id;
  const act = (user, id, action, note) => as(user, () => sql(`select public.act_on_support_request($1, $2, $3)`, [id, action, note ?? null]));
  const journey = async (id) => (await as(ids.pres, () => sql(
    `select event, note, actor_id from public.support_grant_events where grant_id = $1 order by id`, [id])));

  test("rejecting needs a reason; the president sees the whole journey", async () => {
    const id = await ask("لا أستطيع رفع ملف");
    await assert.rejects(act(ids.super, id, "reject", "  "), /reason is required/);
    await act(ids.super, id, "reject", "يرجى إرفاق صورة للخطأ");
    const steps = await journey(id);
    assert.deepEqual(steps.map((s) => s.event), ["requested", "rejected"]);
    assert.equal(steps[0].note, "لا أستطيع رفع ملف");
    assert.equal(steps[1].note, "يرجى إرفاق صورة للخطأ");
    assert.equal(steps[1].actor_id, ids.super);
  });

  test("accepting (note optional) starts the countdown for the requested duration with the requested scope", async () => {
    const id = await ask();
    await act(ids.super, id, "approve", "سأبدأ العمل الآن");
    const [g] = await sql(`select status, expires_at, decided_at from public.support_grants where id = $1`, [id]);
    assert.equal(g.status, "approved");
    const hours = (g.expires_at - g.decided_at) / 3600000;
    assert.ok(Math.abs(hours - 72) < 0.01, "72 hours, as requested");
    // Requested scope: sections with edit → can create a folder; units still closed.
    const [{ id: folder }] = await as(ids.super, () => sql(`insert into public.folders (association_id, name) values ($1, 'من الدعم') returning id`, [ids.a]));
    assert.ok(folder);
    assert.equal((await as(ids.super, () => sql(`select id from public.units where association_id = $1`, [ids.a]))).length, 0);
    ids.activeGrant = id;
  });

  test("only the platform can mark it done, with a note; access ends at that moment", async () => {
    const id = ids.activeGrant;
    await assert.rejects(act(ids.pres, id, "complete", "تم"), /only the platform/);
    await assert.rejects(act(ids.super, id, "complete", ""), /note is required/);
    await act(ids.super, id, "complete", "تم إصلاح صلاحيات رفع الملفات");
    const [g] = await sql(`select status, expires_at from public.support_grants where id = $1`, [id]);
    assert.equal(g.status, "completed");
    assert.ok(g.expires_at <= new Date());
    assert.equal((await as(ids.super, () => sql(`select id from public.folders where association_id = $1`, [ids.a]))).length, 0);
    assert.deepEqual((await journey(id)).map((s) => s.event), ["requested", "approved", "completed"]);
  });

  test("cancel and end are recorded too; the journey can't be written or erased from the apps", async () => {
    const id = await ask();
    await act(ids.pres, id, "cancel", null);
    assert.deepEqual((await journey(id)).map((s) => s.event), ["requested", "cancelled"]);
    await rejects(as(ids.pres, () => sql(`insert into public.support_grant_events (grant_id, association_id, event) values ($1, $2, 'completed')`, [id, ids.a])));
    await rejects(as(ids.super, () => sql(`delete from public.support_grant_events where grant_id = $1`, [id])));
    await rejects(as(ids.super, () => sql(`update public.support_grant_events set note = 'x' where grant_id = $1`, [id])));
    // Owners don't see journeys.
    assert.equal((await as(ids.owner, () => sql(`select id from public.support_grant_events`))).length, 0);
  });

  test("notes over 2000 characters are refused", async () => {
    const id = await ask();
    await assert.rejects(act(ids.super, id, "reject", "x".repeat(2001)), /too long/);
  });
});

describe("archive, vendors & finance", () => {
  const x = {};
  before(async () => {
    x.docs = await createUser("عضو الأرشيف", "966500000020");
    x.vend = await createUser("عضو العقود", "966500000021");
    x.fin = await createUser("أمين الصندوق", "966500000022");
    await sql(`insert into public.memberships (association_id, user_id, role, permissions) values
      ($1, $2, 'board_member', '{documents}'), ($1, $3, 'board_member', '{vendors_contracts}'), ($1, $4, 'board_member', '{finance}')`,
      [ids.a, x.docs, x.vend, x.fin]);
    await sql(`insert into storage.buckets (id, name) values ('association-archive', 'association-archive') on conflict do nothing`);
  });

  const addDoc = (user, visibility, title = "عقد") => as(user, () => sql(
    `insert into public.documents (association_id, category, title, visibility, file_path, file_name)
     values ($1, 'contract', $2, $3, $4, 'ملف.pdf') returning id, file_path`,
    [ids.a, title, visibility, `${ids.a}/${crypto.randomUUID()}.pdf`]));

  test("archive: president shares with owners; board uploads board-only; owners see shared docs only", async () => {
    [x.ownersDoc] = await addDoc(ids.pres, "owners", "عقد النظافة");
    [x.boardDoc] = await addDoc(x.docs, "board", "محضر اجتماع");
    await assert.rejects(addDoc(x.docs, "owners"), /only the president can share/);
    await assert.rejects(as(x.docs, () => sql(`update public.documents set visibility = 'owners' where id = $1`, [x.boardDoc.id])), /only the president/);
    await rejects(addDoc(ids.owner, "board"));
    const seen = await as(ids.owner, () => sql(`select title from public.documents`));
    assert.deepEqual(seen.map((r) => r.title), ["عقد النظافة"]);
    // This member's board role was removed in an earlier test; as an owner they see shared documents only.
    assert.deepEqual((await as(ids.board, () => sql(`select title from public.documents`))).map((r) => r.title), ["عقد النظافة"]);
  });

  test("archive files follow document visibility", async () => {
    await as(ids.pres, () => sql(`insert into storage.objects (bucket_id, name) values ('association-archive', $1), ('association-archive', $2)`,
      [x.ownersDoc.file_path, x.boardDoc.file_path]));
    const files = await as(ids.owner, () => sql(`select name from storage.objects where bucket_id = 'association-archive'`));
    assert.deepEqual(files.map((f) => f.name), [x.ownersDoc.file_path]);
    await rejects(as(ids.owner, () => sql(`insert into storage.objects (bucket_id, name) values ('association-archive', $1)`, [`${ids.a}/x.pdf`])));
  });

  test("archive: soft delete only, with a reason; restore works; no hard delete", async () => {
    await assert.rejects(as(ids.pres, () => sql(`update public.documents set deleted_at = now() where id = $1`, [x.ownersDoc.id])), /check constraint/);
    await as(ids.pres, () => sql(`update public.documents set deleted_at = now(), delete_reason = 'نسخة مكررة' where id = $1`, [x.ownersDoc.id]));
    assert.equal((await as(ids.owner, () => sql(`select id from public.documents`))).length, 0);
    const [d] = await as(ids.pres, () => sql(`select deleted_by, delete_reason from public.documents where id = $1`, [x.ownersDoc.id]));
    assert.equal(d.deleted_by, ids.pres);
    await as(ids.pres, () => sql(`update public.documents set deleted_at = null where id = $1`, [x.ownersDoc.id]));
    assert.equal((await as(ids.owner, () => sql(`select id from public.documents`))).length, 1);
    await rejects(as(ids.pres, () => sql(`delete from public.documents where id = $1`, [x.ownersDoc.id])));
  });

  test("vendors: board manages with permission; owners only see the directory", async () => {
    const [v] = await as(x.vend, () => sql(
      `insert into public.vendors (association_id, name, category, website, support_phone) values ($1, 'شركة النظافة', 'cleaning_maintenance', 'https://clean.example', '920000000') returning id`, [ids.a]));
    const [o] = await as(x.vend, () => sql(
      `insert into public.vendor_offers (association_id, vendor_id, title, services, price_amount, price_basis, status)
       values ($1, $2, 'عرض 2027', '{daily_cleaning,glass}', 1200, 'per_unit_year', 'offer') returning association_id`, [ids.z, v.id]));
    assert.equal(o.association_id, ids.a, "offer follows its vendor's association");
    await rejects(as(x.docs, () => sql(`insert into public.vendors (association_id, name, category) values ($1, 'x y', 'other')`, [ids.a])));
    assert.equal((await as(ids.owner, () => sql(`select id from public.vendors`))).length, 0);
    assert.equal((await as(ids.owner, () => sql(`select id from public.vendor_offers`))).length, 0);
    const dir = await as(ids.owner, () => sql(`select name, website, support_phone from public.vendor_directory($1)`, [ids.a]));
    assert.deepEqual(dir, [{ name: "شركة النظافة", website: "https://clean.example", support_phone: "920000000" }]);
    assert.equal((await as(ids.otherPres, () => sql(`select * from public.vendor_directory($1)`, [ids.a]))).length, 0);
    x.vendor = v.id;
  });

  test("finance: board manages lines; owners see totals of approved budgets only", async () => {
    const [b] = await as(x.fin, () => sql(`insert into public.budgets (association_id, fiscal_year) values ($1, 2027) returning id`, [ids.a]));
    await as(x.fin, () => sql(`insert into public.budget_lines (association_id, budget_id, kind, category, planned_amount, actual_amount, vendor_id) values
      ($1, $2, 'income', 'owner_fees', 100000, 90000, null), ($1, $2, 'expense', 'cleaning', 40000, 42000, $3)`, [ids.a, b.id, x.vendor]));
    await assert.rejects(as(x.fin, () => sql(`insert into public.budget_lines (association_id, budget_id, kind, category) values ($1, $2, 'income', 'cleaning')`, [ids.a, b.id])), /check constraint/);
    await rejects(as(x.docs, () => sql(`insert into public.budgets (association_id, fiscal_year) values ($1, 2028)`, [ids.a])));
    assert.equal((await as(ids.owner, () => sql(`select * from public.finance_summary($1)`, [ids.a]))).length, 0, "draft hidden from owners");
    assert.equal((await as(ids.owner, () => sql(`select id from public.budget_lines`))).length, 0);
    await as(ids.pres, () => sql(`update public.budgets set status = 'approved' where id = $1`, [b.id]));
    const [sum] = await as(ids.owner, () => sql(`select fiscal_year, planned_income, actual_income, planned_expense, actual_expense from public.finance_summary($1)`, [ids.a]));
    assert.deepEqual(
      { y: sum.fiscal_year, pi: Number(sum.planned_income), ai: Number(sum.actual_income), pe: Number(sum.planned_expense), ae: Number(sum.actual_expense) },
      { y: 2027, pi: 100000, ai: 90000, pe: 40000, ae: 42000 });
  });

  test("superadmin needs an accepted request for each section", async () => {
    assert.equal((await as(ids.super, () => sql(`select id from public.documents where association_id = $1`, [ids.a]))).length, 0);
    assert.equal((await as(ids.super, () => sql(`select id from public.vendors where association_id = $1`, [ids.a]))).length, 0);
    const g = await approvedGrant(ids.a, ["vendors"]);
    assert.ok((await as(ids.super, () => sql(`select id from public.vendors where association_id = $1`, [ids.a]))).length > 0);
    assert.equal((await as(ids.super, () => sql(`select id from public.budgets where association_id = $1`, [ids.a]))).length, 0, "finance not covered");
    await as(ids.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [g]));
  });
});

describe("archive AI analysis", () => {
  const y = {};
  before(async () => {
    [{ id: y.a }] = await sql(`insert into public.associations (name, city) values ('جمعية ت', 'الدمام') returning id`);
    y.pres = await createUser("رئيس التحليل", "966500000030");
    y.board = await createUser("عضو التحليل", "966500000031");
    y.owner = await createUser("مالك التحليل", "966500000032");
    await sql(`insert into public.memberships (association_id, user_id, role, permissions) values
      ($1, $2, 'president', '{}'), ($1, $3, 'board_member', '{}'), ($1, $4, 'owner', '{}')`, [y.a, y.pres, y.board, y.owner]);
    [y.shared] = await as(y.pres, () => sql(
      `insert into public.documents (association_id, category, title, visibility, file_path, file_name)
       values ($1, 'invoice', 'فاتورة', 'owners', $2, 'f.pdf') returning id`, [y.a, `${y.a}/1.pdf`]));
  });

  // What the edge functions write (service role).
  async function finishedRun() {
    const [run] = await sql(`insert into public.archive_analyses (association_id, kind, status) values ($1, 'auto', 'done') returning id`, [y.a]);
    await sql(`insert into public.archive_analysis_results (analysis_id, association_id, audience, result) values
      ($1, $2, 'owners', '{"k":"owners"}'), ($1, $2, 'board', '{"k":"board"}')`, [run.id, y.a]);
    await sql(`insert into public.archive_forecasts (analysis_id, association_id, result) values ($1, $2, '{}')`, [run.id, y.a]);
    return run.id;
  }
  const audiences = (user, acting) => as(user, () => sql(`select audience from public.archive_analysis_results where association_id = $1 order by audience`, [y.a]), acting);
  const forecasts = (user, acting) => as(user, () => sql(`select analysis_id from public.archive_forecasts where association_id = $1`, [y.a]), acting);

  test("uploading a file queues its digest; digests are never readable by app users", async () => {
    const [d] = await sql(`select status, file_path from public.document_digests where document_id = $1`, [y.shared.id]);
    assert.deepEqual(d, { status: "pending", file_path: `${y.a}/1.pdf` });
    await sql(`update public.document_digests set status = 'done', digest = '{}' where document_id = $1`, [y.shared.id]);
    await as(y.pres, () => sql(`update public.documents set title = 'فاتورة ١' where id = $1`, [y.shared.id]));
    assert.equal((await sql(`select status from public.document_digests where document_id = $1`, [y.shared.id]))[0].status, "done", "metadata edits keep the digest");
    await as(y.pres, () => sql(`update public.documents set file_path = $2 where id = $1`, [y.shared.id, `${y.a}/2.pdf`]));
    assert.equal((await sql(`select status from public.document_digests where document_id = $1`, [y.shared.id]))[0].status, "pending", "a new file is read again");
    await rejects(as(y.pres, () => sql(`select * from public.document_digests`)));
  });

  test("owners see the owners' overview only; the board sees its own; forecast needs premium", async () => {
    await finishedRun();
    assert.deepEqual((await audiences(y.owner)).map((r) => r.audience), ["owners"]);
    assert.deepEqual((await audiences(y.board)).map((r) => r.audience), ["board", "owners"]);
    assert.equal((await forecasts(y.owner)).length, 0);
    assert.equal((await forecasts(y.board)).length, 0, "base plan");
    await sql(`update public.associations set plan = 'premium' where id = $1`, [y.a]);
    assert.ok((await forecasts(y.board)).length > 0);
    assert.ok((await forecasts(y.pres)).length > 0);
    assert.equal((await forecasts(y.owner)).length, 0, "owners never see the forecast");
    assert.ok((await as(y.owner, () => sql(`select id from public.archive_analyses where association_id = $1`, [y.a]))).length > 0, "owners see run status");
    await rejects(as(y.pres, () => sql(`insert into public.archive_analysis_results (analysis_id, association_id, audience, result)
      select id, association_id, 'owners', '{}' from public.archive_analyses limit 1`)));
    await sql(`update public.associations set plan = 'base' where id = $1`, [y.a]);
  });

  test("superadmin sees the analysis and the forecast only under an 'analysis' grant, on any plan", async () => {
    assert.equal((await audiences(ids.super)).length, 0);
    assert.equal((await forecasts(ids.super)).length, 0);
    const [{ id: g }] = await as(y.pres, () => sql(
      `insert into public.support_grants (association_id, reason, sections) values ($1, 'مراجعة التحليل', '{analysis}') returning id`, [y.a]));
    await as(ids.super, () => sql(`update public.support_grants set status = 'approved' where id = $1`, [g]));
    assert.deepEqual((await audiences(ids.super)).map((r) => r.audience), ["board", "owners"]);
    assert.ok((await forecasts(ids.super)).length > 0, "base plan, but the platform owner");
    assert.equal((await as(ids.super, () => sql(`select id from public.documents where association_id = $1`, [y.a]))).length, 0, "grant covers the analysis, not the files");
    await as(y.pres, () => sql(`update public.support_grants set status = 'revoked' where id = $1`, [g]));
    assert.equal((await audiences(ids.super)).length, 0);
  });

  test("refresh: the president only, one run at a time; the interval is the president's", async () => {
    await rejects(as(y.board, () => sql(`select public.request_archive_analysis($1)`, [y.a])), /only the president/);
    await rejects(as(y.owner, () => sql(`select public.request_archive_analysis($1)`, [y.a])), /only the president/);
    const [{ request_archive_analysis: run }] = await as(y.pres, () => sql(`select public.request_archive_analysis($1)`, [y.a]));
    const [row] = await sql(`select status, kind, include_forecast, requested_by from public.archive_analyses where id = $1`, [run]);
    assert.deepEqual(row, { status: "queued", kind: "manual", include_forecast: false, requested_by: y.pres });
    await assert.rejects(as(y.pres, () => sql(`select public.request_archive_analysis($1)`, [y.a])), /analysis_in_progress/);
    await rejects(as(y.pres, () => sql(`select public.queue_archive_analysis($1, 'manual', null)`, [y.a])));
    await sql(`update public.archive_analyses set status = 'failed' where id = $1`, [run]);

    await as(y.pres, () => sql(`update public.associations set analysis_interval_days = 7 where id = $1`, [y.a]));
    await assert.rejects(as(y.pres, () => sql(`update public.associations set analysis_interval_days = 5 where id = $1`, [y.a])), /check constraint/);
    await as(y.board, () => sql(`update public.associations set analysis_interval_days = 90 where id = $1`, [y.a]));
    assert.equal((await sql(`select analysis_interval_days from public.associations where id = $1`, [y.a]))[0].analysis_interval_days, 7, "board can't change it");
  });

  test("finishing parts: done once all parts end; failed only when nothing was written", async () => {
    const [{ id }] = await sql(`insert into public.archive_analyses (association_id, kind, status, parts_pending) values ($1, 'auto', 'running', '{owners,board}') returning id`, [y.a]);
    assert.equal((await sql(`select public.finish_analysis_part($1, 'owners', 'boom')`, [id]))[0].finish_analysis_part, "running");
    assert.equal((await sql(`select public.finish_analysis_part($1, 'board', 'boom')`, [id]))[0].finish_analysis_part, "failed");
    const [{ id: id2 }] = await sql(`insert into public.archive_analyses (association_id, kind, status, parts_pending) values ($1, 'auto', 'running', '{board}') returning id`, [y.a]);
    await sql(`insert into public.archive_analysis_results (analysis_id, association_id, audience, result) values ($1, $2, 'board', '{}')`, [id2, y.a]);
    assert.equal((await sql(`select public.finish_analysis_part($1, 'board')`, [id2]))[0].finish_analysis_part, "done");
  });

  test("unsharing a document withdraws the owners' overview and queues a rebuild", async () => {
    assert.ok((await audiences(y.owner)).length > 0);
    await as(y.pres, () => sql(`update public.documents set visibility = 'board' where id = $1`, [y.shared.id]));
    assert.equal((await audiences(y.owner)).length, 0);
    assert.ok((await audiences(y.board)).length > 0, "the board keeps its version");
    const [queued] = await sql(`select kind from public.archive_analyses where association_id = $1 and status = 'queued'`, [y.a]);
    assert.equal(queued.kind, "auto");
  });

  test("without the Vault secrets nothing is queued: refresh is refused and the scheduler does nothing", async () => {
    await sql(`update vault.decrypted_secrets set decrypted_secret = '' where name = 'internal_functions_secret'`);
    try {
      await sql(`update public.archive_analyses set status = 'failed' where association_id = $1 and status in ('queued', 'running')`, [y.a]);
      await assert.rejects(as(y.pres, () => sql(`select public.request_archive_analysis($1)`, [y.a])), /analysis_not_configured/);
      const before = await sql(`select count(*)::int as n from public.archive_analyses`);
      await sql(`update public.archive_analyses set finished_at = now() - interval '99 days' where association_id = $1`, [y.a]);
      await sql(`select public.run_analysis_schedule()`);
      assert.deepEqual(await sql(`select count(*)::int as n from public.archive_analyses`), before);
    } finally {
      await sql(`update vault.decrypted_secrets set decrypted_secret = 'test' where name = 'internal_functions_secret'`);
    }
  });

  test("scheduler runs an analysis only when the interval passed and something changed", async () => {
    await sql(`update public.archive_analyses set status = 'failed', created_at = now() - interval '2 days' where association_id = $1 and status in ('queued', 'running', 'failed')`, [y.a]);
    await sql(`update public.document_digests set status = 'done' where association_id = $1`, [y.a]);
    await sql(`update public.archive_analyses set finished_at = now() - interval '9 days' where association_id = $1 and status = 'done'`, [y.a]);
    // A recent finished run that saw every change: nothing to do.
    await sql(`insert into public.archive_analyses (association_id, kind, status, finished_at, source_watermark)
      values ($1, 'auto', 'done', now() - interval '8 days', public.archive_source_watermark($1))`, [y.a]);
    await sql(`select public.run_analysis_schedule()`);
    assert.equal((await sql(`select id from public.archive_analyses where association_id = $1 and status = 'queued'`, [y.a])).length, 0, "unchanged archive");
    await as(y.pres, () => sql(`update public.documents set notes = 'ملاحظة' where id = $1`, [y.shared.id]));
    await sql(`select public.run_analysis_schedule()`);
    assert.equal((await sql(`select kind from public.archive_analyses where association_id = $1 and status = 'queued'`, [y.a]))[0].kind, "auto");
  });
});
