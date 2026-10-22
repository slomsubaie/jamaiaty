// Data access shared by web and mobile. All calls run as the signed-in user, so RLS decides
// what comes back; the apps only shape the UI around it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import type { Access, ActiveGrant } from "./access.ts";
import type { ActingRole } from "./acting.ts";
import { ROLE_RANK, sortRoles, type BoardPermission, type FolderVisibility, type MemberRole, type SupportSection } from "./roles.ts";
import type { AddMemberInput, CreateAssociationInput, FeedbackInput } from "./schemas.ts";

type Client = SupabaseClient<Database>;

export const queryKeys = {
  me: ["me"] as const,
  myMemberships: ["my-memberships"] as const,
  association: (id: string) => ["association", id] as const,
  members: (id: string) => ["members", id] as const,
  units: (id: string) => ["units", id] as const,
  buildings: (id: string) => ["buildings", id] as const,
  allAssociations: ["all-associations"] as const,
  access: (id: string) => ["access", id] as const,
  grants: (id: string) => ["grants", id] as const,
  allGrants: ["all-grants"] as const,
  superadmins: ["superadmins"] as const,
  feedback: ["feedback"] as const,
  folders: (id: string) => ["folders", id] as const,
  items: (folderId: string) => ["items", folderId] as const,
};

export async function getMe(sb: Client) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await sb.from("profiles").select("id, full_name, phone, is_superadmin").eq("id", auth.user.id).single();
  if (error) throw error;
  return data;
}

/** The user's associations, one entry per association with all their roles in it. */
export async function listMyMemberships(sb: Client, userId: string) {
  const { data, error } = await sb
    .from("memberships")
    .select("association_id, role, permissions, associations (id, name, city, plan)")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  const byAssociation = new Map<string, { association_id: string; associations: (typeof data)[number]["associations"]; roles: MemberRole[]; role: MemberRole }>();
  for (const m of data) {
    const entry = byAssociation.get(m.association_id) ?? { association_id: m.association_id, associations: m.associations, roles: [], role: m.role };
    entry.roles = sortRoles([...entry.roles, m.role]);
    entry.role = entry.roles[0];
    byAssociation.set(m.association_id, entry);
  }
  return [...byAssociation.values()];
}

/** All the user's roles in one association; `role` is the highest, `permissions` the board ones. */
export async function getMyMembership(sb: Client, associationId: string, userId: string) {
  const { data, error } = await sb
    .from("memberships")
    .select("role, permissions")
    .eq("association_id", associationId)
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw error;
  if (!data.length) return null;
  const roles = sortRoles(data.map((m) => m.role));
  const permissions = data.find((m) => m.role === "board_member")?.permissions ?? [];
  return { role: roles[0], roles, permissions };
}

export async function getAssociation(sb: Client, id: string) {
  const { data, error } = await sb.from("associations").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

/** Members of an association, one entry per person with all their roles. */
export async function listMembers(sb: Client, associationId: string) {
  const { data, error } = await sb
    .from("memberships")
    .select("id, user_id, role, permissions, active, profiles (full_name, phone)")
    .eq("association_id", associationId)
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  type Row = (typeof data)[number];
  const people = new Map<string, { user_id: string; profiles: Row["profiles"]; roles: MemberRole[]; role: MemberRole; rows: Row[]; boardRow: Row | null; permissions: BoardPermission[] }>();
  for (const m of data) {
    const p = people.get(m.user_id) ?? { user_id: m.user_id, profiles: m.profiles, roles: [], role: m.role, rows: [], boardRow: null, permissions: [] };
    p.rows.push(m);
    p.roles = sortRoles([...p.roles, m.role]);
    p.role = p.roles[0];
    if (m.role === "board_member") {
      p.boardRow = m;
      p.permissions = m.permissions;
    }
    people.set(m.user_id, p);
  }
  return [...people.values()].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]);
}

export async function setBoardPermissions(sb: Client, membershipId: string, permissions: BoardPermission[]) {
  const { error } = await sb.from("memberships").update({ permissions }).eq("id", membershipId);
  if (error) throw error;
}

/** Removes a person from the association (all roles except president). */
export async function deactivateMember(sb: Client, associationId: string, userId: string) {
  const { error } = await sb
    .from("memberships")
    .update({ active: false })
    .eq("association_id", associationId)
    .eq("user_id", userId)
    .neq("role", "president");
  if (error) throw error;
}

export async function listBuildings(sb: Client, associationId: string) {
  const { data, error } = await sb.from("buildings").select("id, name").eq("association_id", associationId).order("name");
  if (error) throw error;
  return data;
}

