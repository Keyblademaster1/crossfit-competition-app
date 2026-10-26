"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { currentClubId } from "@/lib/access";
import { db } from "@/lib/db";
import { text } from "@/lib/form-input";
import { LIMITS } from "@/lib/limits";
import { imageType, readColour } from "@/lib/club-look";

/**
 * Saves Club settings: the club's name, colours and logos. Only ever the
 * club of whoever is logged in, whatever the form says.
 */
export async function saveClubSettings(formData: FormData) {
  const clubId = await currentClubId();

  const name = text(formData, "name");
  if (name === "") redirect("/club?error=NAME");
  const data: Prisma.ClubUpdateInput = { name };

  if (formData.get("builtInColours") === "on") {
    data.primaryColor = null;
    data.secondaryColor = null;
  } else {
    const primary = readColour(text(formData, "primaryColor"));
    const secondary = readColour(text(formData, "secondaryColor"));
    if (!primary || !secondary) redirect("/club?error=COLOUR");
    data.primaryColor = primary;
    data.secondaryColor = secondary;
  }

  for (const kind of ["light", "dark"] as const) {
    const bytesField = kind === "light" ? "logoLight" : "logoDark";
    const typeField = kind === "light" ? "logoLightType" : "logoDarkType";
    const file = formData.get(`${bytesField}File`);

    if (formData.get(`${bytesField}Remove`) === "on") {
      data[bytesField] = null;
      data[typeField] = null;
      data.logoUpdatedAt = new Date();
    } else if (file instanceof File && file.size > 0) {
      if (file.size > LIMITS.logoBytes) redirect("/club?error=TOO_BIG");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageType(bytes);
      if (!type) redirect("/club?error=NOT_AN_IMAGE");
      data[bytesField] = bytes;
      data[typeField] = type;
      data.logoUpdatedAt = new Date();
    }
  }

  await db.club.update({ where: { id: clubId }, data });
  // The header and every screen wear the club's look.
  revalidatePath("/", "layout");
  redirect("/club?saved=1");
}
