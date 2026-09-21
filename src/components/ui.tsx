import type { ReactNode } from "react";

/**
 * Shared building blocks, styled to the design handoff.
 *
 * Colours come from CSS variables, so these never mention a brand. Controls are
 * at least 44px tall: the design calls for that, because scorekeepers use this
 * in a hurry and often with cold hands.
 */

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="font-display text-sm font-semibold uppercase tracking-[.08em] text-muted">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const base =
    "inline-flex h-11 items-center justify-center rounded-lg px-4 text-[15px] font-semibold transition disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "text-white hover:brightness-110"
      : "border border-line bg-card text-ink hover:bg-paper";

  return (
    <button
      {...props}
      style={variant === "primary" ? { background: "var(--brand-primary)", ...props.style } : props.style}
      className={`${base} ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "h-11 w-full rounded-lg border border-line bg-card px-3 text-[15px] text-ink outline-none transition focus:border-ink";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-muted">{children}</p>;
}

/** A small coloured chip, e.g. a division name. */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className="inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-semibold"
      style={
        tone === "brand"
          ? { background: "var(--brand-primary)", color: "#fff" }
          : { background: "var(--paper)", color: "var(--muted)" }
      }
    >
      {children}
    </span>
  );
}
