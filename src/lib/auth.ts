import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

/**
 * Logins, done by Better Auth: free, open source, and keeping its accounts in
 * our own database, so it needs no outside service and costs nothing.
 *
 * Signing up makes a club as well as an account: the person who signs up is
 * the first organiser of a new club, named on the form. Nobody can choose an
 * existing club to join by sending its id, because clubId is never taken from
 * what a form sends (input: false); it is only ever set below.
 *
 * Better Auth can also answer requests at its own web address, but that is
 * not switched on: the app signs people up and in through its own forms
 * (auth-actions.ts), and an address nothing uses is only one more way in.
 *
 * On a laptop running offline there are no logins at all (LOGINS=off, set by
 * the local scripts), and none of this is used.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      // Not "required" here, because Better Auth checks required fields before
      // the step below fills this one in. The database still refuses an
      // account without a club, and that step never makes one without.
      clubId: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every new account starts its own club, named on the sign-up form.
        before: async (user, context) => {
          const body = context?.body as { clubName?: unknown } | undefined;
          const clubName = typeof body?.clubName === "string" ? body.clubName.trim() : "";
          if (clubName === "") return false;
          const club = await db.club.create({ data: { name: clubName } });
          return { data: { ...user, clubId: club.id } };
        },
      },
    },
  },
  // Must come last: lets the forms' actions set the login cookie.
  plugins: [nextCookies()],
});

/** Logins are on everywhere except a laptop running offline. */
export const loginsOn = process.env.LOGINS !== "off";
