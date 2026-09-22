import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadTheme } from "@/lib/theme";
import { loadResults, sectionsFrom, SECTIONS, type ResultsTable } from "@/lib/results";
import { PrintButton } from "@/components/print-button";

/**
 * Results and export, from Results.dc.html.
 *
 * The organiser picks what goes in, sees exactly what will come out, and then
 * either prints it or takes it away as a file. The preview is not a picture of
 * the document: it is the document, laid out on sheets, and printing hides
 * everything around it rather than rendering it again. That way the thing on
 * screen and the thing on paper cannot drift apart.
 */

export const dynamic = "force-dynamic";

/** The formats on offer, and how far each of them actually works. */
const FORMATS = [
  {
    id: "print",
    chip: "PDF",
    chipBg: "#231f20",
    label: "Print or save as PDF",
    desc: "A4, ready for the wall",
    cta: "Print results",
  },
  {
    id: "csv",
    chip: "CSV",
    chipBg: "#1f6b3a",
    label: "Spreadsheet",
    desc: "Opens in Excel, Numbers or Sheets",
    cta: "Download the spreadsheet",
  },
] as const;

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const asked = await searchParams;

  const competition = await db.competition.findUnique({ where: { id } });
  if (!competition) notFound();

  const theme = loadTheme();
  const chosen = sectionsFrom(asked);
  const document = await loadResults(id, chosen);
  const format = FORMATS.find((f) => f.id === asked.format) ?? FORMATS[0];

  // Keeping the current choices on every link means changing one thing does
  // not quietly reset the others.
  const query = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const section of SECTIONS) {
      next.set(section.id, chosen.includes(section.id) ? "1" : "0");
    }
    next.set("format", format.id);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    return `?${next.toString()}`;
  };

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-57px)] print:m-0 print:block">
      <aside className="flex w-[420px] shrink-0 flex-col gap-6 border-r border-line bg-card p-8 print:hidden">
        <Link
          href={`/competitions/${id}`}
          className="flex h-8 items-center text-[14px] font-semibold text-muted hover:underline"
        >
          ← {competition.name}
        </Link>

        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[40px] font-bold uppercase leading-none">
            Results &amp; export
          </h1>
          <p className="text-[16px] text-muted">
            {document.tables.length} {document.tables.length === 1 ? "sheet" : "sheets"}
            {document.occasion ? ` · ${document.occasion}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold tracking-[.02em] text-muted">Include</span>
          {SECTIONS.map((section) => {
            const on = chosen.includes(section.id);
            return (
              <Link
                key={section.id}
                href={query({ [section.id]: on ? "0" : "1" })}
                aria-label={`${on ? "Leave out" : "Include"} ${section.label.toLowerCase()}`}
                className="flex min-h-11 items-center gap-3 text-[16px] font-medium"
              >
                {/* A link dressed as a checkbox, so the preview reloads with
                    no JavaScript at all — the same trick the wizard uses. */}
                <span
                  aria-hidden
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border-2"
                  style={{
                    borderColor: on ? "var(--brand-primary)" : "#CEC8BA",
                    background: on ? "var(--brand-primary)" : "transparent",
                    color: "#fff",
                  }}
                >
                  {on && (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path
                        d="M2.5 7l3 3 5-6.5"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span>{section.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold tracking-[.02em] text-muted">Export as</span>
          {FORMATS.map((option) => (
            <Link
              key={option.id}
              href={query({ format: option.id })}
              className="flex h-14 items-center gap-3.5 rounded-[10px] border-2 bg-card px-4"
              style={{
                borderColor: option.id === format.id ? "var(--brand-primary)" : "var(--line)",
              }}
            >
              <span
                className="font-display flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-[14px] font-bold text-white"
                style={{ background: option.chipBg }}
              >
                {option.chip}
              </span>
              <span className="flex flex-col">
                <span className="text-[16px] font-semibold">{option.label}</span>
                <span className="text-[13px] text-muted">{option.desc}</span>
              </span>
            </Link>
          ))}
          <p className="text-[13px] leading-snug text-muted">
            Straight into Google Sheets or Docs would need the app to sign in to
            your Google account, which it cannot do yet. The spreadsheet opens
            in Sheets from your Drive in the meantime.
          </p>
        </div>

        <div className="mt-auto">
          {format.id === "print" ? (
            <PrintButton>{format.cta}</PrintButton>
          ) : (
            <a
              href={`/competitions/${id}/results/export${query({})}`}
              className="flex h-13 items-center justify-center rounded-lg text-[16px] font-semibold text-white"
              style={{ background: "var(--brand-primary)", height: 52 }}
            >
              {format.cta}
            </a>
          )}
        </div>
      </aside>

      <main className="flex flex-1 justify-center overflow-hidden p-8 print:block print:overflow-visible print:p-0">
        <div className="flex flex-col gap-8 print:gap-0">
          {document.tables.length === 0 ? (
            <p className="text-[15px] text-muted">
              Nothing chosen, so there is nothing to print. Tick something on the
              left.
            </p>
          ) : (
            document.tables.map((table, index) => (
              <Sheet
                key={`${table.title}-${index}`}
                table={table}
                document={document}
                logo={theme.logoLight}
                brand={theme.name}
                page={index + 1}
                pages={document.tables.length}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

/** One printed page: the heading, one table, and the rules at the foot. */
function Sheet({
  table,
  document,
  logo,
  brand,
  page,
  pages,
}: {
  table: ResultsTable;
  document: { name: string; occasion: string; note: string };
  logo: string | null;
  brand: string;
  page: number;
  pages: number;
}) {
  const right = new Set(table.rightAlign ?? []);

  return (
    <div
      className="flex w-[560px] flex-col gap-4 bg-card p-10 shadow-[0_2px_14px_rgba(35,31,32,.14)] print:w-full print:shadow-none"
      // One table to a page, so a sheet is never cut in half.
      style={{ breakAfter: "page", minHeight: 792 }}
    >
      <div className="flex items-start justify-between gap-4">
        {logo ? (
          <Image src={logo} alt={brand} width={200} height={56} unoptimized className="h-14 w-auto" />
        ) : (
          <span aria-hidden className="h-14 w-2 rounded-sm" style={{ background: "var(--brand-primary)" }} />
        )}
        <div className="flex flex-col items-end">
          <span className="font-display text-[22px] font-bold uppercase leading-tight">
            {document.name}
          </span>
          <span className="text-[12px] text-muted">{document.occasion}</span>
        </div>
      </div>

      <div className="h-[3px]" style={{ background: "var(--brand-secondary)" }} />

      <div className="flex flex-col gap-0.5">
        <span className="font-display text-[18px] font-bold uppercase leading-none">
          {table.title}
        </span>
        {table.subtitle && <span className="text-[12px] text-muted">{table.subtitle}</span>}
      </div>

      {/* A real table, so every column lines up with its heading however
          wide the widest result in it turns out to be. */}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-ink text-[11px] font-bold uppercase tracking-[.05em] text-muted">
            {table.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                // The name column takes whatever the others leave.
                className={`whitespace-nowrap px-2 py-1.5 font-bold first:pl-0 last:pr-0 ${
                  right.has(index) ? "text-right" : "text-left"
                } ${index === 1 ? "w-full" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line align-baseline">
              {row.map((value, index) => (
                <td
                  key={index}
                  className={[
                    "px-2 py-[7px] first:pl-0 last:pr-0",
                    right.has(index) ? "num whitespace-nowrap text-right" : "",
                    index === 0 ? "font-display text-[16px] font-bold" : "",
                    index === 1 ? "font-semibold" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    // The podium in the brand colour, as on the leaderboard.
                    index === 0 && Number(value) >= 1 && Number(value) <= 3
                      ? { color: "var(--brand-primary)" }
                      : undefined
                  }
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length === 0 && (
        <span className="text-[13px] text-muted">Nothing here yet.</span>
      )}

      <div className="mt-auto flex flex-col gap-1 pt-4 text-[11px] text-muted">
        {table.legend?.map((line) => <span key={line}>{line}</span>)}
        <span>
          {document.note} · Page {page} of {pages}.
        </span>
      </div>
    </div>
  );
}
