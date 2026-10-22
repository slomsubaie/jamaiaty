import { encodeActing, isSuperadminMode, rolesLabel, sameActing, t, type RoleOption } from "@jamaiah/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { Pressable } from "react-native";
import { Button, Card, Chip, Loading, Row, Screen, Text } from "@/components/ui";
import { useActing, useMyRoles } from "@/lib/hooks";
import { logout } from "@/lib/logout";
import { actingStore } from "@/lib/supabase";

export default function MyAssociations() {
  const qc = useQueryClient();
  const { me, memberships, options } = useMyRoles();
  const acting = useActing();

  if (!me || !memberships || !options) return <Loading />;
  const platform = isSuperadminMode(me, acting);

  function choose(o: RoleOption) {
    if (sameActing(o.acting, acting)) return;
    actingStore.set(o.acting);
    // Everything cached was loaded under the previous role.
    qc.clear();
    if (o.acting.kind === "member") router.push({ pathname: "/a/[id]", params: { id: o.acting.association_id } });
  }

  return (
    <Screen>
      <Text bold size={17}>{me.full_name}</Text>
      {options.length > 1 && (
        <Card style={{ gap: 10 }}>
          <Text muted size={13}>{t.roles.switch}</Text>
          <Row>
            {options.map((o) => (
              <Chip
                key={encodeActing(o.acting)}
                label={o.detail ? `${o.label} — ${o.detail}` : o.label}
                selected={sameActing(o.acting, acting)}
                onPress={() => choose(o)}
              />
            ))}
          </Row>
        </Card>
      )}

      {platform ? (
        <Card>
          <Text bold>مدير المنصة</Text>
          <Text muted>إدارة المنصة وطلبات الدعم متاحة من الموقع الإلكتروني. لاستخدام صلاحياتك في جمعية، اختر دورك فيها من الأعلى.</Text>
        </Card>
      ) : (
        <>
          {memberships.length === 0 && <Text muted>{t.association.noMemberships}</Text>}
          {memberships.map((m) => (
            <Link key={m.association_id} href={{ pathname: "/a/[id]", params: { id: m.association_id } }} asChild>
              <Pressable>
                <Card>
                  <Text bold size={17}>{m.associations?.name}</Text>
                  <Text muted>{`${m.associations?.city} · ${rolesLabel(m.roles)}`}</Text>
                </Card>
              </Pressable>
            </Link>
          ))}
        </>
      )}
      <Button
        variant="ghost"
        title={t.nav.logout}
        onPress={() => void logout(qc)}
      />
    </Screen>
  );
}
