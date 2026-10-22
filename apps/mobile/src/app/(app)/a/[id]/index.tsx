import { canView, getAssociation, isSupportSession, queryKeys, rolesLabel, t } from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable } from "react-native";
import { Card, Loading, Screen, SupportBanner, Text } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

export default function AssociationHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { access, isLoading } = useAccess(id);
  const { data: assoc } = useQuery({ queryKey: queryKeys.association(id), queryFn: () => getAssociation(supabase, id) });

  if (isLoading || !assoc || !access) return <Loading />;
  const support = isSupportSession(access);
  const isBoard = access.role === "president" || access.role === "board_member";

  return (
    <Screen>
      <Stack.Screen options={{ title: assoc.name }} />
      <SupportBanner show={support} />
      <Text muted>{[assoc.city, access.roles.length > 0 && rolesLabel(access.roles)].filter(Boolean).join(" · ")}</Text>

      {canView(access, "sections") && (
        <Link href={{ pathname: "/a/[id]/sections", params: { id } }} asChild>
          <Pressable>
            <Card><Text bold>{t.sections.title}</Text></Card>
          </Pressable>
        </Link>
      )}
      {canView(access, "units") && (
      <Link href={{ pathname: "/a/[id]/units", params: { id } }} asChild>
        <Pressable>
          <Card><Text bold>{isBoard || support ? t.association.units : "وحداتي"}</Text></Card>
        </Pressable>
      </Link>
      )}
      {canView(access, "members") && (
        <Link href={{ pathname: "/a/[id]/members", params: { id } }} asChild>
          <Pressable>
            <Card><Text bold>{t.association.members}</Text></Card>
          </Pressable>
        </Link>
      )}
      {([
        ["archive", t.association.archive, canView(access, "documents")],
        ["vendors", "دليل الشركات", access.role !== null || canView(access, "vendors")],
        ["finance", "ملخص الميزانية", access.role !== null || canView(access, "finance")],
      ] as const).filter(([, , show]) => show).map(([path, label]) => (
        <Link key={path} href={{ pathname: `/a/[id]/${path}`, params: { id } }} asChild>
          <Pressable>
            <Card><Text bold>{label}</Text></Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
