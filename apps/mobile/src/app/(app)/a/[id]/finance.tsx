import { BUDGET_STATUSES, financeSummary, formatSAR, recordKeys, type BudgetStatus } from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Card, Loading, Screen, Text, useColors } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

// Yearly budget totals (owners: approved budgets only). Budget lines and reports are on the website.
export default function Finance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { isLoading } = useAccess(id, { section: "finance", page: "/finance" });
  const sum = useQuery({ queryKey: recordKeys.financeSummary(id), queryFn: () => financeSummary(supabase, id) });
  if (isLoading || sum.isLoading) return <Loading />;
  return (
    <Screen>
      {!sum.data?.length && <Text muted>لا توجد ميزانية منشورة بعد</Text>}
      {sum.data?.map((y) => {
        const balance = Number(y.actual_income) - Number(y.actual_expense);
        const line = (label: string, actual: number, planned: number, color?: string) => (
          <View style={{ gap: 2 }}>
            <Text muted size={13}>{label}</Text>
            <Text bold size={18} style={color ? { color } : undefined}>{formatSAR(actual)}</Text>
            <Text muted size={12}>المخطط: {formatSAR(planned)}</Text>
          </View>
        );
        return (
          <Card key={y.budget_id} style={{ gap: 12 }}>
            <Text bold size={17}>ميزانية {y.fiscal_year} · {BUDGET_STATUSES[y.status as BudgetStatus]}</Text>
            {line("الإيرادات الفعلية", Number(y.actual_income), Number(y.planned_income))}
            {line("المصروفات الفعلية", Number(y.actual_expense), Number(y.planned_expense))}
            {line("الرصيد", balance, Number(y.planned_income) - Number(y.planned_expense), balance < 0 ? c.danger : c.primary)}
          </Card>
        );
      })}
    </Screen>
  );
}
