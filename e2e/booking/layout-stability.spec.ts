import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getPaletteSearch,
  openCommandPaletteWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";
import {
  BOOKING_CALENDAR_ID,
  HOST_ACCOUNT_EMAIL,
  prepareSignedInBookingSettingsPage,
} from "./booking-harness";

test.use({ viewport: { width: 1600, height: 900 } });

/**
 * Holds every matching GET until `release()` so a spec can measure the
 * loading layout, let the response land, and measure again. Registered after
 * the harness route, so Playwright tries it first.
 */
const holdGet = async (
  page: Page,
  pathSuffix: string,
  // Omit to let the harness answer once released.
  body?: Record<string, unknown>,
) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route(
    (url) => url.pathname.endsWith(pathSuffix),
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      held += 1;
      await released;
      if (!body) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  return { release, heldCount: () => held };
};

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return { x: Math.round(rect!.x), y: Math.round(rect!.y) };
};

const openMeetingTab = async (page: Page) => {
  await page.keyboard.press("ControlOrMeta+Comma");
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible({ timeout: 10_000 });
  await settingsDialog.getByRole("button", { name: /^Meeting/ }).click();
  return settingsDialog;
};

type TrackTarget = { selector: string; text?: string };

/**
 * Samples each target's top on every animation frame, so a shift that lasts
 * one frame still shows up. Readable later with `readTops`.
 */
