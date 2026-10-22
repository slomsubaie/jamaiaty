// Data access for the archive, vendors & contracts, and finance. Runs as the signed-in user,
// so row-level security decides what is visible and what may change.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisInterval, AnalysisResult, ForecastResult } from "./analysis.ts";
import type { Database } from "./database.types.ts";
import type { BudgetCategory, BudgetStatus, DocumentCategory, OfferStatus, PriceBasis, VendorCategory } from "./domain.ts";
import { MAX_FILE_BYTES, normalizeUrl, type UploadableFile } from "./queries.ts";

type Client = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];

export const ARCHIVE_BUCKET = "association-archive";

export const recordKeys = {
  documents: (a: string) => ["documents", a] as const,
  vendors: (a: string) => ["vendors", a] as const,
  offers: (a: string) => ["offers", a] as const,
  directory: (a: string) => ["vendor-directory", a] as const,
  budgets: (a: string) => ["budgets", a] as const,
  budgetLines: (b: string) => ["budget-lines", b] as const,
  financeSummary: (a: string) => ["finance-summary", a] as const,
  unitCount: (a: string) => ["unit-count", a] as const,
  analysis: (a: string) => ["archive-analysis", a] as const,
};

/** Throws on error; on success Supabase always returns data for these calls. */
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------
export type DocumentRow = Tables["documents"]["Row"] & { vendors: { name: string } | null };

