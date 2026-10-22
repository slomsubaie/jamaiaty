// Internal (called by the database for a refresh or a scheduled run): writes the archive analysis
// from the document digests. The first call starts the run and hands each part to its own call,
// so every part gets the full time limit:
//   owners   — historical overview from documents shared with owners only
//   board    — historical overview from every document
//   forecast — next 2–3 years and recommended actions (premium, or a superadmin under grant)
import type Anthropic from "@anthropic-ai/sdk";
import {
  ANALYSIS_TABS,
  analysisResult,
  forecastResult,
  type AnalysisResult,
  type DocumentDigest,
} from "../../../packages/shared/src/analysis.ts";
import { ask, errorMessage } from "../_shared/claude.ts";
import { callInternal, isInternal } from "../_shared/internal.ts";
import { admin, json } from "../_shared/supabase.ts";

const PARTS = ["owners", "board", "forecast"] as const;
type Part = (typeof PARTS)[number];

// Roughly 400k tokens of Arabic; beyond it the oldest documents go in by their details only.
const MAX_CORPUS_CHARS = 1_200_000;

Deno.serve(async (req) => {
  if (!isInternal(req)) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (typeof body?.analysis_id !== "string") return json({ error: "invalid_input" }, 400);
  const part = body.part as Part | undefined;
  if (part !== undefined && !PARTS.includes(part)) return json({ error: "invalid_input" }, 400);

  EdgeRuntime.waitUntil(part ? runPart(body.analysis_id, part) : start(body.analysis_id));
  return json({ accepted: true }, 202);
});