const trackTops = async (page: Page, targets: Record<string, TrackTarget>) => {
  await page.evaluate((targets) => {
    const w = window as Window & {
      __layoutTops?: Record<string, number[]>;
    };
    w.__layoutTops = {};
    // The last match is the innermost, so a text target finds its own row
    // rather than an ancestor that also contains the text.
    const find = ({ selector, text }: TrackTarget) =>
      Array.from(document.querySelectorAll(selector))
        .filter((el) => !text || (el.textContent ?? "").includes(text))
        .at(-1);
    const tick = () => {
      for (const [key, target] of Object.entries(targets)) {
        const el = find(target);
        if (!el) continue;
        const top = Math.round(el.getBoundingClientRect().top);
        const all = w.__layoutTops!;
        const seen = all[key] ?? [];
        all[key] = seen;
        if (seen.at(-1) !== top) seen.push(top);
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, targets);
};

const readTops = (page: Page) =>
  page.evaluate(
    () =>
      (window as Window & { __layoutTops?: Record<string, number[]> })
        .__layoutTops ?? {},
  );

type E2EWindow = Window & {
  __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
  __COMPASS_E2E_STORE__?: {
    userMetadata?: { set: (metadata: unknown) => void };
  };
};

/** A reload drops the harness session, so sign the host back in. */
const signInAfterReload = async (
  page: Page,
  hostMetadata: Record<string, unknown>,
) => {
  await page.waitForFunction(
    () => (window as E2EWindow).__COMPASS_E2E_HOOKS__ !== undefined,
  );
  await page.evaluate(() =>
    (window as E2EWindow).__COMPASS_E2E_HOOKS__?.setAuthenticated(true),
  );
  await page.waitForFunction(() =>
    Boolean((window as E2EWindow).__COMPASS_E2E_STORE__?.userMetadata),
  );
  await page.evaluate(
    (metadata) =>
      (window as E2EWindow).__COMPASS_E2E_STORE__?.userMetadata?.set(metadata),
    hostMetadata,
  );
};

const IMPORTING_STATUS = {
  bookable: false,
  reasons: [
    { kind: "connection", reason: "importing", connectionState: "importing" },
  ],
};

for (const [label, status, expected] of [
  [
    "a blocker notice",
    IMPORTING_STATUS,
    settingsText("Guests can't book right now"),
  ],
  [
    "a three-line blocker notice",
    {
      bookable: false,
      reasons: [{ kind: "calendar", reason: "notImported" }],
    },
    settingsText("Remove it from Blocking calendars"),
  ],
  [
    "a blocker with a Reconnect button",
    {
      bookable: false,
      reasons: [
        {
          kind: "connection",
          reason: "actionRequired",
          connectionState: "actionRequired",
        },
      ],
    },
    settingsText("needs reconnecting"),
  ],
  [
    "the live line",
    { bookable: true, reasons: [] },
    settingsText("On. Guests can book at your link."),
  ],
] as const) {
  test(`Meeting tab fields stay put when ${label} loads in`, async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, { openSettings: false });
    const statusGate = await holdGet(page, "/api/booking/page/status", status);

    const settingsDialog = await openMeetingTab(page);
    await trackTops(page, {
      duration: { selector: "#booking-duration" },
      save: { selector: "button", text: "Save changes" },
    });
    await expect.poll(statusGate.heldCount).toBeGreaterThan(0);
    // Long enough for a form that renders ahead of the status to paint.
    await page.waitForTimeout(300);

    statusGate.release();
    await expect(expected(settingsDialog)).toBeVisible();
    await expect(settingsDialog.getByLabel("Duration")).toBeVisible();
    await page.waitForTimeout(300);

    // One top each: the fields first paint where they end up.
    const tops = await readTops(page);
    expect(tops.duration).toHaveLength(1);
    expect(tops.save).toHaveLength(1);
  });
}

function settingsText(text: string) {
  return (settingsDialog: Locator) =>
    settingsDialog.getByText(text, { exact: false }).first();
}

test("sidebar notices stay put while calendars and events load", async ({
  page,
}) => {
  // Unconfigured page plus onboarding done shows the meeting page nudge
  // under the list; an event with a Join link is the tallest Up Next card.
  const { hostMetadata } = await prepareSignedInBookingSettingsPage(page, {
    openSettings: false,
    configured: false,
    completeOnboarding: true,
  });
  const start = new Date(Date.now() + 20 * 60_000);
  start.setSeconds(0, 0);
  const upNextEvent = {
    id: "aaaaaaaaaaaaaaaaaaaaaaa1",
    calendarId: BOOKING_CALENDAR_ID,
    content: {
      kind: "details",
      title: "Up next stability probe",
      description: "https://meet.google.com/abc-defg-hij",
    },
    schedule: {
      kind: "timed",
      start: start.toISOString(),
      end: new Date(start.getTime() + 30 * 60_000).toISOString(),
      timeZone: "UTC",
    },
    recurrence: { kind: "single" },
    createdAt: new Date(0).toISOString(),
    updatedAt: null,
  };
  // The harness answers the profile with {}, which drops the email once it
  // lands and re-renders the list in its signed-out shape. Give it the host.
  await page.route(
    (url) => url.pathname.endsWith("/api/user/profile"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "host-user",
          email: HOST_ACCOUNT_EMAIL,
        }),
      }),
  );
  await page.route(
    (url) => url.pathname.endsWith("/api/event"),
    (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ events: [upNextEvent] }),
          })
        : route.fallback(),
  );
  // Sign in the moment the test hook exists, so the reload never paints the
  // signed-out list first.
  await page.addInitScript(() => {
    let hooks: unknown;
    Object.defineProperty(window, "__COMPASS_E2E_HOOKS__", {
      configurable: true,
      get: () => hooks,
      set: (value: { setAuthenticated: (v: boolean) => void }) => {
        hooks = value;
        value.setAuthenticated(true);
      },
    });
  });
  await page.reload();
  await signInAfterReload(page, hostMetadata);
  const calendarList = page.getByRole("region", { name: "Calendars" });
  await expect(calendarList.getByText("Work").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page
      .getByRole("region", { name: "Up next" })
      .getByText("Up next stability probe"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Meeting page" }),
  ).toBeVisible();
  // The first visit measures the list, so the reload can hold its height.
  await page.waitForTimeout(500);

  const holdEvents = await holdGet(page, "/api/event");
  const holdCalendars = await holdGet(page, "/api/calendars");
  await page.addInitScript(() => {
    const w = window as Window & { __layoutTops?: Record<string, number[]> };
    w.__layoutTops = {};
    const keys: Record<string, string> = {
      calendars: 'section[aria-label="Calendars"]',
    };
    const tick = () => {
      for (const [key, selector] of Object.entries(keys)) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const top = Math.round(el.getBoundingClientRect().top);
        const all = w.__layoutTops!;
        const seen = all[key] ?? [];
        all[key] = seen;
        if (seen.at(-1) !== top) seen.push(top);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.reload();
  await signInAfterReload(page, hostMetadata);
  // Calendars land first; today's events wait on their ids.
  const notice = page.locator(
    'section[aria-label="Meeting page"], section[aria-label="Tasks removed"]',
  );
  const noticeTops: number[] = [];
  await expect.poll(holdCalendars.heldCount).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  noticeTops.push((await box(notice)).y);
  holdCalendars.release();
  await expect.poll(holdEvents.heldCount).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  noticeTops.push((await box(notice)).y);
  holdEvents.release();
  await expect(calendarList.getByText("Work").first()).toBeVisible();
  await page.waitForTimeout(500);

  await expect(
    page
      .getByRole("region", { name: "Up next" })
      .getByText("Up next stability probe"),
  ).toBeVisible();

  noticeTops.push((await box(notice)).y);

  // The Up Next slot is held from the first frame, so the list never moves.
  const tops = await readTops(page);
  expect(tops.calendars, "calendar list top").toHaveLength(1);
  // The skeleton holds the list's height, so the notice under it sits where
  // it will settle while calendars and then events load. (Checked at each
  // step: the harness's sign-in flip can add a one-frame wobble of its own.)
  expect(new Set(noticeTops).size, `notice tops ${noticeTops}`).toBe(1);
});

test("Meeting nav row does not drop when switching Settings tabs", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { openSettings: false });
  const settingsDialog = await openMeetingTab(page);
  const meetingNav = settingsDialog.getByRole("button", { name: /^Meeting/ });
  await expect(
    settingsDialog.getByRole("switch", { name: "Meeting page" }),
  ).toBeVisible({ timeout: 15_000 });
  const meetingBox = await box(meetingNav);
  const dialogBox = await settingsDialog.boundingBox();

  await settingsDialog.getByRole("button", { name: /^Accounts/ }).click();
  await expect(meetingNav).toBeVisible();

  expect(await box(meetingNav)).toEqual(meetingBox);
  const accountsDialogBox = await settingsDialog.boundingBox();
  expect(Math.round(accountsDialogBox!.y)).toBe(Math.round(dialogBox!.y));
});

