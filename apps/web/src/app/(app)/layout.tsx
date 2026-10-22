import { Header } from "./header";
import { RoleGate } from "./role-gate";
import { SessionTimer } from "./session-timer";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <RoleGate>{children}</RoleGate>
      </main>
      <SessionTimer />
    </>
  );
}
