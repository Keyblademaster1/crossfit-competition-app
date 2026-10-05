/**
 * Reading a list of athletes: pasted, or from a spreadsheet file.
 *
 * One athlete per line or row. The name comes first; after it, separated by
 * commas, semicolons or tabs, can come their sex (W or M) and "60+" in any
 * order. Tabs are what a spreadsheet puts between cells, so rows copied
 * straight out of Excel or Google Sheets work too. Anything after the name that
 * is not recognised is ignored rather than refused, so a stray column does no
 * harm.
 *
 * A first row of column names — Name, Sex, 60+, Team, Division, in English or
 * Swedish — says which column is which instead, and is the only way to give a
 * team: a team name cannot be told apart from anything else by looking at it.
 * Everyone on rows with the same team name goes on one team.
 *
 * 60+ can come from its own column, from "60+" in the Division column (where
 * a box competition with no other divisions would put it), from an age, or
 * from a birth date: anyone turning 60 in the competition's year counts, the
 * way Swedish sport does age classes (Carin, 5 October 2026).
 */

/** Only woman and man: a fixed team's class (M/M, W/W, Mixed) comes from it. */
export type Gender = "WOMAN" | "MAN";

export type PastedAthlete = {
  name: string;
  gender: Gender | null;
  isSixtyPlus: boolean;
  /** Only filled when the cell matches one of the divisions it was given. */
  division: string | null;
  /** Only from a Team column; see the note at the top. */
  team: string | null;
};

// English and Swedish, since the lists will come from both.
const WOMAN = new Set(["w", "woman", "women", "f", "female", "k", "kvinna", "dam", "d"]);
const MAN = new Set(["m", "man", "men", "male", "herr", "h"]);
const SIXTY_PLUS = new Set(["60+", "60", "60 +", "sixty plus"]);
// What a 60+ column holds for someone who is: a tick of some sort.
const YES = new Set(["yes", "y", "ja", "j", "x", "true", "1", "✓", "✔"]);

/** Column names, lower case, for each thing a row can hold. */
const COLUMNS = {
  name: ["name", "namn", "athlete", "atlet", "deltagare", "full name", "fullständigt namn"],
  first: ["first name", "firstname", "förnamn"],
  last: ["last name", "lastname", "surname", "efternamn"],
  sex: ["sex", "gender", "kön", "w/m", "m/w", "k/m"],
  sixtyPlus: ["60+", "age", "ålder", "sixty plus", "masters"],
  born: [
    "birth date",
    "birthdate",
    "date of birth",
    "dob",
    "born",
    "birth year",
    "year of birth",
    "födelsedatum",
    "född",
    "födelseår",
  ],
  team: ["team", "lag", "team name", "lagnamn"],
  division: ["division", "klass", "class", "rx/scaled"],
} as const;

type Column = keyof typeof COLUMNS;

/** Which column holds what, if the first row is a row of column names. */
function readHeader(row: string[]): Partial<Record<Column, number>> | null {
  const found: Partial<Record<Column, number>> = {};
  row.forEach((cell, index) => {
    const lower = cell.toLowerCase().trim();
    for (const column of Object.keys(COLUMNS) as Column[]) {
      if (found[column] === undefined && (COLUMNS[column] as readonly string[]).includes(lower)) {
        found[column] = index;
      }
    }
  });
  const hasName = found.name !== undefined || found.first !== undefined;
  return hasName ? found : null;
}

function sexOf(cell: string): Gender | null {
  const lower = cell.toLowerCase();
  if (WOMAN.has(lower)) return "WOMAN";
  if (MAN.has(lower)) return "MAN";
  return null;
}

/** A 60+ column can hold a tick, "60+", or the athlete's age. */
function sixtyPlusOf(cell: string): boolean {
  const lower = cell.toLowerCase();
  if (SIXTY_PLUS.has(lower) || YES.has(lower)) return true;
  const age = Number(lower);
  return Number.isFinite(age) && age >= 60 && age < 130;
}

