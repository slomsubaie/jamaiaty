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
  type UploadableFile,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File as FSFile } from "expo-file-system";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  ErrorText,
  errorText,
  Input,
  LinkButton,
  Loading,
  Row,
  Screen,
  SupportBanner,
  Text,
  useColors,
} from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

function confirmDelete(message: string, onConfirm: () => void) {
  Alert.alert(t.common.delete, message, [
    { text: t.common.cancel, style: "cancel" },
    { text: t.common.delete, style: "destructive", onPress: onConfirm },
  ]);
}

async function pickFile(): Promise<UploadableFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const data = await new FSFile(asset.uri).arrayBuffer();
  return { data, name: asset.name, type: asset.mimeType ?? "application/octet-stream", size: asset.size ?? data.byteLength };
}

export default function Sections() {
  const { id, folder: folderId } = useLocalSearchParams<{ id: string; folder?: string }>();
  const { access, isLoading } = useAccess(id, { section: "sections", page: `/sections${folderId ? `?folder=${folderId}` : ""}` });
  const folders = useQuery({ queryKey: queryKeys.folders(id), queryFn: () => listFolders(supabase, id) });
  const c = useColors();

  if (isLoading || folders.isLoading || !access) return <Loading />;
  if (!canView(access, "sections")) return <Screen><Text muted>{t.common.noPermission}</Text></Screen>;

  const all = folders.data ?? [];
  const current = folderId ? all.find((f) => f.id === folderId) ?? null : null;
  const manage = canManage(access, "sections");
  const children = all.filter((f) => f.parent_id === (current?.id ?? null));

  return (
    <Screen>
      <Stack.Screen options={{ title: current?.name ?? t.sections.title }} />
      <SupportBanner show={isSupportSession(access)} />
      {current?.description ? <Text muted>{current.description}</Text> : null}
      {current && manage && <FolderActions associationId={id} folder={current} all={all} />}

      {manage && <NewFolderForm associationId={id} parent={current} />}
      {children.map((f) => (
        <Pressable key={f.id} onPress={() => router.push({ pathname: "/a/[id]/sections", params: { id, folder: f.id } })}>
          <Card>
            <Row>
              <Text bold style={{ flex: 1 }}>📁 {f.name}</Text>
              {f.visibility === "board" && <Text size={12} style={{ color: c.danger }}>{VISIBILITY_LABELS.board}</Text>}
            </Row>
            {f.description ? <Text muted size={13} numberOfLines={2}>{f.description}</Text> : null}
          </Card>
        </Pressable>
      ))}
      {!current && children.length === 0 && !manage && <Text muted>{t.common.empty}</Text>}

      {current && <Items associationId={id} folder={current} manage={manage} />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

function VisibilityPicker({ value, onChange, locked }: { value: FolderVisibility; onChange: (v: FolderVisibility) => void; locked?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text bold size={14}>{t.sections.visibility}</Text>
      <Row>
        {(["owners", "board"] as const).map((v) => (
          <Chip key={v} label={VISIBILITY_LABELS[v]} selected={(locked ? "board" : value) === v} onPress={() => !locked && onChange(v)} />
        ))}
      </Row>
    </View>
  );
}

function NewFolderForm({ associationId, parent }: { associationId: string; parent: Folder | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<FolderVisibility>("owners");
  const create = useMutation({
    mutationFn: () => createFolder(supabase, { association_id: associationId, parent_id: parent?.id ?? null, name, description, visibility }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
    },
  });

  if (!open) return <Button variant="ghost" title={`+ ${parent ? t.sections.newFolder : t.sections.newSection}`} onPress={() => setOpen(true)} />;
  return (
    <Card style={{ gap: 12 }}>
      <Input label={t.sections.name} value={name} onChangeText={setName} placeholder="مثال: مواعيد النادي الرياضي" autoFocus />
      <Input label={t.sections.description} value={description} onChangeText={setDescription} multiline style={{ height: 80, textAlignVertical: "top", paddingTop: 10 }} />
      <VisibilityPicker value={visibility} onChange={setVisibility} locked={parent?.visibility === "board"} />
      <ErrorText>{errorText(create.error)}</ErrorText>
      <Button title={t.common.save} onPress={() => create.mutate()} disabled={create.isPending || !name.trim()} />
      <Button variant="ghost" title={t.common.cancel} onPress={() => setOpen(false)} />
    </Card>
  );
}

function FolderActions({ associationId, folder, all }: { associationId: string; folder: Folder; all: Folder[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description ?? "");
  const [visibility, setVisibility] = useState<FolderVisibility>(folder.visibility as FolderVisibility);
  const [parentId, setParentId] = useState<string | null>(folder.parent_id);
  const invalid = new Set(folderSubtree(all, folder.id));
  const parentIsBoard = all.find((f) => f.id === parentId)?.visibility === "board";

  const save = useMutation({
    mutationFn: () =>
      updateFolder(supabase, folder.id, { name: name.trim(), description: description.trim() || null, visibility, parent_id: parentId }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFolder(supabase, all, folder.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.folders(associationId) });
      router.back();
    },
  });

  if (!editing) {
    return (
      <Row>
        <Text muted size={13} style={{ flex: 1 }}>{VISIBILITY_LABELS[folder.visibility as FolderVisibility]}</Text>
        <LinkButton title={t.common.edit} onPress={() => setEditing(true)} />
        <LinkButton title={t.common.delete} danger disabled={remove.isPending}
          onPress={() => confirmDelete(t.sections.deleteFolderConfirm, () => remove.mutate())} />
        <ErrorText>{errorText(remove.error)}</ErrorText>
      </Row>
    );
  }
  return (
    <Card style={{ gap: 12 }}>
      <Input label={t.sections.name} value={name} onChangeText={setName} />
      <Input label={t.sections.description} value={description} onChangeText={setDescription} multiline style={{ height: 80, textAlignVertical: "top", paddingTop: 10 }} />
      <VisibilityPicker value={visibility} onChange={setVisibility} locked={parentIsBoard} />
      <View style={{ gap: 6 }}>
        <Text bold size={14}>نقل إلى</Text>
        <Row>
          <Chip label="المستوى الأعلى" selected={parentId === null} onPress={() => setParentId(null)} />
          {all.filter((f) => !invalid.has(f.id)).map((f) => (
            <Chip key={f.id} label={f.name} selected={parentId === f.id} onPress={() => setParentId(f.id)} />
          ))}
        </Row>
      </View>
      <ErrorText>{errorText(save.error)}</ErrorText>
      <Button title={t.common.save} onPress={() => save.mutate()} disabled={save.isPending || !name.trim()} />
      <Button variant="ghost" title={t.common.cancel} onPress={() => setEditing(false)} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function Items({ associationId, folder, manage }: { associationId: string; folder: Folder; manage: boolean }) {
  const items = useQuery({ queryKey: queryKeys.items(folder.id), queryFn: () => listItems(supabase, folder.id) });
  const [adding, setAdding] = useState<ItemKind | null>(null);

  return (
    <View style={{ gap: 12 }}>
      <Text bold size={17}>{t.sections.items}</Text>
      {manage && (
        <Row>
          {(["note", "link", "file"] as const).map((k) => (
            <Chip key={k} label={`+ ${ITEM_KIND_LABELS[k]}`} selected={adding === k} onPress={() => setAdding(adding === k ? null : k)} />
          ))}
        </Row>
      )}
      {adding && <NewItemForm kind={adding} associationId={associationId} folderId={folder.id} onDone={() => setAdding(null)} />}
      {items.data?.length === 0 && <Text muted>{t.common.empty}</Text>}
      {items.data?.map((item) => <ItemCard key={item.id} item={item} manage={manage} />)}
    </View>
  );
}

function NewItemForm({ kind, associationId, folderId, onDone }: { kind: ItemKind; associationId: string; folderId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<UploadableFile | null>(null);
  const [pickError, setPickError] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const base = { association_id: associationId, folder_id: folderId, title };
      if (kind === "note") return createNote(supabase, { ...base, body });
      if (kind === "link") return createLink(supabase, { ...base, url, body });
      if (!file) throw new Error(t.sections.chooseFile);
      return createFileItem(supabase, { ...base, body, file });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.items(folderId) });
      onDone();
    },
  });

  const ready = kind === "file" ? Boolean(file) && file!.size <= MAX_FILE_BYTES : title.trim() && (kind !== "link" || url.trim()) && (kind !== "note" || body.trim());

  return (
    <Card style={{ gap: 12 }}>
      {kind === "file" && (
        <>
          <Button
            variant="ghost"
            title={file ? `📎 ${file.name} (${formatBytes(file.size)})` : t.sections.chooseFile}
            onPress={async () => {
              setPickError("");
              try {
                const f = await pickFile();
                if (f) {
                  setFile(f);
                  if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }
              } catch (e) {
                setPickError(errorText(e));
              }
            }}
          />
          {file && file.size > MAX_FILE_BYTES && <ErrorText>{t.sections.fileTooLarge}</ErrorText>}
          <ErrorText>{pickError}</ErrorText>
        </>
      )}
      <Input label={t.sections.itemTitle} value={title} onChangeText={setTitle} />
      {kind === "link" && <Input label={t.sections.url} ltr value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" placeholder="https://" />}
      <Input label={kind === "note" ? t.sections.body : t.sections.description} value={body} onChangeText={setBody} multiline
        style={{ height: 110, textAlignVertical: "top", paddingTop: 10 }} />
      <ErrorText>{errorText(create.error)}</ErrorText>
      <Button title={create.isPending && kind === "file" ? t.sections.uploading : t.common.save} onPress={() => create.mutate()} disabled={create.isPending || !ready} />
      <Button variant="ghost" title={t.common.cancel} onPress={onDone} />
    </Card>
  );
}

function ItemCard({ item, manage }: { item: FolderItem; manage: boolean }) {
  const qc = useQueryClient();
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body ?? "");
  const [url, setUrl] = useState(item.url ?? "");
  const [newFile, setNewFile] = useState<UploadableFile | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.items(item.folder_id) });

  const save = useMutation({
    mutationFn: async () => {
      if (newFile) await replaceFile(supabase, item, newFile);
      await updateItem(supabase, item, { title, body: body.trim() || null, ...(item.kind === "link" ? { url } : {}) });
    },
    onSuccess: () => {
      setEditing(false);
      setNewFile(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deleteItem(supabase, item), onSuccess: refresh });
  const open = useMutation({
    mutationFn: async (download: boolean) => {
      const signed = await getFileUrl(supabase, item, download);
      if (download) await Linking.openURL(signed);
      else await WebBrowser.openBrowserAsync(signed);
    },
  });

  if (editing) {
    return (
      <Card style={{ gap: 12 }}>
        <Input label={t.sections.itemTitle} value={title} onChangeText={setTitle} />
        {item.kind === "link" && <Input label={t.sections.url} ltr value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />}
        {item.kind === "file" && (
          <Button
            variant="ghost"
            title={newFile ? `📎 ${newFile.name}` : "استبدال الملف (اختياري)"}
            onPress={async () => setNewFile(await pickFile())}
          />
        )}
        <Input label={item.kind === "note" ? t.sections.body : t.sections.description} value={body} onChangeText={setBody} multiline
          style={{ height: 110, textAlignVertical: "top", paddingTop: 10 }} />
        <ErrorText>{errorText(save.error) || (newFile && newFile.size > MAX_FILE_BYTES ? t.sections.fileTooLarge : "")}</ErrorText>
        <Button title={t.common.save} onPress={() => save.mutate()}
          disabled={save.isPending || !title.trim() || (newFile !== null && newFile.size > MAX_FILE_BYTES)} />
        <Button variant="ghost" title={t.common.cancel} onPress={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card>
      <Row>
        <Text size={12} muted>{ITEM_KIND_LABELS[item.kind as ItemKind]}</Text>
        <Text bold style={{ flex: 1 }}>{item.title}</Text>
        {manage && (
          <>
            <LinkButton title={t.common.edit} onPress={() => setEditing(true)} />
            <LinkButton title={t.common.delete} danger disabled={remove.isPending}
              onPress={() => confirmDelete(t.common.confirmDelete, () => remove.mutate())} />
          </>
        )}
      </Row>
      {item.kind === "link" && item.url && (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(item.url!)}>
          <Text style={{ color: c.primary, textDecorationLine: "underline" }}>{item.url}</Text>
        </Pressable>
      )}
      {item.kind === "file" && (
        <Row>
          <Text muted size={13} style={{ flex: 1 }}>{item.file_name} · {formatBytes(item.size_bytes)}</Text>
          <LinkButton title={t.common.open} disabled={open.isPending} onPress={() => open.mutate(false)} />
          <LinkButton title={t.sections.download} disabled={open.isPending} onPress={() => open.mutate(true)} />
        </Row>
      )}
      {item.body ? <Text>{item.body}</Text> : null}
      <ErrorText>{errorText(remove.error) || errorText(open.error)}</ErrorText>
    </Card>
  );
}
