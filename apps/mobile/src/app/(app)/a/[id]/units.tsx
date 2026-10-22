import { listUnits, queryKeys, t } from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Card, Loading, Screen, Text } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// Owners see only their own units (enforced by RLS); the board sees all.
// Adding buildings/units is done on the website.
export default function Units() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: queryKeys.units(id), queryFn: () => listUnits(supabase, id) });

  if (isLoading) return <Loading />;

  return (
    <Screen>
      {data?.length === 0 && <Text muted>لا توجد وحدات</Text>}
      {data?.map((u) => (
        <Card key={u.id}>
          <Text bold>{[u.buildings?.name, `${t.units.unitNumber} ${u.unit_number}`].filter(Boolean).join(" · ")}</Text>
          {(u.floor || u.area_m2) && (
            <Text muted>
              {[u.floor && `${t.units.floor} ${u.floor}`, u.area_m2 && `${u.area_m2} م²`].filter(Boolean).join(" · ")}
            </Text>
          )}
          {u.unit_ownerships.length > 0 && (
            <Text muted>{u.unit_ownerships.map((o) => `${o.profiles?.full_name} (${o.share_pct}%)`).join("، ")}</Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}
