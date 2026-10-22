import { SUPPORT_CONTACT, supportLinks, t, type SupportLink } from "@jamaiah/shared";
import Link from "next/link";
import { LoginForm } from "./login-form";

// Contact details come from packages/shared/src/config/support.ts.
export default function LoginPage() {
  const links = supportLinks();
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-primary">{t.appName}</h1>
        <p className="mb-6 text-center text-sm text-muted">{t.login.title}</p>
        <LoginForm />
        {links.length > 0 && (
          <section aria-labelledby="support-title" className="mt-6 flex flex-col items-center gap-3 text-sm">
            <h2 id="support-title" className="text-muted">{t.login.needHelp}</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {links.map((l) => <SupportButton key={l.kind} link={l} />)}
            </div>
            {SUPPORT_CONTACT.hours && <p className="text-xs text-muted">{SUPPORT_CONTACT.hours}</p>}
          </section>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/feedback" className="text-primary underline-offset-4 hover:underline">{t.feedback.link}</Link>
        </p>
      </div>
    </main>
  );
}

const ICONS: Record<SupportLink["kind"], string> = {
  // Simple inline icons so no icon library is needed.
  whatsapp: "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 .9c.3.1.5.2.5.3.1.1.1.6-.1 1.1Z",
  email: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.2L4.5 7v10h15V7L12 12.2ZM5.4 7l6.6 4.6L18.6 7H5.4Z",
  phone: "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z",
};

function SupportButton({ link }: { link: SupportLink }) {
  return (
    <a
      href={link.href}
      target={link.kind === "whatsapp" ? "_blank" : undefined}
      rel={link.kind === "whatsapp" ? "noopener noreferrer" : undefined}
      title={link.value}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-foreground transition hover:border-primary"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-5 w-5 ${link.kind === "whatsapp" ? "fill-[#25D366]" : "fill-primary"}`}>
        <path d={ICONS[link.kind]} />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{link.label}</span>
        <span dir="ltr" className="text-xs text-muted">{link.value}</span>
      </span>
    </a>
  );
}
