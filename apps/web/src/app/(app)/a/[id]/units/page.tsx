"use client";

import {
  addOwnership,
  canManage,
  canView,
  createBuilding,
  createUnit,
  deleteBuilding,
  deleteOwnership,
  deleteUnit,
  endOwnership,
  isSupportSession,
  supportExpiresAt,
  listBuildings,
  listMembers,
  listUnits,
  queryKeys,
  renameBuilding,
  t,
  updateOwnershipShare,
  updateUnit,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
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
} from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Unit = Awaited<ReturnType<typeof listUnits>>[number];
type Building = Awaited<ReturnType<typeof listBuildings>>[number];

function useRefresh(associationId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.units(associationId) });
    qc.invalidateQueries({ queryKey: queryKeys.buildings(associationId) });
  };
}

export default function UnitsPage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "units", page: "/units" });
  const units = useQuery({ queryKey: queryKeys.units(id), queryFn: () => listUnits(supabase(), id) });
  const buildings = useQuery({ queryKey: queryKeys.buildings(id), queryFn: () => listBuildings(supabase(), id) });

  if (isLoading || units.isLoading || !access) return <Loading />;
  if (!canView(access, "units")) return <p className="text-muted">{t.common.noPermission}</p>;
  const manage = canManage(access, "units");

  return (
    <div className="flex flex-col gap-6">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={t.association.units} back={{ href: `/a/${id}`, label: "الجمعية" }} />
      {manage && <Buildings associationId={id} buildings={buildings.data ?? []} />}
      {manage && <NewUnitForm associationId={id} buildings={buildings.data ?? []} />}
      {units.data?.length === 0 && <p className="text-sm text-muted">لا توجد وحدات</p>}
      <div className="flex flex-col gap-3">
        {units.data?.map((u) => (
          <UnitCard key={u.id} associationId={id} unit={u} buildings={buildings.data ?? []} manage={manage} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function Buildings({ associationId, buildings }: { associationId: string; buildings: Building[] }) {
  const refresh = useRefresh(associationId);
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createBuilding(supabase(), associationId, name.trim()),
    onSuccess: () => { setName(""); refresh(); },
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">المباني</h2>
      <div className="flex flex-col gap-2">
        {buildings.map((b) => <BuildingRow key={b.id} associationId={associationId} building={b} />)}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
        <div className="min-w-48 flex-1">
          <Field label={t.units.addBuilding}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.units.buildingName} required />
          </Field>
        </div>
        <Button type="submit" disabled={add.isPending}>{t.common.add}</Button>
        <ErrorText>{errorText(add.error)}</ErrorText>
      </form>
    </Card>
  );
}

function BuildingRow({ associationId, building }: { associationId: string; building: Building }) {
  const refresh = useRefresh(associationId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(building.name);
  const save = useMutation({
    mutationFn: () => renameBuilding(supabase(), building.id, name),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const remove = useMutation({ mutationFn: () => deleteBuilding(supabase(), building.id), onSuccess: refresh });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0">
      {editing ? (
        <form className="flex flex-1 items-center gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required className="max-w-xs" />
          <Button type="submit" className="h-8" disabled={save.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" className="h-8" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
        </form>
      ) : (
        <>
          <span className="me-auto font-medium">{building.name}</span>
          <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
          <DeleteButton
            message="حذف المبنى؟ ستبقى وحداته بدون مبنى."
            disabled={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </>
      )}
      <ErrorText>{errorText(save.error) || errorText(remove.error)}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

type UnitForm = { building_id: string; unit_number: string; floor: string; area_m2: string; mullak_unit_ref: string };

function toPatch(f: UnitForm) {
  return {
    building_id: f.building_id || null,
    unit_number: f.unit_number.trim(),
    floor: f.floor.trim() || null,
    area_m2: f.area_m2 ? Number(f.area_m2) : null,
    mullak_unit_ref: f.mullak_unit_ref.trim() || null,
  };
}

function UnitFields({ form, setForm, buildings }: { form: UnitForm; setForm: (f: UnitForm) => void; buildings: Building[] }) {
  return (
    <>
      <Field label={t.units.building}>
        <Select value={form.building_id} onChange={(e) => setForm({ ...form, building_id: e.target.value })}>
          <option value="">—</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <Field label={t.units.unitNumber}>
        <Input value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} required />
      </Field>
      <Field label={t.units.floor}>
        <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
      </Field>
      <Field label={t.units.area}>
        <Input type="number" min="0" step="0.01" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} />
      </Field>
      <Field label={t.units.mullakRef}>
        <Input value={form.mullak_unit_ref} onChange={(e) => setForm({ ...form, mullak_unit_ref: e.target.value })} />
      </Field>
    </>
  );
}

function NewUnitForm({ associationId, buildings }: { associationId: string; buildings: Building[] }) {
  const refresh = useRefresh(associationId);
  const empty: UnitForm = { building_id: "", unit_number: "", floor: "", area_m2: "", mullak_unit_ref: "" };
  const [form, setForm] = useState(empty);
  const add = useMutation({
    mutationFn: () => {
      const p = toPatch(form);
      return createUnit(supabase(), {
        association_id: associationId,
        building_id: p.building_id,
        unit_number: p.unit_number,
        floor: p.floor ?? undefined,
        area_m2: p.area_m2 ?? undefined,
        mullak_unit_ref: p.mullak_unit_ref ?? undefined,
      });
    },
    onSuccess: () => { setForm({ ...empty, building_id: form.building_id }); refresh(); },
  });

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
        <h2 className="font-semibold sm:col-span-3">{t.units.addUnit}</h2>
        <UnitFields form={form} setForm={setForm} buildings={buildings} />
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={add.isPending}>{t.common.add}</Button>
          <ErrorText>{errorText(add.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function UnitCard({ associationId, unit, buildings, manage }: { associationId: string; unit: Unit; buildings: Building[]; manage: boolean }) {
  const refresh = useRefresh(associationId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UnitForm>({
    building_id: unit.building_id ?? "",
    unit_number: unit.unit_number,
    floor: unit.floor ?? "",
    area_m2: unit.area_m2?.toString() ?? "",
    mullak_unit_ref: unit.mullak_unit_ref ?? "",
  });
  const save = useMutation({
    mutationFn: () => updateUnit(supabase(), unit.id, toPatch(form)),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const remove = useMutation({ mutationFn: () => deleteUnit(supabase(), unit.id), onSuccess: refresh });

  return (
    <Card className="flex flex-col gap-3">
      {editing ? (
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <UnitFields form={form} setForm={setForm} buildings={buildings} />
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold">{[unit.buildings?.name, `${t.units.unitNumber} ${unit.unit_number}`].filter(Boolean).join(" · ")}</span>
          <span className="me-auto text-sm text-muted">
            {[unit.floor && `${t.units.floor} ${unit.floor}`, unit.area_m2 && `${unit.area_m2} م²`, unit.mullak_unit_ref && `ملاك: ${unit.mullak_unit_ref}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {manage && (
            <>
              <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
              <DeleteButton message="حذف الوحدة وسجل ملكيتها؟" disabled={remove.isPending} onConfirm={() => remove.mutate()} />
            </>
          )}
        </div>
      )}
      <ErrorText>{errorText(save.error) || errorText(remove.error)}</ErrorText>
      <Ownerships associationId={associationId} unit={unit} manage={manage} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ownerships
// ---------------------------------------------------------------------------

function Ownerships({ associationId, unit, manage }: { associationId: string; unit: Unit; manage: boolean }) {
  const refresh = useRefresh(associationId);
  const [adding, setAdding] = useState(false);
  const members = useQuery({
    queryKey: queryKeys.members(associationId),
    queryFn: () => listMembers(supabase(), associationId),
    enabled: manage && adding,
  });
  const [userId, setUserId] = useState("");
  const [share, setShare] = useState("100");
  const add = useMutation({
    mutationFn: () => addOwnership(supabase(), { association_id: associationId, unit_id: unit.id, user_id: userId, share_pct: Number(share) }),
    onSuccess: () => { setAdding(false); setUserId(""); refresh(); },
  });
  const owned = new Set(unit.unit_ownerships.map((o) => o.user_id));

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
      <span className="text-muted">الملاك</span>
      {unit.unit_ownerships.length === 0 && <span className="text-muted">—</span>}
      {unit.unit_ownerships.map((o) => <OwnershipRow key={o.id} associationId={associationId} ownership={o} manage={manage} />)}
      {manage && !adding && (
        <div><Button variant="ghost" className="h-8 px-0" onClick={() => setAdding(true)}>+ ربط مالك بالوحدة</Button></div>
      )}
      {manage && adding && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
          <div className="min-w-48">
            <Field label="العضو">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} required>
                <option value="">—</option>
                {members.data?.filter((m) => !owned.has(m.user_id)).map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-28">
            <Field label={t.members.sharePct}>
              <Input type="number" min="1" max="100" value={share} onChange={(e) => setShare(e.target.value)} required />
            </Field>
          </div>
          <Button type="submit" className="h-10" disabled={add.isPending}>{t.common.add}</Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setAdding(false)}>{t.common.cancel}</Button>
          <ErrorText>{errorText(add.error)}</ErrorText>
        </form>
      )}
    </div>
  );
}

function OwnershipRow({ associationId, ownership, manage }: { associationId: string; ownership: Unit["unit_ownerships"][number]; manage: boolean }) {
  const refresh = useRefresh(associationId);
  const [editing, setEditing] = useState(false);
  const [share, setShare] = useState(String(ownership.share_pct));
  const save = useMutation({
    mutationFn: () => updateOwnershipShare(supabase(), ownership.id, Number(share)),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const end = useMutation({ mutationFn: () => endOwnership(supabase(), ownership.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteOwnership(supabase(), ownership.id), onSuccess: refresh });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="me-auto">
        {ownership.profiles?.full_name}{" "}
        {editing ? null : <span className="text-muted">({ownership.share_pct}%)</span>}
      </span>
      {editing ? (
        <form className="flex items-center gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Input type="number" min="1" max="100" value={share} onChange={(e) => setShare(e.target.value)} className="w-24" required />
          <Button type="submit" className="h-8" disabled={save.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" className="h-8" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
        </form>
      ) : (
        manage && (
          <>
            <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>تعديل النسبة</Button>
            <DeleteButton
              label="إنهاء الملكية"
              message="إنهاء ملكية هذا المالك للوحدة (مثلاً عند البيع)؟ يبقى السجل محفوظاً."
              disabled={end.isPending}
              onConfirm={() => end.mutate()}
            />
            <DeleteButton message="حذف هذا السجل نهائياً (للأخطاء فقط)؟" disabled={remove.isPending} onConfirm={() => remove.mutate()} />
          </>
        )
      )}
      <ErrorText>{errorText(save.error) || errorText(end.error) || errorText(remove.error)}</ErrorText>
    </div>
  );
}
