import { Suspense } from "react";
import { Loading } from "@/components/ui";

// Association pages read the id from the URL at runtime, so they stream in
// behind this boundary while the header prerenders into the static shell.
export default function AssociationLayout({ children }: LayoutProps<"/a/[id]">) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
