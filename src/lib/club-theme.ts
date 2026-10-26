import { cache } from "react";
import { db } from "@/lib/db";
import { loadTheme, type Theme } from "@/lib/theme";

/**
 * A club's look: its name, and the colours and logos it chose in Club
 * settings. Anything it has not chosen falls back to the app's own look
 * (loadTheme), so a club that never opens its settings looks like the
 * built-in app, not broken.
 *
 * With no club (someone not logged in, on the login page), the app's own.
 *
 * Remembered for the rest of the request, since a page and its layout both
 * ask.
 */
export const clubTheme = cache(async (clubId: string | null): Promise<Theme> => {
  const fallback = loadTheme();
  if (!clubId) return fallback;
  const club = await db.club.findUnique({
    where: { id: clubId },
    // Never the logos themselves here: only whether there are any.
    select: {
      id: true,
      name: true,
      primaryColor: true,
      secondaryColor: true,
      logoLightType: true,
      logoDarkType: true,
      logoUpdatedAt: true,
    },
  });
  if (!club) return fallback;

  // The time it changed goes on the end, so a new logo is fetched afresh
  // rather than the browser's copy of the old one being shown.
  const version = club.logoUpdatedAt?.getTime() ?? 0;
  const logo = (kind: "light" | "dark") => `/club-logo/${club.id}/${kind}?v=${version}`;

  return {
    name: club.name,
    primary: club.primaryColor ?? fallback.primary,
    secondary: club.secondaryColor ?? fallback.secondary,
    screenBackground: fallback.screenBackground,
    logoLight: club.logoLightType ? logo("light") : fallback.logoLight,
    // The TV screens are dark. With no logo made for them, the club's name
    // shows there as text instead, rather than a light logo that may vanish.
    logoDark: club.logoDarkType ? logo("dark") : club.logoLightType ? null : fallback.logoDark,
  };
});
