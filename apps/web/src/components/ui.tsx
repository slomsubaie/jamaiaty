import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; ref?: Ref<HTMLButtonElement> }) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "border border-border bg-surface hover:bg-background",
    ghost: "text-muted hover:text-foreground",
  }[variant];
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      // Full width unless the caller sets its own width (e.g. "w-auto", "w-48").
      className={`h-10 ${/(^|\s)w-/.test(className) ? "" : "w-full"} rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-danger">{children}</p>;
}

export function Loading() {
  return <p className="p-6 text-sm text-muted">جارٍ التحميل…</p>;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" | "danger" }) {
  const styles = {
    neutral: "bg-background text-muted",
    primary: "bg-primary/10 text-primary",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

/** Destructive action guarded by a native confirm dialog. */
export function DeleteButton({
  onConfirm,
  message = "هل أنت متأكد من الحذف؟ لا يمكن التراجع.",
  label = "حذف",
  disabled,
}: {
  onConfirm: () => void;
  message?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 px-2 text-danger hover:text-danger"
      disabled={disabled}
      onClick={() => confirm(message) && onConfirm()}
    >
      {label}
    </Button>
  );
}

export function PageTitle({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && (
          <Link href={back.href} className="text-sm text-muted hover:text-foreground">
            → {back.label}
          </Link>
        )}
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function SupportBanner({ show, expiresAt }: { show: boolean; expiresAt?: string | null }) {
  if (!show) return null;
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
      أنت تتصفح هذه الجمعية بصلاحية دعم فني مؤقتة، وكل صفحة تفتحها تُسجَّل في سجل الجمعية.
      {expiresAt && <> تنتهي في {new Date(expiresAt).toLocaleString("ar-SA")}.</>}
    </div>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "ليست لديك صلاحية لهذا الإجراء",
  invalid_input: "يرجى التحقق من البيانات المدخلة",
  already_president: "رئيس الجمعية يملك كل صلاحيات المجلس، ولا يمكن إضافته عضواً في المجلس",
  unit_not_found: "الوحدة غير موجودة",
  file_too_large: "حجم الملف يتجاوز 50 ميجابايت",
  analysis_in_progress: "التحليل قيد التنفيذ حالياً",
  analysis_no_documents: "أضف مستندات إلى الأرشيف أولاً",
  analysis_daily_limit: "بلغت الحد اليومي للتحديث (3 مرات)، حاول غداً",
  analysis_not_configured: "التحليل الذكي غير مفعّل على المنصة بعد",
};

/** Turns API/database errors into an Arabic message for the user. */
export function errorText(error: unknown): string {
  if (!error) return "";
  const message = error instanceof Error ? error.message : String(error);
  if (ERROR_MESSAGES[message]) return ERROR_MESSAGES[message];
  if (/row-level security|permission denied|42501/i.test(message)) return ERROR_MESSAGES.forbidden;
  if (/duplicate key|already exists|unique/i.test(message)) return "هذا العنصر موجود مسبقاً";
  if (/inside itself/.test(message)) return "لا يمكن نقل المجلد إلى داخل نفسه";
  if (/foreign key/i.test(message)) return "لا يمكن الحذف لوجود بيانات مرتبطة";
  return message;
}