for (const recent of [[], ["open-meeting-page"]] as const) {
  test(`command palette rows stay put when the meeting page command loads${recent.length > 0 ? " from Recent" : ""}`, async ({
    page,
  }) => {
    if (recent.length > 0) {
      await page.addInitScript((ids) => {
        localStorage.setItem("compass.commands.recent", JSON.stringify(ids));
      }, recent);
    }
    await prepareSignedInBookingSettingsPage(page, { openSettings: false });
    const pageGate = await holdGet(page, "/api/booking/page", {
      enabled: true,
      durationMinutes: 45,
      destinationCalendarId: "64b7f0a1c2d3e4f5a6b7c8d9",
      blockingCalendarIds: ["64b7f0a1c2d3e4f5a6b7c8d9"],
      timeZone: "America/New_York",
      weeklyAvailability: [],
      minNoticeHours: 4,
      maxHorizonDays: 60,
      id: "000000000000000000000001",
      slug: "hostuser",
      hostUserId: "000000000000000000000002",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      bookingUrl: "https://compasscalendar.com/meet/hostuser",
    });

    await openCommandPaletteWithKeyboard(page);
    await expect(getPaletteSearch(page)).toBeVisible();
    // With nothing recent, the Log Out row sits below the meeting command.
    // With a recent meeting command, the Recent section sits above Go to
    // Today; keep that row at scroll top so scroll anchoring can't hide a
    // shift.
    const anchor =
      recent.length > 0
        ? page.getByRole("option", { name: /^Go to Today/ })
        : page.getByRole("option", { name: /^Log Out/ });
    if (recent.length === 0) await anchor.scrollIntoViewIfNeeded();
    await expect(anchor).toBeVisible();
    const loading = page.getByRole("option", { name: /^Meeting page/ }).first();
    const loadingShown = (await pageGate.heldCount()) > 0;
    if (loadingShown) await expect(loading).toBeVisible();
    const before = await box(anchor);

    pageGate.release();
    await expect(
      page.getByRole("option", { name: /^Open meeting page/ }).first(),
    ).toBeVisible();

    expect(await box(anchor)).toEqual(before);
  });
}

for (const [label, query, commandRow] of [
  ["no command matches", "Zyxq", null],
  ["commands match too", "Go", "Go to Today"],
] as const) {
  test(`palette search results land where the status row was when ${label}`, async ({
    page,
  }) => {
    await prepareTimedCalendarPage(page);
    const title = `${query === "Go" ? "Gopher" : "Zyxquil"} review ${Date.now()}`;
    await openTimedEventFormWithKeyboard(page);
    await fillTitleAndSaveEventForm(page, title);
    await expectTimedEventVisible(page, title);

    await openCommandPaletteWithKeyboard(page);
    const search = getPaletteSearch(page);
    await expect(search).toBeVisible();
    await trackTops(page, {
      status: { selector: "div", text: `Searching for` },
      event: { selector: '[role="option"]', text: title },
      ...(commandRow
        ? { command: { selector: '[role="option"]', text: commandRow } }
        : {}),
    });
    await search.pressSequentially(query, { delay: 20 });
    await expect(
      page.getByRole("option", { name: new RegExp(title) }),
    ).toBeVisible();
    await page.waitForTimeout(300);

    const tops = await readTops(page);
    expect(tops.event).toHaveLength(1);
    // The status row held the first event row's slot.
    if (tops.status) expect(tops.status.at(-1)).toBe(tops.event![0]);
    if (commandRow) {
      // The command row may move while letters filter the list; it must not
      // move once the full query is typed and results arrive.
      const settled = tops.command!.at(-1);
      await page.waitForTimeout(100);
      expect((await readTops(page)).command!.at(-1)).toBe(settled);
    }
  });
}
