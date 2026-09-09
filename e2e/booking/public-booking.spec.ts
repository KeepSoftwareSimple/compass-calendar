import { expect, test } from "@playwright/test";
import {
  appleBookingCalendar,
  buildBookableSlot,
  buildSameDaySiblingSlot,
  buildUpcomingSaturdaySlot,
  formatSlotButtonLabel,
  microsoftBookingCalendar,
  preparePublicBookingConfirmedPage,
  preparePublicBookingPage,
} from "./booking-harness";

test.describe("public booking page", () => {
  test("legacy /book path redirects to /meet and keeps the query string", async ({
    page,
  }) => {
    await page.goto("/book/tylerdane?token=abc", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/meet\/tylerdane/);
    expect(new URL(page.url()).searchParams.get("token")).toBe("abc");

    await page.goto("/book/cancel/000000000000000000000099?token=abc", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/meet\/cancel\/000000000000000000000099/);
    expect(new URL(page.url()).searchParams.get("token")).toBe("abc");
  });
  test("renders Teams copy for a Microsoft destination on the public page and confirmation", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page, {
      conference: microsoftBookingCalendar.conference,
      createsGoogleMeet: microsoftBookingCalendar.createsGoogleMeet,
    });

    await expect(page.getByText("30 minutes Microsoft Teams")).toBeVisible();
    await expect(page.getByText("30 minutes Google Meet")).toHaveCount(0);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByText("A Microsoft Teams invite is on its way to your email."),
    ).toBeVisible();
    await expect(
      page.getByText("A Google Meet invite is on its way to your email."),
    ).toHaveCount(0);
  });

  test("renders no-video copy for an Apple destination on the public page and confirmation", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page, {
      conference: appleBookingCalendar.conference,
      createsGoogleMeet: appleBookingCalendar.createsGoogleMeet,
    });

    await expect(page.getByText("30 minutes")).toBeVisible();
    await expect(page.getByText("30 minutes Google Meet")).toHaveCount(0);
    await expect(page.getByText("30 minutes Microsoft Teams")).toHaveCount(0);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByText("The calendar invite is on its way to your email."),
    ).toBeVisible();
    await expect(
      page.getByText("A Google Meet invite is on its way to your email."),
    ).toHaveCount(0);
    await expect(
      page.getByText("A Microsoft Teams invite is on its way to your email."),
    ).toHaveCount(0);
  });

  test("shows unavailable when the host calendar is not bookable", async ({
    page,
  }) => {
    await preparePublicBookingPage(page, { bookable: false });

    const heading = page.getByRole("heading", {
      name: "Meeting temporarily unavailable",
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("id", "booking-status-heading");
    await expect(
      page.getByText("The host calendar is not ready for new meetings."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Previous month" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next month" })).toHaveCount(
      0,
    );
  });

  test("loads without login and shows the host heading", async ({ page }) => {
    await preparePublicBookingPage(page);

    await expect(
      page.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeVisible();
    await expect(page.getByText("30 minutes Google Meet")).toBeVisible();
    await expect(page.getByText(/Times shown in your timezone/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
  });

  test("old address is not found after a rename and the new address shows the picker", async ({
    page,
  }) => {
    await preparePublicBookingPage(page, {
      slug: "old-address",
      notFound: true,
    });
    await expect(
      page.getByRole("heading", { name: "Meeting page not found" }),
    ).toBeVisible();

    await page.unroute("**/api/**");
    await preparePublicBookingPage(page, { slug: "new-address" });
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
  });

  test("shows Saturday times when Saturday has bookable slots", async ({
    page,
  }) => {
    const saturday = buildUpcomingSaturdaySlot();
    await preparePublicBookingPage(page, { slots: [saturday] });

    const slotButton = page.getByRole("button", {
      name: formatSlotButtonLabel(saturday.slotStart),
    });
    if (await page.getByText("No open times this month.").isVisible()) {
      await page
        .getByRole("button", { name: "Jump to next available day" })
        .click();
    }

    await expect(slotButton).toBeVisible();
    const saturdayName = await page.evaluate((iso) => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(iso));
    }, saturday.slotStart);
    await expect(
      page.getByRole("button", { name: saturdayName }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("walks the picker with the keyboard via the skip link", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to open times" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: formatSlotButtonLabel(slotStart) }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Change time" }),
    ).toBeFocused();
  });

  test("confirms a booking against stubbed APIs", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    const captured = await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Change time" }),
    ).toBeVisible();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(page.getByText("When")).toBeVisible();
    await expect(page.getByText("Duration")).toBeVisible();
    await expect(page.getByText("Timezone")).toBeVisible();
    await expect(
      page.getByText("A Google Meet invite is on its way to your email."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
      }),
    ).toHaveCount(0);
    expect(captured.reservationPosts).toHaveLength(1);
    expect(captured.reservationPosts[0]).toMatchObject({
      slotStart,
      guestName: "Guest User",
      guestEmail: "guest@example.com",
      durationMinutes: 30,
    });
  });

  test("returns to the host page on Escape from confirmation", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();
    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/\/meet\/tylerdane(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeFocused();
  });

  test("overrides the guest timezone on the reservation", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    const captured = await preparePublicBookingPage(page);

    await expect(
      page.getByRole("button", { name: /^Timezone:/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Timezone:/ }).click();
    await page.getByRole("combobox").fill("berlin");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: /^Timezone: Berlin/ }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: formatSlotButtonLabel(slotStart, "Europe/Berlin"),
      })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    expect(captured.reservationPosts).toHaveLength(1);
    expect(captured.reservationPosts[0]).toMatchObject({
      slotStart,
      guestTimeZone: "Europe/Berlin",
    });
  });

  test("keeps confirmation details after a refresh", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(page).toHaveURL(
      /\/meet\/confirmed\/000000000000000000000099\?token=abc$/,
    );
    await expect(
      page.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(page.getByText("When")).toBeVisible();
    await expect(page.getByText("Duration")).toBeVisible();
    await expect(page.getByText("30 minutes")).toBeVisible();
    await expect(page).toHaveURL(
      /\/meet\/confirmed\/000000000000000000000099\?token=abc$/,
    );
    await expect(
      page.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reschedule this meeting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
  });

  test("does not promise an invite cancel link on a cold confirmation permalink", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page);
    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    await expect(page.getByRole("button", { name: /^Copy / })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Cancel this meeting" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("A Google Meet invite is on its way to your email."),
    ).toBeVisible();
    await expect(
      page.getByText(/To cancel, use the link in that invite/),
    ).toHaveCount(0);
  });

  test("shows a calm state for a cancelled confirmation permalink", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationStatus: "cancelled",
    });
    await expect(
      page.getByRole("heading", { name: "This meeting was canceled" }),
    ).toBeFocused();
  });

  test("shows a calm state for an unknown confirmation permalink", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationNotFound: true,
    });
    await expect(
      page.getByRole("heading", { name: "Meeting not found" }),
    ).toBeFocused();
  });

  test("shows a retryable heading when the confirmation GET fails", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationGetStatus: 500,
    });
    await expect(
      page.getByRole("heading", { name: "Could not load meeting" }),
    ).toBeFocused();
  });

  test("does not POST when email is missing", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    const captured = await preparePublicBookingPage(page);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    expect(captured.reservationPosts).toHaveLength(0);
    await expect(page.getByLabel("Email")).toBeFocused();
  });

  test("scrolls later times in the selected day's slot pane", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 480 });

    const origin = buildBookableSlot();
    // Fill the origin's whole UTC day from midnight: counting forward from
    // the origin left too few slots to scroll when the suite ran late in the
    // UTC day (the origin can fall back to now + 2h).
    const dayStart = new Date(origin.slotStart);
    dayStart.setUTCHours(0, 0, 0, 0);
    const slots: Array<{ slotStart: string; slotEnd: string }> = [];
    for (let index = 0; index < 40; index += 1) {
      const slotStart = new Date(dayStart.getTime() + index * 15 * 60 * 1000);
      slots.push({
        slotStart: slotStart.toISOString(),
        slotEnd: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(),
      });
    }

    await preparePublicBookingPage(page, { slots });

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const heading = Array.from(document.querySelectorAll("h2")).find(
            (node) => node.textContent === "Pick a time",
          );
          let node = heading?.parentElement ?? null;
          while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (style.overflowY === "auto" || style.overflowY === "scroll") {
              return node.scrollHeight > node.clientHeight + 20;
            }
            node = node.parentElement;
          }
          const scrolling = document.scrollingElement;
          return Boolean(
            scrolling && scrolling.scrollHeight > scrolling.clientHeight + 40,
          );
        }),
      )
      .toBe(true);

    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent === "Pick a time",
      );
      let node = heading?.parentElement ?? null;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          node.scrollTop = 600;
          return;
        }
        node = node.parentElement;
      }
    });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const heading = Array.from(document.querySelectorAll("h2")).find(
            (node) => node.textContent === "Pick a time",
          );
          let node = heading?.parentElement ?? null;
          while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (style.overflowY === "auto" || style.overflowY === "scroll") {
              return node.scrollTop;
            }
            node = node.parentElement;
          }
          return window.scrollY;
        }),
      )
      .toBeGreaterThan(80);
  });

  test("refreshes slots and shows a conflict message on 409", async ({
    page,
  }) => {
    const first = buildBookableSlot();
    const second = buildSameDaySiblingSlot(first);
    const captured = await preparePublicBookingPage(page, {
      confirmStatus: 409,
      slots: [first, second],
    });

    await page
      .getByRole("button", { name: formatSlotButtonLabel(first.slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByLabel("Notes (optional)").fill("Bring slides");
    await page.getByRole("button", { name: "Confirm meeting" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toHaveText(
      "This time is no longer available. Pick another slot.",
    );
    await expect(alert).toBeFocused();
    await expect(page.getByLabel("Name")).toHaveValue("Guest User");
    await expect(page.getByLabel("Email")).toHaveValue("guest@example.com");
    await expect(page.getByLabel("Notes (optional)")).toHaveValue(
      "Bring slides",
    );
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(first.slotStart),
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: "Confirm meeting" }),
    ).toBeDisabled();
    await expect.poll(() => captured.slotGets).toBeGreaterThan(1);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(second.slotStart) })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm meeting" }),
    ).toBeEnabled();
    await expect(page.getByLabel("Name")).toHaveValue("Guest User");
  });

  test("renders a prefetched month without issuing a new slots request", async ({
    page,
  }) => {
    const captured = await preparePublicBookingPage(page);

    await expect(
      page.getByRole("button", { name: "Previous month" }),
    ).toBeDisabled();
    const next = page.getByRole("button", { name: "Next month" });
    await expect(next).toBeEnabled();
    await next.hover();
    await expect.poll(() => captured.slotGets).toBeGreaterThanOrEqual(2);
    await next.click();
    await expect(
      page.getByRole("button", { name: "Previous month" }),
    ).toBeEnabled();
    await expect(page.getByText("Loading open times")).toHaveCount(0);
    // Adjacent prefetch of the month after next may still be in flight when
    // the 60-day horizon reaches that month (from 2 Sep, 1 Nov is in range).
    // Do not require a third fetch; snapshot only after the count is stable
    // so revisiting the prefetched month is not blamed for that request.
    let previousGets = -1;
    await expect
      .poll(() => {
        const n = captured.slotGets;
        const stable = n >= 2 && n === previousGets;
        previousGets = n;
        return stable;
      })
      .toBe(true);
    const afterArrive = captured.slotGets;
    expect(afterArrive).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: "Previous month" }).click();
    await next.click();
    await page.waitForLoadState("networkidle");
    expect(captured.slotGets).toBe(afterArrive);

    const firstWindow = captured.slotQueries[0];
    expect(firstWindow?.start).toBeTruthy();
    expect(firstWindow?.end).toBeTruthy();
    const startMs = Date.parse(firstWindow?.start ?? "");
    const endMs = Date.parse(firstWindow?.end ?? "");
    expect(endMs - startMs).toBeGreaterThan(0);
    expect(endMs - startMs).toBeLessThanOrEqual(32 * 24 * 60 * 60 * 1000);
  });

  test("selects a highlighted day from the month grid", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    const dayName = await page.evaluate((iso) => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(iso));
    }, slotStart);

    const dayButton = page.getByRole("button", { name: dayName });
    await expect(dayButton).toBeVisible();
    await dayButton.click();
    await expect(dayButton).toHaveAttribute("aria-pressed", "true");

    await dayButton.focus();
    await page.keyboard.press("ArrowRight");
    await expect(dayButton).toBeFocused();
  });

  test("shows only the selected day's times in the slot pane", async ({
    page,
  }) => {
    const today = buildBookableSlot();
    const laterToday = buildSameDaySiblingSlot(today);
    const otherDayStart = new Date(
      Date.parse(today.slotStart) + 25 * 60 * 60 * 1000,
    ).toISOString();
    const otherDay = {
      slotStart: otherDayStart,
      slotEnd: new Date(
        Date.parse(otherDayStart) + 30 * 60 * 1000,
      ).toISOString(),
    };

    await preparePublicBookingPage(page, {
      slots: [today, laterToday, otherDay],
    });

    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(today.slotStart),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(laterToday.slotStart),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(otherDay.slotStart),
      }),
    ).toHaveCount(0);

    const monthBox = await page
      .getByRole("heading", { name: /20\d{2}$/ })
      .boundingBox();
    const slotsBox = await page
      .getByRole("heading", { name: "Pick a time" })
      .boundingBox();
    expect(monthBox).toBeTruthy();
    expect(slotsBox).toBeTruthy();
    expect(Math.abs((monthBox?.y ?? 0) - (slotsBox?.y ?? 0))).toBeLessThan(80);
    expect(monthBox?.x ?? 0).toBeLessThan(slotsBox?.x ?? 0);
  });

  test("jumps to the next open day in the following month", async ({
    page,
  }) => {
    const now = new Date();
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2, 16, 0, 0),
    );
    const nextMonthSlot = {
      slotStart: nextMonthStart.toISOString(),
      slotEnd: new Date(
        nextMonthStart.getTime() + 30 * 60 * 1000,
      ).toISOString(),
    };
    const nextMonthHeading = new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(nextMonthStart);

    await preparePublicBookingPage(page, { slots: [nextMonthSlot] });

    await expect(page.getByText("No open times this month.")).toBeVisible();
    await page
      .getByRole("button", { name: "Jump to next available day" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();

    await expect(
      page.getByRole("heading", { name: nextMonthHeading }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(nextMonthSlot.slotStart),
      }),
    ).toBeVisible();
  });

  test("stacks without horizontal scroll at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    const monthHeading = page.getByRole("heading", { name: /20\d{2}$/ });
    const slotsHeading = page.getByRole("heading", { name: "Pick a time" });
    const monthBox = await monthHeading.boundingBox();
    const slotsBox = await slotsHeading.boundingBox();
    expect(monthBox).toBeTruthy();
    expect(slotsBox).toBeTruthy();
    expect((monthBox?.y ?? 0) + (monthBox?.height ?? 0)).toBeLessThan(
      slotsBox?.y ?? 0,
    );

    const overflowX = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflowX).toBeLessThanOrEqual(1);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirm meeting" }),
    ).toBeVisible();
  });

  test("returns to the picker from Change time with the day still selected", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingPage(page);

    const dayName = await page.evaluate((iso) => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone,
      }).format(new Date(iso));
    }, slotStart);

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Change time" }).click();

    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();
    await expect(page.getByRole("button", { name: dayName })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: formatSlotButtonLabel(slotStart) }),
    ).toHaveAttribute("aria-pressed", "true");

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await expect(page.getByLabel("Name")).toHaveValue("Guest User");
    await expect(page.getByLabel("Email")).toHaveValue("guest@example.com");
  });

  test("does not POST twice while confirm is in flight", async ({ page }) => {
    const { slotStart } = buildBookableSlot();
    let release!: () => void;
    const holdConfirm = new Promise<void>((resolve) => {
      release = resolve;
    });
    const captured = await preparePublicBookingPage(page, { holdConfirm });

    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByLabel("Name").fill("Guest User");
    await page.getByLabel("Email").fill("guest@example.com");
    await page.getByRole("button", { name: "Confirm meeting" }).click();
    const confirming = page.getByRole("button", { name: "Confirming..." });
    await expect(confirming).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => captured.reservationPosts.length).toBe(1);
    await confirming.click({ force: true });
    expect(captured.reservationPosts).toHaveLength(1);
    release();
    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeFocused();
    expect(captured.reservationPosts).toHaveLength(1);
  });

  test("announces slot loading without replacing the host heading", async ({
    page,
  }) => {
    let release!: () => void;
    const holdFirstSlots = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preparePublicBookingPage(page, { holdFirstSlots });

    await expect(
      page.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Loading open times");
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Times loaded");
  });

  test("retries a failed slots request without a page reload", async ({
    page,
  }) => {
    const slot = buildBookableSlot();
    const slotFailGate = { fail: true };
    await preparePublicBookingPage(page, {
      slots: [slot],
      slotFailGate,
    });

    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Meet with Tyler Dane" }),
    ).toBeVisible();
    slotFailGate.fail = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", {
        name: formatSlotButtonLabel(slot.slotStart),
      }),
    ).toBeVisible();
  });
});

test.describe("public booking theme", () => {
  test("uses the light default when nothing is stored, even if OS is dark", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await preparePublicBookingPage(page);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "light-beach",
    );
  });

  test("keeps a stored dark theme when OS is light", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.theme", "dark-abyss");
    });
    await page.emulateMedia({ colorScheme: "light" });
    await preparePublicBookingPage(page);
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "dark-abyss",
    );
  });
});
