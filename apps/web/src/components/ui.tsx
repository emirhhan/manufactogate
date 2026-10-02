import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
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
  return <button className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
  title?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-border",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    accent: "bg-accent/10 text-accent border-accent/30",
  };
  return (
    <span title={title} className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone])}>
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
