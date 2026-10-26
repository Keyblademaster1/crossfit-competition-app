/**
 * Checking what a club sends from Club settings: colours and logo files.
 * Kept apart from the action so they can be tested on their own.
 */

/** "#3f512c", lower-cased, or null if it is not a six-digit colour. */
export function readColour(raw: string): string | null {
  const colour = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(colour) ? colour : null;
}

/**
 * The image type of a logo file, judged from its first bytes rather than
 * from its name or what the browser says, or null if it is not a PNG, JPEG
 * or WebP. SVG is left out on purpose: it can carry a script.
 */
export function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
