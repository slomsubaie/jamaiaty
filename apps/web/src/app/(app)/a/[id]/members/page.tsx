"use client";

import {
  addMember,
  BOARD_PERMISSIONS,
  canManage,
  canView,
  deactivateMember,
  isPresident as isPresidentOf,
  isSupportSession,
  supportExpiresAt,
  formatSaudiPhone,
  listMembers,
  listUnits,
  PERMISSION_LABELS,
  queryKeys,
  ROLE_LABELS,
  rolesLabel,
  setBoardPermissions,
  setMemberRole,
  t,
  toLatinDigits,
  type BoardPermission,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, errorText, Field, Input, Loading, PageTitle, Select, SupportBanner } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  forbidden: "ليست لديك صلاحية لهذا الإجراء",
  invalid_input: "يرجى التحقق من البيانات المدخلة",
  already_president: "رئيس الجمعية يملك كل صلاحيات المجلس، ولا يمكن إضافته عضواً في المجلس",
  unit_not_found: "الوحدة غير موجودة",
};

export default function MembersPage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "members", page: "/members" });
  const members = useQuery({ queryKey: queryKeys.members(id), queryFn: () => listMembers(supabase(), id) });

  if (isLoading || members.isLoading || !access) return <Loading />;
  if (!canView(access, "members")) return <p className="text-muted">{t.common.noPermission}</p>;
  const isPresident = isPresidentOf(access);
  // Adding members goes through the add-member function, which needs a membership.
  const canAddOwners = access.role !== null && canManage(access, "units");
  const canManageOwners = canManage(access, "units");

  return (
    <div className="flex flex-col gap-6">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={t.association.members} back={{ href: `/a/${id}`, label: "الجمعية" }} />
      {canAddOwners && <AddMemberForm associationId={id} isPresident={isPresident} />}
      <div className="flex flex-col gap-3">
        {members.data?.map((m) => {
          const presidentRow = m.roles.includes("president");
          return (
            <Card key={m.user_id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-semibold">{m.profiles?.full_name}</span>
                <span dir="ltr" className="text-sm text-muted">{m.profiles?.phone && formatSaudiPhone(m.profiles.phone)}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs">{rolesLabel(m.roles)}</span>
                {isPresident && !presidentRow && <RemoveButton associationId={id} userId={m.user_id} />}
              </div>
              {(isPresident || canManageOwners) && (
                <RoleToggles
                  associationId={id}
                  userId={m.user_id}
                  roles={m.roles}
                  canToggleBoard={isPresident && !presidentRow}
                  canToggleOwner={canManageOwners}
                />
              )}
              {m.boardRow && (
                <PermissionEditor associationId={id} membershipId={m.boardRow.id} value={m.permissions} editable={isPresident} />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PermissionEditor({
  associationId,
  membershipId,
  value,
  editable,
}: {
  associationId: string;
  membershipId: string;
  value: BoardPermission[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (perms: BoardPermission[]) => setBoardPermissions(supabase(), membershipId, perms),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members(associationId) }),
  });
  const toggle = (p: BoardPermission) =>
    save.mutate(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {BOARD_PERMISSIONS.map((p) => (
        <label key={p} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={value.includes(p)}
            disabled={!editable || save.isPending}
            onChange={() => toggle(p)}
            className="accent-[var(--primary)]"
          />
          {PERMISSION_LABELS[p]}
        </label>
      ))}
      <ErrorText>{errorText(save.error)}</ErrorText>
    </div>
  );
}

/** Roles combine: e.g. a board member who also owns a unit holds both. */
function RoleToggles({
  associationId,
  userId,
  roles,
  canToggleBoard,
  canToggleOwner,
}: {
  associationId: string;
  userId: string;
  roles: ("president" | "board_member" | "owner")[];
  canToggleBoard: boolean;
  canToggleOwner: boolean;
}) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: ({ role, on }: { role: "owner" | "board_member"; on: boolean }) => setMemberRole(supabase(), associationId, userId, role, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members(associationId) }),
  });
  const toggle = (role: "owner" | "board_member", on: boolean) => {
    const remaining = roles.filter((r) => r !== role);
    if (!on && remaining.length === 0) {
      alert("لكل عضو دور واحد على الأقل. لإخراجه من الجمعية استخدم زر \"إزالة\".");
      return;
    }
    if (!on && role === "board_member" && !confirm("إلغاء عضوية المجلس سيلغي جميع صلاحياته في المجلس. متابعة؟")) return;
    change.mutate({ role, on });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-muted">الأدوار:</span>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={roles.includes("board_member")} disabled={!canToggleBoard || change.isPending}
          onChange={(e) => toggle("board_member", e.target.checked)} />
        {ROLE_LABELS.board_member}
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={roles.includes("owner")} disabled={!canToggleOwner || change.isPending}
          onChange={(e) => toggle("owner", e.target.checked)} />
        {ROLE_LABELS.owner}
      </label>
      <ErrorText>{errorText(change.error)}</ErrorText>
    </div>
  );
}

function RemoveButton({ associationId, userId }: { associationId: string; userId: string }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deactivateMember(supabase(), associationId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members(associationId) }),
  });
  return (
    <Button
      variant="ghost"
      className="ms-auto h-8 text-danger"
      disabled={remove.isPending}
      onClick={() => confirm("إزالة هذا العضو من الجمعية؟") && remove.mutate()}
    >
      إزالة
    </Button>
  );
}

