"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { text } from "@/lib/form-input";

/**
 * Signing up, logging in and logging out.
 *
 * Each goes through Better Auth (auth.ts), which checks the password, keeps
 * only a hash of it, and sets the login cookie. When something is wrong the
 * form comes back with a short code saying what, and with what was typed
 * except the password, which never goes in an address.
 */

/** Better Auth's code for what went wrong, or null if it was something else. */
function failure(error: unknown): string | null {
  if (!isAPIError(error)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

function back(path: string, error: string, keep: Record<string, string>): never {
  const query = new URLSearchParams({ error, ...keep });
  redirect(`${path}?${query}`);
}

export async function signUp(formData: FormData) {
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const clubName = text(formData, "clubName");
  const password = String(formData.get("password") ?? "");
  const keep = { name, email, clubName };

  if (name === "" || email === "" || clubName === "") back("/signup", "MISSING", keep);
  if (password.length < 8) back("/signup", "PASSWORD_TOO_SHORT", keep);

  // clubName is not one of Better Auth's own fields. It is passed along with
  // them and read by the step in auth.ts that makes the club.
  const body = { name, email, password, clubName };
  let code: string | null = null;
  try {
    await auth.api.signUpEmail({ body, headers: await headers() });
  } catch (error) {
    code = failure(error);
    if (code === null) throw error;
  }
  if (code) back("/signup", code, keep);
  redirect("/");
}

export async function logIn(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (email === "" || password === "") back("/login", "MISSING", { email });

  let code: string | null = null;
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    code = failure(error);
    if (code === null) throw error;
  }
  if (code) back("/login", code, { email });
  redirect("/");
}

export async function logOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
