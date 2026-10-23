import Link from "next/link";
import { redirect } from "next/navigation";
import { logIn } from "@/lib/auth-actions";
import { currentUser } from "@/lib/access";
import { loginsOn } from "@/lib/auth";
import { Button, Card, Field, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

/** What each code from auth-actions.ts means, said plainly. */
const PROBLEMS: Record<string, string> = {
  MISSING: "Please fill in your email and password.",
  // Deliberately the same for a wrong email as for a wrong password, so the
  // form cannot be used to find out who has an account.
  INVALID_EMAIL_OR_PASSWORD: "That email and password do not match.",
  INVALID_EMAIL: "That email and password do not match.",
};

export default async function LogInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  if (!loginsOn || (await currentUser())) redirect("/");
  const { error, email } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>

      <Card>
        <form action={logIn} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
            >
              {PROBLEMS[error] ?? "That did not work. Please try again."}
            </p>
          )}
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
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </Field>
          <Button type="submit" className="w-full">
            Log in
          </Button>
        </form>
      </Card>

      <p className="text-center text-[15px] text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-ink underline">
          Create your club
        </Link>
      </p>
    </div>
  );
}
