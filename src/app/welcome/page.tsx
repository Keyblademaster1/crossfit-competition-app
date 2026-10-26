import { redirect } from "next/navigation";
import { startClub } from "@/lib/auth-actions";
import { currentUser } from "@/lib/access";
import { Button, Card, Field, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The one question for someone logging in for the first time: what their
 * club is called. They become its first organiser.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.club) redirect("/");
  const { error } = await searchParams;
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          One question before you start. Only people in your club can see or change its
          competitions.
        </p>
      </div>

      <Card>
        <form action={startClub} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
            >
              {error === "FULL"
                ? "A lot of new clubs have started today, more than the free hosting allows. Please try again tomorrow."
                : "Please give your club a name."}
            </p>
          )}
          <Field label="What is your club or gym called?">
            <input name="clubName" required className={inputClass} />
          </Field>
          <Button type="submit" className="w-full">
            Start
          </Button>
        </form>
      </Card>
    </div>
  );
}
