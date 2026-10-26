import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, isAdmin, lookingAsClubId } from "@/lib/access";
import { logOut } from "@/lib/auth-actions";
import { loginsOn } from "@/lib/auth";
import { clubTheme } from "@/lib/club-theme";
import { themeVariables } from "@/lib/theme";
import { BrandHeader } from "@/components/brand-header";

export async function generateMetadata(): Promise<Metadata> {
  const theme = await clubTheme(await lookingAsClubId());
  return { title: `${theme.name} — competition scoring` };
}

/**
 * Everything an organiser sees, in their own club's look.
 *
 * The header's links are not prefetched. Next.js would otherwise load each of
 * those pages in the background after every click, in case it came next, and
 * every one of them asks the database who is logged in and what their club
 * looks like: about three times the work of the click itself, on every click.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, theme] = await Promise.all([currentUser(), lookingAsClubId().then(clubTheme)]);

  return (
    <div className="flex flex-1 flex-col" style={themeVariables(theme) as React.CSSProperties}>
      <BrandHeader theme={theme} home="/">
        {user && (
          <form action={logOut} className="ml-auto flex shrink-0 items-center gap-4">
            {user.club && (
              <Link href="/club" prefetch={false} className="text-[15px] font-semibold text-ink underline">
                Club settings
              </Link>
            )}
            {isAdmin(user) && (
              <Link href="/admin" prefetch={false} className="text-[15px] font-semibold text-ink underline">
                Usage
              </Link>
            )}
            <button type="submit" className="text-[15px] font-semibold text-ink underline">
              Log out
            </button>
          </form>
        )}
        {/* On a laptop running offline nobody logs in, but its club still has settings. */}
        {!loginsOn && (
          <Link href="/club" prefetch={false} className="ml-auto shrink-0 text-[15px] font-semibold text-ink underline">
            Club settings
          </Link>
        )}
      </BrandHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