export async function listUnits(sb: Client, associationId: string) {
  const { data, error } = await sb
    .from("units")
    .select("id, unit_number, floor, area_m2, mullak_unit_ref, building_id, buildings (name), unit_ownerships (id, user_id, share_pct, start_date, end_date, profiles (full_name))")
    .eq("association_id", associationId)
    .order("unit_number");
  if (error) throw error;
  return data.map((u) => ({ ...u, unit_ownerships: u.unit_ownerships.filter((o) => o.end_date === null) }));
}

export async function createBuilding(sb: Client, associationId: string, name: string) {
  const { error } = await sb.from("buildings").insert({ association_id: associationId, name });
  if (error) throw error;
}

export async function createUnit(
  sb: Client,
  unit: { association_id: string; building_id: string | null; unit_number: string; floor?: string; area_m2?: number; mullak_unit_ref?: string },
) {
  const { error } = await sb.from("units").insert(unit);
  if (error) throw error;
}

/** Superadmin view: platform metadata plus each association's president. */
export async function listAllAssociations(sb: Client) {
  const { data, error } = await sb
    .from("associations")
    .select("id, name, city, mullak_number, plan, status, created_at, memberships (role, profiles (full_name, phone))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((a) => ({
    ...a,
    president: a.memberships.find((m) => m.role === "president")?.profiles ?? null,
  }));
}

async function invoke<T>(sb: Client, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke<T>(fn, { body });
  if (error) {
    // Surface the function's own error code (e.g. "forbidden") when there is one.
    const ctx = (error as { context?: Response }).context;
    const payload = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(payload?.error ?? error.message);
  }
  return data as T;
}

export function addMember(sb: Client, input: AddMemberInput) {
  return invoke<{ user_id: string }>(sb, "add-member", input);
}

export function createAssociation(sb: Client, input: CreateAssociationInput) {
  return invoke<{ association_id: string; president_id: string }>(sb, "create-association", input);
}

// ---------------------------------------------------------------------------
// Access (membership or superadmin support grant)
// ---------------------------------------------------------------------------

export async function getAccess(sb: Client, associationId: string, userId: string, acting: ActingRole | null = null): Promise<Access> {
  let membership = await getMyMembership(sb, associationId, userId);
  // Mirror the database: the acting role narrows which of the person's roles count here.
  if (acting?.kind === "superadmin") membership = null;
  else if (acting?.kind === "member" && acting.association_id === associationId && membership) {
    membership = membership.roles.includes(acting.role)
      ? { role: acting.role, roles: [acting.role], permissions: acting.role === "board_member" ? membership.permissions : [] }
      : null;
  }
  let grants: ActiveGrant[] = [];
  if (!membership) {
    // Only superadmins can read grants without being approvers; RLS returns nothing otherwise.
    const { data } = await sb
      .from("support_grants")
      .select("id, sections, can_edit, expires_at")
      .eq("association_id", associationId)
      .eq("status", "approved")
      .gt("expires_at", new Date().toISOString());
    grants = data ?? [];
  }
  return { role: membership?.role ?? null, roles: membership?.roles ?? [], permissions: membership?.permissions ?? [], grants };
}

/** Records a superadmin's page view under a support grant in the association's audit log. */
export async function logSupportView(sb: Client, associationId: string, section: SupportSection, page: string) {
  await sb.rpc("log_support_view", { a: associationId, section, page });
}

// ---------------------------------------------------------------------------
// Associations & profile
// ---------------------------------------------------------------------------

export type AssociationPatch = Partial<
  Pick<Database["public"]["Tables"]["associations"]["Row"], "name" | "city" | "mullak_number" | "plan" | "status">
>;

export async function updateAssociation(sb: Client, id: string, patch: AssociationPatch) {
  const { error } = await sb.from("associations").update(patch).eq("id", id);
  if (error) throw error;
}

/** Superadmin only. Runs server-side so the association's stored files are removed too. */
export function deleteAssociation(sb: Client, id: string) {
  return invoke<{ deleted: string; files_removed: number }>(sb, "delete-association", { association_id: id });
}

