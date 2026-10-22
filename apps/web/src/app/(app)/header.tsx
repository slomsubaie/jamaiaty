"use client";

import { encodeActing, isSuperadminMode, sameActing, t, type RoleOption } from "@jamaiah/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { actingStore, useActing } from "@/lib/acting";
import { useMyRoles } from "@/lib/hooks";
import { logout } from "@/lib/session";

export function Header() {
  const queryClient = useQueryClient();
  const { me, options } = useMyRoles();
  const acting = useActing();
  const platform = isSuperadminMode(me, acting);


  return (
    <header className="border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href={platform ? "/admin" : "/"} className="text-lg font-bold text-primary">{t.appName}</Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          {platform ? (
            <>
              <Link href="/admin" className="text-muted hover:text-foreground">{t.nav.platformAdmin}</Link>
              <Link href="/admin/support" className="text-muted hover:text-foreground">{t.support.requests}</Link>
              <Link href="/admin/feedback" className="text-muted hover:text-foreground">{t.feedback.admin.title}</Link>
            </>
          ) : (
            <Link href="/" className="text-muted hover:text-foreground">{t.nav.myAssociations}</Link>
          )}
        </nav>
        {me && <RoleMenu name={me.full_name} options={options ?? []} />}
        <Button variant="secondary" onClick={() => void logout(queryClient)}>{t.nav.logout}</Button>
      </div>
    </header>
  );
}

function optionText(o: RoleOption) {
  return o.detail ? `${o.label} — ${o.detail}` : o.label;
}

/** The person's name; opens a list of their roles to switch between. */
function RoleMenu({ name, options }: { name: string; options: RoleOption[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const acting = useActing();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => sameActing(o.acting, acting));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function choose(o: RoleOption) {
    setOpen(false);
    if (sameActing(o.acting, acting)) return;
    actingStore.set(o.acting);
    // Everything cached was loaded under the previous role.
    queryClient.clear();
    router.push(o.acting.kind === "superadmin" ? "/admin" : `/a/${o.acting.association_id}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex flex-col items-end rounded-lg px-2 py-1 text-end hover:bg-background"
      >
        <span className="text-sm font-medium">{name} ▾</span>
        {current && <span className="text-xs text-primary">{optionText(current)}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-20 mt-1 w-72 rounded-xl border border-border bg-surface p-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-xs text-muted">{t.roles.switch}</p>
          {options.map((o) => {
            const selected = sameActing(o.acting, acting);
            return (
              <button
                key={encodeActing(o.acting)}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => choose(o)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-background ${selected ? "font-semibold text-primary" : ""}`}
              >
                <span className="w-4">{selected ? "✓" : ""}</span>
                <span className="flex-1">
                  {o.label}
                  {o.detail && <span className="block text-xs font-normal text-muted">{o.detail}</span>}
                </span>
              </button>
            );
          })}
          <div className="my-1 border-t border-border" />
          <Link href="/profile" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-background">
            {t.roles.profile}
          </Link>
          <Link href="/feedback" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-background">
            {t.feedback.link}
          </Link>
        </div>
      )}
    </div>
  );
}
