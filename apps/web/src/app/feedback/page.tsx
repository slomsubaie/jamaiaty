import { t } from "@jamaiah/shared";
import Link from "next/link";
import { FeedbackForm } from "./feedback-form";

// Public page: complaints & suggestions (no login needed).
export default function FeedbackPage() {
  return (
    <main className="flex flex-1 justify-center p-4 sm:py-10">
      <div className="w-full max-w-xl">
        <Link href="/login" className="text-sm text-muted hover:text-foreground">→ {t.feedback.backToLogin}</Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">{t.feedback.title}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{t.feedback.intro}</p>
        <FeedbackForm />
      </div>
    </main>
  );
}
