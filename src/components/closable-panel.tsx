"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Puts every box back the way the page drew it: empty for "Paste a list",
 * the athlete's saved details for an athlete being edited.
 */
function reset(details: HTMLDetailsElement) {
  details.querySelectorAll("input, select, textarea").forEach((field) => {
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      field.checked = field.defaultChecked;
    } else if (field instanceof HTMLSelectElement) {
      const saved = [...field.options].findIndex((option) => option.defaultSelected);
      field.selectedIndex = Math.max(0, saved);
    } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.value = field.defaultValue;
    }
  });
}

function close(details: HTMLDetailsElement | null) {
  if (!details?.open) return;
  reset(details);
  details.open = false;
  details.querySelector("summary")?.focus();
}

/**
 * Something to click that opens a box underneath it: "Paste a list", or an
 * athlete's name to correct their details.
 *
 * It is a <details>, so it still opens without JavaScript. What the script adds
 * is closing it again: Escape, a button marked `data-close`, or a click
 * anywhere outside. Closing also undoes whatever was typed. The box sits inside
 * the step's form, and any button on the step saves what is in it, so a change
 * left behind in a closed box would otherwise still be saved the next time
 * Continue was pressed.
 */
export function ClosablePanel({
  summary,
  summaryClassName,
  className,
  children,
}: {
  summary: ReactNode;
  summaryClassName: string;
  className?: string;
  children: ReactNode;
}) {
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
    // Straight into the first box, ready to type or paste.
    details?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <details
      ref={ref}
      className={`group ${className ?? ""}`}
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
      <summary className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}>
        {summary}
      </summary>
      {children}
    </details>
  );
}
