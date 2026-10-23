import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/lib/auth-actions";
import { currentUser } from "@/lib/access";
import { loginsOn } from "@/lib/auth";
import { Button, Card, Field, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

/** What each code from auth-actions.ts means, said plainly. */
const PROBLEMS: Record<string, string> = {
  MISSING: "Please fill in every box.",
  PASSWORD_TOO_SHORT: "The password needs at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
  INVALID_EMAIL: "That email address does not look right.",
  USER_ALREADY_EXISTS: "There is already an account with that email. Log in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There is already an account with that email. Log in instead.",
};

/**
 * Signing up: one form makes an account and a new club, with the person
 * signing up as its first organiser.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; email?: string; clubName?: string }>;
}) {
  if (!loginsOn || (await currentUser())) redirect("/");
  const { error, name, email, clubName } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your club</h1>
        <p className="mt-1 text-[15px] text-muted">
          An account for you, and a club for your competitions. Only people in your club can see
          or change them.
        </p>
      </div>

      <Card>
        <form action={signUp} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
            >
              {PROBLEMS[error] ?? "That did not work. Please try again."}
            </p>
          )}
          <Field label="Club or gym name">
            <input name="clubName" defaultValue={clubName} required className={inputClass} />
          </Field>
          <Field label="Your name">
            <input name="name" defaultValue={name} required autoComplete="name" className={inputClass} />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              defaultValue={email}
              required
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field label="Password (at least 8 characters)">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Button type="submit" className="w-full">
            Create club
          </Button>
        </form>
      </Card>

      <p className="text-center text-[15px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
