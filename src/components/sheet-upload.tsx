"use client";

import { useEffect, useRef, useState } from "react";
import { parseAthleteRows, parseCsv, type PastedAthlete } from "@/lib/athlete-list";

/**
 * The inside of "Upload a spreadsheet": somewhere to drop the file, and what
 * is in it.
 *
 * Choosing a file used to show nothing but its name, so there was no telling
 * whether it had been read, or read right, until it was added (Carin,
 * 5 October 2026). Now the file is read here as soon as it is chosen, with the
 * same rules the save uses, and every row is listed as it will be added: who
 * is already on the list, who is left out for want of W or M, and which team
 * each goes on. The button says how many will be added.
 *
 * Anything missed can be put right in the list itself — a W or M, a team, a
 * division, a misspelt name — rather than in the spreadsheet (Carin, 5 October
 * 2026). Once the file has been read, the list as edited is what is sent, as
 * `sheetRows`, and the file stays behind. Without JavaScript there is no list,
 * and the file is sent and read on the server instead.
 */
export function SheetUpload({
  example,
  divisions,
  year,
  existingNames,
  existingTeams,
  showTeams,
  showDivision,
  teamSize,
}: {
  /** The example table, column by column: heading, then two rows. */
  example: string[][];
  divisions: string[];
  year: number;
  existingNames: string[];
  /** Teams already made: their division, and how many are on each. */
  existingTeams: { name: string; division: string | null; members: number }[];
  /** Teams come from the spreadsheet: fixed teams chosen at signup. */
  showTeams: boolean;
  /** Fixed teams: divisions count, and 60+ does not. */
  showDivision: boolean;
  teamSize: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<PastedAthlete[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Closing the box empties the file input (see ClosablePanel); forget what
  // was read from it at the same time.
  useEffect(() => {
    const details = input.current?.closest("details");
    if (!details) return;
    const forget = () => {
      if (details.open) return;
      setFile(null);
      setRows(null);
      setError(null);
    };
    details.addEventListener("toggle", forget);
    return () => details.removeEventListener("toggle", forget);
  }, []);

  async function read(chosen: File | undefined) {
    setRows(null);
    setError(null);
    setFile(chosen?.name ?? null);
    if (!chosen) return;
    const name = chosen.name.toLowerCase();
    try {
      let cells: string[][];
      if (name.endsWith(".xlsx")) {
        // Only fetched once a spreadsheet is chosen, so the page stays light.
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(chosen);
        cells = sheet.map((row) =>
          row.map((cell) =>
            cell === null || cell === undefined
              ? ""
              : cell instanceof Date
                ? cell.toISOString().slice(0, 10)
                : String(cell),
          ),
        );
      } else if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
        cells = parseCsv(await chosen.text());
      } else {
        setError(`${chosen.name} is not a spreadsheet the app can read. Save it as .xlsx or .csv first.`);
        return;
      }
      setRows(parseAthleteRows(cells, divisions, year));
    } catch {
      setError(`Could not read ${chosen.name}. Save it again as .xlsx or .csv and try once more.`);
    }
  }

  const key = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
  const knownTeams = new Map(existingTeams.map((team) => [key(team.name), team]));

  // A team has one division. An existing team keeps its own; a new one takes
  // the first division given on any of its rows, and every row shows it.
  const teamDivision = new Map<string, string | null>();
  for (const [teamKey, team] of knownTeams) teamDivision.set(teamKey, team.division);
  for (const row of rows ?? []) {
    if (!row.team || !row.division) continue;
    if (!teamDivision.get(key(row.team))) teamDivision.set(key(row.team), row.division);
  }
  const divisionOf = (row: PastedAthlete) =>
    showTeams && row.team ? (teamDivision.get(key(row.team)) ?? null) : row.division;

  const already = new Set(existingNames.map(key));
  const seen = new Set<string>();
  // "waiting": added, onto a team that will still be short of a full one.
  type Status = "already" | "noSex" | "waiting" | "add";
  const listed = (rows ?? []).map((row): PastedAthlete & { status: Status } => {
    const status: Status =
      already.has(key(row.name)) || seen.has(key(row.name))
        ? "already"
        : row.gender === null
          ? "noSex"
          : "add";
    seen.add(key(row.name));
    return { ...row, division: divisionOf(row), status };
  });

  // A team left short of a full one is still made, and waits for a teammate
  // (see addListed in actions.ts).
  if (showTeams) {
    const size = new Map<string, number>();
    for (const row of listed) {
      if (row.status !== "add" || !row.team) continue;
      size.set(key(row.team), (size.get(key(row.team)) ?? 0) + 1);
    }
    for (const row of listed) {
      if (row.status !== "add" || !row.team) continue;
      const total = (knownTeams.get(key(row.team))?.members ?? 0) + (size.get(key(row.team)) ?? 0);
      if (total < teamSize) row.status = "waiting";
    }
  }

  const adding = listed.filter((row) => row.status === "add" || row.status === "waiting");
  const noSex = listed.filter((row) => row.status === "noSex");
  const waitingTeams = [
    ...new Set(listed.filter((row) => row.status === "waiting").map((row) => row.team!)),
  ];
  const sixtyPlus = adding.filter((row) => row.isSixtyPlus).length;
  // A new team needs a division, or it is not made and its athletes wait
  // under "Not on a team yet".
  const noDivision = showTeams && divisions.length > 0
    ? [
        ...new Map(
          adding
            .filter((row) => row.team && !knownTeams.has(key(row.team)) && !row.division)
            .map((row) => [key(row.team!), row.team!]),
        ).values(),
      ]
    : [];
  // Teams the rows go on, less those that will not be made.
  const teams = new Set(
    adding
      .filter((row) => row.team && (row.division || divisions.length === 0 || knownTeams.has(key(row.team))))
      .map((row) => key(row.team!)),
  ).size;
  // Shown whenever teams come from the list, so a missing one can be typed in.
  const hasTeams = showTeams;

  function change(index: number, update: Partial<PastedAthlete>) {
    setRows((current) => {
      if (!current) return current;
      const row = current[index];
      const team = update.team !== undefined ? update.team : row.team;
      return current.map((other, at) => {
        if (at === index) {
          // Moved onto a team that has a division: theirs becomes the same.
          const joined = update.team ? teamDivision.get(key(update.team)) : undefined;
          return { ...other, ...update, ...(joined ? { division: joined } : {}) };
        }
        // A division chosen on one row is the whole team's.
        if (update.division !== undefined && team && other.team && key(other.team) === key(team)) {
          return { ...other, division: update.division };
        }
        return other;
      });
    });
  }
  const cell = "h-8 rounded-md border border-[#CEC8BA] bg-card px-1.5 text-[14px]";

  const alreadyCount = listed.filter((row) => row.status === "already").length;
  const summary = [
    `${adding.length} ${adding.length === 1 ? "athlete" : "athletes"} to add`,
    !showDivision && sixtyPlus > 0 ? `${sixtyPlus} 60+` : "",
    hasTeams ? `${teams} ${teams === 1 ? "team" : "teams"}` : "",
    alreadyCount > 0 ? `${alreadyCount} already on the list` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[15px] font-semibold">Excel (.xlsx) or CSV file</span>

      {/* The input covers the whole area, so a file dropped anywhere on it
          lands in the input itself, with no script needed for dragging. */}
      <label
        className="relative flex min-h-[88px] cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-4 py-3"
        style={{
          borderColor: rows ? "var(--brand-primary)" : error ? "#C9A07A" : "var(--line)",
          background: rows ? "#EEF2E8" : "var(--paper)",
        }}
      >
        <input
          ref={input}
          id="athlete-sheet"
          // Once read, the edited list is sent in its place; see sheetRows.
          name={rows ? undefined : "sheet"}
          type="file"
          aria-label="Excel (.xlsx) or CSV file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => read(event.target.files?.[0])}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[20px] font-bold text-white"
          style={{ background: rows ? "var(--brand-primary)" : "#A39D8F" }}
        >
          {rows ? "✓" : "↑"}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[16px] font-semibold">
            {file ?? "Choose a file, or drag it here"}
          </span>
          <span className="text-[14px] text-muted" aria-live="polite">
            {rows
              ? listed.length === 0
                ? "No athletes found. Is there a Name column in the first row?"
                : summary
              : file && !error
                ? "Reading…"
                : "One athlete per row, column names in the first row."}
          </span>
        </span>
        {file && <span className="ml-auto shrink-0 text-[14px] font-semibold underline">Change</span>}
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-3 py-2 text-[14px] text-[#6B3A0E]">
          {error}
        </p>
      )}

      {rows && listed.length > 0 ? (
        <>
          <div className="max-h-[min(440px,50vh)] overflow-auto rounded-lg border border-line">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-paper text-left">
                <tr>
                  <th className="px-2.5 py-1.5 font-semibold">Name</th>
                  <th className="px-2.5 py-1.5 font-semibold">Sex</th>
                  {!showDivision && <th className="px-2.5 py-1.5 font-semibold">60+</th>}
                  {hasTeams && <th className="px-2.5 py-1.5 font-semibold">Team</th>}
                  {showDivision && <th className="px-2.5 py-1.5 font-semibold">Division</th>}
                  <th className="px-2.5 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {listed.map((row, index) =>
                  row.status === "already" ? (
                    // Skipped whatever is changed, so nothing here to change.
                    <tr key={index} className="border-t border-line" style={{ opacity: 0.55 }}>
                      <td className="px-2.5 py-1.5 font-medium">{row.name}</td>
                      <td className="px-2.5 py-1.5">
                        {row.gender === "WOMAN" ? "W" : row.gender === "MAN" ? "M" : "–"}
                      </td>
                      {!showDivision && <td className="px-2.5 py-1.5">{row.isSixtyPlus ? "60+" : ""}</td>}
                      {hasTeams && <td className="px-2.5 py-1.5">{row.team ?? ""}</td>}
                      {showDivision && <td className="px-2.5 py-1.5">{row.division ?? ""}</td>}
                      <td className="px-2.5 py-1.5 text-right text-[13px] text-muted">Already added</td>
                    </tr>
                  ) : (
                  <tr key={index} className="border-t border-line">
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Name on row ${index + 1}`}
                        value={row.name}
                        onChange={(event) => change(index, { name: event.target.value })}
                        className={`${cell} w-full min-w-24 font-medium`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Sex of ${row.name}`}
                        value={row.gender ?? ""}
                        onChange={(event) =>
                          change(index, {
                            gender: (event.target.value || null) as PastedAthlete["gender"],
                          })
                        }
                        className={cell}
                        style={row.gender ? undefined : { borderColor: "#8A2A12" }}
                      >
                        <option value="">–</option>
                        <option value="WOMAN">W</option>
                        <option value="MAN">M</option>
                      </select>
                    </td>
                    {!showDivision && (
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          aria-label={`${row.name} is 60+`}
                          checked={row.isSixtyPlus}
                          onChange={(event) => change(index, { isSixtyPlus: event.target.checked })}
                          className="h-5 w-5"
                        />
                      </td>
                    )}
                    {hasTeams && (
                      <td className="px-2 py-1">
                        <input
                          aria-label={`Team of ${row.name}`}
                          value={row.team ?? ""}
                          onChange={(event) => change(index, { team: event.target.value || null })}
                          className={`${cell} w-full min-w-28`}
                        />
                      </td>
                    )}
                    {showDivision && (
                      <td className="px-2 py-1">
                        <select
                          aria-label={`Division of ${row.name}`}
                          value={row.division ?? ""}
                          onChange={(event) => change(index, { division: event.target.value || null })}
                          // A team already made keeps its division; it is
                          // changed on the team's own card.
                          disabled={!!row.team && knownTeams.has(key(row.team))}
                          title={
                            row.team && knownTeams.has(key(row.team))
                              ? `${row.team} is already made: change its division on its card`
                              : undefined
                          }
                          className={`${cell} disabled:opacity-60`}
                        >
                          <option value="">–</option>
                          {divisions.map((division) => (
                            <option key={division} value={division}>
                              {division}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-2.5 py-1.5 text-right text-[13px]">
                      {row.status === "noSex" && (
                        <span className="font-semibold text-[#8A2A12]">No W or M · left out</span>
                      )}
                      {row.status === "waiting" && (
                        <span className="font-semibold text-[#8A4B12]">Waiting for teammate</span>
                      )}
                    </td>
                  </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {noDivision.length > 0 && (
            <p className="text-[14px] text-[#8A2A12]">
              No division for <strong>{noDivision.join(", ")}</strong>, so no team is made: its
              athletes are added and wait under “Not on a team yet”. Choose a division on one of
              its rows to make the team.
            </p>
          )}
          {waitingTeams.length > 0 && (
            <p className="text-[14px] text-[#8A4B12]">
              <strong>{waitingTeams.join(", ")}</strong> will not be full yet, and{" "}
              {waitingTeams.length === 1 ? "waits" : "wait"} for a teammate. Add them later on the
              team&apos;s card, or here in the list.
            </p>
          )}
          {noSex.length > 0 && (
            <p className="text-[14px] text-[#8A2A12]">
              {noSex.length === 1 ? "1 row has" : `${noSex.length} rows have`} no W or M and will be
              left out. Choose one in the list to add them.
            </p>
          )}
        </>
      ) : (
        !file && (
          <div className="overflow-x-auto">
            <table className="text-[14px]">
              <tbody>
                {[0, 1, 2].map((row) => (
                  <tr key={row} className={row === 0 ? "font-semibold" : ""}>
                    {example.map((column) => (
                      <td key={column[0]} className="border border-line px-2.5 py-1">
                        {column[row]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {rows && (
        <input
          type="hidden"
          name="sheetRows"
          // Each row with its team's division, as shown.
          value={JSON.stringify(rows.map((row) => ({ ...row, division: divisionOf(row) })))}
        />
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          data-close
          className="flex h-11 items-center rounded-lg border border-line bg-card px-5 font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          // Only once the file has been read: without JavaScript there is no
          // preview, and the button still has to work.
          disabled={rows !== null && adding.length === 0}
          className="flex h-11 items-center rounded-lg px-5 font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--brand-primary)" }}
        >
          {rows && adding.length > 0
            ? `Add ${adding.length} ${adding.length === 1 ? "athlete" : "athletes"}`
            : "Add these"}
        </button>
      </div>
    </div>
  );
}
