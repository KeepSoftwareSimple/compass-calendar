import { expect, test } from "@playwright/test";
import { seedJourneyOnboarding } from "../journey/journey-leg.util";
import {
  dismissExploreTrialBannerIfOpen,
  getEventFormTitleInput,
  openTimedEventFormWithKeyboard,
} from "../utils/event-test-utils";
import fs from "node:fs";

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const BASE =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

const FAST_STRING =
  "Quarterly planning workshop with product design and research teams";

type TypingProbe = {
  view: "day" | "week";
  field: "title" | "startTime";
  expected: string;
  actual: string;
  droppedChars: number;
  perKeyLatencyMs: number[];
  p50LatencyMs: number;
  p95LatencyMs: number;
};

async function dismissExploreBanner(page: import("@playwright/test").Page) {
  const trialBanner = page.getByRole("status").filter({
    hasText: "Start your 7-day free trial to plan your week.",
  });
  if (await trialBanner.isVisible().catch(() => false)) {
    await trialBanner.getByRole("button", { name: "Dismiss" }).click();
    await expect(trialBanner).toBeHidden({ timeout: 10_000 });
  }
}

async function signUpFreshAccount(page: import("@playwright/test").Page) {
  const email = `agent.fast-typing.${Date.now()}@compasscaltest.invalid`;
  const password = "CompassStagingFastType1!";

  await page.goto(`${BASE}/week?auth=signup`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Name").fill("Fast Typing Probe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0, {
    timeout: 120_000,
  });
  await page
    .locator("#mainGrid")
    .waitFor({ state: "visible", timeout: 60_000 });
  await dismissExploreBanner(page);
  return email;
}

async function prepareCalendarSurface(page: import("@playwright/test").Page) {
  await dismissExploreTrialBannerIfOpen(page);
  const shortcutsDialog = page.getByRole("dialog", {
    name: "Keyboard shortcuts",
  });
  if (await shortcutsDialog.isVisible().catch(() => false)) {
    await shortcutsDialog
      .getByRole("button", { name: "Close shortcuts" })
      .click();
  }
  const meetingDismiss = page
    .getByRole("region", { name: "Meeting page" })
    .getByRole("button", { name: "Dismiss" });
  if (await meetingDismiss.isVisible().catch(() => false)) {
    await meetingDismiss.click();
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator("#mainGrid").focus();
}

async function openDayView(page: import("@playwright/test").Page) {
  await prepareCalendarSurface(page);
  await page.keyboard.press("d");
  await page.waitForURL((url) => url.pathname.startsWith("/day"), {
    timeout: 15_000,
  });
  await prepareCalendarSurface(page);
}

async function measureFastTitleTyping(
  page: import("@playwright/test").Page,
  view: "day" | "week",
): Promise<TypingProbe> {
  if (view === "day") {
    await openDayView(page);
  } else {
    await prepareCalendarSurface(page);
    await page.keyboard.press("w");
    await page.waitForURL((url) => url.pathname.startsWith("/week"), {
      timeout: 15_000,
    });
    await prepareCalendarSurface(page);
  }

  await openTimedEventFormWithKeyboard(page);
  const title = getEventFormTitleInput(page);
  await title.focus();
  await title.fill("");

  const perKeyLatencyMs = await page.evaluate(async (text) => {
    const latencies: number[] = [];
    const startedAt = performance.now();
    for (let index = 0; index < text.length; index += 1) {
      latencies.push(performance.now() - startedAt);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return latencies;
  }, FAST_STRING);

  const typeStarted = Date.now();
  await page.keyboard.type(FAST_STRING, { delay: 0 });
  const typeDurationMs = Date.now() - typeStarted;
  await title.blur();
  await page.waitForTimeout(100);
  const actual = await title.inputValue();

  const sorted = [...perKeyLatencyMs].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;

  return {
    view,
    field: "title",
    expected: FAST_STRING,
    actual,
    droppedChars: FAST_STRING.length - actual.length,
    perKeyLatencyMs: [typeDurationMs, p50, p95],
    p50LatencyMs: p50,
    p95LatencyMs: p95,
  };
}

async function measureFastTimeTyping(
  page: import("@playwright/test").Page,
  view: "day" | "week",
): Promise<TypingProbe> {
  if (view === "day") {
    await openDayView(page);
  } else {
    await prepareCalendarSurface(page);
    await page.keyboard.press("w");
    await page.waitForURL((url) => url.pathname.startsWith("/week"), {
      timeout: 15_000,
    });
    await prepareCalendarSurface(page);
  }

  await openTimedEventFormWithKeyboard(page);
  const startTime = page.getByRole("combobox", { name: "Start time" });
  await startTime.focus();

  const timeString = "1030a";
  await page.keyboard.type(timeString, { delay: 0 });
  await page.waitForTimeout(300);
  const actual = await startTime.inputValue();

  return {
    view,
    field: "startTime",
    expected: timeString,
    actual,
    droppedChars: timeString.length - actual.replace(/\s/g, "").length,
    perKeyLatencyMs: [],
    p50LatencyMs: 0,
    p95LatencyMs: 0,
  };
}

test.describe("staging event form fast typing probe", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.use({ viewport: { width: 1280, height: 800 } });

  test("measure title and time field drops on fresh signup", async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.STAGING_FAST_TYPING_PROBE !== "1",
      "Set STAGING_FAST_TYPING_PROBE=1",
    );

    await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });
    await page.addInitScript(() => {
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "true");
    });

    const versionResponse = await page.request.get(`${BASE}/version.json`);
    const versionBody = (await versionResponse.json()) as { version?: string };

    await page.context().tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    const email = await signUpFreshAccount(page);
    const probes: TypingProbe[] = [];

    probes.push(await measureFastTitleTyping(page, "day"));
    probes.push(await measureFastTimeTyping(page, "day"));

    const tracePath = testInfo.outputPath("staging-fast-typing-trace.zip");
    await page.context().tracing.stop({ path: tracePath });

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const report = {
      at: new Date().toISOString(),
      baseUrl: BASE,
      version: versionBody.version ?? null,
      signupEmail: email,
      probes,
      reproduces:
        probes.some((p) => p.droppedChars > 0) ||
        probes.some((p) => p.p95LatencyMs > 50),
    };
    fs.writeFileSync(
      `${ARTIFACT_DIR}/staging-fast-typing-report.json`,
      JSON.stringify(report, null, 2),
    );
    fs.copyFileSync(tracePath, `${ARTIFACT_DIR}/staging-fast-typing-trace.zip`);

    await page.screenshot({
      path: `${ARTIFACT_DIR}/staging-fast-typing-final.png`,
      fullPage: true,
    });

    // Investigation probe: record measurements; do not fail CI on drops yet.
    expect(probes.length).toBe(4);
  });
});
