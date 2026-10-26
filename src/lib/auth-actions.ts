"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { text } from "@/lib/form-input";

/**
 * Logging in with Google, naming a new club, and logging out.
 */

/** Sends the browser to Google, which sends it back logged in. */
export async function logInWithGoogle() {
  const { url } = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: "/", errorCallbackURL: "/login" },
    headers: await headers(),
  });
  if (!url) redirect("/login?error=GOOGLE");
  redirect(url);
}

/**
 * Makes a club for someone logged in who does not have one yet, with them as
 * its first organiser. Someone who already has a club cannot make another or
 * move to one, so this only ever runs once per person.
 */
export async function startClub(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.club) redirect("/");

  const name = text(formData, "clubName");
  if (name === "") redirect("/welcome?error=MISSING");

  await db.$transaction(async (tx) => {
    const club = await tx.club.create({ data: { name } });
    // Only if they still have no club, so two clicks at once cannot give
    // them two. The second finds the first already done and undoes itself.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, clubId: null },
      data: { clubId: club.id },
    });
    if (count === 0) await tx.club.delete({ where: { id: club.id } });
  });
  // The header, which shows the club's name, is drawn by the layout, and the
  // layout is kept from page to page unless told it has changed.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function logOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
