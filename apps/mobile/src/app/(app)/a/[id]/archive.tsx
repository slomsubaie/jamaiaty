import { canView, DOCUMENT_CATEGORIES, formatBytes, getDocumentUrl, listDocuments, recordKeys, t, type DocumentCategory, type DocumentRow } from "@jamaiah/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArchiveInsights } from "@/components/archive-insights";
import { Card, ErrorText, errorText, LinkButton, Loading, Row, Screen, Text } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";

// View-only: the AI analysis and the documents this person may see (owners: those shared with
// owners). Uploading, editing and refreshing the analysis are on the website.
export default function Archive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { access, isLoading } = useAccess(id, { section: "documents", page: "/archive" });
  const docs = useQuery({ queryKey: [...recordKeys.documents(id), "mobile"], queryFn: () => listDocuments(supabase, id), enabled: access ? canView(access, "documents") : false });
  if (isLoading || docs.isLoading) return <Loading />;
  return (
    <Screen>
      {access && <ArchiveInsights associationId={id} access={access} />}
      {docs.data?.length === 0 && <Text muted>لا توجد مستندات</Text>}
      {docs.data?.map((d) => <Doc key={d.id} doc={d} />)}
    </Screen>
  );
}

function Doc({ doc }: { doc: DocumentRow }) {
  const open = useMutation({ mutationFn: async () => WebBrowser.openBrowserAsync(await getDocumentUrl(supabase, doc)) });
  return (
    <Card>
      <Row>
        <Text size={12} muted>{DOCUMENT_CATEGORIES[doc.category as DocumentCategory]}</Text>
        <Text bold style={{ flex: 1 }}>{doc.title}</Text>
        <LinkButton title={t.common.open} disabled={open.isPending} onPress={() => open.mutate()} />
      </Row>
      <Text muted size={13}>{[doc.document_date, doc.vendors?.name, formatBytes(doc.size_bytes)].filter(Boolean).join(" · ")}</Text>
      {doc.notes ? <Text size={14}>{doc.notes}</Text> : null}
      <ErrorText>{errorText(open.error)}</ErrorText>
    </Card>
  );
}
