import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

// Resolved values of --background and --accent per theme (packages/web/src/index.css).
const COLORS = {
  "light-beach": {
    background: "rgb(243, 238, 226)",
    accent: "rgb(43, 42, 39)",
  },
  "dark-abyss": { background: "rgb(6, 9, 15)", accent: "rgb(124, 198, 228)" },
} as const;

for (const theme of ["light-beach", "dark-abyss"] as const) {
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
      // Anchor on today so its column is the first one and stays visible
      // however many columns the viewport fits.
      const today = new Date();
      const dateString = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
      await page.goto(`/week/${dateString}`, { waitUntil: "commit" });
      const shell = page.getByRole("main", { name: "Compass Calendar" });
      await expect(shell).toBeVisible();
      await expect(shell).toHaveAttribute("aria-busy", "true");
      await expect(shell).toHaveCSS(
        "background-color",
        COLORS[theme].background,
      );
      await expect(page.getByRole("status")).toHaveText(
        "Loading your calendar…",
      );
      // The shell mirrors the week view: month heading, day labels with
      // today in the accent color, and as many columns as the 1280px
      // viewport fits next to the default 345px sidebar.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /\d{2}$/,
      );
      await expect(
        shell.getByText(new RegExp(`^(\\w{3} )?${today.getDate()}$`)),
      ).toBeVisible();
      const weekday = today.toLocaleString("en-US", { weekday: "short" });
      await expect(shell.getByText(weekday, { exact: true })).toHaveCSS(
        "color",
        COLORS[theme].accent,
      );
      // Five columns fit: the fifth day is visible, the sixth is not.
      const weekdayAfter = (days: number) =>
        new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + days,
        ).toLocaleString("en-US", { weekday: "short" });
      await expect(
        shell.getByText(weekdayAfter(4), { exact: true }),
      ).toBeVisible();
      await expect(
        shell.getByText(weekdayAfter(5), { exact: true }),
      ).toBeHidden();
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
        page.getByRole("main", { name: "Compass Calendar" }),
      ).toHaveCount(0);
    } finally {
      releaseScript();
      releaseFonts();
    }
  });
}
