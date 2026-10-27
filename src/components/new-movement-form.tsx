"use client";

import { useOptimistic, useRef, useTransition, type CSSProperties, type ReactNode } from "react";

/**
 * The blank line at the bottom of a block, for the next movement.
 *
 * Online, adding a movement takes a second or two, and the line used to keep
 * what was typed until the answer came. The next movement was typed on top
 * of it ("BurpeesThrusters"), and a line filled in but never sent with
 * "+ Movement" was simply lost, unlike every other box in the builder, which
 * saves itself (Carin, 27 October 2026). So the line now empties the moment
 * it is sent, shows the movement as saving until it is really there, and
 * sends itself when it is left with a movement named.
 */
export function NewMovementForm({
  id,
  action,
  className,
  style,
  children,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  // A click inside the line, on "Shared" say, which takes the focus away
  // from a box for a moment without leaving the line.
  const clickingInside = useRef(false);
  const [, startTransition] = useTransition();
  const [saving, addSaving] = useOptimistic<string[], string>([], (list, line) => [...list, line]);

  return (
    <>
      {saving.map((line, index) => (
        <div
          key={index}
          role="status"
          className="flex h-11 items-center justify-between rounded-lg border border-dashed border-[#CEC8BA] px-3 text-[15px] font-semibold text-muted"
        >
          <span>{line}</span>
          <span className="text-[13px] font-normal">Saving…</span>
        </div>
      ))}
      <form
        id={id}
        // Without JavaScript the browser sends the line itself.
        action={action}
        className={className}
        style={style}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const name = String(formData.get("name") ?? "").trim();
          // Nothing named, nothing to add: a stray click, or the line was
          // already sent when it was left.
          if (name === "") return;
          const reps = String(formData.get("reps") ?? "").trim();
          form.reset();
          startTransition(async () => {
            addSaving(reps ? `${reps} ${name}` : name);
            await action(formData);
          });
        }}
        onPointerDown={() => (clickingInside.current = true)}
        onClick={(event) => {
          const form = event.currentTarget;
          setTimeout(() => {
            clickingInside.current = false;
            // A click on a gap between the boxes leaves the line after all.
            if (!form.contains(document.activeElement)) form.requestSubmit();
          });
        }}
        onBlur={(event) => {
          // Moving between the line's own boxes is still filling it in.
          if (clickingInside.current) return;
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          // Left, for "+ Movement", another event or anywhere else: sent at
          // once, before another event can replace this one on screen. When
          // it was "+ Movement", that click then finds the line empty.
          event.currentTarget.requestSubmit();
        }}
      >
        {children}
      </form>
    </>
  );
}
