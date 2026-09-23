"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function close(details: HTMLDetailsElement | null) {
  if (!details?.open) return;
  details.querySelectorAll("textarea").forEach((box) => (box.value = ""));
  details.open = false;
  details.querySelector("summary")?.focus();
}

/**
 * A button that opens a box underneath it, such as "Paste a list".
 *
 * It is a <details>, so it still opens without JavaScript. What the script adds
 * is closing it again: Escape, the Cancel button, or a click anywhere outside.
 * Closing also empties it. The box sits inside the step's form, and any button
 * on the step saves what is in it, so text left behind in a closed box would
 * still be added the next time Continue was pressed.
 */
export function PastePanel({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const details = ref.current;
    // Escape with the focus somewhere else on the page. Escape from inside the
    // box is handled on the box itself, below, so it works the instant the box
    // opens rather than once this has run.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(details);
    };
    const onPointer = (event: PointerEvent) => {
      if (!details?.contains(event.target as Node)) close(details);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    // Straight into the box, ready to paste.
    details?.querySelector("textarea")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <details
      ref={ref}
      className="group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close(ref.current);
        }
      }}
      onClick={(event) => {
        if ((event.target as Element).closest("[data-close]")) close(ref.current);
      }}
    >
      <summary className="flex h-11 cursor-pointer list-none items-center rounded-lg border border-line bg-card px-[18px] font-semibold group-open:bg-paper [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      {children}
    </details>
  );
}
