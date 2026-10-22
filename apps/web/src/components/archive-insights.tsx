"use client";

// AI analysis dashboard at the top of the archive: topic tabs with the historical overview for
// everyone, plus details, forecast and recommendations for the board (premium) or a superadmin
// under grant. The database decides what each person may read; this only lays it out.
import {
  ANALYSIS_INTERVALS,
  ANALYSIS_TAB_LABELS,
  ANALYSIS_TABS,
  canRefreshAnalysis,
  canViewBoardAnalysis,
  canViewForecast,
  getAnalysisDashboard,
  isPresident,
  isSupportSession,
  LEVEL_LABELS,
  logSupportView,
  recordKeys,
  requestAnalysis,
  setAnalysisInterval,
  type Access,
  type AnalysisInterval,
  type AnalysisTab,
  type ForecastTab,
  type HistoryTab,
  type Level,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { formatDate } from "@/components/support";
import { Badge, Button, Card, ErrorText, errorText, Select } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

type Titles = Map<string, string>;

const LEVEL_TONE: Record<Level, "neutral" | "primary" | "danger"> = { low: "neutral", medium: "primary", high: "danger" };
const formatNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function ArchiveInsights({ associationId, access, titles }: { associationId: string; access: Access; titles: Titles }) {
  const qc = useQueryClient();
  const board = canViewBoardAnalysis(access);
  const key = [...recordKeys.analysis(associationId), board];
  const dash = useQuery({
    queryKey: key,
    queryFn: () => getAnalysisDashboard(supabase(), associationId, { board, forecast: board }),
    refetchInterval: (q) => (q.state.data?.run && ["queued", "running"].includes(q.state.data.run.status) ? 5000 : false),
  });
  const refresh = useMutation({
    mutationFn: () => requestAnalysis(supabase(), associationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const interval = useMutation({
    mutationFn: (days: AnalysisInterval) => setAnalysisInterval(supabase(), associationId, days),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const [expanded, setExpanded] = useState(false);
  const support = isSupportSession(access) && board;

  useEffect(() => {
    if (support) void logSupportView(supabase(), associationId, "analysis", "/archive#analysis");
  }, [support, associationId]);

  if (dash.isLoading) return null;
  if (dash.error) return <ErrorText>{errorText(dash.error)}</ErrorText>;
  const d = dash.data!;
  const running = d.run?.status === "queued" || d.run?.status === "running";
  const forecastAllowed = canViewForecast(access, d.plan);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-lg font-semibold">التحليل الذكي للأرشيف</h2>
        {running && <Badge tone="primary">جارٍ التحليل…</Badge>}
        {!running && d.run?.status === "failed" && <Badge tone="danger">تعذّر آخر تحليل</Badge>}
        {d.changedSince > 0 && <Badge>{d.changedSince} مستند جديد أو معدّل منذ آخر تحليل</Badge>}
        {canRefreshAnalysis(access) && (
          <Button className="h-8" disabled={running || refresh.isPending} onClick={() => refresh.mutate()}>تحديث التحليل</Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{d.history ? `آخر تحديث: ${formatDate(d.history.created_at)}` : "لم يُحلَّل الأرشيف بعد"}</span>
        {isPresident(access) ? (
          <label className="flex items-center gap-2">
            تحديث تلقائي كل
            <Select className="h-8 w-28" value={d.intervalDays} disabled={interval.isPending}
              onChange={(e) => interval.mutate(Number(e.target.value) as AnalysisInterval)}>
              {ANALYSIS_INTERVALS.map((n) => <option key={n} value={n}>{n} يوماً</option>)}
            </Select>
          </label>
        ) : (
          <span>يُحدَّث تلقائياً كل {d.intervalDays} يوماً عند إضافة مستندات أو تعديلها</span>
        )}
      </div>
      {running && d.run?.pending_document_count ? (
        <p className="text-xs text-muted">{d.run.pending_document_count} مستند لم تُقرأ ملفاته بعد، فاعتمد التحليل على بياناتها فقط.</p>
      ) : null}
      <ErrorText>{errorText(refresh.error) || errorText(interval.error)}</ErrorText>

      {!d.history ? (
        <p className="text-sm text-muted">
          {running ? "يُعدّ التحليل الآن، وقد يستغرق بضع دقائق." : canRefreshAnalysis(access) ? "اضغط «تحديث التحليل» لإعداد أول تحليل للأرشيف." : "سيظهر التحليل هنا بعد إعداده."}
        </p>
      ) : (
        <>
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
            {ANALYSIS_TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm ${tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted hover:text-foreground"}`}>
                {ANALYSIS_TAB_LABELS[k]}
              </button>
            ))}
          </div>
          <History tab={d.history.result[tab]} titles={titles} />

          {board && (
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <button className="flex items-center gap-2 text-start font-semibold text-primary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                <span aria-hidden="true">{expanded ? "▾" : "◂"}</span> تفاصيل وتوقعات السنوات القادمة
              </button>
              {expanded && (!forecastAllowed ? (
                <p className="rounded-lg bg-background p-3 text-sm text-muted">
                  التحليل المفصّل وتوقعات السنوات الثلاث القادمة والإجراءات الموصى بها متاحة في الباقة المميزة. تواصل مع إدارة المنصة للترقية.
                </p>
              ) : !d.forecast ? (
                <p className="text-sm text-muted">{running ? "تُعدّ التوقعات الآن." : "ستظهر التوقعات بعد التحديث القادم للتحليل."}</p>
              ) : (
                <>
                  <Forecast tab={d.forecast.result[tab]} titles={titles} />
                  {d.forecast.result.assumptions.length > 0 && (
                    <Section title="الافتراضات">
                      <ul className="list-disc ps-5 text-sm">{d.forecast.result.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </Section>
                  )}
                  <p className="text-xs text-muted">
                    توقعات تقديرية أعدّها الذكاء الاصطناعي من مستندات الأرشيف بتاريخ {formatDate(d.forecast.created_at)}، وليست ضماناً. راجعها قبل اتخاذ أي قرار.
                  </p>
                </>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Links to the cited documents the reader can see (owners never get ids of board-only documents). */
function Sources({ ids, titles }: { ids: string[]; titles: Titles }) {
  const seen = ids.filter((id) => titles.has(id));
  if (seen.length === 0) return null;
  return (
    <span className="text-xs text-muted">
      {" "}— المصدر:{" "}
      {seen.map((id, i) => (
        <span key={id}>
          {i > 0 && "، "}
          <a href={`#doc-${id}`} className="underline hover:text-primary">{titles.get(id)}</a>
        </span>
      ))}
    </span>
  );
}

function Paragraphs({ text }: { text: string }) {
  return <div className="flex flex-col gap-2 text-sm leading-7">{text.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function History({ tab, titles }: { tab: HistoryTab; titles: Titles }) {
  const timeline = [...tab.timeline].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="flex flex-col gap-4">
      <Paragraphs text={tab.summary} />
      {tab.metrics.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {tab.metrics.map((m, i) => (
            <div key={i} className="rounded-lg bg-background p-3">
              <p className="text-xs text-muted">{m.label}{m.year ? ` (${m.year})` : ""}</p>
              <p className="text-lg font-semibold">{formatNumber(m.value)} <span className="text-sm font-normal">{m.unit}</span></p>
            </div>
          ))}
        </div>
      )}
      {tab.highlights.length > 0 && (
        <Section title="أبرز النقاط">
          <ul className="list-disc ps-5 text-sm leading-7">
            {tab.highlights.map((h, i) => <li key={i}>{h.text}<Sources ids={h.sources} titles={titles} /></li>)}
          </ul>
        </Section>
      )}
      {timeline.length > 0 && (
        <Section title="الخط الزمني">
          <ol className="flex flex-col gap-1 border-s border-border ps-4 text-sm">
            {timeline.map((e, i) => (
              <li key={i}><span className="font-medium" dir="ltr">{e.date}</span> · {e.event}<Sources ids={e.sources} titles={titles} /></li>
            ))}
          </ol>
        </Section>
      )}
      {tab.risks.length > 0 && (
        <Section title="المخاطر الملاحظة">
          <ul className="flex flex-col gap-1 text-sm">
            {tab.risks.map((r, i) => (
              <li key={i}><Badge tone={LEVEL_TONE[r.severity]}>{LEVEL_LABELS[r.severity]}</Badge> {r.text}<Sources ids={r.sources} titles={titles} /></li>
            ))}
          </ul>
        </Section>
      )}
      {tab.data_gaps.length > 0 && (
        <Section title="ما ينقص الأرشيف">
          <ul className="list-disc ps-5 text-sm text-muted">{tab.data_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}

function Forecast({ tab, titles }: { tab: ForecastTab; titles: Titles }) {
  return (
    <div className="flex flex-col gap-4">
      <Paragraphs text={tab.details} />
      {tab.outlook.length > 0 && (
        <Section title="التوقعات">
          <ul className="flex flex-col gap-1 text-sm">
            {[...tab.outlook].sort((a, b) => a.year - b.year).map((o, i) => (
              <li key={i}>
                <span className="font-medium">{o.year}</span> · {o.expectation}{" "}
                <Badge tone={LEVEL_TONE[o.likelihood]}>الاحتمال: {LEVEL_LABELS[o.likelihood]}</Badge>
                <Sources ids={o.sources} titles={titles} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {tab.projections.map((p, i) => {
        const max = Math.max(...p.points.map((x) => Math.abs(x.value)), 1);
        return (
          <Section key={i} title={`${p.label} (${p.unit})`}>
            {[...p.points].sort((a, b) => a.year - b.year).map((x) => (
              <div key={x.year} className="grid items-center gap-2 text-sm grid-cols-[3.5rem_1fr_7rem]">
                <span>{x.year}</span>
                <div className={`h-2 rounded ${x.estimated ? "bg-primary/40" : "bg-primary"}`} style={{ width: `${(Math.abs(x.value) / max) * 100}%` }} aria-hidden="true" />
                <span className="text-muted">{formatNumber(x.value)}{x.estimated ? " (تقديري)" : ""}</span>
              </div>
            ))}
          </Section>
        );
      })}
      {tab.projections.length > 0 && <p className="text-xs text-muted">الشريط الداكن: من السجلات · الفاتح: تقديري.</p>}
      {tab.recommendations.length > 0 && (
        <Section title="الإجراءات الموصى بها">
          <ul className="flex flex-col gap-2 text-sm">
            {tab.recommendations.map((r, i) => (
              <li key={i} className="rounded-lg bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={LEVEL_TONE[r.priority]}>الأولوية: {LEVEL_LABELS[r.priority]}</Badge>
                  <span className="font-medium">{r.action}</span>
                  <span className="text-xs text-muted">· {r.timeframe}</span>
                </div>
                <p className="mt-1 text-muted">{r.rationale}<Sources ids={r.sources} titles={titles} /></p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
