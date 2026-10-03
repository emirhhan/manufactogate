import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/store/toast";

export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const base = "inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "h-7 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm" };
  const variants = {
    primary: "bg-accent text-accent-fg border-accent hover:opacity-90",
    secondary: "bg-surface text-text border-border hover:bg-surface-2",
    ghost: "bg-transparent text-text border-transparent hover:bg-surface-2",
    danger: "bg-surface text-danger border-border hover:bg-surface-2",
  };
  // A Button inside a form must not submit it unless asked to.
  return <button type={type ?? "button"} className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}

/** Icon-only button: always carries an accessible name. */
export function IconButton({ label, className, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type={type ?? "button"} aria-label={label} title={label} className={cn("grid h-8 w-8 place-items-center rounded-md border border-transparent text-muted hover:border-border hover:bg-surface-2 hover:text-text", className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
  title,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
  title?: string | undefined;
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    accent: "bg-accent/10 text-accent border-accent/30",
  };
  return (
    <span title={title} className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6">
      <div className="font-medium">{title}</div>
      {hint && <div className="text-muted">{hint}</div>}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 text-[11px] text-muted">{children}</kbd>;
}

/* ---- Form fields ---------------------------------------------------------------------------- */

export function Input({ className, size, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "md" }) {
  return <input className={cn("field", size === "sm" && "field-sm", className)} {...props} />;
}
export function Select({ className, size, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md" }) {
  return <select className={cn("field", size === "sm" && "field-sm", className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field", className)} {...props} />;
}

/* ---- Layout ---------------------------------------------------------------------------------- */

/** Section title row with an optional hint and "tümünü gör" link. */
export function SectionHeader({ title, hint, to, toLabel = "Tümünü gör", right }: { title: string; hint?: string | undefined; to?: string | undefined; toLabel?: string | undefined; right?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
      <span className="ml-auto flex items-center gap-3">
        {right}
        {to && (
          <Link to={to} className="text-[12px] text-accent hover:underline">
            {toLabel} →
          </Link>
        )}
      </span>
    </div>
  );
}

/** KPI tile: label, value, optional delta/hint. Values are tabular. */
export function Stat({ label, value, hint, tone = "neutral", to }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "accent"; to?: string | undefined }) {
  const toneCls = { neutral: "", success: "text-success", warning: "text-warning", danger: "text-danger", accent: "text-accent" }[tone];
  const body = (
    <>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight tnum", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="card-lift block rounded-lg border border-border bg-surface p-4">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-border bg-surface p-4">{body}</div>
  );
}

/** Thin horizontal meter (0..1), tokens only. */
export function Meter({ value, tone = "accent", label }: { value: number; tone?: "accent" | "success" | "warning" | "danger"; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bg = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={cn("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---- Skeletons ------------------------------------------------------------------------------- */

export function SkeletonLine({ w = "w-full", h = "h-3", className }: { w?: string; h?: string; className?: string }) {
  return <div aria-hidden className={cn("skeleton motion-reduce:animate-none", w, h, className)} />;
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface" aria-busy="true">
      <div className="skeleton aspect-square w-full rounded-none" />
      <div className="space-y-2 p-3">
        <SkeletonLine />
        <SkeletonLine w="w-3/4" />
        <div className="flex justify-between pt-1">
          <SkeletonLine w="w-16" h="h-4" />
          <SkeletonLine w="w-10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ---- Checklist ------------------------------------------------------------------------------- */

export type StepState = "done" | "todo" | "warning";

export function Step({ state, title, hint, action }: { state: StepState; title: string; hint?: ReactNode; action?: ReactNode }) {
  const dot = { done: "bg-success text-white", todo: "border border-border bg-surface text-muted", warning: "bg-warning text-white" }[state];
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", dot)} aria-hidden>
        {state === "done" ? "✓" : state === "warning" ? "!" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13px] font-medium", state === "done" && "text-muted line-through decoration-border")}>{title}</div>
        {hint && <div className="text-[12px] text-muted">{hint}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

export function Checklist({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border", className)}>{children}</ul>;
}

/* ---- Sparkline ------------------------------------------------------------------------------- */

/** Inline price history, last `max` points; tone follows the direction of the last move. */
export function Sparkline({ points, width = 96, height = 28, max = 30, label }: { points: number[]; width?: number; height?: number; max?: number; label?: string }) {
  const xs = points.slice(-max);
  if (xs.length < 2) return <svg width={width} height={height} aria-hidden className="text-muted"><line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="2 3" /></svg>;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo || 1;
  const pad = 2;
  const pts = xs.map((v, i) => [pad + (i / (xs.length - 1)) * (width - pad * 2), pad + (1 - (v - lo) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = xs[xs.length - 1]!;
  const prev = xs[xs.length - 2]!;
  const cls = last < prev ? "text-success" : last > prev ? "text-danger" : "text-muted";
  const end = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} role="img" aria-label={label ?? `${xs.length} fiyat noktası`} className={cls}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r={2} fill="currentColor" />
    </svg>
  );
}

/* ---- Toasts ---------------------------------------------------------------------------------- */

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  if (!toasts.length) return null;
  const tones = { neutral: "border-border", success: "border-success/50", warning: "border-warning/50", danger: "border-danger/50" };
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn("toast-enter pointer-events-auto flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow-md)]", tones[t.tone])}>
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <Link to={t.action.to} className="text-accent hover:underline" onClick={() => dismiss(t.id)}>
              {t.action.label}
            </Link>
          )}
          <IconButton label="Kapat" className="h-6 w-6" onClick={() => dismiss(t.id)}>
            ✕
          </IconButton>
        </div>
      ))}
    </div>
  );
}

/* ---- Hooks ----------------------------------------------------------------------------------- */

/** Sets the document title for the page ("Ayarlar · Manufactogate"). */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title ? `${title} · Manufactogate` : "Manufactogate";
  }, [title]);
}