/** Turns 60 or more in `year`: a birth date in any common form, or a year. */
function sixtyPlusBorn(cell: string, year: number): boolean {
  const born = cell.match(/(19|20)\d{2}/);
  return born !== null && year - Number(born[0]) >= 60;
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Reads rows that are already split into cells: a spreadsheet's, or pasted
 * lines split on commas and tabs.
 */
export function parseAthleteRows(
  rows: string[][],
  divisions: string[] = [],
  /** The competition's year, for a birth date. */
  year = new Date().getFullYear(),
): PastedAthlete[] {
  const nonEmpty = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  const header = nonEmpty.length > 0 ? readHeader(nonEmpty[0]) : null;
  const body = header ? nonEmpty.slice(1) : nonEmpty;
  const divisionNamed = (cell: string) =>
    divisions.find((d) => d.toLowerCase() === cell.toLowerCase()) ?? null;

  const athletes: PastedAthlete[] = [];
  for (const raw of body) {
    const cells = raw.map((cell) => cell.trim());
    const at = (column: Column) => {
      const index = header?.[column];
      return index === undefined ? "" : (cells[index] ?? "");
    };

    const name = header
      ? tidy(at("name") || `${at("first")} ${at("last")}`)
      : tidy(cells[0] ?? "");
    if (name === "") continue;

    const athlete: PastedAthlete = {
      name,
      gender: null,
      isSixtyPlus: false,
      division: null,
      team: null,
    };

    if (header) {
      athlete.gender = sexOf(at("sex"));
      athlete.isSixtyPlus =
        sixtyPlusOf(at("sixtyPlus")) ||
        SIXTY_PLUS.has(at("division").toLowerCase()) ||
        sixtyPlusBorn(at("born"), year);
      athlete.division = divisionNamed(at("division"));
      athlete.team = tidy(at("team")) || null;
    }

    // Columns without a name it knows are still read for W/M, 60+ and a
    // division, the way a pasted line always has been.
    const known = new Set(header ? Object.values(header) : [0]);
    cells.forEach((cell, index) => {
      if (known.has(index) || cell === "") return;
      const lower = cell.toLowerCase();
      if (!athlete.gender && sexOf(cell)) athlete.gender = sexOf(cell);
      else if (SIXTY_PLUS.has(lower)) athlete.isSixtyPlus = true;
      else if (!athlete.division && divisionNamed(cell)) athlete.division = divisionNamed(cell);
    });

    athletes.push(athlete);
  }
  return athletes;
}

/** A pasted list: one athlete per line, cells split on commas, semicolons or tabs. */
export function parseAthleteList(
  raw: string,
  divisions: string[] = [],
  year = new Date().getFullYear(),
): PastedAthlete[] {
  return parseAthleteRows(
    raw.split(/\r?\n/).map((line) => line.split(/[\t,;]/)),
    divisions,
    year,
  );
}

/**
 * The list from "Upload a spreadsheet" as it was edited on the page, sent as
 * JSON in place of the file. It comes from the browser, so nothing in it is
 * trusted: anything not a proper row is dropped, a division must be one of
 * those given, and the names are tidied as a pasted one would be.
 */
export function editedRows(json: string, divisions: string[] = []): PastedAthlete[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const textOf = (value: unknown) => (typeof value === "string" ? tidy(value).slice(0, 200) : "");
  return data.slice(0, 2000).flatMap((row): PastedAthlete[] => {
    if (typeof row !== "object" || row === null) return [];
    const { name, gender, isSixtyPlus, division, team } = row as Record<string, unknown>;
    const athlete: PastedAthlete = {
      name: textOf(name),
      gender: gender === "WOMAN" || gender === "MAN" ? gender : null,
      isSixtyPlus: isSixtyPlus === true,
      division: divisions.find((d) => d === division) ?? null,
      team: textOf(team) || null,
    };
    return athlete.name === "" ? [] : [athlete];
  });
}

/**
 * Splits a CSV file into rows of cells.
 *
 * Swedish Excel saves CSV with semicolons, because the comma is its decimal
 * point, so whichever of the two the first line has more of is the one used.
 * A cell in double quotes may hold the separator, a line break, or "" for a
 * quote mark, as the CSV format allows.
 */
export function parseCsv(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const count = (char: string) => firstLine.split(char).length - 1;
  const separator = count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Leaves out anyone already signed up, and anyone listed twice in the paste,
 * so pasting the same list a second time adds nobody. Names are compared
 * ignoring capitals and extra spaces.
 */
export function withoutDuplicates(
  pasted: PastedAthlete[],
  existingNames: string[],
): { toAdd: PastedAthlete[]; skipped: number } {
  const key = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(existingNames.map(key));
  const toAdd: PastedAthlete[] = [];
  for (const athlete of pasted) {
    if (seen.has(key(athlete.name))) continue;
    seen.add(key(athlete.name));
    toAdd.push(athlete);
  }
  return { toAdd, skipped: pasted.length - toAdd.length };
}
