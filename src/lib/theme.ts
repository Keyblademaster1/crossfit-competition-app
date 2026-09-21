/**
 * Branding.
 *
 * The colours below ship with the app. Logo files do not: they live in
 * public/brand/, which git ignores, and are pointed at by BRAND_LOGO_* in
 * .env.local. Every BRAND_* value can be overridden the same way, so the app
 * can be rebranded without touching the code.
 *
 * Only the brand layer is swappable. The neutral surfaces — paper, card,
 * border, ink — are part of the design itself and live in globals.css.
 */

export interface Theme {
  /** Shown beside the logo, or on its own when there is no logo. */
  name: string;
  /** Buttons, the leader row, the LIVE badge. */
  primary: string;
  /** Second and third place, and secondary labels. */
  secondary: string;
  /** Background of the big screens shown on a TV. */
  screenBackground: string;
  /** Optional logo for light screens. Null means show the name as text. */
  logoLight: string | null;
  /** Optional logo for the dark big screens. */
  logoDark: string | null;
}

/**
 * The look anyone gets by checking out this repository: Holger's colours,
 * sampled from their logo and used with their permission.
 *
 * The logo files themselves are deliberately not in the repository. They live
 * in public/brand/, which git ignores, and are pointed at by BRAND_LOGO_* in
 * .env.local. Without them the header shows a coloured bar and the name as
 * text, which is why nothing breaks when they are missing.
 *
 * Every value here can be overridden by a BRAND_* environment variable, so the
 * app can be rebranded without touching the code.
 */
export const defaultTheme: Theme = {
  name: "Holger Functional Fitness",
  /** Buttons, the leader's row, the LIVE badge. */
  primary: "#3f512c",
  /** Second and third place, and the Scaled division. */
  secondary: "#684024",
  /** Background of the big screens shown on a TV. */
  screenBackground: "#231f20",
  logoLight: null,
  logoDark: null,
};

/** Reads the brand from the environment, falling back to the default. */
export function loadTheme(): Theme {
  return {
    name: process.env.BRAND_NAME || defaultTheme.name,
    primary: process.env.BRAND_PRIMARY || defaultTheme.primary,
    secondary: process.env.BRAND_SECONDARY || defaultTheme.secondary,
    screenBackground:
      process.env.BRAND_SCREEN_BACKGROUND || defaultTheme.screenBackground,
    logoLight: process.env.BRAND_LOGO_LIGHT || defaultTheme.logoLight,
    logoDark: process.env.BRAND_LOGO_DARK || defaultTheme.logoDark,
  };
}

/**
 * Turns the theme into CSS variables, so components can refer to
 * `var(--brand-primary)` and never know which brand is loaded.
 */
export function themeVariables(theme: Theme): Record<string, string> {
  return {
    "--brand-primary": theme.primary,
    "--brand-secondary": theme.secondary,
    "--brand-screen-bg": theme.screenBackground,
  };
}
