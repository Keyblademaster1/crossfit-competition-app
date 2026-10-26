import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Stardos_Stencil } from "next/font/google";
import { loadTheme, themeVariables } from "@/lib/theme";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
const stardos = Stardos_Stencil({
  variable: "--font-stardos",
  subsets: ["latin"],
  weight: ["700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const theme = loadTheme();
  return {
    title: `${theme.name} — competition scoring`,
    description: "Scores, standings and team draws for a box competition.",
  };
}

/**
 * The page around everything. The header lives one level in, because whose
 * look it wears depends on the page: the logged-in club's in (app), the
 * club that owns the competition on a share link (share/[code]).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The app's own look, until a club's own takes over further in.
      style={themeVariables(loadTheme()) as React.CSSProperties}
      className={`${barlow.variable} ${barlowCondensed.variable} ${stardos.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