async function start(id: string) {
  const { data: run } = await admin
    .from("archive_analyses")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id, association_id, include_forecast")
    .maybeSingle();
  if (!run) return;

  const parts: Part[] = run.include_forecast ? ["owners", "board", "forecast"] : ["owners", "board"];
  try {
    const { data: watermark } = await admin.rpc("archive_source_watermark", { a: run.association_id });
    const docs = await loadDocuments(run.association_id);
    const { error } = await admin
      .from("archive_analyses")
      .update({
        parts_pending: parts,
        document_count: docs.length,
        pending_document_count: docs.filter((d) => !d.digest).length,
        source_watermark: watermark,
      })
      .eq("id", run.id);
    if (error) throw error;
  } catch (e) {
    await admin.from("archive_analyses")
      .update({ status: "failed", error: errorMessage(e), finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return;
  }
  await Promise.all(parts.map(async (p) => {
    try {
      await callInternal("analyze-archive", { analysis_id: run.id, part: p });
    } catch (e) {
      await admin.rpc("finish_analysis_part", { run: run.id, part: p, failure: errorMessage(e) });
    }
  }));
}

async function runPart(id: string, part: Part) {
  const { data: run } = await admin
    .from("archive_analyses")
    .select("id, association_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!run || run.status !== "running") return;

  let failure: string | null = null;
  try {
    const all = await loadDocuments(run.association_id);
    const docs = part === "owners" ? all.filter((d) => d.visibility === "owners") : all;

    if (part === "forecast") {
      const { data, usage, model } = await ask({
        schema: forecastResult,
        effort: "high",
        content: [corpus(docs)],
        task: forecastTask(),
      });
      await insert("archive_forecasts", { analysis_id: run.id, association_id: run.association_id, result: data, usage, model });
    } else {
      const answer = docs.length
        ? await ask({ schema: analysisResult, effort: "high", content: [corpus(docs)], task: historyTask(part) })
        : { data: emptyHistory(), usage: null, model: null };
      // Never publish to owners if sharing changed while the model was writing.
      if (part === "owners") {
        const now = (await loadDocuments(run.association_id)).filter((d) => d.visibility === "owners").map((d) => d.id);
        if (now.sort().join() !== docs.map((d) => d.id).sort().join()) throw new Error("owner documents changed during the run");
      }
      await insert("archive_analysis_results", {
        analysis_id: run.id,
        association_id: run.association_id,
        audience: part,
        result: answer.data,
        usage: answer.usage,
        model: answer.model,
      });
    }
  } catch (e) {
    failure = errorMessage(e);
  }
  await admin.rpc("finish_analysis_part", { run: run.id, part, failure });
}

async function insert(table: "archive_forecasts" | "archive_analysis_results", row: Record<string, unknown>) {
  const { error } = await admin.from(table).insert(row);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Material sent to Claude
// ---------------------------------------------------------------------------
interface ArchiveDoc {
  id: string;
  title: string;
  category: string;
  document_date: string | null;
  created_at: string;
  notes: string | null;
  visibility: string;
  vendor: string | null;
  digest: DocumentDigest | null;
}

async function loadDocuments(associationId: string): Promise<ArchiveDoc[]> {
  const [{ data: docs, error }, { data: digests, error: dErr }] = await Promise.all([
    admin
      .from("documents")
      .select("id, title, category, document_date, created_at, notes, visibility, vendors (name)")
      .eq("association_id", associationId)
      .is("deleted_at", null),
    admin.from("document_digests").select("document_id, digest").eq("association_id", associationId).eq("status", "done"),
  ]);
  if (error || dErr) throw error ?? dErr;
  const byDoc = new Map((digests ?? []).map((d) => [d.document_id, d.digest as DocumentDigest]));
  return (docs ?? [])
    .map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      document_date: d.document_date,
      created_at: d.created_at,
      notes: d.notes,
      visibility: d.visibility,
      // Many-to-one embed: one vendor object (untyped client).
      vendor: (d.vendors as unknown as { name: string } | null)?.name ?? null,
      digest: byDoc.get(d.id) ?? null,
    }))
    .sort((a, b) => (b.document_date ?? b.created_at).localeCompare(a.document_date ?? a.created_at));
}

/** Newest first; once the budget is used up, older documents go in without their digest. */
function corpus(docs: ArchiveDoc[]): Anthropic.Beta.BetaContentBlockParam {
  let used = 0;
  const entries = docs.map(({ digest, created_at, visibility: _v, ...doc }) => {
    const entry = { ...doc, uploaded_at: created_at.slice(0, 10), file: digest };
    const size = JSON.stringify(entry).length;
    if (digest && used + size > MAX_CORPUS_CHARS) return { ...entry, file: null, file_note: "omitted (archive too large)" };
    used += size;
    return digest ? entry : { ...entry, file_note: "file not read yet; use the details above only" };
  });
  return { type: "text", text: `<archive count="${docs.length}">\n${JSON.stringify(entries)}\n</archive>` };
}

const TAB_GUIDE = `Tabs:
- overview: the association's overall story and state across every topic.
- finance: budgets, invoices, fees, spending and its trend.
- contracts: vendors, contracts, quotations, renewals and obligations.
- maintenance: repairs, recurring issues, assets and their condition.
- governance: meetings, minutes, decisions, compliance and correspondence.`;

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

function historyTask(part: "owners" | "board") {
  const reader = part === "owners"
    ? "Readers: all owners of the association."
    : "Readers: the president and board members.";
  return `Today is ${today()}. Write a detailed, professional overview of the association's history as recorded in <archive>. ${reader}
${TAB_GUIDE}
For every tab: a summary of a few paragraphs, the main highlights, figures worth tracking (metrics, with the year when known), a dated timeline of key events, risks you can see in the record, and data gaps. A topic the archive doesn't cover gets a short summary saying so and empty lists.`;
}

function forecastTask() {
  const year = Number(today().slice(0, 4));
  return `Today is ${today()}. Readers: the president and board members.
From the history recorded in <archive>, give each tab a deeper professional analysis, a forecast of what is likely to happen in ${year + 1}, ${year + 2} and ${year + 3}, projections of key figures by year (mark estimated points), and concrete recommended actions with priority and timeframe.
${TAB_GUIDE}
Set horizon_years to [${year + 1}, ${year + 2}, ${year + 3}]. List the assumptions behind the forecast. These are estimates: say how sure you are (likelihood) and don't present a guess as fact.`;
}

function emptyHistory(): AnalysisResult {
  const tab: AnalysisResult["overview"] = {
    summary: "لا توجد مستندات مشاركة مع الملاك بعد.",
    highlights: [],
    metrics: [],
    timeline: [],
    risks: [],
    data_gaps: [],
  };
  return Object.fromEntries(ANALYSIS_TABS.map((k) => [k, tab])) as Record<(typeof ANALYSIS_TABS)[number], typeof tab>;
}
