import type { Metadata } from "next";
import { db } from "@/lib/db";
import { sharedCompetition } from "@/lib/access";
import { clubTheme } from "@/lib/club-theme";
import { themeVariables } from "@/lib/theme";
import { BrandHeader } from "@/components/brand-header";

async function sharedTheme(code: string) {
  const id = await sharedCompetition(code);
  const { clubId } = await db.competition.findUniqueOrThrow({ where: { id }, select: { clubId: true } });
  return clubTheme(clubId);
}

export async function generateMetadata({ params }: LayoutProps<"/share/[code]">): Promise<Metadata> {
  const theme = await sharedTheme((await params).code);
  return { title: `${theme.name} — competition scoring` };
}

/**
 * Pages seen through a share link, in the look of the club that owns the
 * competition, whoever is watching.
 */
export default async function SharedLayout({ children, params }: LayoutProps<"/share/[code]">) {
  const theme = await sharedTheme((await params).code);

  return (
    <div className="flex flex-1 flex-col" style={themeVariables(theme) as React.CSSProperties}>
      <BrandHeader theme={theme} home={null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
