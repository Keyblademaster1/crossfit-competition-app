import { networkInterfaces } from "node:os";
import { headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";

/**
 * A competition's share links, for its organiser to copy and hand out: the
 * leaderboard for phones, and the two TV screens. Anyone with them can watch
 * but not change anything (src/app/share).
 *
 * Shows nothing while the link is switched off.
 */
export async function ShareLinks({
  competition,
}: {
  competition: { publicLink: boolean; shareCode: string | null };
}) {
  if (!competition.publicLink || !competition.shareCode) return null;

  // The address this page was opened on, so the links work wherever the app
  // is: its web address online, or the laptop's address on a local network.
  const sent = await headers();
  let host = sent.get("x-forwarded-host") ?? sent.get("host") ?? "localhost";
  // "localhost" only works on the laptop itself. A phone on the same wifi
  // needs the laptop's address on that network instead.
  const [hostname, port] = host.split(":");
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const address = networkAddress();
    if (address) host = port ? `${address}:${port}` : address;
  }
  const protocol = sent.get("x-forwarded-proto") ?? "http";
  const base = `${protocol}://${host}/share/${competition.shareCode}`;

  const links = [
    { label: "Leaderboard, for phones", href: base },
    { label: "Leaderboard screen, for a TV", href: `${base}/screen/leaderboard` },
    { label: "Workout screen, for a TV", href: `${base}/screen/workout` },
  ];

  return (
    <div className="space-y-3">
      {links.map((link) => (
        <div key={link.href}>
          <p className="text-[14px] font-semibold">{link.label}</p>
          <div className="mt-1 flex items-center gap-2">
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate rounded-lg border border-line bg-[#F7F7F5] px-3 py-2 text-[14px] text-muted"
            >
              {link.href}
            </a>
            <CopyButton text={link.href} />
          </div>
        </div>
      ))}
      <p className="text-[14px] text-muted">
        Anyone with these links can watch, without logging in. Nobody can change anything
        through them. Switch the public link off in setup to stop them working.
      </p>
    </div>
  );
}

/** This computer's address on its local network, if it is on one. */
function networkAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}