export async function listDocuments(sb: Client, associationId: string, includeDeleted = false): Promise<DocumentRow[]> {
  let q = sb.from("documents").select("*, vendors (name)").eq("association_id", associationId);
  if (!includeDeleted) q = q.is("deleted_at", null);
  const data = must(await q.order("document_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }));
  return data as DocumentRow[];
}

function archivePath(associationId: string, fileName: string) {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)?.[1]?.toLowerCase();
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${associationId}/${id}${ext ? "." + ext : ""}`;
}

async function uploadArchiveFile(sb: Client, associationId: string, file: UploadableFile) {
  if (file.size > MAX_FILE_BYTES) throw new Error("file_too_large");
  const path = archivePath(associationId, file.name);
  const { error } = await sb.storage.from(ARCHIVE_BUCKET).upload(path, file.data, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(error.message);
  return path;
}

export interface DocumentInput {
  category: DocumentCategory;
  title: string;
  document_date?: string | null;
  notes?: string | null;
  visibility: "board" | "owners";
  vendor_id?: string | null;
}

export async function createDocument(sb: Client, associationId: string, input: DocumentInput, file: UploadableFile) {
  const path = await uploadArchiveFile(sb, associationId, file);
  const res = await sb.from("documents").insert({
    association_id: associationId,
    category: input.category,
    title: input.title.trim(),
    document_date: input.document_date || null,
    notes: blankToNull(input.notes),
    visibility: input.visibility,
    vendor_id: input.vendor_id || null,
    file_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
  if (res.error) {
    await sb.storage.from(ARCHIVE_BUCKET).remove([path]);
    throw new Error(res.error.message);
  }
}

export async function updateDocument(sb: Client, doc: Pick<DocumentRow, "id" | "association_id" | "file_path">, input: DocumentInput, newFile?: UploadableFile | null) {
  const patch: Tables["documents"]["Update"] = {
    category: input.category,
    title: input.title.trim(),
    document_date: input.document_date || null,
    notes: blankToNull(input.notes),
    visibility: input.visibility,
    vendor_id: input.vendor_id || null,
  };
  let newPath: string | null = null;
  if (newFile) {
    newPath = await uploadArchiveFile(sb, doc.association_id, newFile);
    Object.assign(patch, { file_path: newPath, file_name: newFile.name, mime_type: newFile.type || null, size_bytes: newFile.size });
  }
  const res = await sb.from("documents").update(patch).eq("id", doc.id);
  if (res.error) {
    if (newPath) await sb.storage.from(ARCHIVE_BUCKET).remove([newPath]);
    throw new Error(res.error.message);
  }
  // The replaced file is no longer referenced.
  if (newPath) await sb.storage.from(ARCHIVE_BUCKET).remove([doc.file_path]);
}

/** Soft delete: the document disappears for owners and goes to the board's "deleted" list. */
export async function deleteDocument(sb: Client, id: string, reason: string) {
  must(await sb.from("documents").update({ deleted_at: new Date().toISOString(), delete_reason: reason.trim() }).eq("id", id));
}

export async function restoreDocument(sb: Client, id: string) {
  must(await sb.from("documents").update({ deleted_at: null }).eq("id", id));
}

export async function getDocumentUrl(sb: Client, doc: Pick<DocumentRow, "file_path" | "file_name">, download = false) {
  const { data, error } = await sb.storage
    .from(ARCHIVE_BUCKET)
    .createSignedUrl(doc.file_path, 60 * 10, download ? { download: doc.file_name } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Vendors & offers / contracts
// ---------------------------------------------------------------------------
export type Vendor = Tables["vendors"]["Row"];
export type Offer = Tables["vendor_offers"]["Row"] & { vendors: { name: string; category: string } | null };

export async function listVendors(sb: Client, associationId: string): Promise<Vendor[]> {
  return must(await sb.from("vendors").select("*").eq("association_id", associationId).order("category").order("name"));
}

export interface VendorInput {
  name: string;
  category: VendorCategory;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  support_phone?: string | null;
  notes?: string | null;
  show_in_directory: boolean;
}

function vendorRow(v: VendorInput) {
  return {
    name: v.name.trim(),
    category: v.category,
    contact_name: blankToNull(v.contact_name),
    phone: blankToNull(v.phone),
    email: blankToNull(v.email),
    website: v.website?.trim() ? normalizeUrl(v.website) : null,
    support_phone: blankToNull(v.support_phone),
    notes: blankToNull(v.notes),
    show_in_directory: v.show_in_directory,
  };
}

export async function createVendor(sb: Client, associationId: string, v: VendorInput) {
  const { data, error } = await sb.from("vendors").insert({ association_id: associationId, ...vendorRow(v) }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateVendor(sb: Client, id: string, v: VendorInput) {
  must(await sb.from("vendors").update(vendorRow(v)).eq("id", id));
}

export async function deleteVendor(sb: Client, id: string) {
  must(await sb.from("vendors").delete().eq("id", id));
}

export async function listOffers(sb: Client, associationId: string): Promise<Offer[]> {
  const data = must(await sb.from("vendor_offers").select("*, vendors (name, category)").eq("association_id", associationId).order("created_at", { ascending: false }));
  return data as Offer[];
}

export interface OfferInput {
  vendor_id: string;
  title: string;
  status: OfferStatus;
  services: string[];
  price_amount: number;
  price_basis: PriceBasis;
  vat_included: boolean;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
}

function offerRow(o: OfferInput) {
  return {
    vendor_id: o.vendor_id,
    title: o.title.trim(),
    status: o.status,
    services: [...new Set(o.services.map((s) => s.trim()).filter(Boolean))],
    price_amount: o.price_amount,
    price_basis: o.price_basis,
    vat_included: o.vat_included,
    start_date: o.start_date || null,
    end_date: o.end_date || null,
    notes: blankToNull(o.notes),
  };
}

export async function createOffer(sb: Client, associationId: string, o: OfferInput) {
  must(await sb.from("vendor_offers").insert({ association_id: associationId, ...offerRow(o) }));
}

export async function updateOffer(sb: Client, id: string, o: OfferInput) {
  must(await sb.from("vendor_offers").update(offerRow(o)).eq("id", id));
}

export async function deleteOffer(sb: Client, id: string) {
  must(await sb.from("vendor_offers").delete().eq("id", id));
}

/** Owners' view: name, field, website and support number of listed vendors. */
export async function vendorDirectory(sb: Client, associationId: string) {
  return must(await sb.rpc("vendor_directory", { a: associationId }));
}

/** Units in the association (for per-unit price comparison). */
export async function countUnits(sb: Client, associationId: string) {
  const { count, error } = await sb.from("units").select("id", { count: "exact", head: true }).eq("association_id", associationId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Finance: budgets and lines
// ---------------------------------------------------------------------------
export type Budget = Tables["budgets"]["Row"];
export type BudgetLine = Tables["budget_lines"]["Row"] & { vendors: { name: string } | null };

export async function listBudgets(sb: Client, associationId: string): Promise<Budget[]> {
  return must(await sb.from("budgets").select("*").eq("association_id", associationId).order("fiscal_year", { ascending: false }));
}

export async function createBudget(sb: Client, associationId: string, fiscalYear: number, title?: string) {
  const { data, error } = await sb.from("budgets").insert({ association_id: associationId, fiscal_year: fiscalYear, title: blankToNull(title) }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateBudget(sb: Client, id: string, patch: { title?: string | null; status?: BudgetStatus; notes?: string | null }) {
  must(await sb.from("budgets").update(patch).eq("id", id));
}

export async function deleteBudget(sb: Client, id: string) {
  must(await sb.from("budgets").delete().eq("id", id));
}

export async function listBudgetLines(sb: Client, budgetId: string): Promise<BudgetLine[]> {
  const data = must(await sb.from("budget_lines").select("*, vendors (name)").eq("budget_id", budgetId).order("kind", { ascending: false }).order("category").order("created_at"));
  return data as BudgetLine[];
}

export interface BudgetLineInput {
  kind: "income" | "expense";
  category: BudgetCategory;
  description?: string | null;
  planned_amount: number;
  actual_amount: number;
  vendor_id?: string | null;
  notes?: string | null;
}

function lineRow(l: BudgetLineInput) {
  return {
    kind: l.kind,
    category: l.category,
    description: blankToNull(l.description),
    planned_amount: l.planned_amount,
    actual_amount: l.actual_amount,
    vendor_id: l.vendor_id || null,
    notes: blankToNull(l.notes),
  };
}

export async function createBudgetLine(sb: Client, associationId: string, budgetId: string, l: BudgetLineInput) {
  must(await sb.from("budget_lines").insert({ association_id: associationId, budget_id: budgetId, ...lineRow(l) }));
}

export async function updateBudgetLine(sb: Client, id: string, l: BudgetLineInput) {
  must(await sb.from("budget_lines").update(lineRow(l)).eq("id", id));
}

export async function deleteBudgetLine(sb: Client, id: string) {
  must(await sb.from("budget_lines").delete().eq("id", id));
}

/** Yearly totals (owners: approved/closed budgets only). */
export async function financeSummary(sb: Client, associationId: string) {
  return must(await sb.rpc("finance_summary", { a: associationId }));
}

// ---------------------------------------------------------------------------
// Archive AI analysis
// ---------------------------------------------------------------------------
export type AnalysisRun = Tables["archive_analyses"]["Row"];

export interface AnalysisDashboard {
  plan: string;
  intervalDays: number;
  /** Latest run, whatever its status. */
  run: AnalysisRun | null;
  /** Latest historical overview the user may see (owners' or board's version). */
  history: { result: AnalysisResult; created_at: string } | null;
  /** Latest forecast, when the user may see it. */
  forecast: { result: ForecastResult; created_at: string } | null;
  /** Visible documents added or changed since the overview shown was written. */
  changedSince: number;
}

export async function getAnalysisDashboard(
  sb: Client,
  associationId: string,
  opts: { board: boolean; forecast: boolean },
): Promise<AnalysisDashboard> {
  const newest = { ascending: false } as const;
  const [assoc, run, history, forecast] = await Promise.all([
    sb.from("associations").select("plan, analysis_interval_days").eq("id", associationId).single(),
    sb.from("archive_analyses").select("*").eq("association_id", associationId)
      .order("created_at", newest).limit(1).maybeSingle(),
    sb.from("archive_analysis_results")
      .select("result, created_at, archive_analyses (source_watermark)")
      .eq("association_id", associationId)
      .eq("audience", opts.board ? "board" : "owners")
      .order("created_at", newest).limit(1).maybeSingle(),
    opts.forecast
      ? sb.from("archive_forecasts").select("result, created_at").eq("association_id", associationId)
          .order("created_at", newest).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const a = must(assoc);
  const h = must(history);
  const f = must(forecast);

  let changedSince = 0;
  const watermark = h?.archive_analyses?.source_watermark;
  if (watermark) {
    const { count } = await sb.from("documents").select("id", { count: "exact", head: true })
      .eq("association_id", associationId).gt("updated_at", watermark);
    changedSince = count ?? 0;
  }

  return {
    plan: a.plan,
    intervalDays: a.analysis_interval_days,
    run: must(run),
    history: h ? { result: h.result as unknown as AnalysisResult, created_at: h.created_at } : null,
    forecast: f ? { result: f.result as unknown as ForecastResult, created_at: f.created_at } : null,
    changedSince,
  };
}

/** Runs the analysis now (president, or superadmin under grant); the database refuses overlaps. */
export async function requestAnalysis(sb: Client, associationId: string) {
  return must(await sb.rpc("request_archive_analysis", { a: associationId }));
}

/** How often the analysis runs by itself when nobody refreshes it (president only, per RLS). */
export async function setAnalysisInterval(sb: Client, associationId: string, days: AnalysisInterval) {
  must(await sb.from("associations").update({ analysis_interval_days: days }).eq("id", associationId));
}
