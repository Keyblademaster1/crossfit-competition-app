import { db } from "@/lib/db";

/**
 * A club's logo, as an image. Open to anyone, like any logo on a website:
 * share links show it to people who are not logged in.
 *
 * The address carries the time the logo last changed (club-theme.ts), so a
 * browser may keep its copy for good: a new logo gets a new address.
 */
export async function GET(_request: Request, { params }: RouteContext<"/club-logo/[clubId]/[kind]">) {
  const { clubId, kind } = await params;
  if (kind !== "light" && kind !== "dark") return new Response("Not found", { status: 404 });

  const light = kind === "light";
  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { logoLight: light, logoLightType: light, logoDark: !light, logoDarkType: !light },
  });
  const bytes = light ? club?.logoLight : club?.logoDark;
  const type = light ? club?.logoLightType : club?.logoDarkType;
  if (!bytes || !type) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Only ever shown as the image it says it is.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
