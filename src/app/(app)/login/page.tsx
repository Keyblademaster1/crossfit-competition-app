import { redirect } from "next/navigation";
import { logInWithGoogle } from "@/lib/auth-actions";
import { currentUser } from "@/lib/access";
import { googleReady, loginsOn } from "@/lib/auth";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Logging in, with Google. The same button makes an account the first time,
 * so there is no separate page for signing up.
 */
export default async function LogInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!loginsOn || (await currentUser())) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-1 text-[15px] text-muted">
          With your Google account. New here? The same button gets you started.
        </p>
      </div>

      <Card>
        <form action={logInWithGoogle} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-[#C9A07A] bg-[#FBF3EA] px-4 py-3 text-[15px] text-[#6B3A0E]"
            >
              {/* Google's codes mean nothing to anyone, and nearly all of them
                  come down to the same thing: it did not finish. */}
              Logging in with Google did not finish. Please try again.
            </p>
          )}
          {googleReady ? (
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-[16px] font-semibold text-ink hover:bg-[#F7F7F7]"
            >
              <GoogleMark />
              Continue with Google
            </button>
          ) : (
            <p className="text-[15px] text-muted">
              Logging in is not set up on this copy yet: it needs its codes from Google. See the
              README.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}

/** Google's "G", as Google asks its sign-in buttons to show it. */
function GoogleMark() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
