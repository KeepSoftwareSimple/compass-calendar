import { expect, type Page, test } from "@playwright/test";

// Empty storage so the welcome modal runs, and the game has not been seen.
test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

const dismissWelcomeWithExplore = async (page: Page) => {
  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  // Three screens, one primary action each: Enter advances.
  await expect(
    welcomeDialog.getByRole("button", { name: "Get started for free" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    welcomeDialog.getByRole("button", { name: "Who is Compass for?" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    welcomeDialog.getByRole("button", { name: "Explore without an account" }),
  ).toBeVisible();
  await page.keyboard.press("s");
  await expect(welcomeDialog).toBeHidden();
};

/** Opt-in entry: the shared ?play= deep link, consumed on load. */
const openPracticeViaPlayLink = async (page: Page) => {
  await page.goto("/week?play=1", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
  ).toBeHidden();
  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toBeVisible();
  await expect(showcase).toContainText("Block Party");
  await expect(page).not.toHaveURL(/play=/);
};

const startPracticing = async (page: Page) => {
  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toContainText("Block Party");
  await expect(
    showcase.getByRole("button", { name: "Start practicing" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(showcase).toContainText("Task 1/11");
  // The first run is untimed practice: no countdown anywhere.
  await expect(showcase.getByRole("timer")).toHaveCount(0);
  await expect(showcase).toContainText("Practice");
};

const holdModAndPress = async (page: Page, key: string) => {
  // Linux CI resolves Mod to Control; macOS to Meta. Hold both so the
  // chord check fires on either platform.
  await page.keyboard.down("Control");
  await page.keyboard.down("Meta");
  await page.keyboard.press(key);
  await page.keyboard.up("Meta");
  await page.keyboard.up("Control");
};

const pressTimes = async (page: Page, key: string, times: number) => {
  for (let i = 0; i < times; i += 1) {
    await page.keyboard.press(key);
  }
};

/** The winning script: clears all eleven tasks with the taught keys. */
const clearTheQueue = async (page: Page) => {
  const showcase = page.getByRole("region", { name: "Shortcut practice" });

  // place-standup: C spawns the piece, walk it to Monday, lock.
  await page.keyboard.press("c");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(showcase).toContainText("Task 2/11");

  // quicktime-coffee: type the time, lock.
  await page.keyboard.type("930");
  await page.keyboard.press("Enter");
  await expect(showcase).toContainText("Task 3/11");

  // nudge-standup: 9:00 -> 9:15 in one 15-minute step.
  await page.keyboard.press("Shift+ArrowDown");
  await expect(showcase).toContainText("Task 4/11");

  // resize-one-on-one: Tab to the start edge, Shift+Up 10:00 -> 9:45.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(showcase).toContainText("Task 5/11");

  // delete-gym, undo-gym
  await page.keyboard.press("Delete");
  await expect(showcase).toContainText("Task 6/11");
  await holdModAndPress(page, "z");
  await expect(showcase).toContainText("Task 7/11");

  // legend-peek: ? opens the practice legend, Esc closes it.
  await page.keyboard.press("?");
  await expect(showcase).toContainText("Shortcuts");
  await page.keyboard.press("Escape");
  await expect(showcase).toContainText("Task 8/11");

  // jump-to-kickoff: H reveals jump letters, S is on Team kickoff.
  await page.keyboard.press("h");
  await page.keyboard.press("s");
  await expect(showcase).toContainText("Task 9/11");

  // page-jump-peek: hold Mod alone until the numbers appear, then Mod+1.
  await page.keyboard.down("Control");
  await page.keyboard.down("Meta");
  await page.waitForTimeout(800);
  await page.keyboard.press("1");
  await page.keyboard.up("Meta");
  await page.keyboard.up("Control");
  await expect(showcase).toContainText("Task 10/11");

  // palette-peek: Mod+K opens the practice palette, Esc closes it.
  await holdModAndPress(page, "k");
  await expect(showcase).toContainText("Type a command...");
  await page.keyboard.press("Escape");
  await expect(showcase).toContainText("Task 11/11");

  // place-party: down to 5pm, lock.
  await page.keyboard.press("c");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(showcase).toContainText("You cleared the week!");
};

test("exploring without an account leaves Block Party closed", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await dismissWelcomeWithExplore(page);

  await expect(
    page.getByRole("region", { name: "Shortcut practice" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Create your first event" }),
  ).toBeVisible();
});

test("stalling on a task surfaces its hint, and progress clears it", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);
  await startPracticing(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  const hint = "Tap Left to reach Monday";
  await expect(showcase).not.toContainText(hint);
  // The hint lands after 7 idle seconds on the task.
  await expect(showcase).toContainText(hint, { timeout: 9_000 });

  // Real progress resets the stall and the hint goes away.
  await page.keyboard.press("c");
  await expect(showcase).not.toContainText(hint);
});

test("a full run clears the queue, shows the score, and graduates", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);
  await startPracticing(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(
    showcase.getByRole("button", { name: "Leave practice" }),
  ).toBeVisible();

  await clearTheQueue(page);

  await expect(showcase).toContainText("11/11 tasks cleared");
  await expect(showcase).toContainText("Moves you learned");
  await expect(
    showcase.getByRole("button", { name: /Sign up to keep your calendar/ }),
  ).toBeVisible();
  // The untimed run's rematch is the timed challenge; reminders are gone.
  await expect(
    showcase.getByRole("button", { name: /Race the clock/ }),
  ).toBeVisible();
  await expect(
    showcase.getByRole("button", { name: /Enable reminders/ }),
  ).toHaveCount(0);

  // O opens the calendar for anonymous players; Enter belongs to signup.
  await page.keyboard.press("o");
  await expect(showcase).toHaveCount(0);

  await expect(
    page.getByRole("complementary", { name: "Create your first event" }),
  ).toBeVisible();
});

test("the end screen's rematch races the clock with a full timer", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);

  // The how-to card only starts practice: no timed option up front.
  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(
    showcase.getByRole("button", { name: "Start practicing" }),
  ).toBeVisible();
  await expect(
    showcase.getByRole("button", { name: /Race the clock/ }),
  ).toHaveCount(0);
  await startPracticing(page);

  // Esc-skip the whole queue: the fastest road to the end screen.
  await pressTimes(page, "Escape", 11);
  await expect(showcase).toContainText("You cleared the week!");

  await page.keyboard.press("p");
  await expect(showcase).toContainText("Task 1/11");
  await expect(showcase.getByRole("timer")).toBeVisible();
  await expect(showcase.getByRole("timer")).toContainText("2:00");
});

test("Enter on the end screen hands an anonymous player to signup", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);
  await startPracticing(page);
  await clearTheQueue(page);

  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Shortcut practice" }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/auth=signup/);
});

test("Skip to sign up leaves the game for the signup form", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toContainText("Block Party");

  await expect(
    showcase.getByRole("button", { name: /Skip to sign up/ }),
  ).toBeVisible();
  await page.keyboard.press("u");
  await expect(showcase).toHaveCount(0);
  await expect(page).toHaveURL(/auth=signup/);
});

test("Escape mid-run skips one task and keeps the game up", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);
  await startPracticing(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  // Mid-run, Escape skips the current task and the game stays up.
  await page.keyboard.press("Escape");
  await expect(showcase).toContainText("Task 2/11");
  await expect(showcase).toBeVisible();
});

