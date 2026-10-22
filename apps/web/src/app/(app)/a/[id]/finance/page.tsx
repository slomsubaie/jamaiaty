"use client";

import {
  BUDGET_CATEGORY_LABELS,
  BUDGET_STATUSES,
  budgetReport,
  canManage,
  canView,
  createBudget,
  createBudgetLine,
  deleteBudget,
  deleteBudgetLine,
  EXPENSE_CATEGORIES,
  financeSummary,
  formatSAR,
  INCOME_CATEGORIES,
  isSupportSession,
  listBudgetLines,
  listBudgets,
  listVendors,
  recordKeys,
  supportExpiresAt,
  t,
  toCSV,
  toLatinDigits,
  updateBudget,
  updateBudgetLine,
  type Budget,
  type BudgetCategory,
  type BudgetLine,
  type BudgetLineInput,
  type BudgetStatus,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, DeleteButton, ErrorText, errorText, Field, Input, Loading, PageTitle, Select, SupportBanner } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const money = (v: string) => Number(toLatinDigits(v).replace(/[^\d.]/g, "")) || 0;

export default function FinancePage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "finance", page: "/finance" });
  if (isLoading || !access) return <Loading />;
  const full = canView(access, "finance");

  return (
    <div className="flex flex-col gap-5">
      <SupportBanner show={isSupportSession(access)} expiresAt={supportExpiresAt(access)} />
      <PageTitle title={t.association.finance} back={{ href: `/a/${id}`, label: "الجمعية" }}>
        {full && <Button variant="ghost" className="print:hidden" onClick={() => window.print()}>طباعة</Button>}
      </PageTitle>
      {full ? (
        <Budgets associationId={id} manage={canManage(access, "finance")} />
      ) : access.role ? (
        <OwnerSummary associationId={id} />
      ) : (
        <p className="text-muted">{t.common.noPermission}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owners: yearly totals of approved budgets
// ---------------------------------------------------------------------------
function OwnerSummary({ associationId }: { associationId: string }) {
  const sum = useQuery({ queryKey: recordKeys.financeSummary(associationId), queryFn: () => financeSummary(supabase(), associationId) });
  if (sum.isLoading) return <Loading />;
  if (!sum.data?.length) return <p className="text-sm text-muted">لا توجد ميزانية معتمدة منشورة بعد.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">ملخص ميزانية الجمعية المعتمدة. التفاصيل متاحة لمجلس الإدارة.</p>
      {sum.data.map((y) => (
        <Card key={y.budget_id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">ميزانية {y.fiscal_year}</h2>
            <Badge tone="primary">{BUDGET_STATUSES[y.status as BudgetStatus]}</Badge>
          </div>
          <Totals plannedIncome={+y.planned_income} actualIncome={+y.actual_income} plannedExpense={+y.planned_expense} actualExpense={+y.actual_expense} />
        </Card>
      ))}
    </div>
  );
}

function Totals({ plannedIncome, actualIncome, plannedExpense, actualExpense }: { plannedIncome: number; actualIncome: number; plannedExpense: number; actualExpense: number }) {
  const box = (label: string, planned: number, actual: number, tone?: "danger" | "primary") => (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-lg font-bold ${tone === "danger" ? "text-danger" : tone === "primary" ? "text-primary" : ""}`}>{formatSAR(actual)}</p>
      <p className="text-xs text-muted">المخطط: {formatSAR(planned)}</p>
    </div>
  );
  const balance = actualIncome - actualExpense;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {box("الإيرادات الفعلية", plannedIncome, actualIncome)}
      {box("المصروفات الفعلية", plannedExpense, actualExpense)}
      {box("الرصيد (فائض / عجز)", plannedIncome - plannedExpense, balance, balance < 0 ? "danger" : "primary")}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board: budgets, lines, report
// ---------------------------------------------------------------------------
function Budgets({ associationId, manage }: { associationId: string; manage: boolean }) {
  const qc = useQueryClient();
  const budgets = useQuery({ queryKey: recordKeys.budgets(associationId), queryFn: () => listBudgets(supabase(), associationId) });
  const [selected, setSelected] = useState<string | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const create = useMutation({
    mutationFn: () => createBudget(supabase(), associationId, Number(year)),
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: recordKeys.budgets(associationId) });
      setSelected(newId);
    },
  });
  if (budgets.isLoading) return <Loading />;
  const current = budgets.data?.find((b) => b.id === selected) ?? budgets.data?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {budgets.data && budgets.data.length > 0 && (
          <Field label="السنة المالية">
            <Select value={current?.id ?? ""} onChange={(e) => setSelected(e.target.value)} className="w-48">
              {budgets.data.map((b) => <option key={b.id} value={b.id}>{b.fiscal_year} — {BUDGET_STATUSES[b.status as BudgetStatus]}</option>)}
            </Select>
          </Field>
        )}
        {manage && (
          <form className="flex items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
            <Field label="ميزانية جديدة لسنة">
              <Input dir="ltr" inputMode="numeric" value={year} className="w-28" onChange={(e) => setYear(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 4))} />
            </Field>
            <Button type="submit" disabled={create.isPending || year.length !== 4}>{t.common.add}</Button>
          </form>
        )}
        <ErrorText>{create.error ? (/duplicate|unique/i.test(create.error.message) ? "توجد ميزانية لهذه السنة" : errorText(create.error)) : ""}</ErrorText>
      </div>
      {!current ? (
        <p className="text-sm text-muted">لا توجد ميزانيات بعد{manage ? "، أضف ميزانية للسنة المالية." : "."}</p>
      ) : (
        <BudgetView key={current.id} budget={current} manage={manage} />
      )}
    </div>
  );
}

function BudgetView({ budget: b, manage }: { budget: Budget; manage: boolean }) {
  const qc = useQueryClient();
  const lines = useQuery({ queryKey: recordKeys.budgetLines(b.id), queryFn: () => listBudgetLines(supabase(), b.id) });
  const refreshBudgets = () => qc.invalidateQueries({ queryKey: recordKeys.budgets(b.association_id) });
  const setStatus = useMutation({ mutationFn: (status: BudgetStatus) => updateBudget(supabase(), b.id, { status }), onSuccess: refreshBudgets });
  const remove = useMutation({ mutationFn: () => deleteBudget(supabase(), b.id), onSuccess: refreshBudgets });
  const [adding, setAdding] = useState<"income" | "expense" | null>(null);
  if (lines.isLoading) return <Loading />;
  const report = budgetReport(lines.data ?? []);

  function exportCSV() {
    const rows: (string | number)[][] = [["النوع", "البند", "الوصف", "الشركة", "المخطط (ر.س)", "الفعلي (ر.س)", "الفرق"]];
    for (const l of lines.data ?? []) {
      rows.push([l.kind === "income" ? "إيراد" : "مصروف", BUDGET_CATEGORY_LABELS[l.category as BudgetCategory], l.description ?? "", l.vendors?.name ?? "",
        Number(l.planned_amount), Number(l.actual_amount), Number(l.actual_amount) - Number(l.planned_amount)]);
    }
    rows.push([], ["إجمالي الإيرادات", "", "", "", report.plannedIncome, report.actualIncome, report.actualIncome - report.plannedIncome]);
    rows.push(["إجمالي المصروفات", "", "", "", report.plannedExpense, report.actualExpense, report.actualExpense - report.plannedExpense]);
    rows.push(["الرصيد", "", "", "", report.plannedBalance, report.actualBalance, report.actualBalance - report.plannedBalance]);
    const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `ميزانية-${b.fiscal_year}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">ميزانية {b.fiscal_year}</h2>
        {manage ? (
          <Select value={b.status} className="h-8 w-auto py-0 text-sm print:hidden" disabled={setStatus.isPending}
            onChange={(e) => setStatus.mutate(e.target.value as BudgetStatus)} aria-label="حالة الميزانية">
            {(Object.entries(BUDGET_STATUSES) as [BudgetStatus, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        ) : (
          <Badge>{BUDGET_STATUSES[b.status as BudgetStatus]}</Badge>
        )}
        <span className="me-auto text-xs text-muted">{b.status === "draft" ? "المسودة لا تظهر للملاك. اعتمدها ليظهر ملخصها لهم." : "يظهر ملخص هذه الميزانية للملاك."}</span>
        <Button variant="secondary" className="h-8 print:hidden" onClick={exportCSV}>تصدير Excel</Button>
        {manage && <DeleteButton message={`حذف ميزانية ${b.fiscal_year} وجميع بنودها؟`} disabled={remove.isPending} onConfirm={() => remove.mutate()} />}
        <ErrorText>{errorText(setStatus.error) || errorText(remove.error)}</ErrorText>
      </Card>

      <Totals plannedIncome={report.plannedIncome} actualIncome={report.actualIncome} plannedExpense={report.plannedExpense} actualExpense={report.actualExpense} />

      {(["income", "expense"] as const).map((kind) => {
        const kindLines = (lines.data ?? []).filter((l) => l.kind === kind);
        return (
          <Card key={kind} className="flex flex-col gap-3 p-0">
            <div className="flex items-center justify-between px-5 pt-4">
              <h3 className="font-semibold">{kind === "income" ? "الإيرادات" : "المصروفات"}</h3>
              {manage && adding !== kind && <Button variant="secondary" className="h-8 print:hidden" onClick={() => setAdding(kind)}>+ بند</Button>}
            </div>
            {adding === kind && <div className="px-5"><LineForm budget={b} kind={kind} onDone={() => setAdding(null)} /></div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-y border-border text-muted">
                  <tr>
                    <th className="p-3 text-start font-medium">البند</th>
                    <th className="p-3 text-start font-medium">الوصف</th>
                    <th className="p-3 text-start font-medium">المخطط</th>
                    <th className="p-3 text-start font-medium">الفعلي</th>
                    <th className="p-3 text-start font-medium">الفرق</th>
                    {manage && <th className="p-3 print:hidden" />}
                  </tr>
                </thead>
                <tbody>
                  {kindLines.length === 0 && <tr><td colSpan={6} className="p-3 text-muted">لا توجد بنود</td></tr>}
                  {kindLines.map((l) => <LineRow key={l.id} line={l} budget={b} manage={manage} />)}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-3">
        <h3 className="font-semibold">التقرير: المخطط مقابل الفعلي حسب البند</h3>
        {report.categories.length === 0 && <p className="text-sm text-muted">أضف بنوداً لعرض التقرير</p>}
        {report.categories.map((c) => {
          const max = Math.max(c.planned, c.actual, 1);
          const over = c.kind === "expense" ? c.actual > c.planned : c.actual < c.planned;
          return (
            <div key={c.category} className="grid items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_9rem]">
              <span>{BUDGET_CATEGORY_LABELS[c.category as BudgetCategory]}</span>
              <div className="flex flex-col gap-1" aria-hidden="true">
                <div className="h-2 rounded bg-border" style={{ width: `${(c.planned / max) * 100}%` }} />
                <div className={`h-2 rounded ${over ? "bg-danger" : "bg-primary"}`} style={{ width: `${(c.actual / max) * 100}%` }} />
              </div>
              <span className={over ? "text-danger" : "text-muted"}>
                {formatSAR(c.actual)} / {formatSAR(c.planned)}
                {c.variancePct !== null && ` (${c.variance >= 0 ? "+" : ""}${Math.round(c.variancePct * 100)}%)`}
              </span>
            </div>
          );
        })}
        {report.categories.length > 0 && <p className="text-xs text-muted">الشريط الرمادي: المخطط · الملوّن: الفعلي (الأحمر: تجاوز في المصروف أو نقص في الإيراد).</p>}
      </Card>
    </div>
  );
}

function LineForm({ budget, kind, line, onDone }: { budget: Budget; kind: "income" | "expense"; line?: BudgetLine; onDone: () => void }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: recordKeys.vendors(budget.association_id), queryFn: () => listVendors(supabase(), budget.association_id), enabled: kind === "expense" });
  const cats = (kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES) as Record<string, string>;
  const [f, setF] = useState({
    category: (line?.category ?? Object.keys(cats)[0]) as BudgetCategory,
    description: line?.description ?? "",
    planned: line ? String(line.planned_amount) : "",
    actual: line ? String(line.actual_amount) : "",
    vendor_id: line?.vendor_id ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const input: BudgetLineInput = { kind, category: f.category, description: f.description, planned_amount: money(f.planned), actual_amount: money(f.actual), vendor_id: f.vendor_id || null };
      return line ? updateBudgetLine(supabase(), line.id, input) : createBudgetLine(supabase(), budget.association_id, budget.id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recordKeys.budgetLines(budget.id) });
      onDone();
    },
  });
  return (
    <form className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-5" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
      <Field label="البند">
        <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as BudgetCategory })}>
          {Object.entries(cats).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="الوصف"><Input value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="المخطط (ر.س)"><Input dir="ltr" inputMode="decimal" value={f.planned} onChange={(e) => setF({ ...f, planned: toLatinDigits(e.target.value) })} /></Field>
      <Field label="الفعلي (ر.س)"><Input dir="ltr" inputMode="decimal" value={f.actual} onChange={(e) => setF({ ...f, actual: toLatinDigits(e.target.value) })} /></Field>
      {kind === "expense" ? (
        <Field label="الشركة (اختياري)">
          <Select value={f.vendor_id} onChange={(e) => setF({ ...f, vendor_id: e.target.value })}>
            <option value="">—</option>
            {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
      ) : <div />}
      <div className="flex items-center gap-2 sm:col-span-5">
        <Button type="submit" className="h-8" disabled={save.isPending}>{t.common.save}</Button>
        <Button type="button" variant="ghost" className="h-8" onClick={onDone}>{t.common.cancel}</Button>
        <ErrorText>{errorText(save.error)}</ErrorText>
      </div>
    </form>
  );
}

function LineRow({ line: l, budget, manage }: { line: BudgetLine; budget: Budget; manage: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({ mutationFn: () => deleteBudgetLine(supabase(), l.id), onSuccess: () => qc.invalidateQueries({ queryKey: recordKeys.budgetLines(budget.id) }) });
  const variance = Number(l.actual_amount) - Number(l.planned_amount);
  const bad = l.kind === "expense" ? variance > 0 : variance < 0;
  if (editing) {
    return (
      <tr><td colSpan={6} className="p-3"><LineForm budget={budget} kind={l.kind as "income" | "expense"} line={l} onDone={() => setEditing(false)} /></td></tr>
    );
  }
  return (
    <tr className="border-t border-border">
      <td className="p-3">{BUDGET_CATEGORY_LABELS[l.category as BudgetCategory]}</td>
      <td className="p-3 text-muted">{[l.description, l.vendors?.name].filter(Boolean).join(" · ") || "—"}</td>
      <td className="p-3">{formatSAR(Number(l.planned_amount))}</td>
      <td className="p-3 font-medium">{formatSAR(Number(l.actual_amount))}</td>
      <td className={`p-3 ${bad && variance !== 0 ? "text-danger" : "text-muted"}`}>{variance === 0 ? "—" : `${variance > 0 ? "+" : ""}${formatSAR(variance)}`}</td>
      {manage && (
        <td className="p-3 print:hidden">
          <div className="flex gap-1">
            <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <DeleteButton disabled={remove.isPending} onConfirm={() => remove.mutate()} />
          </div>
        </td>
      )}
    </tr>
  );
}