export async function updateMyName(sb: Client, userId: string, fullName: string) {
  const { error } = await sb.from("profiles").update({ full_name: fullName.trim() }).eq("id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Buildings, units, ownerships
// ---------------------------------------------------------------------------

export async function renameBuilding(sb: Client, id: string, name: string) {
  const { error } = await sb.from("buildings").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteBuilding(sb: Client, id: string) {
  const { error } = await sb.from("buildings").delete().eq("id", id);
  if (error) throw error;
}

export type UnitPatch = Partial<
  Pick<Database["public"]["Tables"]["units"]["Row"], "building_id" | "unit_number" | "floor" | "area_m2" | "mullak_unit_ref">
>;

export async function updateUnit(sb: Client, id: string, patch: UnitPatch) {
  const { error } = await sb.from("units").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteUnit(sb: Client, id: string) {
  const { error } = await sb.from("units").delete().eq("id", id);
  if (error) throw error;
}

export async function addOwnership(
  sb: Client,
  o: { association_id: string; unit_id: string; user_id: string; share_pct: number },
) {
  const { error } = await sb.from("unit_ownerships").insert(o);
  if (error) throw error;
}

export async function updateOwnershipShare(sb: Client, id: string, sharePct: number) {
  const { error } = await sb.from("unit_ownerships").update({ share_pct: sharePct }).eq("id", id);
  if (error) throw error;
}

/** Ends an ownership (e.g. the unit was sold) while keeping the history row. */
export async function endOwnership(sb: Client, id: string) {
  const { error } = await sb.from("unit_ownerships").update({ end_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
  if (error) throw error;
}

/** Removes an ownership entered by mistake. */
export async function deleteOwnership(sb: Client, id: string) {
  const { error } = await sb.from("unit_ownerships").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** President only: switch a member between owner and board member. */
/** Adds or removes one role for a person (roles are combinable, e.g. board member + owner). */
export async function setMemberRole(sb: Client, associationId: string, userId: string, role: "owner" | "board_member", on: boolean) {
  if (on) {
    const { error } = await sb
      .from("memberships")
      .upsert({ association_id: associationId, user_id: userId, role, active: true }, { onConflict: "association_id,user_id,role" });
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("memberships").delete().eq("association_id", associationId).eq("user_id", userId).eq("role", role);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Superadmins (only a superadmin can grant or revoke)
// ---------------------------------------------------------------------------

export async function listSuperadmins(sb: Client) {
  const { data, error } = await sb.from("profiles").select("id, full_name, phone").eq("is_superadmin", true).order("full_name");
  if (error) throw error;
  return data;
}

export function manageSuperadmin(sb: Client, input: { phone: string; full_name?: string; grant: boolean }) {
  return invoke<{ user_id: string; is_superadmin: boolean }>(sb, "manage-superadmin", input);
}

// ---------------------------------------------------------------------------
// Support grants
// ---------------------------------------------------------------------------

const GRANT_FIELDS =
  "id, association_id, direction, reason, sections, can_edit, duration_hours, status, expires_at, created_at, decided_at, associations (name, city), requester:profiles!support_grants_requested_by_fkey (full_name, phone), decider:profiles!support_grants_decided_by_fkey (full_name), support_grant_events (id, event, note, created_at, actor:profiles!support_grant_events_actor_id_fkey (full_name))" as const;

export async function listGrants(sb: Client, associationId: string) {
  const { data, error } = await sb.from("support_grants").select(GRANT_FIELDS).eq("association_id", associationId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Superadmin view of every support request on the platform. */
export async function listAllGrants(sb: Client) {
  const { data, error } = await sb.from("support_grants").select(GRANT_FIELDS).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getGrant(sb: Client, id: string) {
  const { data, error } = await sb.from("support_grants").select(GRANT_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export type Grant = NonNullable<Awaited<ReturnType<typeof getGrant>>>;

export interface GrantInput {
  association_id: string;
  reason: string;
  sections: SupportSection[];
  duration_hours: 24 | 72 | 168;
  can_edit: boolean;
}

/**
 * Creates a support request. Acting as superadmin it asks the association for access
 * (the association decides); acting for the association it asks the platform for help
 * (a superadmin decides). The database sets the direction and keeps it pending.
 */
export async function createSupportRequest(sb: Client, input: GrantInput) {
  const { error } = await sb.from("support_grants").insert(input);
  if (error) throw error;
}

export type SupportAction = "approve" | "reject" | "complete" | "cancel" | "end";

/**
 * approve / reject: the superadmin answers a request (a reason is required to reject).
 * complete: the superadmin marks the work done, with a note; access ends.
 * cancel: the association withdraws a pending request. end: the association ends active access.
 * Every action is recorded in the request's journey with its note.
 */
export async function actOnSupportRequest(sb: Client, id: string, action: SupportAction, note?: string) {
  const { error } = await sb.rpc("act_on_support_request", { p_grant: id, p_action: action, p_note: note?.trim() || undefined });
  if (error) {
    if (/reason is required|note is required/.test(error.message)) throw new Error("note_required");
    if (/too long/.test(error.message)) throw new Error("note_too_long");
    throw error;
  }
}

/** Journey steps in order, oldest first. */
export function grantJourney(g: { support_grant_events: { id: number; event: string; note: string | null; created_at: string; actor: { full_name: string } | null }[] }) {
  return [...g.support_grant_events].sort((x, y) => x.id - y.id);
}

export type GrantState = "pending" | "active" | "expired" | "rejected" | "revoked" | "completed";

export function grantState(g: { status: string; expires_at: string | null }): GrantState {
  if (g.status === "approved") return g.expires_at && new Date(g.expires_at) <= new Date() ? "expired" : "active";
  return g.status as GrantState;
}

/** Which actions the current side may take on a request. */
export function grantActions(g: { status: string; expires_at: string | null; direction: string }, side: "platform" | "association") {
  const state = grantState(g);
  const fromAssociation = g.direction === "association_request";
  return {
    /** Accept or reject (the side that didn't ask). */
    canDecide: state === "pending" && (side === "platform") === fromAssociation,
    /** Withdraw a pending request (the side that asked). */
    canCancel: state === "pending" && (side === "platform") !== fromAssociation,
    /** Mark the work done (platform, while access is active). */
    canComplete: state === "active" && side === "platform",
    /** End active access early (association). */
    canEnd: state === "active" && side === "association",
  };
}

// ---------------------------------------------------------------------------
// Custom sections: folders and items
// ---------------------------------------------------------------------------

export const SECTION_FILES_BUCKET = "association-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type FolderItem = Database["public"]["Tables"]["folder_items"]["Row"];

/** All folders the user can see in an association; build the tree with parent_id. */
export async function listFolders(sb: Client, associationId: string): Promise<Folder[]> {
  const { data, error } = await sb
    .from("folders")
    .select("*")
    .eq("association_id", associationId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data;
}

export interface FolderInput {
  association_id: string;
  parent_id: string | null;
  name: string;
  description?: string | null;
  visibility: FolderVisibility;
}

export async function createFolder(sb: Client, input: FolderInput) {
  const { data, error } = await sb
    .from("folders")
    .insert({ ...input, name: input.name.trim(), description: input.description?.trim() || null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateFolder(
  sb: Client,
  id: string,
  patch: Partial<Pick<Folder, "name" | "description" | "visibility" | "parent_id" | "sort_order">>,
) {
  const { error } = await sb.from("folders").update(patch).eq("id", id);
  if (error) throw error;
}

/** IDs of a folder and everything below it. */
export function folderSubtree(folders: Pick<Folder, "id" | "parent_id">[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const f of folders) if (f.parent_id === ids[i]) ids.push(f.id);
  }
  return ids;
}

/** Deletes a folder, its subfolders and items, and the stored files. */
export async function deleteFolder(sb: Client, folders: Pick<Folder, "id" | "parent_id">[], id: string) {
  const subtree = folderSubtree(folders, id);
  const { data: files } = await sb.from("folder_items").select("file_path").in("folder_id", subtree).not("file_path", "is", null);
  // Files first: storage rules only allow deleting a file while its folder still exists.
  await removeFiles(sb, (files ?? []).map((f) => f.file_path!));
  const { data, error } = await sb.from("folders").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("forbidden");
}

export async function listItems(sb: Client, folderId: string): Promise<FolderItem[]> {
  const { data, error } = await sb
    .from("folder_items")
    .select("*")
    .eq("folder_id", folderId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return data;
}

type ItemBase = { association_id: string; folder_id: string; title: string };

export async function createNote(sb: Client, input: ItemBase & { body: string }) {
  const { error } = await sb.from("folder_items").insert({ ...input, kind: "note", title: input.title.trim() });
  if (error) throw error;
}

export async function createLink(sb: Client, input: ItemBase & { url: string; body?: string }) {
  const { error } = await sb
    .from("folder_items")
    .insert({ ...input, kind: "link", title: input.title.trim(), url: normalizeUrl(input.url), body: input.body?.trim() || null });
  if (error) throw error;
}

export interface UploadableFile {
  /** Blob/File on the web, ArrayBuffer on mobile. */
  data: Blob | ArrayBuffer;
  name: string;
  type: string;
  size: number;
}

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function storagePath(associationId: string, folderId: string, fileName: string): string {
  // Storage keys must be ASCII-safe; the original (often Arabic) name is kept in file_name.
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)?.[1]?.toLowerCase();
  return `${associationId}/${folderId}/${randomId()}${ext ? "." + ext : ""}`;
}

async function uploadObject(sb: Client, path: string, file: UploadableFile) {
  if (file.size > MAX_FILE_BYTES) throw new Error("file_too_large");
  const { error } = await sb.storage
    .from(SECTION_FILES_BUCKET)
    .upload(path, file.data, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
}

async function removeFiles(sb: Client, paths: string[]) {
  if (paths.length) await sb.storage.from(SECTION_FILES_BUCKET).remove(paths);
}

export async function createFileItem(sb: Client, input: ItemBase & { body?: string; file: UploadableFile }) {
  const path = storagePath(input.association_id, input.folder_id, input.file.name);
  await uploadObject(sb, path, input.file);
  const { error } = await sb.from("folder_items").insert({
    association_id: input.association_id,
    folder_id: input.folder_id,
    kind: "file",
    title: (input.title || input.file.name).trim(),
    body: input.body?.trim() || null,
    file_path: path,
    file_name: input.file.name,
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
  });
  if (error) {
    await removeFiles(sb, [path]);
    throw error;
  }
}

export async function updateItem(
  sb: Client,
  item: Pick<FolderItem, "id" | "kind">,
  patch: { title?: string; body?: string | null; url?: string; folder_id?: string },
) {
  const clean = {
    ...patch,
    title: patch.title?.trim(),
    url: item.kind === "link" && patch.url !== undefined ? normalizeUrl(patch.url) : undefined,
  };
  const { error } = await sb.from("folder_items").update(clean).eq("id", item.id);
  if (error) throw error;
}

/** Swaps the stored file of a file item, then removes the old one. */
export async function replaceFile(sb: Client, item: FolderItem, file: UploadableFile) {
  const path = storagePath(item.association_id, item.folder_id, file.name);
  await uploadObject(sb, path, file);
  const { error } = await sb
    .from("folder_items")
    .update({ file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size })
    .eq("id", item.id);
  if (error) {
    await removeFiles(sb, [path]);
    throw error;
  }
  if (item.file_path) await removeFiles(sb, [item.file_path]);
}

export async function deleteItem(sb: Client, item: Pick<FolderItem, "id" | "file_path">) {
  const { data, error } = await sb.from("folder_items").delete().eq("id", item.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("forbidden");
  if (item.file_path) await removeFiles(sb, [item.file_path]);
}

/** Short-lived link to view or download a stored file. */
export async function getFileUrl(sb: Client, item: Pick<FolderItem, "file_path" | "file_name">, download = false) {
  const { data, error } = await sb.storage
    .from(SECTION_FILES_BUCKET)
    .createSignedUrl(item.file_path!, 60 * 10, download ? { download: item.file_name ?? true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export function normalizeUrl(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export interface OtpHealth {
  ok: boolean;
  reason?: "token_invalid" | "not_configured";
  detail?: string | null;
  permanent?: boolean;
  expires_at?: string | null;
}

/** Superadmin: whether login codes can currently be delivered over WhatsApp. */
export function checkOtpHealth(sb: Client) {
  return invoke<OtpHealth>(sb, "otp-health", {});
}

// ---------------------------------------------------------------------------
// Complaints & suggestions
// ---------------------------------------------------------------------------

export type FeedbackResult =
  | { ok: true; reference: string }
  | { ok: false; error: string; fields?: { field: string; code: string }[] };

/** Public: sends the form to the submit-feedback function (works logged in or out). */
export async function submitFeedback(sb: Client, input: FeedbackInput): Promise<FeedbackResult> {
  const { data, error } = await sb.functions.invoke<{ reference: string }>("submit-feedback", { body: input });
  if (!error && data?.reference) return { ok: true, reference: data.reference };
  const ctx = (error as { context?: Response } | null)?.context;
  const payload = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
  return { ok: false, error: payload?.error ?? "generic", fields: payload?.fields };
}

export type FeedbackStatus = "new" | "in_review" | "resolved";

/** Superadmin: all submissions, newest first. */
export async function listFeedback(sb: Client) {
  const { data, error } = await sb
    .from("feedback")
    .select("id, reference, kind, topic, full_name, email, phone, association_name, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data;
}

export async function setFeedbackStatus(sb: Client, id: number, status: FeedbackStatus) {
  const { error } = await sb.from("feedback").update({ status }).eq("id", id);
  if (error) throw error;
}
