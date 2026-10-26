import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The privacy policy, public, as Google asks of any app that logs people in
 * with it.
 *
 * Whoever runs a copy gives their contact address as CONTACT_EMAIL, so it is
 * never written into the code, which is public.
 */
export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 text-[15px] leading-relaxed">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-1 text-muted">Last updated 26 October 2026</p>
      </div>

      <Section title="Who runs this">
        <p>
          Box Competitions is run by a private person, free of charge, for scoring competitions at
          CrossFit and functional fitness boxes. Questions, and requests about your data, go to{" "}
          {contact ? (
            <a href={`mailto:${contact}`} className="font-semibold underline">
              {contact}
            </a>
          ) : (
            "the person who runs this site"
          )}
          .
        </p>
      </Section>

      <Section title="What we keep about organisers">
        <p>When you log in with Google, Google tells us your name, your email address and the address of your profile picture. We keep those, and the name of your club and its colours and logo if you add them.</p>
        <p>While you are logged in we keep a record of the login, with your IP address and the kind of browser you use, so the login can be checked and ended. It ends when you log out, or after a week.</p>
        <p>We never see or keep your Google password, and we ask Google for nothing else: not your contacts, your email or your files.</p>
      </Section>

      <Section title="What organisers add about athletes">
        <p>Organisers add the competition: athletes&apos; names, whether they compete as a woman or a man, whether they are in the 60+ group, their teams and their scores. The club that runs a competition decides what goes in it, and is responsible for telling its athletes.</p>
        <p>If a club switches on a share link, anyone with the link can see that competition&apos;s leaderboard and screens. Nothing else is public.</p>
      </Section>

      <Section title="Where it is kept, and who else is involved">
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase keeps the database, in the EU (Ireland).</li>
          <li>Netlify serves the website. It is an American company, and the pages may be produced on its servers outside the EU.</li>
          <li>Google handles logging in.</li>
        </ul>
        <p>We do not sell anything we keep, show adverts or use it for anything but running the competitions.</p>
      </Section>

      <Section title="Cookies">
        <p>One cookie, which keeps you logged in, and a short-lived one while you log in with Google. No tracking, analytics or advertising cookies.</p>
      </Section>

      <Section title="How long, and your rights">
        <p>We keep your details while your club uses the app. You can ask to see them, to have them corrected, or to have your account, your club and its competitions deleted, by writing to the address above.</p>
        <p>If you think we handle your data wrongly, you can complain to the Swedish Authority for Privacy Protection (IMY).</p>
      </Section>

      <p>
        <Link href="/about" className="font-semibold underline">
          About Box Competitions
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
