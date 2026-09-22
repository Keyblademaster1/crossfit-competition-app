"use client";

import type { ReactNode } from "react";

/**
 * Opens the browser's own print dialog.
 *
 * The one thing on this screen that needs JavaScript: nothing else can ask a
 * browser to print. Everything else — choosing what goes in, and downloading
 * the spreadsheet — is a plain link, so the screen still does most of its job
 * without it.
 */
export function PrintButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-13 w-full items-center justify-center rounded-lg text-[16px] font-semibold text-white"
      style={{ background: "var(--brand-primary)", height: 52 }}
    >
      {children}
    </button>
  );
}
