import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Theme } from "@/lib/theme";

/**
 * The bar across the top, in a club's look: its logo if it has one, and its
 * name. Whatever is passed as children goes at the right-hand end.
 */
export function BrandHeader({ theme, home, children }: { theme: Theme; home: string | null; children?: ReactNode }) {
  const brand = (
    <>
      {theme.logoLight ? (
        // A logo nearly always carries the name, so the name is not repeated
        // beside it; the picture's alt text still says it.
        <Image
          src={theme.logoLight}
          alt={theme.name}
          width={160}
          height={40}
          className="h-9 w-auto max-w-[220px] object-contain object-left"
          unoptimized
        />
      ) : (
        <>
          <span aria-hidden className="h-7 w-2 shrink-0 rounded-sm" style={{ background: "var(--brand-primary)" }} />
          <span className="font-display text-xl font-bold uppercase tracking-wide">{theme.name}</span>
        </>
      )}
    </>
  );
  return (
    <header className="border-b border-line bg-card">
      {/* On a phone the links drop below the name rather than squeezing it. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {home ? (
          <Link href={home} className="flex min-w-0 items-center gap-3">
            {brand}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">{brand}</div>
        )}
        {children}
      </div>
    </header>
  );
}
