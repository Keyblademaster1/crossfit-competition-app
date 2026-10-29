"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Save = (formData: FormData) => Promise<void>;

/**
 * The setup wizard's frame: the list of steps, Back and Continue, and every
 * step's form, all on the page at once with only the current one showing.
 *
 * Moving between steps is instant, because it is the browser that changes
 * step, without asking the server for a new page. What changed on the step
 * being left is saved on the way, in one of two ways:
 *
 * - A settings step (`background`) is saved while the next step is already
 *   showing. Nothing comes back from those saves to show. If what it saves
 *   changes what other steps offer (`refreshAfter`: the format decides the
 *   athletes step's team columns), the next step is covered until the page
 *   has been read again, so it is never worked in while showing the old
 *   choice.
 * - A list step (events, athletes) with something waiting in it, such as a
 *   name typed in or a list pasted, is sent the ordinary way, so the page
 *   that comes back can say who was added and who was not.
 *
 * A step left unchanged sends nothing at all. Without JavaScript none of
 * this runs: the buttons are ordinary buttons of the current step's form,
 * which posts and comes back one step at a time.
 */
export function SetupWizard({
  names,
  initialStep,
  competitionId,
  steps,
  saves,
  background,
  refreshAfter,
}: {
  names: string[];
  initialStep: number;
  competitionId: string;
  /** Each step's fields, in order. */
  steps: ReactNode[];
  /** Each step's save, in order. */
  saves: Save[];
  /** Which steps can be saved in the background. */
  background: number[];
  /** Steps whose saving changes what other steps show, so the page is read again after. */
  refreshAfter: number[];
}) {
  const last = names.length - 1;
  const [step, setStep] = useState(initialStep);
  const [problem, setProblem] = useState(false);
  const [pending, startTransition] = useTransition();
  // A save that changes what other steps show is under way: until the page
  // has been read again, the step on screen may still show the old choice.
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const forms = useRef<(HTMLFormElement | null)[]>([]);
  // What each form held when last saved, to tell whether leaving it needs a save.
  const saved = useRef<string[]>([]);

  useEffect(() => {
    saved.current = forms.current.map((form) => (form ? contents(form) : ""));
  }, []);

  // The browser's back and forward buttons: leaving a step that way saves it
  // just as the step list does, by pressing that step's button in the list.
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    const moved = () => {
      const to = Number(new URLSearchParams(window.location.search).get("step") ?? 0);
      const button = document.querySelector<HTMLButtonElement>(`nav button[name="goto"][value="${to}"]`);
      if (Number.isInteger(to) && to >= 0 && to <= last && button) goRef.current(to, button, true);
    };
    window.addEventListener("popstate", moved);
    return () => window.removeEventListener("popstate", moved);
  }, [last]);

  // The transition covers the save and the page being read again after it.
  if (updating && !pending) setUpdating(false);

  // Each step is its own place in the browser's history, so its back
  // button goes back a step rather than out of setup altogether (found 28
  // October 2026). Going back is the history moving already: nothing to add.
  function show(to: number, back = false) {
    setStep(to);
    if (!back) window.history.pushState(null, "", `?step=${to}`);
    window.scrollTo(0, 0);
  }

  /** Moves to a step, given the button pressed, which says where to. */
  function go(to: number, button: HTMLButtonElement, back = false) {
    const form = forms.current[step];
    if (!form) return show(to, back);
    const now = contents(form);
    if (now === saved.current[step]) return show(to, back);

    // Sent the ordinary way, as if JavaScript were off: the button says where to.
    if (!background.includes(step)) return form.requestSubmit(button);

    const data = new FormData(form);
    data.set("goto", String(to));
    data.set("background", "1");
    const from = step;
    const changesOthers = refreshAfter.includes(from);
    show(to, back);
    if (changesOthers) setUpdating(true);
    startTransition(async () => {
      try {
        await saves[from](data);
        saved.current[from] = now;
        setProblem(false);
        if (changesOthers) router.refresh();
      } catch {
        setProblem(true);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-col lg:flex-row">
      <nav className="flex shrink-0 flex-col gap-1.5 border-b border-line p-5 lg:w-[270px] lg:border-b-0 lg:border-r">
        <span className="px-3 pb-2 text-[13px] font-semibold uppercase tracking-[.02em] text-muted">
          Set up
        </span>
        {names.map((label, index) => (
          <button
            key={label}
            type="submit"
            form={formId(step)}
            name="goto"
            value={index}
            onClick={(event) => {
              event.preventDefault();
              if (index !== step) go(index, event.currentTarget);
            }}
            aria-current={index === step ? "step" : undefined}
            className="flex h-13 items-center gap-3 rounded-[10px] px-3 text-left text-[16px]"
            style={{
              height: 52,
              background: index === step ? "var(--card)" : "transparent",
              fontWeight: index === step ? 600 : 500,
            }}
          >
            <span
              className="font-display num flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-bold"
              style={{
                background:
                  index === step ? "var(--brand-primary)" : index < step ? "var(--ink)" : "var(--line)",
                color: index <= step ? "#fff" : "var(--muted)",
              }}
            >
              {index + 1}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8 lg:px-11">
        {problem && (
          <p
            role="alert"
            className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
          >
            Something you changed could not be saved. Check your connection, then go back to that
            step and try again.
          </p>
        )}

        <div className="relative flex flex-col gap-6" aria-busy={updating}>
        <div inert={updating} className="contents">
        {steps.map((fields, index) => (
          <form
            key={index}
            id={formId(index)}
            ref={(form) => {
              forms.current[index] = form;
            }}
            action={saves[index]}
            hidden={index !== step}
            className="flex flex-col gap-6"
          >
            <input type="hidden" name="competitionId" value={competitionId} />
            {fields}
          </form>
        ))}
        </div>
        {updating && (
          <div
            role="status"
            className="absolute inset-0 z-10 flex items-start justify-center pt-16"
            style={{ background: "color-mix(in srgb, var(--paper) 80%, transparent)" }}
          >
            <span className="rounded-lg border border-line bg-card px-5 py-3 text-[16px] font-semibold shadow-sm">
              Saving…
            </span>
          </div>
        )}
        </div>

        <div className="mt-auto flex justify-between gap-3 border-t border-line pt-5">
          <button
            type="submit"
            form={formId(step)}
            name="goto"
            value={Math.max(0, step - 1)}
            onClick={(event) => {
              event.preventDefault();
              go(Math.max(0, step - 1), event.currentTarget);
            }}
            className="flex items-center rounded-lg border border-line bg-card px-6 font-semibold"
            style={{ height: 52, visibility: step === 0 ? "hidden" : "visible" }}
          >
            ← Back
          </button>
          <button
            type="submit"
            form={formId(step)}
            name="goto"
            value={step === last ? "" : step + 1}
            onClick={(event) => {
              // Finishing is always sent the ordinary way: it checks the teams
              // and moves on to the competition.
              if (step === last) return;
              event.preventDefault();
              go(step + 1, event.currentTarget);
            }}
            className="flex items-center rounded-lg px-7 font-semibold text-white"
            style={{ height: 52, background: "var(--brand-primary)" }}
          >
            {step === last ? "Finish setup" : "Continue"} →
          </button>
        </div>
      </main>
    </div>
  );
}

/** Everything a form would send, as one string, to compare before and after. */
function contents(form: HTMLFormElement): string {
  const entries: string[] = [];
  for (const [name, value] of new FormData(form)) {
    if (name === "goto") continue;
    entries.push(`${name}=${typeof value === "string" ? value : `${value.name}:${value.size}`}`);
  }
  return entries.join("&");
}

function formId(step: number): string {
  return `setup-step-${step}`;
}
