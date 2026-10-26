"use client";

import { useState } from "react";
import { readColour } from "@/lib/club-look";

/**
 * A colour, chosen either by picking it or by typing its code: clubs with a
 * brand already know theirs, such as "#1D4E89". The two stay in step.
 *
 * Only the typed box is sent with the form, so it also works with no
 * JavaScript, as a plain box for the code.
 */
export function ColourField({ name, label, hint, value }: { name: string; label: string; hint: string; value: string }) {
  const [code, setCode] = useState(value.toUpperCase());
  const picked = readColour(code) ?? value;

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={`${label}, picked`}
        value={picked}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        className="h-12 w-16 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <label className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold">{label}</span>
          <input
            name={name}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={readColour(code) === null}
            spellCheck={false}
            autoComplete="off"
            className="h-9 w-28 rounded-md border border-line bg-card px-2 font-mono text-[15px] uppercase aria-[invalid=true]:border-[#B3261E]"
          />
        </label>
        <span className="text-[14px] text-muted">{hint}</span>
      </div>
    </div>
  );
}
