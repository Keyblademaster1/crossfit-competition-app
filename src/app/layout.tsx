import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Stardos_Stencil } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { loadTheme, themeVariables } from "@/lib/theme";
import { currentUser } from "@/lib/access";
import { logOut } from "@/lib/auth-actions";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = loadTheme();
  const user = await currentUser();

  return (
    <html
      lang="en"
      // The resolved brand is handed to CSS here and nowhere else, so every
      // component can just use var(--brand-primary).
      style={themeVariables(theme) as React.CSSProperties}
      className={`${barlow.variable} ${barlowCondensed.variable} ${stardos.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              {theme.logoLight ? (
                <Image
                  src={theme.logoLight}
                  alt={theme.name}
                  width={160}
                  height={40}
                  className="h-9 w-auto"
                  unoptimized
                />
              ) : (
                <span
                  aria-hidden
                  className="h-7 w-2 rounded-sm"
                  style={{ background: "var(--brand-primary)" }}
                />
              )}
              <span className="font-display text-xl font-bold uppercase tracking-wide">
                {theme.name}
              </span>
            </Link>
            {user && (
              <form action={logOut} className="ml-auto flex items-center gap-4">
                <span className="text-[15px] text-muted">{user.club?.name ?? user.name}</span>
                <button type="submit" className="text-[15px] font-semibold text-ink underline">
                  Log out
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
