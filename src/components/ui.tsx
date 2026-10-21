// Shared building blocks so every screen looks and behaves the same.
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(27,21,48,0.04)] ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-danger">
      {children}
    </p>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-2xl border border-success/40 bg-surface p-3 text-sm text-success">
      {children}
    </p>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} aria-label="Loading" />;
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" | "warning" | "success" }) {
  const tones = {
    muted: "border-border text-muted",
    accent: "border-accent/30 bg-accent-soft text-accent",
    danger: "border-danger/40 text-danger",
    warning: "border-warning/40 text-warning",
    success: "border-success/40 text-success",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "soft" }) {
  const styles =
    variant === "primary" ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent";
  return (
    <Link href={href} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${styles}`}>
      {children}
    </Link>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

export const primaryButton =
  "h-12 rounded-full bg-accent px-5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// A horizontal meter. `tone` carries status; callers always show the value as text too.
export function Meter({ value, tone = "accent", label }: { value: number; tone?: "accent" | "warning" | "danger"; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = { accent: "bg-chart", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
