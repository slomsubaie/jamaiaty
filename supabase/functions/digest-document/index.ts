// Internal (called by the database when a file is uploaded or replaced, and retried hourly):
// Claude reads one archive file and the digest is stored for the analysis. Answers right away
// and does the work in the background.
import type Anthropic from "@anthropic-ai/sdk";
import { documentDigest } from "../../../packages/shared/src/analysis.ts";
import { ask, base64, errorMessage } from "../_shared/claude.ts";
import { isInternal } from "../_shared/internal.ts";
import { admin, json } from "../_shared/supabase.ts";

const ARCHIVE_BUCKET = "association-archive";
const MAX_ATTEMPTS = 3;
// API limits: 32 MB per request (base64 adds a third) and 5 MB per image.
const MAX_PDF_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const TASK = `Digest the attached archive document for later analysis of the association's history.
Use <document_metadata> (entered by the board) as context, but rely on the file itself. If the file is blank or unreadable, set readable to false and summarise only what the metadata says.`;

interface Doc {
  id: string;
  title: string;
  category: string;
  document_date: string | null;
  notes: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
}

Deno.serve(async (req) => {
  if (!isInternal(req)) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (typeof body?.document_id !== "string") return json({ error: "invalid_input" }, 400);

  const { data: doc } = await admin
    .from("documents")
    .select("id, title, category, document_date, notes, file_path, file_name, mime_type, size_bytes, deleted_at")
    .eq("id", body.document_id)
    .maybeSingle();
  if (!doc || doc.deleted_at) return json({ skipped: "no document" });

  // Claim the digest so overlapping calls don't read the same file twice.
  const { data: row } = await admin
    .from("document_digests")
    .select("status, attempts, file_path")
    .eq("document_id", doc.id)
    .maybeSingle();
  if (!row || !["pending", "failed"].includes(row.status) || row.attempts >= MAX_ATTEMPTS || row.file_path !== doc.file_path) {
    return json({ skipped: "nothing to do" });
  }
  const { data: claimed } = await admin
    .from("document_digests")
    .update({ status: "running", attempts: row.attempts + 1, updated_at: new Date().toISOString() })
    .eq("document_id", doc.id)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("document_id");
  if (!claimed?.length) return json({ skipped: "claimed elsewhere" });

  EdgeRuntime.waitUntil(digest(doc));
  return json({ accepted: true }, 202);
});

// Writes only if the file wasn't replaced in the meantime.
function save(doc: Doc, patch: Record<string, unknown>) {
  return admin
    .from("document_digests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("document_id", doc.id)
    .eq("file_path", doc.file_path);
}

async function digest(doc: Doc) {
  try {
    const block = await fileBlock(doc);
    if (typeof block === "string") {
      await save(doc, { status: "skipped", error: block });
      return;
    }
    const metadata = JSON.stringify({
      title: doc.title,
      category: doc.category,
      document_date: doc.document_date,
      notes: doc.notes,
      file_name: doc.file_name,
    });
    const { data, usage, model } = await ask({
      schema: documentDigest,
      effort: "medium",
      maxTokens: 16000,
      content: [block, { type: "text", text: `<document_metadata>${metadata}</document_metadata>` }],
      task: TASK,
    });
    await save(doc, { status: "done", digest: data, error: null, usage, model });
  } catch (e) {
    await save(doc, { status: "failed", error: errorMessage(e).slice(0, 500) });
  }
}

/** The file as a content block, or the reason it can't be read. */
async function fileBlock(doc: Doc): Promise<Anthropic.Beta.BetaContentBlockParam | string> {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const kind = mime === "application/pdf" ? "pdf" : IMAGE_TYPES.includes(mime) ? "image" : mime.startsWith("text/") ? "text" : null;
  if (!kind) return `unsupported file type: ${mime || "unknown"}`;
  if (doc.size_bytes > (kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) return "file too large to analyse";

  const { data: file, error } = await admin.storage.from(ARCHIVE_BUCKET).download(doc.file_path);
  if (error || !file) throw new Error(error?.message ?? "download failed");
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (kind === "pdf") {
    return { type: "document", title: doc.title, source: { type: "base64", media_type: "application/pdf", data: base64(bytes) } };
  }
  if (kind === "image") {
    return { type: "image", source: { type: "base64", media_type: mime as "image/png", data: base64(bytes) } };
  }
  return { type: "document", title: doc.title, source: { type: "text", media_type: "text/plain", data: new TextDecoder().decode(bytes) } };
}
