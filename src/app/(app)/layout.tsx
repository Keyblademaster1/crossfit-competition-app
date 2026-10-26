import type { Metadata } from "next";
import Link from "next/link";
import { currentUser, isAdmin, lookingAsClubId } from "@/lib/access";
import { logOut } from "@/lib/auth-actions";
import { clubTheme } from "@/lib/club-theme";
import { themeVariables } from "@/lib/theme";
import { BrandHeader } from "@/components/brand-header";

export async function generateMetadata(): Promise<Metadata> {
  const theme = await clubTheme(await lookingAsClubId());
  return { title: `${theme.name} — competition scoring` };
}

/** Everything an organiser sees, in their own club's look. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, theme] = await Promise.all([currentUser(), lookingAsClubId().then(clubTheme)]);

  return (
    <div className="flex flex-1 flex-col" style={themeVariables(theme) as React.CSSProperties}>
      <BrandHeader theme={theme} home="/">
        {user && (
          <form action={logOut} className="ml-auto flex shrink-0 items-center gap-4">
            {user.club && (
              <Link href="/club" className="text-[15px] font-semibold text-ink underline">
                Club settings
              </Link>
            )}
            {isAdmin(user) && (
              <Link href="/admin" className="text-[15px] font-semibold text-ink underline">
                Usage
              </Link>
            )}
            <button type="submit" className="text-[15px] font-semibold text-ink underline">
              Log out
            </button>
          </form>
        )}
      </BrandHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
