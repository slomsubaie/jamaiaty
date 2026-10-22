// View-only AI analysis of the archive (refreshing and settings are on the website).
import {
  ANALYSIS_TAB_LABELS,
  ANALYSIS_TABS,
  canViewBoardAnalysis,
  canViewForecast,
  getAnalysisDashboard,
  LEVEL_LABELS,
  recordKeys,
  type Access,
  type AnalysisTab,
} from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, Chip, LinkButton, Row, Text } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export function ArchiveInsights({ associationId, access }: { associationId: string; access: Access }) {
  const board = canViewBoardAnalysis(access);
  const dash = useQuery({
    queryKey: [...recordKeys.analysis(associationId), board, "mobile"],
    queryFn: () => getAnalysisDashboard(supabase, associationId, { board, forecast: board }),
  });
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const [expanded, setExpanded] = useState(false);
  const d = dash.data;
  if (!d?.history) return null;
  const h = d.history.result[tab];
  const f = d.forecast?.result[tab];

  return (
    <Card>
      <Text bold size={17}>التحليل الذكي للأرشيف</Text>
      <Text muted size={12}>آخر تحديث: {new Date(d.history.created_at).toLocaleDateString("ar-SA")}</Text>
      <Row>
        {ANALYSIS_TABS.map((k) => <Chip key={k} label={ANALYSIS_TAB_LABELS[k]} selected={tab === k} onPress={() => setTab(k)} />)}
      </Row>
      <Text size={14}>{h.summary}</Text>
      {h.highlights.length > 0 && <Text bold size={14}>أبرز النقاط</Text>}
      {h.highlights.map((x, i) => <Text key={i} size={14}>• {x.text}</Text>)}
      {h.risks.length > 0 && <Text bold size={14}>المخاطر الملاحظة</Text>}
      {h.risks.map((r, i) => <Text key={i} size={14}>• ({LEVEL_LABELS[r.severity]}) {r.text}</Text>)}

      {board && (
        <>
          <LinkButton title={expanded ? "إخفاء التفاصيل والتوقعات" : "تفاصيل وتوقعات السنوات القادمة"} onPress={() => setExpanded(!expanded)} />
          {expanded && !canViewForecast(access, d.plan) && (
            <Text muted size={13}>التوقعات والإجراءات الموصى بها متاحة في الباقة المميزة.</Text>
          )}
          {expanded && canViewForecast(access, d.plan) && !f && <Text muted size={13}>ستظهر التوقعات بعد التحديث القادم للتحليل.</Text>}
          {expanded && f && (
            <>
              <Text size={14}>{f.details}</Text>
              {f.outlook.length > 0 && <Text bold size={14}>التوقعات</Text>}
              {[...f.outlook].sort((a, b) => a.year - b.year).map((o, i) => (
                <Text key={i} size={14}>• {o.year}: {o.expectation} (الاحتمال: {LEVEL_LABELS[o.likelihood]})</Text>
              ))}
              {f.recommendations.length > 0 && <Text bold size={14}>الإجراءات الموصى بها</Text>}
              {f.recommendations.map((r, i) => (
                <Text key={i} size={14}>• [{LEVEL_LABELS[r.priority]}] {r.action} — {r.timeframe}</Text>
              ))}
              <Text muted size={12}>توقعات تقديرية أعدّها الذكاء الاصطناعي من مستندات الأرشيف، وليست ضماناً.</Text>
            </>
          )}
        </>
      )}
    </Card>
  );
}
