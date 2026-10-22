import { addMember, canManage, deactivateMember, formatSaudiPhone, rolesLabel, listMembers, listUnits, PERMISSION_LABELS, queryKeys, t, toLatinDigits } from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { Button, Card, ErrorText, errorText, Input, LinkButton, Loading, Row, Screen, Text, useColors } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

const ERRORS: Record<string, string> = {
  forbidden: "ليست لديك صلاحية لهذا الإجراء",
  invalid_input: "يرجى التحقق من البيانات المدخلة",
  already_president: "هذا الشخص هو رئيس الجمعية",
};

export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "members", page: "/members" });
  const members = useQuery({ queryKey: queryKeys.members(id), queryFn: () => listMembers(supabase, id) });

  if (isLoading || members.isLoading || !access) return <Loading />;

  return (
    <Screen>
      {access.role !== null && canManage(access, "units") && <AddOwner associationId={id} />}
      {members.data?.map((m) => (
        <Card key={m.user_id}>
          <Row>
            <Text bold style={{ flex: 1 }}>{m.profiles?.full_name}</Text>
            {access.role === "president" && !m.roles.includes("president") && <RemoveMember associationId={id} userId={m.user_id} />}
          </Row>
          <Text muted>
            {rolesLabel(m.roles)}
            {m.profiles?.phone ? ` · ⁦${formatSaudiPhone(m.profiles.phone)}⁩` : ""}
          </Text>
          {m.roles.includes("board_member") && m.permissions.length > 0 && (
            <Text muted size={13}>{m.permissions.map((p) => PERMISSION_LABELS[p]).join("، ")}</Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}

function RemoveMember({ associationId, userId }: { associationId: string; userId: string }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deactivateMember(supabase, associationId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members(associationId) }),
  });
  return (
    <>
      <LinkButton
        title="إزالة"
        danger
        disabled={remove.isPending}
        onPress={() =>
          Alert.alert("إزالة العضو", "إزالة هذا العضو من الجمعية؟", [
            { text: t.common.cancel, style: "cancel" },
            { text: "إزالة", style: "destructive", onPress: () => remove.mutate() },
          ])
        }
      />
      <ErrorText>{errorText(remove.error)}</ErrorText>
    </>
  );
}

/** Adding board members and editing permissions is done on the website; mobile adds owners. */
function AddOwner({ associationId }: { associationId: string }) {
  const c = useColors();
  const qc = useQueryClient();
  const units = useQuery({ queryKey: queryKeys.units(associationId), queryFn: () => listUnits(supabase, associationId) });
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      addMember(supabase, { association_id: associationId, full_name: fullName, phone, role: "owner", unit_id: unitId ?? undefined }),
    onSuccess: () => {
      setFullName("");
      setPhone("");
      setUnitId(null);
      qc.invalidateQueries({ queryKey: queryKeys.members(associationId) });
      qc.invalidateQueries({ queryKey: queryKeys.units(associationId) });
    },
  });

  return (
    <Card style={{ gap: 12 }}>
      <Text bold size={17}>{t.members.addMember}</Text>
      <Input label={t.members.fullName} value={fullName} onChangeText={setFullName} />
      <Input label={t.members.phone} ltr keyboardType="phone-pad" placeholder="05XXXXXXXX" value={phone} onChangeText={(v) => setPhone(toLatinDigits(v))} />
      <Text bold size={14}>{t.members.unit}</Text>
      <Row>
        {units.data?.map((u) => {
          const selected = unitId === u.id;
          return (
            <Pressable
              key={u.id}
              onPress={() => setUnitId(selected ? null : u.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primary : "transparent",
              }}
            >
              <Text size={13} style={{ color: selected ? c.onPrimary : c.text }}>
                {[u.buildings?.name, u.unit_number].filter(Boolean).join(" / ")}
              </Text>
            </Pressable>
          );
        })}
      </Row>
      <ErrorText>{add.error && (ERRORS[add.error.message] ?? add.error.message)}</ErrorText>
      {add.isSuccess && <Text style={{ color: c.primary }}>{t.members.added}</Text>}
      <Button title={t.members.save} onPress={() => add.mutate()} disabled={add.isPending || !fullName || !phone} />
    </Card>
  );
}
