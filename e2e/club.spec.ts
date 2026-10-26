import { test, expect, type Page } from "@playwright/test";
import { withDatabase } from "./database";
import { logInAs } from "./session";

/**
 * Club settings: a club's name, colours and logo, worn by its own pages and
 * by its share links, whoever is watching.
 */

// A 1×1 PNG, the smallest real picture there is.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.use({ storageState: { cookies: [], origins: [] } });

async function brandColour(page: Page) {
  return page.locator("header").evaluate((el) => getComputedStyle(el).getPropertyValue("--brand-primary").trim());
}

test.describe("club settings", () => {
  test("a club's name, colour and logo show on its pages and its share link", async ({ page, context, browser }) => {
    await logInAs(context, { name: "Robin", clubName: "Plain Box" });
    await page.goto("/");
    await page.getByRole("link", { name: "Club settings" }).click();

    await page.getByLabel("Club or gym name").fill("Ironworks");
    await page.locator('input[name="primaryColor"]').fill("#aa2233");
    await page.getByLabel("Logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("status")).toHaveText("Saved.");
    // The logo stands for the name, which is not repeated beside it.
    await expect(page.locator('header img[src^="/club-logo/"]')).toHaveAttribute("alt", "Ironworks");
    expect(await brandColour(page)).toBe("#aa2233");

    // The logo is served as the picture it is.
    const src = await page.locator("header img").getAttribute("src");
    const logo = await page.request.get(src!);
    expect(logo.headers()["content-type"]).toBe("image/png");

    // A share link wears the owning club's look, for someone not logged in.
    const code = "IronworksShareCode0000";
    await withDatabase((db) =>
      db.query(
        `INSERT INTO "Competition" (id, "clubId", name, "publicLink", "shareCode")
         SELECT 'e2e-ironworks', "clubId", 'Iron Open', true, $1 FROM "User" WHERE name = 'Robin'`,
        [code],
      ),
    );
    const stranger = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await stranger.goto(`/share/${code}`);
    await expect(stranger.locator('header img[src^="/club-logo/"]')).toHaveAttribute("alt", "Ironworks");
    expect(await brandColour(stranger)).toBe("#aa2233");
    // And the app's own pages, for them, do not.
    await stranger.goto("/login");
    await expect(stranger.locator("header")).not.toContainText("Ironworks");

    // Back to the built-in look, and no logo.
    await page.getByLabel("Go back to the built-in colours").check();
    await page.getByLabel("Remove").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await expect(page.locator("header img")).toHaveCount(0);
    await expect(page.locator("header")).toContainText("Ironworks");
    expect(await brandColour(page)).not.toBe("#aa2233");
  });

  test("only pictures go in as a logo, and only small ones", async ({ page, context }) => {
    await logInAs(context, { name: "Sam", clubName: "Careful Box" });
    await page.goto("/club");

    await page.getByLabel("Logo", { exact: true }).setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("A logo has to be a PNG, JPEG or WebP picture.")).toBeVisible();

    const huge = Buffer.concat([PNG, Buffer.alloc(300 * 1024)]);
    await page.getByLabel("Logo", { exact: true }).setInputFiles({ name: "big.png", mimeType: "image/png", buffer: huge });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("A logo can be at most 200 KB.", { exact: false })).toBeVisible();
    await expect(page.locator("header img")).toHaveCount(0);
  });
});
