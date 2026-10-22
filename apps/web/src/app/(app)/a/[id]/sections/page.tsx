"use client";

import {
  canManage,
  canView,
  createFileItem,
  createFolder,
  createLink,
  createNote,
  deleteFolder,
  deleteItem,
  folderSubtree,
  formatBytes,
  getFileUrl,
  isSupportSession,
  supportExpiresAt,
  ITEM_KIND_LABELS,
  listFolders,
  listItems,
  MAX_FILE_BYTES,
  queryKeys,
  replaceFile,
  t,
  updateFolder,
  updateItem,
  VISIBILITY_LABELS,
  type Folder,
  type FolderItem,
  type FolderVisibility,
  type ItemKind,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  DeleteButton,
  ErrorText,
  errorText,
  Field,
  Input,
  Loading,
  PageTitle,
  Select,
  SupportBanner,
  Textarea,
} from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

export default function SectionsPage() {
  const { id } = useParams<{ id: string }>();
  const folderId = useSearchParams().get("folder");
  const { access, isLoading } = useAccess(id, { section: "sections", page: `/sections${folderId ? `?folder=${folderId}` : ""}` });
  const folders = useQuery({ queryKey: queryKeys.folders(id), queryFn: () => listFolders(supabase(), id) });

  if (isLoading || folders.isLoading || !access) return <Loading />;
  if (!canView(access, "sections")) return <p className="text-muted">{t.common.noPermission}</p>;

  const all = folders.data ?? [];
  const current = folderId ? all.find((f) => f.id === folderId) ?? null : null;
  const manage = canManage(access, "sections");
  const children = all.filter((f) => f.parent_id === (current?.id ?? null));
  const path: Folder[] = [];
  for (let f = current; f; f = all.find((x) => x.id === f!.parent_id) ?? null) path.unshift(f);

  return (
    <div className="flex flex-col gap-5">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={current?.name ?? t.sections.title} back={{ href: `/a/${id}`, label: "الجمعية" }} />

      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href={`/a/${id}/sections`} className="hover:text-foreground">{t.sections.title}</Link>
        {path.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span>‹</span>
            <Link href={`/a/${id}/sections?folder=${f.id}`} className="hover:text-foreground">{f.name}</Link>
          </span>
        ))}
      </nav>

      {current?.description && <p className="whitespace-pre-wrap text-sm text-muted">{current.description}</p>}

      {folderId && !current && <p className="text-muted">المجلد غير موجود أو ليست لديك صلاحية مشاهدته.</p>}

      {current && manage && <FolderActions associationId={id} folder={current} all={all} />}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{current ? t.sections.folders : t.sections.title}</h2>
        </div>
        {manage && <NewFolderForm associationId={id} parent={current} />}
        {children.length === 0 && !manage && !current && <p className="text-sm text-muted">{t.common.empty}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((f) => (
            <Link key={f.id} href={`/a/${id}/sections?folder=${f.id}`}>
              <Card className="flex h-full flex-col gap-1 transition hover:border-primary">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">📁 {f.name}</span>
                  {f.visibility === "board" && <Badge>{VISIBILITY_LABELS.board}</Badge>}
                </div>
                {f.description && <p className="line-clamp-2 text-sm text-muted">{f.description}</p>}
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {current && <ItemsSection associationId={id} folder={current} manage={manage} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

function NewFolderForm({ associationId, parent }: { associationId: string; parent: Folder | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<FolderVisibility>(parent?.visibility === "board" ? "board" : "owners");

  const create = useMutation({
    mutationFn: () =>
      createFolder(supabase(), { association_id: associationId, parent_id: parent?.id ?? null, name, description, visibility }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
    },
  });

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>+ {parent ? t.sections.newFolder : t.sections.newSection}</Button>
      </div>
    );
  }

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
        <Field label={t.sections.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مواعيد النادي الرياضي" required autoFocus />
        </Field>
        <VisibilityField value={visibility} onChange={setVisibility} lockedToBoard={parent?.visibility === "board"} />
        <div className="sm:col-span-2">
          <Field label={t.sections.description}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
          </Field>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
          <ErrorText>{errorText(create.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function VisibilityField({
  value,
  onChange,
  lockedToBoard,
}: {
  value: FolderVisibility;
  onChange: (v: FolderVisibility) => void;
  lockedToBoard?: boolean;
}) {
  return (
    <Field label={t.sections.visibility}>
      <Select value={lockedToBoard ? "board" : value} disabled={lockedToBoard} onChange={(e) => onChange(e.target.value as FolderVisibility)}>
        <option value="owners">{VISIBILITY_LABELS.owners}</option>
        <option value="board">{VISIBILITY_LABELS.board}</option>
      </Select>
    </Field>
  );
}

function FolderActions({ associationId, folder, all }: { associationId: string; folder: Folder; all: Folder[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: folder.name,
    description: folder.description ?? "",
    visibility: folder.visibility as FolderVisibility,
    parent_id: folder.parent_id ?? "",
  });
  const invalid = new Set(folderSubtree(all, folder.id));
  const parentOptions = all.filter((f) => !invalid.has(f.id));
  const parentIsBoard = all.find((f) => f.id === form.parent_id)?.visibility === "board";

  const save = useMutation({
    mutationFn: () =>
      updateFolder(supabase(), folder.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        visibility: form.visibility,
        parent_id: form.parent_id || null,
      }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteFolder(supabase(), all, folder.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
      router.replace(`/a/${associationId}/sections${folder.parent_id ? `?folder=${folder.parent_id}` : ""}`);
    },
  });

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={folder.visibility === "board" ? "danger" : "primary"}>{VISIBILITY_LABELS[folder.visibility as FolderVisibility]}</Badge>
        <Button variant="secondary" className="h-8" onClick={() => setEditing(true)}>{t.common.edit}</Button>
        <DeleteButton message={t.sections.deleteFolderConfirm} disabled={remove.isPending} onConfirm={() => remove.mutate()} />
        <ErrorText>{errorText(remove.error)}</ErrorText>
      </div>
    );
  }

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t.sections.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <VisibilityField value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} lockedToBoard={parentIsBoard} />
        <Field label="نقل إلى">
          <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">— {t.sections.title} (المستوى الأعلى)</option>
            {parentOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.sections.description}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
          </Field>
        </div>
        {form.visibility === "board" && folder.visibility !== "board" && (
          <p className="text-sm text-muted sm:col-span-2">سيصبح كل ما بداخل هذا المجلد مرئياً لمجلس الإدارة فقط.</p>
        )}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Items: notes, links, files
// ---------------------------------------------------------------------------

function ItemsSection({ associationId, folder, manage }: { associationId: string; folder: Folder; manage: boolean }) {
  const items = useQuery({ queryKey: queryKeys.items(folder.id), queryFn: () => listItems(supabase(), folder.id) });
  const [adding, setAdding] = useState<ItemKind | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto font-semibold">{t.sections.items}</h2>
        {manage &&
          (["note", "link", "file"] as const).map((k) => (
            <Button key={k} variant={adding === k ? "primary" : "secondary"} className="h-8" onClick={() => setAdding(adding === k ? null : k)}>
              + {ITEM_KIND_LABELS[k]}
            </Button>
          ))}
      </div>
      {adding && <NewItemForm kind={adding} associationId={associationId} folderId={folder.id} onDone={() => setAdding(null)} />}
      {items.isLoading && <Loading />}
      {items.data?.length === 0 && <p className="text-sm text-muted">{t.common.empty}</p>}
      <div className="flex flex-col gap-3">
        {items.data?.map((item) => <ItemCard key={item.id} item={item} manage={manage} />)}
      </div>
    </section>
  );
}

function NewItemForm({ kind, associationId, folderId, onDone }: { kind: ItemKind; associationId: string; folderId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const base = { association_id: associationId, folder_id: folderId, title };
      if (kind === "note") return createNote(supabase(), { ...base, body });
      if (kind === "link") return createLink(supabase(), { ...base, url, body });
      if (!file) throw new Error("اختر ملفاً");
      return createFileItem(supabase(), { ...base, body, file: { data: file, name: file.name, type: file.type, size: file.size } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.items(folderId) });
      onDone();
    },
  });

  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
        {kind === "file" && (
          <Field label={t.sections.chooseFile}>
            <input
              type="file"
              required
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
            {file && file.size > MAX_FILE_BYTES && <ErrorText>{t.sections.fileTooLarge}</ErrorText>}
          </Field>
        )}
        <Field label={t.sections.itemTitle}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required={kind !== "file"} />
        </Field>
        {kind === "link" && (
          <Field label={t.sections.url}>
            <Input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
          </Field>
        )}
        <Field label={kind === "note" ? t.sections.body : t.sections.description}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} required={kind === "note"}
            placeholder={kind === "note" ? "مثال: السبت - الخميس 6 صباحاً - 11 مساءً" : undefined} />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={create.isPending || (kind === "file" && (!file || file.size > MAX_FILE_BYTES))}>
            {create.isPending && kind === "file" ? t.sections.uploading : t.common.save}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
          <ErrorText>{errorText(create.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function ItemCard({ item, manage }: { item: FolderItem; manage: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: item.title, body: item.body ?? "", url: item.url ?? "" });
  const [newFile, setNewFile] = useState<File | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.items(item.folder_id) });

  const save = useMutation({
    mutationFn: async () => {
      if (newFile) await replaceFile(supabase(), item, { data: newFile, name: newFile.name, type: newFile.type, size: newFile.size });
      await updateItem(supabase(), item, {
        title: form.title,
        body: form.body.trim() || null,
        ...(item.kind === "link" ? { url: form.url } : {}),
      });
    },
    onSuccess: () => {
      setEditing(false);
      setNewFile(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deleteItem(supabase(), item), onSuccess: refresh });
  const open = useMutation({
    mutationFn: async (download: boolean) => {
      // Open the tab synchronously (inside the click) so Safari doesn't block it as a pop-up.
      const tab = window.open("about:blank", "_blank");
      try {
        const url = await getFileUrl(supabase(), item, download);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        throw e;
      }
    },
  });

  if (editing) {
    return (
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Field label={t.sections.itemTitle}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          {item.kind === "link" && (
            <Field label={t.sections.url}>
              <Input dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
            </Field>
          )}
          {item.kind === "file" && (
            <Field label="استبدال الملف (اختياري)">
              <input type="file" className="text-sm" onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
            </Field>
          )}
          <Field label={item.kind === "note" ? t.sections.body : t.sections.description}>
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required={item.kind === "note"} />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={save.isPending || (newFile !== null && newFile.size > MAX_FILE_BYTES)}>{t.common.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
            <ErrorText>{errorText(save.error) || (newFile && newFile.size > MAX_FILE_BYTES ? t.sections.fileTooLarge : "")}</ErrorText>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{ITEM_KIND_LABELS[item.kind as ItemKind]}</Badge>
        <span className="me-auto font-semibold">{item.title}</span>
        {manage && (
          <>
            <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <DeleteButton disabled={remove.isPending} onConfirm={() => remove.mutate()} />
          </>
        )}
      </div>
      {item.kind === "link" && item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-sm text-primary underline">
          {item.url}
        </a>
      )}
      {item.kind === "file" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span dir="auto" className="text-muted">{item.file_name} · {formatBytes(item.size_bytes)}</span>
          <Button variant="secondary" className="h-8" disabled={open.isPending} onClick={() => open.mutate(false)}>{t.common.open}</Button>
          <Button variant="ghost" className="h-8" disabled={open.isPending} onClick={() => open.mutate(true)}>{t.sections.download}</Button>
        </div>
      )}
      {item.body && <p className="whitespace-pre-wrap text-sm">{item.body}</p>}
      <ErrorText>{errorText(remove.error) || errorText(open.error)}</ErrorText>
    </Card>
  );
}
