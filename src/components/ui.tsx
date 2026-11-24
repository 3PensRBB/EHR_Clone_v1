import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { SlaLevel } from "@/lib/domain/sla";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost" | "warn";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark border-brand",
  secondary: "bg-white text-ink border-line hover:bg-slate-50",
  danger: "bg-crit text-white border-crit hover:brightness-110",
  warn: "bg-warn text-white border-warn hover:brightness-110",
  ghost: "bg-transparent text-brand border-transparent hover:bg-blue-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-panel shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "crit" | "warn" | "ok" | "info" | "dark"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    crit: "bg-crit-bg text-crit border-red-200",
    warn: "bg-warn-bg text-warn border-amber-200",
    ok: "bg-ok-bg text-ok border-green-200",
    info: "bg-blue-50 text-brand border-blue-200",
    dark: "bg-ink text-white border-ink",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function FlagBadge({ flag }: { flag: string }) {
  const tone = flag === "HH" || flag === "LL" || flag === "POS" ? "crit" : flag === "H" || flag === "L" ? "warn" : "neutral";
  return <Badge tone={tone}>{flag === "N" ? "—" : flag}</Badge>;
}

const slaTone: Record<SlaLevel, string> = {
  green: "bg-ok-bg text-ok border-green-300",
  amber: "bg-warn-bg text-warn border-amber-300",
  red: "bg-crit-bg text-crit border-red-300 animate-crit",
  overdue: "bg-ink text-white border-ink",
  done: "bg-ok-bg text-ok border-green-300",
  done_late: "bg-warn-bg text-warn border-amber-300",
};

export function SlaPill({ level, label, large }: { level: SlaLevel; label: string; large?: boolean }) {
  const icon = level === "done" || level === "done_late" ? "✓" : level === "overdue" ? "!" : "⏱";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-semibold", large ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs", slaTone[level])}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
