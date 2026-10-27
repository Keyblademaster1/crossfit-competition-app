"use client";

import {
  createContext,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Whether a block's blank line is showing. A block with movements hides it
 * until "+ Movement" is pressed: an empty dashed line under every finished
 * block looked like something left undone (Carin, 27 October 2026). A new
 * block shows it straight away, ready for its first movement.
 */
const Line = createContext<{ open: boolean; byClick: boolean; show: () => void }>({
  open: true,
  byClick: false,
  show: () => {},
});

/** Around one block's movements and its "+ Movement" button. */
export function NewMovementArea({ startOpen, children }: { startOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const [byClick, setByClick] = useState(false);
  const show = () => {
    setOpen(true);
    setByClick(true);
  };
  return <Line.Provider value={{ open, byClick, show }}>{children}</Line.Provider>;
}

/**
 * "+ Movement": opens the line when it is hidden, and sends it when it is
 * open, leaving it open and empty for the next one.
 */
export function AddMovementButton({ form, ...props }: ComponentProps<"button"> & { form: string }) {
  const { open, show } = useContext(Line);
  return (
    <button
      {...props}
      type="submit"
      form={form}
      onClick={(event) => {
        if (open) return;
        event.preventDefault();
        show();
      }}
    />
  );
}

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
  const formRef = useRef<HTMLFormElement>(null);
  // A click inside the line, on "Shared" say, which takes the focus away
  // from a box for a moment without leaving the line.
  const clickingInside = useRef(false);
  const [, startTransition] = useTransition();
  const [saving, addSaving] = useOptimistic<string[], string>([], (list, line) => [...list, line]);
  const { open, byClick } = useContext(Line);

  // Opened by "+ Movement": ready to type the name.
  useEffect(() => {
    if (open && byClick) nameBox(formRef.current)?.focus();
  }, [open, byClick]);

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
      {open && (
        <form
          ref={formRef}
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
            if (name === "") {
              // "+ Movement" on an empty line: back to the name, to type one.
              // Leaving an empty line sends nothing.
              if ((event.nativeEvent as SubmitEvent).submitter) nameBox(form)?.focus();
              return;
            }
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
            // it was "+ Movement", that click then finds the line empty and
            // puts the cursor back in it for the next one.
            event.currentTarget.requestSubmit();
          }}
        >
          {children}
        </form>
      )}
    </>
  );
}

function nameBox(form: HTMLFormElement | null) {
  return form?.querySelector<HTMLInputElement>('input[name="name"]');
}
