import { recordKeys, VENDOR_CATEGORIES, vendorDirectory, type VendorCategory } from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { Card, LinkButton, Loading, Row, Screen, Text } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

// Vendor directory (name, field, website, support number). Contracts, offers and the
// comparison are managed on the website.
export default function Vendors() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading } = useAccess(id, { section: "vendors", page: "/vendors" });
  const dir = useQuery({ queryKey: recordKeys.directory(id), queryFn: () => vendorDirectory(supabase, id) });
  if (isLoading || dir.isLoading) return <Loading />;
  return (
    <Screen>
      {!dir.data?.length && <Text muted>لا توجد شركات مدرجة بعد</Text>}
      {dir.data?.map((v) => (
        <Card key={v.id}>
          <Text bold>{v.name}</Text>
          <Text muted size={13}>{VENDOR_CATEGORIES[v.category as VendorCategory]}</Text>
          <Row>
            {v.support_phone ? <LinkButton title={`☎ ${v.support_phone}`} onPress={() => void Linking.openURL(`tel:${v.support_phone}`)} /> : null}
            {v.website ? <LinkButton title="الموقع الإلكتروني" onPress={() => void WebBrowser.openBrowserAsync(v.website!)} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
