/**
 * Loading a barbell.
 *
 * Given a total weight, work out which plates go on each side. Shown on the
 * heats screen so whoever sets the floor up can see at a glance what each lane
 * needs, and so nobody has to do the arithmetic while a heat is waiting.
 *
 * Plates go on in the usual order, heaviest first, which is both how it is
 * done and how you end up with the fewest plates.
 */

/** Plate weights in kilos, heaviest first, with the colours they are made in. */
export const PLATES = [
  { kg: 25, colour: "#C62828", width: 16, height: 60 },
  { kg: 20, colour: "#1E56A0", width: 14, height: 60 },
  { kg: 15, colour: "#F2C230", width: 12, height: 60 },
  { kg: 10, colour: "#2E7D32", width: 10, height: 60 },
  { kg: 5, colour: "#1B1B1B", width: 8, height: 60 },
  { kg: 2.5, colour: "#EF7B6B", width: 7, height: 32 },
  { kg: 1.25, colour: "#9CCC65", width: 6, height: 26 },
] as const;

export const MENS_BAR = 20;
export const WOMENS_BAR = 15;

export interface Loading {
  /** The bar being loaded, in kilos. */
  bar: number;
  /** Plates for one side, heaviest first. Both sides are the same. */
  perSide: number[];
  /**
   * What could not be made up with the plates available, in kilos. Anything
   * other than zero means the total cannot actually be loaded.
   */
  shortBy: number;
}

/**
 * Works out the plates for one side of a bar.
 *
 * A total below the bar's own weight cannot be loaded at all, which is worth
 * saying rather than quietly showing an empty bar.
 */
export function loadBar(totalKg: number, bar: number = MENS_BAR): Loading {
  if (totalKg < bar) {
    return { bar, perSide: [], shortBy: Math.round((totalKg - bar) * 100) / 100 };
  }

  // Work in grams so the halving and subtracting stay exact. A quarter of a
  // kilo cannot be represented properly as a decimal, and the rounding error
  // would show up as a bar that is short by 0.0000001 kg.
  let remainingGrams = Math.round(((totalKg - bar) / 2) * 1000);
  const perSide: number[] = [];

  for (const plate of PLATES) {
    const plateGrams = Math.round(plate.kg * 1000);
    while (remainingGrams >= plateGrams) {
      perSide.push(plate.kg);
      remainingGrams -= plateGrams;
    }
  }

  // Whatever is left over is missing from both sides.
  return { bar, perSide, shortBy: Math.round((remainingGrams * 2) / 10) / 100 };
}

/** The bar someone lifts, given how they are recorded. */
export function barFor(gender: string | null | undefined): number {
  return gender === "WOMAN" ? WOMENS_BAR : MENS_BAR;
}

/** "42.5 kg" → 42.5. Loads are written by hand, so this has to be forgiving. */
export function readKilos(load: string | null | undefined): number | null {
  if (!load) return null;
  const match = load.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
