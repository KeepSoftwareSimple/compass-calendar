import { expect, test } from "@playwright/test";
import fs from "node:fs";

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const BASE =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

type TraceEntry = {
  at: string;
  note: string;
  url: string;
  authParam: string | null;
  trialDialog: boolean;
  billingGate: boolean;
  exploreBanner: boolean;
  firstEventPrompt: boolean;
  settingsPlanTrial: boolean;
};

async function snapshotState(
  page: import("@playwright/test").Page,
  note: string,
): Promise<TraceEntry> {
  const url = page.url();
  const authParam = new URL(url).searchParams.get("auth");
  const trialDialog = await page
    .getByRole("dialog", { name: "Start your 7-day free trial" })
    .isVisible()
    .catch(() => false);
  const billingGate = await page
    .getByRole("dialog", { name: "Finish starting your trial" })
    .isVisible()
    .catch(() => false);
  const exploreBanner = await page
    .getByRole("status")
    .filter({ hasText: "Start your 7-day free trial to plan your week." })
    .isVisible()
    .catch(() => false);
  const firstEventPrompt = await page
    .getByRole("complementary", { name: "Create your first event" })
    .isVisible()
    .catch(() => false);
  return {
    at: new Date().toISOString(),
    note,
    url,
    authParam,
    trialDialog,
    billingGate,
    exploreBanner,
    firstEventPrompt,
    settingsPlanTrial: false,
  };
}

test.describe("staging first-event trial trace", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("non-synthetic signup then first event save", async ({ page }) => {
    test.skip(
      process.env.STAGING_FIRST_EVENT_TRIAL_TRACE !== "1",
      "Set STAGING_FIRST_EVENT_TRIAL_TRACE=1",
    );

    const versionResponse = await page.request.get(`${BASE}/version.json`);
    expect(versionResponse.ok()).toBe(true);
    const versionBody = (await versionResponse.json()) as { version?: string };
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(
      `${ARTIFACT_DIR}/staging-trace-version.json`,
      JSON.stringify(versionBody, null, 2),
    );

    const trace: TraceEntry[] = [];
    const email = `agent.trial.trace.${Date.now()}@compasscaltest.invalid`;
    const password = "CompassStagingTrial1!";

    await page.goto(`${BASE}/week`, { waitUntil: "domcontentloaded" });

    const welcomeDialog = page.getByRole("dialog", {
      name: "Welcome to Compass Calendar",
    });
    if (await welcomeDialog.isVisible().catch(() => false)) {
      await welcomeDialog
        .getByRole("button", { name: "Get started for free" })
        .click();
      await welcomeDialog.getByRole("button", { name: "Next" }).click();
      await welcomeDialog
        .getByRole("button", { name: "Sign up with email" })
        .click();
    } else {
      await page.goto(`${BASE}/week?auth=signup`, {
        waitUntil: "domcontentloaded",
      });
    }

    trace.push(await snapshotState(page, "signup modal visible"));

    await page.getByLabel("Name").fill("Trace Trial");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByLabel("Password")).toHaveCount(0, {
      timeout: 120_000,
    });
    trace.push(await snapshotState(page, "after signup submit"));

    const firstEventPrompt = page.getByRole("complementary", {
      name: "Create your first event",
    });
    const connectDialog = page.getByRole("dialog", {
      name: "Bring your events",
    });
    if (await connectDialog.isVisible().catch(() => false)) {
      await connectDialog.getByRole("button", { name: "Skip for now" }).click();
      await expect(connectDialog).toHaveCount(0, { timeout: 15_000 });
      trace.push(await snapshotState(page, "after connect prompt skip"));
    }

    await expect(firstEventPrompt).toBeVisible({ timeout: 120_000 });
    trace.push(await snapshotState(page, "first-event prompt visible"));

    for (const { width, height, suffix } of [
      { width: 1280, height: 800, suffix: "1280" },
      { width: 360, height: 740, suffix: "360" },
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `${ARTIFACT_DIR}/staging-trace-before-first-event-${suffix}.png`,
        fullPage: false,
      });
    }

    await firstEventPrompt.getByRole("button", { name: "Add event" }).click();

    const trialDialog = page.getByRole("dialog", {
      name: "Start your 7-day free trial",
    });
    await expect
      .poll(
        async () => {
          trace.push(await snapshotState(page, "poll after Add event"));
          return (
            (await trialDialog.isVisible().catch(() => false)) ||
            (await page
              .getByRole("dialog", { name: "Finish starting your trial" })
              .isVisible()
              .catch(() => false))
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);

    trace.push(await snapshotState(page, "after first event save attempt"));

    for (const { width, height, suffix } of [
      { width: 1280, height: 800, suffix: "1280" },
      { width: 360, height: 740, suffix: "360" },
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `${ARTIFACT_DIR}/staging-trace-after-first-event-${suffix}.png`,
        fullPage: false,
      });
    }

    fs.writeFileSync(
      `${ARTIFACT_DIR}/staging-first-event-trial-trace.json`,
      JSON.stringify({ emailDomain: "compasscaltest.invalid", trace }, null, 2),
    );

    test.info().attach("trace-email-domain", {
      body: "compasscaltest.invalid (no synthetic header)",
      contentType: "text/plain",
    });
  });
});
