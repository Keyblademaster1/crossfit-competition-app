"use client";

import { useState } from "react";

/**
 * Copies a piece of text, such as a link, and says so for a moment. Needs
 * JavaScript, but the text it copies is always on the page beside it, so it
 * can be selected and copied by hand without.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex h-10 shrink-0 items-center rounded-lg border border-line bg-card px-4 text-[15px] font-semibold"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
