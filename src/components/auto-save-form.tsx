"use client";

import { useRef, useState, useTransition } from "react";

/**
 * A form that saves itself.
 *
 * Score entry has no Save button: results are written as they are typed. The
 * scorekeeper is standing at the whiteboard between heats and should not have
 * to remember to press anything.
 *
 * Saving is held back until typing stops, and happens straight away when a box
 * loses focus. Choosing a status is deliberately not a trigger, because
 * switching to Capped reveals an empty box, and saving that empty box would
 * wipe the result the scorekeeper is halfway through correcting.
 *
 * It saves by calling the action itself rather than through the form's
 * `action`, because React resets a form after its action runs. A box then
 * shows its newly saved value, but a menu jumps back to whatever it showed
 * when the page loaded — choosing "Rower" in the event builder snapped back
 * to "Barbell", and the next save wrote Barbell over it — and anything typed
 * while the save was on its way was wiped. Buttons with their own action
 * (move up, remove) still go through React as before.
 */
export function AutoSaveForm({
  action,
  className,
  style,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();

  const saveIn = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => formRef.current?.requestSubmit(), delay);
  };

  return (
    <form
      ref={formRef}
      className={`relative ${className ?? ""}`}
      style={style}
      onSubmit={(event) => {
        // A button with an action of its own: React runs that, as before.
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (submitter?.hasAttribute("formaction")) return;

        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setState("saving");
        startTransition(async () => {
          await action(formData);
          setState("saved");
        });
      }}
      onChange={(event) => {
        // Radios pick a status; they save through their own handler, if at all.
        if (isRadio(event.target)) return;
        saveIn(800);
      }}
      onBlur={(event) => {
        if (isRadio(event.target)) return;
        saveIn(150);
      }}
    >
      {/* First in the form, so Enter in a box saves the row rather than
          pressing its first button, which is "move up" on a movement. */}
      <button type="submit" tabIndex={-1} aria-hidden className="sr-only" />
      {children}
      <SaveState state={state} />
    </form>
  );
}

function isRadio(target: EventTarget): boolean {
  return target instanceof HTMLInputElement && target.type === "radio";
}

function SaveState({ state }: { state: "idle" | "saving" | "saved" }) {
  return (
    <span
      aria-live="polite"
      // Floated into the corner rather than given a column, so it can never
      // push the rest of the row off the edge.
      className="pointer-events-none absolute right-3 top-1 text-[12px] font-semibold"
      style={{ color: state === "saved" ? "#2E3D1F" : "var(--muted)" }}
    >
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
    </span>
  );
}
