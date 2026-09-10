import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

for (const theme of ["light-beach", "dark-abyss"]) {
  test(`shows the ${theme} shell while JavaScript and font CSS are pending`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem("compass.theme", value);
    }, theme);
    let releaseScript!: () => void;
    let releaseFonts!: () => void;
    const scriptReady = new Promise<void>((resolve) => {
      releaseScript = resolve;
    });
    const fontsReady = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    await page.route("**/index.js", async (route) => {
      await scriptReady;
      await route.continue();
    });
    await page.route("https://fonts.googleapis.com/**", async (route) => {
      await fontsReady;
      await route.abort();
    });

    try {
      await page.goto("/week", { waitUntil: "commit" });
      await expect(
        page.getByRole("heading", { name: "Compass Calendar", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toHaveText(
        "Loading your calendar…",
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => performance.getEntriesByName("first-contentful-paint").length,
          ),
        )
        .toBe(1);

      releaseScript();
      await expect(
        page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Compass Calendar", exact: true }),
      ).toHaveCount(0);
    } finally {
      releaseScript();
      releaseFonts();
    }
  });
}
