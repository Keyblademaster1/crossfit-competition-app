import type { Page, TestInfo } from "@playwright/test";

/**
 * A slow connection, for the "slow" test project.
 *
 * On this computer the app answers at once, which hides a whole kind of bug:
 * the moment between a click and the answer, when the old page is still on
 * screen and can be typed into. Online that moment is real (Carin lost
 * movements to it, 26 October 2026). The "slow" project runs the same tests
 * again with every answer from the app held back, so that moment is long
 * enough to fall into.
 */
export const SLOW_MS = 700;

export async function slowWhenAsked(page: Page, info: TestInfo): Promise<void> {
  if (info.project.name !== "slow") return;
  await page.route("**/*", async (route) => {
    // Only the app's own answers: the pictures and scripts it is built from
    // come from the browser's cache online, so they are not held back.
    const url = route.request().url();
    if (url.startsWith("http://localhost:3100/") && !url.includes("/_next/static/")) {
      await new Promise((done) => setTimeout(done, SLOW_MS));
    }
    await route.continue();
  });
}
