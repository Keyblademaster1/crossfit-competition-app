import Image from "next/image";
import { currentClubId } from "@/lib/access";
import { clubTheme } from "@/lib/club-theme";
import { db } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { loadTheme } from "@/lib/theme";
import { saveClubSettings } from "@/lib/club-actions";
import { Button, Card, Field, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

/** What each code from saveClubSettings means, said plainly. */
const PROBLEMS: Record<string, string> = {
  NAME: "The club needs a name.",
  COLOUR: "One of the colours did not come through. Please pick it again.",
  TOO_BIG: `A logo can be at most ${LIMITS.logoBytes / 1024} KB. Try a smaller version of it.`,
  NOT_AN_IMAGE: "A logo has to be a PNG, JPEG or WebP picture.",
};

/**
 * Club settings: the club's name, colours and logos, which every page, TV
 * screen and share link of theirs then wears.
 */
export default async function ClubSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const clubId = await currentClubId();
  const [{ error, saved }, club, theme] = await Promise.all([
    searchParams,
    db.club.findUniqueOrThrow({
      where: { id: clubId },
      select: { name: true, primaryColor: true, secondaryColor: true, logoLightType: true, logoDarkType: true },
    }),
    clubTheme(clubId),
  ]);
  const builtIn = loadTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Club settings</h1>
        <p className="mt-1 text-[15px] text-muted">
          Your club&apos;s name, colours and logo. They show on every page, on the TV screens and on
          your share links.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
        >
          {PROBLEMS[error] ?? "That did not save. Please try again."}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="rounded-lg border border-line bg-card px-4 py-3 text-[15px]">
          Saved.
        </p>
      )}

      <form action={saveClubSettings} className="space-y-6">
        <Card title="Name">
          <Field label="Club or gym name">
            <input name="name" defaultValue={club.name} required className={inputClass} />
          </Field>
        </Card>

        <Card title="Colours">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColourField
              name="primaryColor"
              label="Main colour"
              hint="Buttons, the leader's row"
              value={club.primaryColor ?? builtIn.primary}
            />
            <ColourField
              name="secondaryColor"
              label="Second colour"
              hint="Second and third place, Scaled"
              value={club.secondaryColor ?? builtIn.secondary}
            />
          </div>
          {club.primaryColor && (
            <label className="mt-4 flex items-center gap-3 text-[15px]">
              <input type="checkbox" name="builtInColours" className="h-5 w-5" />
              Go back to the built-in colours
            </label>
          )}
        </Card>

        <Card title="Logo">
          <div className="space-y-6">
            <LogoField
              name="logoLight"
              label="Logo"
              hint="For the top of each page and printed results, on white."
              current={theme.logoLight && club.logoLightType ? theme.logoLight : null}
              background="#ffffff"
            />
            <LogoField
              name="logoDark"
              label="Logo for TV screens (optional)"
              hint="The TV screens are dark. If your logo is dark too, add a light version here. Without one, the TV shows your club's name."
              current={theme.logoDark && club.logoDarkType ? theme.logoDark : null}
              background={builtIn.screenBackground}
            />
            <p className="text-[14px] text-muted">
              PNG, JPEG or WebP, up to {LIMITS.logoBytes / 1024} KB. A PNG with a see-through
              background looks best.
            </p>
          </div>
        </Card>

        <Button type="submit" className="w-full sm:w-auto">
          Save
        </Button>
      </form>
    </div>
  );
}

function ColourField({ name, label, hint, value }: { name: string; label: string; hint: string; value: string }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        name={name}
        defaultValue={value}
        className="h-12 w-16 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1"
      />
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-[14px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

function LogoField({
  name,
  label,
  hint,
  current,
  background,
}: {
  name: string;
  label: string;
  hint: string;
  current: string | null;
  background: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-semibold">{label}</p>
      <p className="text-[14px] text-muted">{hint}</p>
      {current && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="max-w-full rounded-lg border border-line px-4 py-3" style={{ background }}>
            <Image src={current} alt="" width={160} height={48} className="h-12 w-auto max-w-[220px] object-contain" unoptimized />
          </div>
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" name={`${name}Remove`} className="h-5 w-5" />
            Remove
          </label>
        </div>
      )}
      <input
        type="file"
        name={`${name}File`}
        accept="image/png,image/jpeg,image/webp"
        aria-label={current ? `Replace ${label.toLowerCase()}` : label}
        className="block w-full text-[15px] file:mr-3 file:rounded-lg file:border file:border-line file:bg-card file:px-4 file:py-2 file:font-semibold"
      />
    </div>
  );
}
