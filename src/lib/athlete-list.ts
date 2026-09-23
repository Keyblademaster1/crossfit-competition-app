/**
 * Reading a pasted list of athletes.
 *
 * One athlete per line. The name comes first; after it, separated by commas,
 * semicolons or tabs, can come their sex (W or M) and "60+" in any order. Tabs are what a
 * spreadsheet puts between cells, so rows copied straight out of Excel or
 * Google Sheets work too. Anything after the name that is not recognised is
 * ignored rather than refused, so a stray column does no harm.
 */

/** Only woman and man: a fixed team's class (M/M, W/W, Mixed) comes from it. */
export type Gender = "WOMAN" | "MAN";

export type PastedAthlete = {
  name: string;
  gender: Gender | null;
  isSixtyPlus: boolean;
  /** Only filled when the cell matches one of the divisions it was given. */
  division: string | null;
};

// English and Swedish, since the lists will come from both.
const WOMAN = new Set(["w", "woman", "women", "f", "female", "k", "kvinna", "dam", "d"]);
const MAN = new Set(["m", "man", "men", "male", "herr", "h"]);
const SIXTY_PLUS = new Set(["60+", "60", "60 +", "sixty plus"]);
const HEADER_NAMES = new Set(["name", "namn", "athlete", "atlet"]);

export function parseAthleteList(
  raw: string,
  divisions: string[] = [],
): PastedAthlete[] {
  const athletes: PastedAthlete[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cells = line.split(/[\t,;]/).map((cell) => cell.trim());
    const name = cells[0].replace(/\s+/g, " ");
    if (name === "" || HEADER_NAMES.has(name.toLowerCase())) continue;

    const athlete: PastedAthlete = { name, gender: null, isSixtyPlus: false, division: null };
    for (const cell of cells.slice(1)) {
      const lower = cell.toLowerCase();
      if (WOMAN.has(lower)) athlete.gender = "WOMAN";
      else if (MAN.has(lower)) athlete.gender = "MAN";
      else if (SIXTY_PLUS.has(lower)) athlete.isSixtyPlus = true;
      else {
        const division = divisions.find((d) => d.toLowerCase() === lower);
        if (division) athlete.division = division;
      }
    }
    athletes.push(athlete);
  }
  return athletes;
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
