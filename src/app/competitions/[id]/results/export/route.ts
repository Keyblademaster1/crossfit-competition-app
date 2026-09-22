import { loadResults, sectionsFrom } from "@/lib/results";

/**
 * The results as a spreadsheet.
 *
 * Comma-separated values rather than a real Excel file: every spreadsheet
 * opens it, including Excel, Numbers and Google Sheets, and it needs nothing
 * added to the app to produce. The cost is that it is one sheet rather than a
 * tab per event, so the tables are stacked with a blank line between them.
 *
 * A plain link, so it works with no JavaScript at all.
 */

export const dynamic = "force-dynamic";

/**
 * One value, safe to sit in a CSV.
 *
 * Anything holding a comma, a quote or a line break has to be quoted, and a
 * quote inside it doubled. A name like `O'Brien, Jr "Bo"` breaks a file that
 * does not do this.
 */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(values: string[]): string {
  return values.map(cell).join(",");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asked = Object.fromEntries(new URL(request.url).searchParams);
  const document = await loadResults(id, sectionsFrom(asked));

  const lines: string[] = [row([document.name]), row([document.occasion]), ""];

  for (const table of document.tables) {
    lines.push(row([table.title]));
    if (table.subtitle) lines.push(row([table.subtitle]));
    lines.push(row(table.columns));
    for (const line of table.rows) lines.push(row(line));
    for (const note of table.legend ?? []) lines.push(row([note]));
    lines.push("");
  }
  lines.push(row([document.note]));

  // A byte order mark, so Excel opens it as UTF-8 and Åberg keeps its Å.
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const filename = `${document.name.replace(/[^\w\s-]/g, "").trim() || "results"}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
