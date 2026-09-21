/**
 * Branding.
 *
 * The app ships with a plain red-and-black look and no logo, so the public
 * repository carries nothing that belongs to a particular gym. A real brand is
 * applied on the machine that runs it, by setting the BRAND_* values in
 * .env.local and dropping logo files into public/brand/. Git ignores both.
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
 * The look anyone gets by checking out this repository. Deliberately
 * unbranded: a strong red against near-black.
 */
export const genericTheme: Theme = {
  name: "Box Competition",
  primary: "#c62828",
  // Blue, not another red. The big screens paint second and third place in
  // this colour, and a second red is hard to tell from the leader's row at
  // any distance. Darkened from the design's 20 kg plate blue so the leader
  // still stands out as the brightest row on the board.
  secondary: "#1a4780",
  screenBackground: "#141312",
  logoLight: null,
  logoDark: null,
};

/** Reads the brand from the environment, falling back to the generic look. */
export function loadTheme(): Theme {
  return {
    name: process.env.BRAND_NAME || genericTheme.name,
    primary: process.env.BRAND_PRIMARY || genericTheme.primary,
    secondary: process.env.BRAND_SECONDARY || genericTheme.secondary,
    screenBackground:
      process.env.BRAND_SCREEN_BACKGROUND || genericTheme.screenBackground,
    logoLight: process.env.BRAND_LOGO_LIGHT || genericTheme.logoLight,
    logoDark: process.env.BRAND_LOGO_DARK || genericTheme.logoDark,
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
