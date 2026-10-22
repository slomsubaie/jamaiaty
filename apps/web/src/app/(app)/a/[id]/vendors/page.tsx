"use client";

import {
  canManage,
  canView,
  compareOffers,
  countUnits,
  createOffer,
  createVendor,
  deleteOffer,
  deleteVendor,
  formatSAR,
  isSupportSession,
  listOffers,
  listVendors,
  normalizePrice,
  OFFER_STATUSES,
  PRICE_BASES,
  recordKeys,
  SERVICE_CATALOG,
  serviceLabel,
  supportExpiresAt,
  t,
  toLatinDigits,
  updateOffer,
  updateVendor,
  VENDOR_CATEGORIES,
  vendorDirectory,
  type Offer,
  type OfferInput,
  type OfferStatus,
  type PriceBasis,
  type Vendor,
  type VendorCategory,
  type VendorInput,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatDate } from "@/components/support";
import { Badge, Button, Card, DeleteButton, ErrorText, errorText, Field, Input, Loading, PageTitle, Select, SupportBanner, Textarea } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const VCATS = Object.entries(VENDOR_CATEGORIES) as [VendorCategory, string][];
type Tab = "vendors" | "offers" | "compare";

export default function VendorsPage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "vendors", page: "/vendors" });
  const [tab, setTab] = useState<Tab>("vendors");

  if (isLoading || !access) return <Loading />;
  const full = canView(access, "vendors");
  const manage = canManage(access, "vendors");

  return (
    <div className="flex flex-col gap-5">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={full ? t.association.vendors : "دليل الشركات المتعاقدة"} back={{ href: `/a/${id}`, label: "الجمعية" }} />
      {!full ? (
        access.role ? <Directory associationId={id} /> : <p className="text-muted">{t.common.noPermission}</p>
      ) : (
        <>
          <div role="tablist" className="flex gap-1 border-b border-border">
            {([["vendors", "الشركات"], ["offers", "العروض والعقود"], ["compare", "المقارنة"]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "vendors" && <VendorsTab associationId={id} manage={manage} />}
          {tab === "offers" && <OffersTab associationId={id} manage={manage} />}
          {tab === "compare" && <CompareTab associationId={id} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owners: directory
// ---------------------------------------------------------------------------
function Directory({ associationId }: { associationId: string }) {
  const dir = useQuery({ queryKey: recordKeys.directory(associationId), queryFn: () => vendorDirectory(supabase(), associationId) });
  if (dir.isLoading) return <Loading />;
  if (!dir.data?.length) return <p className="text-sm text-muted">لا توجد شركات مدرجة بعد</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dir.data.map((v) => (
        <Card key={v.id} className="flex flex-col gap-1">
          <p className="font-semibold">{v.name}</p>
          <p className="text-sm text-muted">{VENDOR_CATEGORIES[v.category as VendorCategory]}</p>
          {v.support_phone && <a href={`tel:${v.support_phone}`} dir="ltr" className="text-sm text-primary">☎ {v.support_phone}</a>}
          {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-sm text-primary underline">{v.website}</a>}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
function VendorsTab({ associationId, manage }: { associationId: string; manage: boolean }) {
  const vendors = useQuery({ queryKey: recordKeys.vendors(associationId), queryFn: () => listVendors(supabase(), associationId) });
  const offers = useQuery({ queryKey: recordKeys.offers(associationId), queryFn: () => listOffers(supabase(), associationId) });
  const [adding, setAdding] = useState(false);
  if (vendors.isLoading) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      {manage && !adding && <div><Button onClick={() => setAdding(true)}>+ إضافة شركة</Button></div>}
      {adding && <VendorForm associationId={associationId} onDone={() => setAdding(false)} />}
      {vendors.data?.length === 0 && <p className="text-sm text-muted">لا توجد شركات بعد</p>}
      {vendors.data?.map((v) => (
        <VendorCard key={v.id} vendor={v} manage={manage} active={(offers.data ?? []).find((o) => o.vendor_id === v.id && o.status === "active")} />
      ))}
    </div>
  );
}

function VendorForm({ associationId, vendor, onDone }: { associationId: string; vendor?: Vendor; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<VendorInput>({
    name: vendor?.name ?? "",
    category: (vendor?.category as VendorCategory) ?? "cleaning_maintenance",
    contact_name: vendor?.contact_name ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    website: vendor?.website ?? "",
    support_phone: vendor?.support_phone ?? "",
    notes: vendor?.notes ?? "",
    show_in_directory: vendor?.show_in_directory ?? true,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (vendor) await updateVendor(supabase(), vendor.id, f);
      else await createVendor(supabase(), associationId, f);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.vendors(associationId) });
      qc.invalidateQueries({ queryKey: recordKeys.directory(associationId) });
      onDone();
    },
  });
  const text = (key: keyof VendorInput, label: string, opts: { ltr?: boolean; digits?: boolean; type?: string } = {}) => (
    <Field label={label}>
      <Input dir={opts.ltr ? "ltr" : undefined} type={opts.type} value={(f[key] as string) ?? ""}
        onChange={(e) => setF({ ...f, [key]: opts.digits ? toLatinDigits(e.target.value) : e.target.value })} />
    </Field>
  );
  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-semibold sm:col-span-3">{vendor ? "تعديل الشركة" : "شركة جديدة"}</h2>
        <Field label="اسم الشركة *"><Input value={f.name} maxLength={150} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="المجال *">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as VendorCategory })}>
            {VCATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        {text("contact_name", "اسم المسؤول")}
        {text("phone", "جوال المسؤول", { ltr: true, digits: true, type: "tel" })}
        {text("email", "البريد الإلكتروني", { ltr: true, type: "email" })}
        {text("website", "الموقع الإلكتروني", { ltr: true })}
        {text("support_phone", "رقم الدعم / البلاغات", { ltr: true, digits: true, type: "tel" })}
        <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.show_in_directory} onChange={(e) => setF({ ...f, show_in_directory: e.target.checked })} />
          إظهارها للملاك في دليل الشركات (الاسم، المجال، الموقع، رقم الدعم)
        </label>
        <div className="sm:col-span-3">
          <Field label="ملاحظات"><Textarea value={f.notes ?? ""} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-16" /></Field>
        </div>
        <div className="flex items-center gap-2 sm:col-span-3">
          <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function VendorCard({ vendor: v, manage, active }: { vendor: Vendor; manage: boolean; active?: Offer }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteVendor(supabase(), v.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.vendors(v.association_id) });
      qc.invalidateQueries({ queryKey: recordKeys.offers(v.association_id) });
    },
  });
  if (editing) return <VendorForm associationId={v.association_id} vendor={v} onDone={() => setEditing(false)} />;
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{v.name}</span>
        <Badge>{VENDOR_CATEGORIES[v.category as VendorCategory]}</Badge>
        {active ? <Badge tone="primary">عقد ساري{active.end_date ? ` حتى ${active.end_date}` : ""}</Badge> : null}
        {!v.show_in_directory && <Badge>غير ظاهر للملاك</Badge>}
        <span className="me-auto" />
        {manage && (
          <>
            <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <DeleteButton message={`حذف ${v.name} وجميع عروضها وعقودها؟`} disabled={remove.isPending} onConfirm={() => remove.mutate()} />
          </>
        )}
      </div>
      <p className="text-sm text-muted">
        {[v.contact_name, v.phone && `☎ ${v.phone}`, v.support_phone && `الدعم: ${v.support_phone}`, v.email].filter(Boolean).join(" · ") || "—"}
      </p>
      {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" dir="ltr" className="break-all text-sm text-primary underline">{v.website}</a>}
      {v.notes && <p className="whitespace-pre-wrap text-sm">{v.notes}</p>}
      <ErrorText>{errorText(remove.error)}</ErrorText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Offers & contracts
// ---------------------------------------------------------------------------
function OffersTab({ associationId, manage }: { associationId: string; manage: boolean }) {
  const offers = useQuery({ queryKey: recordKeys.offers(associationId), queryFn: () => listOffers(supabase(), associationId) });
  const vendors = useQuery({ queryKey: recordKeys.vendors(associationId), queryFn: () => listVendors(supabase(), associationId) });
  const units = useQuery({ queryKey: recordKeys.unitCount(associationId), queryFn: () => countUnits(supabase(), associationId) });
  const [adding, setAdding] = useState(false);
  if (offers.isLoading || vendors.isLoading) return <Loading />;
  if (!vendors.data?.length) return <p className="text-sm text-muted">أضف شركة أولاً من تبويب «الشركات».</p>;
  return (
    <div className="flex flex-col gap-3">
      {manage && !adding && <div><Button onClick={() => setAdding(true)}>+ إضافة عرض سعر أو عقد</Button></div>}
      {adding && <OfferForm associationId={associationId} vendors={vendors.data} onDone={() => setAdding(false)} />}
      {offers.data?.length === 0 && <p className="text-sm text-muted">لا توجد عروض أو عقود بعد</p>}
      {offers.data?.map((o) => <OfferCard key={o.id} offer={o} vendors={vendors.data ?? []} units={units.data ?? 0} manage={manage} />)}
    </div>
  );
}

function OfferForm({ associationId, vendors, offer, preset, onDone }: {
  associationId: string; vendors: Vendor[]; offer?: Offer; preset?: Partial<OfferInput>; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<OfferInput>({
    vendor_id: offer?.vendor_id ?? preset?.vendor_id ?? vendors[0]?.id ?? "",
    title: offer?.title ?? preset?.title ?? "",
    status: (offer?.status as OfferStatus) ?? preset?.status ?? "offer",
    services: offer?.services ?? preset?.services ?? [],
    price_amount: offer ? Number(offer.price_amount) : preset?.price_amount ?? 0,
    price_basis: (offer?.price_basis as PriceBasis) ?? preset?.price_basis ?? "per_year",
    vat_included: offer?.vat_included ?? preset?.vat_included ?? true,
    start_date: offer?.start_date ?? preset?.start_date ?? "",
    end_date: offer?.end_date ?? preset?.end_date ?? "",
    notes: offer?.notes ?? preset?.notes ?? "",
  });
  const [custom, setCustom] = useState("");
  const category = (vendors.find((v) => v.id === f.vendor_id)?.category ?? "other") as VendorCategory;
  const catalog = SERVICE_CATALOG[category];
  const extra = f.services.filter((s) => !(s in catalog));
  const toggle = (s: string) => setF({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] });
  const save = useMutation({
    mutationFn: () => (offer ? updateOffer(supabase(), offer.id, f) : createOffer(supabase(), associationId, f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.offers(associationId) });
      onDone();
    },
  });

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="font-semibold sm:col-span-3">{offer ? "تعديل العرض / العقد" : preset ? "تجديد العقد" : "عرض سعر أو عقد جديد"}</h2>
        <Field label="الشركة *">
          <Select value={f.vendor_id} onChange={(e) => setF({ ...f, vendor_id: e.target.value })} required>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} — {VENDOR_CATEGORIES[v.category as VendorCategory]}</option>)}
          </Select>
        </Field>
        <Field label="العنوان *"><Input value={f.title} maxLength={200} placeholder="مثال: عرض النظافة 2027" onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="الحالة">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OfferStatus })}>
            {(Object.entries(OFFER_STATUSES) as [OfferStatus, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="السعر (ر.س) *">
          <Input dir="ltr" inputMode="decimal" value={String(f.price_amount)} required
            onChange={(e) => setF({ ...f, price_amount: Number(toLatinDigits(e.target.value).replace(/[^\d.]/g, "")) || 0 })} />
        </Field>
        <Field label="أساس التسعير *">
          <Select value={f.price_basis} onChange={(e) => setF({ ...f, price_basis: e.target.value as PriceBasis })}>
            {(Object.entries(PRICE_BASES) as [PriceBasis, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={f.vat_included} onChange={(e) => setF({ ...f, vat_included: e.target.checked })} />
          السعر شامل ضريبة القيمة المضافة
        </label>
        <Field label="تاريخ البداية"><Input type="date" value={f.start_date ?? ""} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="تاريخ النهاية"><Input type="date" value={f.end_date ?? ""} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <div />
        <fieldset className="flex flex-col gap-2 text-sm sm:col-span-3">
          <legend className="mb-1 font-medium">الخدمات المشمولة</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(catalog).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.services.includes(k)} onChange={() => toggle(k)} /> {label}
              </label>
            ))}
            {extra.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" checked onChange={() => toggle(s)} /> {s}
              </label>
            ))}
          </div>
          <div className="flex max-w-md gap-2">
            <Input value={custom} placeholder="خدمة أخرى…" maxLength={80} onChange={(e) => setCustom(e.target.value)} />
            <Button type="button" variant="secondary" onClick={() => { if (custom.trim()) { setF({ ...f, services: [...f.services, custom.trim()] }); setCustom(""); } }}>{t.common.add}</Button>
          </div>
        </fieldset>
        <div className="sm:col-span-3">
          <Field label="ملاحظات"><Textarea value={f.notes ?? ""} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-16" /></Field>
        </div>
        <div className="flex items-center gap-2 sm:col-span-3">
          <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function addYear(date: string | null | undefined, days = 0) {
  const d = date ? new Date(date) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function OfferCard({ offer: o, vendors, units, manage }: { offer: Offer; vendors: Vendor[]; units: number; manage: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "renew">("view");
  const refresh = () => qc.invalidateQueries({ queryKey: recordKeys.offers(o.association_id) });
  const remove = useMutation({ mutationFn: () => deleteOffer(supabase(), o.id), onSuccess: refresh });
  const endIt = useMutation({
    mutationFn: () => updateOffer(supabase(), o.id, { ...toInput(o), status: "ended" }),
    onSuccess: refresh,
  });
  const p = normalizePrice(Number(o.price_amount), o.price_basis as PriceBasis, units);

  if (mode === "edit") return <OfferForm associationId={o.association_id} vendors={vendors} offer={o} onDone={() => setMode("view")} />;
  if (mode === "renew") {
    // New active contract starting the day after this one ends; this one is marked as ended.
    const start = o.end_date ? addYear(o.end_date, 1) : addYear(null);
    const end = (() => { const d = new Date(start); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    return (
      <OfferForm associationId={o.association_id} vendors={vendors}
        preset={{ ...toInput(o), title: `${o.title} (تجديد)`, status: "active", start_date: start, end_date: end }}
        onDone={async () => { if (o.status === "active") await updateOffer(supabase(), o.id, { ...toInput(o), status: "ended" }); setMode("view"); refresh(); }} />
    );
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={o.status === "active" ? "primary" : o.status === "declined" ? "danger" : "neutral"}>{OFFER_STATUSES[o.status as OfferStatus]}</Badge>
        <span className="font-semibold">{o.vendors?.name}</span>
        <span className="me-auto text-sm text-muted">{o.title}</span>
        {manage && (
          <>
            {(o.status === "active" || o.status === "ended") && <Button variant="secondary" className="h-8" onClick={() => setMode("renew")}>تجديد</Button>}
            {o.status === "active" && <Button variant="ghost" className="h-8" disabled={endIt.isPending} onClick={() => confirm("إنهاء هذا العقد؟") && endIt.mutate()}>إنهاء العقد</Button>}
            <Button variant="ghost" className="h-8 px-2" onClick={() => setMode("edit")}>{t.common.edit}</Button>
            <DeleteButton disabled={remove.isPending} onConfirm={() => remove.mutate()} />
          </>
        )}
      </div>
      <p className="text-sm">
        <span className="font-semibold">{formatSAR(Number(o.price_amount))}</span> {PRICE_BASES[o.price_basis as PriceBasis]}
        {" · "}سنوياً: <span className="font-semibold">{formatSAR(p.perYear)}</span>
        {p.perUnitPerYear !== null && <> · للوحدة سنوياً: {formatSAR(p.perUnitPerYear)}</>}
        {" · "}{o.vat_included ? "شامل الضريبة" : "غير شامل الضريبة"}
      </p>
      {(o.start_date || o.end_date) && <p className="text-sm text-muted">من {o.start_date ? formatDate(o.start_date).split(" ")[0] : "—"} إلى {o.end_date ? formatDate(o.end_date).split(" ")[0] : "—"}</p>}
      {o.services.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.services.map((s) => <Badge key={s}>{serviceLabel(o.vendors?.category ?? "other", s)}</Badge>)}
        </div>
      )}
      {o.notes && <p className="whitespace-pre-wrap text-sm">{o.notes}</p>}
      <ErrorText>{errorText(remove.error) || errorText(endIt.error)}</ErrorText>
    </Card>
  );
}

function toInput(o: Offer): OfferInput {
  return {
    vendor_id: o.vendor_id,
    title: o.title,
    status: o.status as OfferStatus,
    services: o.services,
    price_amount: Number(o.price_amount),
    price_basis: o.price_basis as PriceBasis,
    vat_included: o.vat_included,
    start_date: o.start_date,
    end_date: o.end_date,
    notes: o.notes,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
function CompareTab({ associationId }: { associationId: string }) {
  const offers = useQuery({ queryKey: recordKeys.offers(associationId), queryFn: () => listOffers(supabase(), associationId) });
  const unitCount = useQuery({ queryKey: recordKeys.unitCount(associationId), queryFn: () => countUnits(supabase(), associationId) });
  const categories = [...new Set((offers.data ?? []).map((o) => o.vendors?.category).filter(Boolean))] as VendorCategory[];
  const [category, setCategory] = useState<VendorCategory | "">("");
  const [statuses, setStatuses] = useState<OfferStatus[]>(["offer", "active"]);
  const [unitsOverride, setUnitsOverride] = useState("");

  if (offers.isLoading || unitCount.isLoading) return <Loading />;
  if (!categories.length) return <p className="text-sm text-muted">أضف عروض أسعار أو عقوداً لتظهر المقارنة.</p>;
  const cat = category || categories[0];
  const units = unitsOverride ? Number(unitsOverride) : unitCount.data ?? 0;
  const { rows, services } = compareOffers(
    (offers.data ?? [])
      .filter((o) => o.vendors?.category === cat && statuses.includes(o.status as OfferStatus))
      .map((o) => ({
        id: o.id, vendorName: o.vendors?.name ?? "—", title: o.title, status: o.status, services: o.services,
        price_amount: Number(o.price_amount), price_basis: o.price_basis as PriceBasis, vat_included: o.vat_included,
      })),
    units,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 sm:grid-cols-3">
        <Field label="المجال">
          <Select value={cat} onChange={(e) => setCategory(e.target.value as VendorCategory)}>
            {categories.map((c) => <option key={c} value={c}>{VENDOR_CATEGORIES[c]}</option>)}
          </Select>
        </Field>
        <Field label={`عدد الوحدات للحساب (المسجّل: ${unitCount.data ?? 0})`}>
          <Input dir="ltr" inputMode="numeric" value={unitsOverride} placeholder={String(unitCount.data ?? 0)}
            onChange={(e) => setUnitsOverride(toLatinDigits(e.target.value).replace(/\D/g, ""))} />
        </Field>
        <fieldset className="flex flex-wrap items-end gap-3 pb-2 text-sm">
          {(["offer", "active", "ended"] as OfferStatus[]).map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" checked={statuses.includes(s)} onChange={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])} />
              {OFFER_STATUSES[s]}
            </label>
          ))}
        </fieldset>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">لا توجد عروض مطابقة</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-start font-medium text-muted">البند</th>
                {rows.map((r) => (
                  <th key={r.id} className={`p-3 text-start ${r.cheapest ? "bg-primary/10" : ""}`}>
                    <div className="font-semibold">{r.vendorName}</div>
                    <div className="text-xs font-normal text-muted">{r.title} · {OFFER_STATUSES[r.status as OfferStatus]}</div>
                    {r.cheapest && <Badge tone="primary">الأقل سعراً</Badge>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <PriceRow label="السعر كما في العرض" rows={rows} render={(r) => `${formatSAR(r.price_amount)} ${PRICE_BASES[r.price_basis]}`} />
              <PriceRow label="الإجمالي السنوي" rows={rows} strong render={(r) => formatSAR(r.perYear)} />
              <PriceRow label="للوحدة سنوياً" rows={rows} render={(r) => (r.perUnitPerYear === null ? "أدخل عدد الوحدات" : formatSAR(r.perUnitPerYear))} />
              <PriceRow label="الفرق عن الأقل" rows={rows} render={(r) => (r.cheapest ? "—" : `+${Math.round(r.vsCheapest * 100)}%`)} />
              <PriceRow label="الضريبة" rows={rows} render={(r) => (r.vat_included ? "شامل" : "غير شامل")} />
              <PriceRow label="الخدمات المشمولة" rows={rows} strong render={(r) => `${r.services.length} من ${services.length}`} />
              {services.map((s) => (
                <tr key={s} className="border-t border-border">
                  <td className="p-3 text-muted">{serviceLabel(cat, s)}</td>
                  {rows.map((r) => (
                    <td key={r.id} className={`p-3 text-center text-base ${r.cheapest ? "bg-primary/10" : ""}`}>
                      {r.services.includes(s) ? <span className="text-primary" aria-label="مشمولة">✓</span> : <span className="text-danger" aria-label="غير مشمولة">✗</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {rows.some((r) => !r.vat_included) && rows.some((r) => r.vat_included) && (
        <p className="text-xs text-muted">تنبيه: بعض العروض غير شاملة للضريبة، فالمقارنة السعرية بينها تقريبية.</p>
      )}
    </div>
  );
}

function PriceRow<R extends { id: string; cheapest: boolean }>({ label, rows, render, strong }: { label: string; rows: R[]; render: (r: R) => string; strong?: boolean }) {
  return (
    <tr className="border-t border-border">
      <td className="p-3 text-muted">{label}</td>
      {rows.map((r) => (
        <td key={r.id} className={`p-3 ${strong ? "font-semibold" : ""} ${r.cheapest ? "bg-primary/10" : ""}`}>{render(r)}</td>
      ))}
    </tr>
  );
}
