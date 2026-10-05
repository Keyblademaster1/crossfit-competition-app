import { readSheet } from "read-excel-file/universal";
import { parseCsv } from "@/lib/athlete-list";

/**
 * An uploaded spreadsheet as rows of text, or a sentence saying why it could
 * not be read.
 *
 * Excel's .xlsx and CSV are read. Those two cover every program: Google
 * Sheets, Numbers and LibreOffice all save both. The older .xls and Numbers'
 * own format are not, and saying "save it as .xlsx" beats a garbled list.
 * Only the first sheet in a workbook is read.
 */
export async function readSpreadsheet(file: File): Promise<string[][] | string> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
      return parseCsv(await file.text());
    }
    if (name.endsWith(".xlsx")) {
      const rows = await readSheet(file);
      return rows.map((row) => row.map(cellText));
    }
  } catch {
    return `Could not read ${file.name}. Save it again as .xlsx or .csv and try once more.`;
  }
  return `${file.name} is not a spreadsheet the app can read. Save it as .xlsx or .csv first.`;
}

/** A cell as the text it shows: Excel keeps an age as a number, say. */
function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell);
}