test("Escape leaves from the how-to card and it never auto-replays", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toContainText("Block Party");

  await page.keyboard.press("Escape");
  await expect(showcase).toBeVisible();
  await expect(showcase).toContainText("Press Esc again to leave practice.");

  await page.keyboard.press("Escape");
  await expect(showcase).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("region", { name: "Shortcut practice" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
  ).toBeHidden();
});

test("reloading mid-game re-offers a fresh run from the how-to card", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await openPracticeViaPlayLink(page);
  await startPracticing(page);

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await page.keyboard.press("c");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(showcase).toContainText("Task 2/11");

  await page.reload({ waitUntil: "domcontentloaded" });
  const resumed = page.getByRole("region", { name: "Shortcut practice" });
  await expect(resumed).toBeVisible();
  // A run has no mid-run resume: the attempt re-offers whole.
  await expect(resumed).toContainText("Block Party");
  await expect(
    resumed.getByRole("button", { name: "Start practicing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
  ).toBeHidden();
});

test("a ?play=1 link starts the game directly, skipping the welcome modal", async ({
  page,
}) => {
  await page.goto("/week?play=1", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
  ).toBeHidden();
  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toBeVisible();
  await expect(showcase).toContainText("Block Party");
  // Consumed and stripped, so a reload does not restart the run.
  await expect(page).not.toHaveURL(/play=/);
});
