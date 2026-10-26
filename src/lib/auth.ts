import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

/**
 * Logins, done by Better Auth: free, open source, and keeping its accounts in
 * our own database.
 *
 * People log in with their Google account and nothing else, so the app never
 * holds a password: there is none to leak, to forget or to reset, and Google
 * has already checked that the email address is theirs. Google charges
 * nothing for this and needs no payment card.
 *
 * Someone logging in for the first time has no club yet. They are asked to
 * name one (src/app/welcome), and become its first organiser.
 *
 * Of Better Auth's own web addresses, only the one Google sends people back
 * to is switched on (src/app/api/auth/callback). Everything else goes
 * through the app's own actions (auth-actions.ts), and an address nothing
 * uses is only one more way in.
 *
 * On a laptop running offline there are no logins at all (LOGINS=off, set by
 * the local scripts), and none of this is used.
 */

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Whether this copy has been given its codes from Google. */
export const googleReady = Boolean(clientId && clientSecret);

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  // Where this copy of the app lives, so Google knows where to send people
  // back to. Netlify is given the site's own address.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  socialProviders: googleReady ? { google: { clientId: clientId!, clientSecret: clientSecret! } } : {},
  user: {
    additionalFields: {
      // Set only by the welcome step, never from anything a browser sends.
      clubId: { type: "string", required: false, input: false },
    },
  },
  // If Google sends someone back with a problem, they land on the login page
  // with a short code saying what, instead of on a bare error page.
  onAPIError: { errorURL: "/login" },
  // Must come last: lets the app's actions set the login cookie.
  plugins: [nextCookies()],
});

/** Logins are on everywhere except a laptop running offline. */
export const loginsOn = process.env.LOGINS !== "off";
