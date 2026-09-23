"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Moves a TV screen on to another page after a while, and says when.
 * Give it a key of its href, so the count starts again on every page.
 *
 * Used by the fixed-teams leaderboard to take turns between RX and Scaled.
 * Each switch loads the page afresh, so new scores appear as well. Nothing
 * is kept between switches: a reload simply starts the count again.
 */
export function SwitchAfter({
  href,
  seconds,
  to,
}: {
  href: string;
  seconds: number;
  /** What it switches to, for the countdown: "Scaled". */
  to: string;
}) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      const remaining = seconds - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) {
        clearInterval(tick);
        router.replace(href);
      } else {
        setLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [href, seconds, router]);

  return (
    <span className="num">
      switches to {to} in {left} s
    </span>
  );
}
