import { sameActing } from "@jamaiah/shared";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SessionTimer } from "@/components/session-timer";
import { Loading } from "@/components/ui";
import { useActing, useMyRoles } from "@/lib/hooks";
import { actingStore } from "@/lib/supabase";

export default function AppLayout() {
  const { options } = useMyRoles();
  const acting = useActing();
  const valid = Boolean(options && (options.length === 0 ? !acting : acting && options.some((o) => sameActing(o.acting, acting))));

  // Make sure a role the person really holds is selected before screens load data.
  useEffect(() => {
    if (options && !valid) actingStore.set(options[0]?.acting ?? null);
  }, [options, valid]);

  if (!options || !valid) return <Loading />;

  return (
    <>
    <SessionTimer />
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal", headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "جمعياتي" }} />
      <Stack.Screen name="a/[id]/index" options={{ title: "" }} />
      <Stack.Screen name="a/[id]/units" options={{ title: "الوحدات" }} />
      <Stack.Screen name="a/[id]/members" options={{ title: "الملاك والأعضاء" }} />
      <Stack.Screen name="a/[id]/sections" options={{ title: "الأقسام المخصصة" }} />
      <Stack.Screen name="a/[id]/archive" options={{ title: "الأرشيف" }} />
      <Stack.Screen name="a/[id]/vendors" options={{ title: "دليل الشركات" }} />
      <Stack.Screen name="a/[id]/finance" options={{ title: "الميزانية" }} />
    </Stack>
    </>
  );
}