function AddMemberForm({ associationId, isPresident }: { associationId: string; isPresident: boolean }) {
  const qc = useQueryClient();
  const units = useQuery({ queryKey: queryKeys.units(associationId), queryFn: () => listUnits(supabase(), associationId) });
  const empty = { full_name: "", phone: "", role: "owner" as "owner" | "board_member", unit_id: "", share_pct: "100" };
  const [form, setForm] = useState(empty);
  const [permissions, setPermissions] = useState<BoardPermission[]>([]);

  const add = useMutation({
    mutationFn: () =>
      addMember(supabase(), {
        association_id: associationId,
        full_name: form.full_name,
        phone: form.phone,
        role: form.role,
        permissions: form.role === "board_member" ? permissions : [],
        unit_id: form.unit_id || undefined,
        share_pct: form.unit_id ? Number(form.share_pct) : undefined,
      }),
    onSuccess: () => {
      setForm(empty);
      setPermissions([]);
      qc.invalidateQueries({ queryKey: queryKeys.members(associationId) });
      qc.invalidateQueries({ queryKey: queryKeys.units(associationId) });
    },
  });

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
        <h2 className="font-semibold sm:col-span-2">{t.members.addMember}</h2>
        <Field label={t.members.fullName}>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </Field>
        <Field label={t.members.phone}>
          <Input dir="ltr" type="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: toLatinDigits(e.target.value) })} required />
        </Field>
        <Field label={t.members.role}>
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
            <option value="owner">{ROLE_LABELS.owner}</option>
            {isPresident && <option value="board_member">{ROLE_LABELS.board_member}</option>}
          </Select>
        </Field>
        <Field label={t.members.unit}>
          <Select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
            <option value="">{t.members.noUnit}</option>
            {units.data?.map((u) => (
              <option key={u.id} value={u.id}>{[u.buildings?.name, u.unit_number].filter(Boolean).join(" / ")}</option>
            ))}
          </Select>
        </Field>
        {form.unit_id && (
          <Field label={t.members.sharePct}>
            <Input type="number" min="1" max="100" value={form.share_pct} onChange={(e) => setForm({ ...form, share_pct: e.target.value })} />
          </Field>
        )}
        {form.role === "board_member" && (
          <div className="flex flex-col gap-2 text-sm sm:col-span-2">
            <span className="font-medium">{t.members.permissions}</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {BOARD_PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={() => setPermissions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
                  />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={add.isPending}>{t.members.save}</Button>
          {add.isSuccess && <span className="text-sm text-primary">{t.members.added}</span>}
          <ErrorText>{add.error && (ERRORS[add.error.message] ?? add.error.message)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}
