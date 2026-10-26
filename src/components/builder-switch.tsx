"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";

/**
 * Covering the event builder while another event opens.
 *
 * Opening an event, or adding one, takes a moment online, and until the new
 * one arrives the old one is still on the screen, looking just like an empty
 * event. Anything typed in that moment went into the old event's rows and
 * was lost or saved in the wrong place (Carin, 26 October 2026). So from the
 * click until the new event is really there, the builder is covered and
 * cannot be typed in.
 */

const Opening = createContext<{ opening: string | null; open: (what: string) => void }>({
  opening: null,
  open: () => {},
});

/**
 * Around the whole builder. `showing` names the event (and version) on
 * screen; when it changes, the new one has arrived and the cover comes off.
 */
export function BuilderSwitch({ showing, children }: { showing: string; children: ReactNode }) {
  const [opening, setOpening] = useState<string | null>(null);

  // A new event on screen is the signal the wait is over. Adjusting state
  // while rendering is React's way to reset it when a prop changes.
  const [shown, setShown] = useState(showing);
  if (shown !== showing) {
    setShown(showing);
    setOpening(null);
  }

  // Should the new event never come, say on lost wifi, the builder is not
  // left covered for good.
  useEffect(() => {
    if (!opening) return;
    const giveUp = setTimeout(() => setOpening(null), 20_000);
    return () => clearTimeout(giveUp);
  }, [opening]);

  return <Opening.Provider value={{ opening, open: setOpening }}>{children}</Opening.Provider>;
}

/** A link to another event, or another version of this one. */
export function SwitchLink({
  current,
  opening,
  ...props
}: ComponentProps<typeof Link> & { current: boolean; opening: string }) {
  const { open } = useContext(Opening);
  return (
    <Link
      {...props}
      onClick={(event) => {
        // A click that opens a new tab, or on what is already open, waits for nothing.
        if (current || event.metaKey || event.ctrlKey || event.shiftKey) return;
        open(opening);
      }}
    />
  );
}

/** The "+ Add event" button. */
export function SwitchButton({ opening, ...props }: ComponentProps<"button"> & { opening: string }) {
  const { open } = useContext(Opening);
  return <button {...props} onClick={() => open(opening)} />;
}

/** The part that is covered while waiting. */
export function SwitchArea({ className, children }: { className?: string; children: ReactNode }) {
  const { opening } = useContext(Opening);
  return (
    <main className={`relative ${className ?? ""}`} aria-busy={opening !== null}>
      <div inert={opening !== null} className="flex flex-col gap-4">
        {children}
      </div>
      {opening && (
        <div
          role="status"
          className="absolute inset-0 z-10 flex items-start justify-center pt-24"
          style={{ background: "color-mix(in srgb, var(--paper) 80%, transparent)" }}
        >
          <span className="rounded-lg border border-line bg-card px-5 py-3 text-[16px] font-semibold shadow-sm">
            {opening}
          </span>
        </div>
      )}
    </main>
  );
}
