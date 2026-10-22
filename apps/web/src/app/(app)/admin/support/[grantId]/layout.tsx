import { Suspense } from "react";
import { Loading } from "@/components/ui";

// The request id comes from the URL at runtime, so the page streams in behind this boundary.
export default function GrantLayout({ children }: LayoutProps<"/admin/support/[grantId]">) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
