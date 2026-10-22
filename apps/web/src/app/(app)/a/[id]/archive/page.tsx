"use client";

import {
  canManage,
  canView,
  canViewBoardAnalysis,
  createDocument,
  deleteDocument,
  DOCUMENT_CATEGORIES,
  formatBytes,
  getDocumentUrl,
  isPresident,
  isSupportSession,
  listDocuments,
  listVendors,
  MAX_FILE_BYTES,
  recordKeys,
  restoreDocument,
  supportExpiresAt,
  t,
  updateDocument,
  VISIBILITY_LABELS,
  type DocumentCategory,
  type DocumentInput,
  type DocumentRow,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArchiveInsights } from "@/components/archive-insights";
import { formatDate } from "@/components/support";
import { Badge, Button, Card, ErrorText, errorText, Field, Input, Loading, PageTitle, Select, SupportBanner, Textarea } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const CATS = Object.entries(DOCUMENT_CATEGORIES) as [DocumentCategory, string][];

export default function ArchivePage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "documents", page: "/archive" });
  const manage = access ? canManage(access, "documents") : false;
  const board = access ? access.role === "president" || access.role === "board_member" : false;
  const files = access ? canView(access, "documents") : false;
  const docs = useQuery({
    queryKey: [...recordKeys.documents(id), board],
    queryFn: () => listDocuments(supabase(), id, board),
    enabled: files,
  });
  const [filter, setFilter] = useState({ category: "" as DocumentCategory | "", year: "", q: "", showDeleted: false });
  const [adding, setAdding] = useState(false);

  const years = useMemo(
    () => [...new Set((docs.data ?? []).map((d) => (d.document_date ?? d.created_at).slice(0, 4)))].sort().reverse(),
    [docs.data],
  );

  // Document titles for the analysis' source links (only documents this person can open).
  const titles = useMemo(() => new Map((docs.data ?? []).map((d) => [d.id, d.title])), [docs.data]);

  if (isLoading || !access || docs.isLoading) return <Loading />;
  // A support grant may cover the analysis without the files.
  if (!files && !canViewBoardAnalysis(access)) return <p className="text-muted">{t.common.noPermission}</p>;
  if (!files) {
    return (
      <div className="flex flex-col gap-5">
        <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
        <PageTitle title={t.association.archive} back={{ href: `/a/${id}`, label: "الجمعية" }} />
        <ArchiveInsights associationId={id} access={access} titles={titles} />
      </div>
    );
  }

  const q = filter.q.trim().toLowerCase();
  const rows = (docs.data ?? []).filter(
    (d) =>
      Boolean(d.deleted_at) === filter.showDeleted &&
      (!filter.category || d.category === filter.category) &&
      (!filter.year || (d.document_date ?? d.created_at).startsWith(filter.year)) &&
      (!q || [d.title, d.notes, d.file_name, d.vendors?.name].some((v) => v?.toLowerCase().includes(q))),
  );

  return (
    <div className="flex flex-col gap-5">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={t.association.archive} back={{ href: `/a/${id}`, label: "الجمعية" }}>
        {manage && !adding && <Button onClick={() => setAdding(true)}>+ إضافة مستند</Button>}
      </PageTitle>
      <ArchiveInsights associationId={id} access={access} titles={titles} />
      {!board && <p className="text-sm text-muted">تظهر هنا المستندات التي شاركها رئيس الجمعية مع الملاك.</p>}

      {adding && <DocumentForm associationId={id} president={isPresident(access)} onDone={() => setAdding(false)} />}

      <Card className="grid gap-3 sm:grid-cols-4">
        <Field label="بحث">
          <Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="العنوان، الملاحظات، الشركة…" />
        </Field>
        <Field label="التصنيف">
          <Select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value as DocumentCategory | "" })}>
            <option value="">الكل</option>
            {CATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <Field label="السنة">
          <Select value={filter.year} onChange={(e) => setFilter({ ...filter, year: e.target.value })}>
            <option value="">الكل</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        {board && (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={filter.showDeleted} onChange={(e) => setFilter({ ...filter, showDeleted: e.target.checked })} />
            المستندات المحذوفة
          </label>
        )}
      </Card>

      {rows.length === 0 && <p className="text-sm text-muted">لا توجد مستندات</p>}
      <div className="flex flex-col gap-3">
        {rows.map((d) => (
          <div key={d.id} id={`doc-${d.id}`} className="scroll-mt-4">
            <DocumentCard doc={d} manage={manage} president={isPresident(access)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentForm({ associationId, president, doc, onDone }: { associationId: string; president: boolean; doc?: DocumentRow; onDone: () => void }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: recordKeys.vendors(associationId), queryFn: () => listVendors(supabase(), associationId) });
  const [form, setForm] = useState<DocumentInput>({
    category: (doc?.category as DocumentCategory) ?? "contract",
    title: doc?.title ?? "",
    document_date: doc?.document_date ?? "",
    notes: doc?.notes ?? "",
    visibility: (doc?.visibility as "board" | "owners") ?? "board",
    vendor_id: doc?.vendor_id ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const upload = file ? { data: file, name: file.name, type: file.type, size: file.size } : null;
      if (doc) return updateDocument(supabase(), doc, form, upload);
      if (!upload) throw new Error("اختر ملفاً");
      return createDocument(supabase(), associationId, form, upload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.documents(associationId) });
      onDone();
    },
  });
  const tooBig = file !== null && file.size > MAX_FILE_BYTES;

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-semibold sm:col-span-2">{doc ? "تعديل المستند" : "إضافة مستند"}</h2>
        <Field label={doc ? "استبدال الملف (اختياري)" : "الملف *"}>
          <input type="file" className="text-sm" required={!doc} onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (f && !form.title) setForm((v) => ({ ...v, title: f.name.replace(/\.[^.]+$/, "") }));
          }} />
          {tooBig && <ErrorText>{t.sections.fileTooLarge}</ErrorText>}
        </Field>
        <Field label="التصنيف *">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })}>
            {CATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <Field label="العنوان *">
          <Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <Field label="تاريخ المستند">
          <Input type="date" value={form.document_date ?? ""} onChange={(e) => setForm({ ...form, document_date: e.target.value })} />
        </Field>
        <Field label="الشركة المرتبطة (اختياري)">
          <Select value={form.vendor_id ?? ""} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
            <option value="">—</option>
            {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="من يمكنه المشاهدة">
          <Select value={form.visibility} disabled={!president} onChange={(e) => setForm({ ...form, visibility: e.target.value as "board" | "owners" })}>
            <option value="board">{VISIBILITY_LABELS.board}</option>
            <option value="owners">{VISIBILITY_LABELS.owners}</option>
          </Select>
          {!president && <span className="text-xs text-muted">مشاركة المستند مع الملاك من صلاحيات رئيس الجمعية فقط.</span>}
        </Field>
        <div className="sm:col-span-2">
          <Field label="ملاحظات">
            <Textarea value={form.notes ?? ""} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" />
          </Field>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={save.isPending || tooBig}>{save.isPending ? t.sections.uploading : t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function DocumentCard({ doc, manage, president }: { doc: DocumentRow; manage: boolean; president: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: recordKeys.documents(doc.association_id) });
  const remove = useMutation({ mutationFn: () => deleteDocument(supabase(), doc.id, reason), onSuccess: () => { setDeleting(false); refresh(); } });
  const restore = useMutation({ mutationFn: () => restoreDocument(supabase(), doc.id), onSuccess: refresh });
  const open = useMutation({
    mutationFn: async (download: boolean) => {
      const tab = window.open("about:blank", "_blank");
      try {
        const url = await getDocumentUrl(supabase(), doc, download);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        throw e;
      }
    },
  });

  if (editing) return <DocumentForm associationId={doc.association_id} president={president} doc={doc} onDone={() => { setEditing(false); refresh(); }} />;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{DOCUMENT_CATEGORIES[doc.category as DocumentCategory]}</Badge>
        <span className="me-auto font-semibold">{doc.title}</span>
        {doc.visibility === "owners" ? <Badge tone="primary">{VISIBILITY_LABELS.owners}</Badge> : <Badge>{VISIBILITY_LABELS.board}</Badge>}
      </div>
      <p className="text-sm text-muted">
        {doc.document_date ? formatDate(doc.document_date).split(" ")[0] : formatDate(doc.created_at)}
        {doc.vendors?.name && ` · ${doc.vendors.name}`} · <span dir="auto">{doc.file_name}</span> · {formatBytes(doc.size_bytes)}
      </p>
      {doc.notes && <p className="whitespace-pre-wrap text-sm">{doc.notes}</p>}
      {doc.deleted_at && (
        <p className="text-sm text-danger">حُذف في {formatDate(doc.deleted_at)} · السبب: {doc.delete_reason}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="h-8" disabled={open.isPending} onClick={() => open.mutate(false)}>{t.common.open}</Button>
        <Button variant="ghost" className="h-8" disabled={open.isPending} onClick={() => open.mutate(true)}>{t.sections.download}</Button>
        {manage && !doc.deleted_at && (
          <>
            <Button variant="ghost" className="h-8" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <Button variant="ghost" className="h-8 text-danger" onClick={() => setDeleting(!deleting)}>{t.common.delete}</Button>
          </>
        )}
        {manage && doc.deleted_at && (
          <Button variant="secondary" className="h-8" disabled={restore.isPending} onClick={() => restore.mutate()}>استعادة</Button>
        )}
      </div>
      {deleting && (
        <form className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3" onSubmit={(e: FormEvent) => { e.preventDefault(); remove.mutate(); }}>
          <label htmlFor={`reason-${doc.id}`} className="text-sm font-medium">سبب الحذف (مطلوب)</label>
          <Textarea id={`reason-${doc.id}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} required autoFocus className="min-h-16" />
          <p className="text-xs text-muted">يُخفى المستند عن الملاك ويبقى محفوظاً لمجلس الإدارة مع سبب الحذف، ويمكن استعادته.</p>
          <div className="flex gap-2">
            <Button type="submit" className="h-8" disabled={remove.isPending}>{t.support.submit}</Button>
            <Button type="button" variant="ghost" className="h-8" onClick={() => setDeleting(false)}>{t.common.cancel}</Button>
          </div>
        </form>
      )}
      <ErrorText>{errorText(remove.error) || errorText(restore.error) || errorText(open.error)}</ErrorText>
    </Card>
  );
}
