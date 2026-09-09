import { expect, test } from "@playwright/test";
import {
  buildBookableSlot,
  dispatchClick,
  dispatchFill,
  expectMeetingShortcutChips,
  formatSlotButtonLabel,
  holdSettingsMod,
  preparePublicBookingCancelPage,
  preparePublicBookingConfirmedPage,
  preparePublicBookingPage,
  preparePublicBookingReschedulePage,
  prepareSignedInBookingSettingsPage,
  releaseSettingsMod,
} from "../booking/booking-harness";
import { expectNoAxeViolations } from "../utils/axe-assertion";

test.describe("public booking page color scheme", () => {
  (
    [
      { name: "light", theme: "light-beach", stored: null },
      { name: "dark", theme: "dark-abyss", stored: "dark-abyss" },
    ] as const
  ).forEach(({ name, theme, stored }) => {
    test.describe(`${name} theme`, () => {
      test("the picker has no automatically detectable accessibility violations", async ({
        page,
      }) => {
        if (stored) {
          await page.addInitScript((value) => {
            localStorage.setItem("compass.theme", value);
          }, stored);
        }
        await preparePublicBookingPage(page);
        await expect(
          page.getByRole("heading", { name: "Pick a time" }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectNoAxeViolations(page, {
          checkpoint: `public booking page ${name}`,
        });
      });

      test("the details step has no automatically detectable accessibility violations", async ({
        page,
      }) => {
        if (stored) {
          await page.addInitScript((value) => {
            localStorage.setItem("compass.theme", value);
          }, stored);
        }
        const { slotStart } = buildBookableSlot();
        await preparePublicBookingPage(page);
        await page
          .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
          .click();
        await expect(
          page.getByRole("heading", { name: "Your details" }),
        ).toBeVisible();
        await expectNoAxeViolations(page, {
          checkpoint: `public booking details ${name}`,
        });
      });
    });
  });
});

test("the public booking slots error has no automatically detectable accessibility violations", async ({
  page,
}) => {
  const slotFailGate = { fail: true };
  await preparePublicBookingPage(page, { slotFailGate });

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expectNoAxeViolations(page, {
    checkpoint: "public booking slots error",
  });
});

test("the unbookable public page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await preparePublicBookingPage(page, { bookable: false });
  await expect(
    page.getByRole("heading", { name: "Meeting temporarily unavailable" }),
  ).toBeVisible();
  await expectNoAxeViolations(page, {
    checkpoint: "public booking unbookable",
  });
});

test("the unbookable reschedule page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await preparePublicBookingReschedulePage(page, { bookable: false });
  await expect(
    page.getByRole("heading", { name: "Meeting temporarily unavailable" }),
  ).toBeVisible();
  await expectNoAxeViolations(page, {
    checkpoint: "public booking reschedule unbookable",
  });
});

test("the public booking conflict alert has no automatically detectable accessibility violations", async ({
  page,
}) => {
  const { slotStart } = buildBookableSlot();
  await preparePublicBookingPage(page, { confirmStatus: 409 });

  await page
    .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
    .click();
  await page.getByLabel("Name").fill("Guest User");
  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByRole("button", { name: "Confirm meeting" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expectNoAxeViolations(page, { checkpoint: "public booking conflict" });
});

test("the public booking unbookable state has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await preparePublicBookingPage(page, { bookable: false });
  await expect(
    page.getByRole("heading", { name: "Meeting temporarily unavailable" }),
  ).toBeVisible();
  await expectNoAxeViolations(page, {
    checkpoint: "public booking unbookable",
  });
});

test.describe("public booking confirmation page", () => {
  test("confirmed state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page);
    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking confirmation permalink",
    });
  });

  test("tokenized permalink confirmation has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, { token: "abc" });
    await expect(
      page.getByRole("heading", { name: "You're meeting with Tyler Dane" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking confirmation permalink with token",
    });
  });

  test("edit-details form has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      token: "abc",
      guestName: "Ada Lovelace",
      notes: "bring coffee",
    });
    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit details" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expectNoAxeViolations(page, {
      checkpoint: "booking edit details",
    });
  });

  test("cancelled state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationStatus: "cancelled",
    });
    await expect(
      page.getByRole("heading", { name: "This meeting was canceled" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking confirmation cancelled",
    });
  });

  test("not-found state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationNotFound: true,
    });
    await expect(
      page.getByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking confirmation not found",
    });
  });

  test("load-error state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingConfirmedPage(page, {
      reservationGetStatus: 500,
    });
    await expect(
      page.getByRole("heading", { name: "Could not load meeting" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking confirmation load error",
    });
  });
});

test.describe("public booking cancel page", () => {
  test("confirm state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingCancelPage(page);
    await expect(
      page.getByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { checkpoint: "cancel confirm" });
  });

  test("cancelling state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    let release!: () => void;
    const holdCancel = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preparePublicBookingCancelPage(page, { holdCancel });
    await page.getByRole("button", { name: "Cancel this meeting" }).click();
    await expect(
      page.getByRole("button", { name: "Canceling..." }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { checkpoint: "cancel in-flight" });
    release();
    await expect(
      page.getByRole("heading", { name: "Meeting canceled" }),
    ).toBeVisible();
  });

  test("canceled state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingCancelPage(page);
    await page.getByRole("button", { name: "Cancel this meeting" }).click();
    await expect(
      page.getByRole("heading", { name: "Meeting canceled" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { checkpoint: "cancel success" });
  });

  test("not-found state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingCancelPage(page, { token: "" });
    await expect(
      page.getByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { checkpoint: "cancel not found" });
  });

  test("error state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingCancelPage(page, { cancelStatus: 500 });
    await page.getByRole("button", { name: "Cancel this meeting" }).click();
    await expect(
      page.getByRole("heading", { name: "Could not cancel meeting" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { checkpoint: "cancel error" });
  });
});

test.describe("public booking reschedule page", () => {
  test("picker has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingReschedulePage(page);
    await expect(
      page.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pick a time" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking reschedule picker",
    });
  });

  test("not-found state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingReschedulePage(page, { token: "" });
    await expect(
      page.getByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking reschedule not found",
    });
  });

  test("canceled state has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await preparePublicBookingReschedulePage(page, {
      reservationStatus: "cancelled",
    });
    await expect(
      page.getByRole("heading", { name: "This meeting was canceled" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking reschedule canceled",
    });
  });

  test("conflict alert has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    const { slotStart } = buildBookableSlot();
    await preparePublicBookingReschedulePage(page, { rescheduleStatus: 409 });
    await page
      .getByRole("button", { name: formatSlotButtonLabel(slotStart) })
      .click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "booking reschedule conflict",
    });
  });
});

test.describe("settings booking section", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(settingsDialog.getByLabel("Duration")).toBeVisible();
    await expect(
      settingsDialog.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", "true");
    // Scoped to the dialog: the calendar shell behind the modal is not this
    // suite's subject and has its own pre-existing findings.
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking",
      include: "[role='dialog']",
    });
  });

  test("number-field errors have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await settingsDialog.getByText("More options", { exact: true }).click();
    await dispatchFill(settingsDialog.getByLabel("Maximum horizon (days)"), "");
    await expect(settingsDialog.getByText("Enter 1 to 60 days.")).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking error",
      include: "[role='dialog']",
    });
  });

  test("inline save errors have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    for (const name of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]) {
      await dispatchClick(settingsDialog.getByRole("checkbox", { name }));
    }
    await dispatchClick(
      settingsDialog.getByRole("switch", { name: "Meeting page" }),
    );
    await expect(
      settingsDialog.getByRole("alert").filter({
        hasText: "Add weekly hours before turning on your meeting page.",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking inline save error",
      include: "[role='dialog']",
    });
  });

  test("weekly hours menus have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await dispatchClick(
      settingsDialog.getByRole("button", { name: "Add hours to Monday" }),
    );
    await expect(
      settingsDialog.getByRole("combobox", { name: "Monday start 2" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking weekly hours menus",
      include: "[role='dialog']",
    });
  });

  test("two Tuesday blocks with More options open have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await dispatchClick(
      settingsDialog.getByRole("button", { name: "Add hours to Tuesday" }),
    );
    await expect(
      settingsDialog.getByRole("combobox", { name: "Tuesday start 2" }),
    ).toBeVisible();
    await settingsDialog.getByText("More options", { exact: true }).click();
    await expect(settingsDialog.getByLabel("Page address")).toBeVisible();
    await expect(
      settingsDialog.getByRole("button", { name: /Meeting timezone:/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking two blocks more options",
      include: "[role='dialog']",
    });
  });

  test("address errors have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await settingsDialog.getByText("More options", { exact: true }).click();
    const address = settingsDialog.getByLabel("Page address");
    await address.click();
    await dispatchFill(address, "ab");
    await settingsDialog.getByLabel("Duration").click();
    await expect(
      settingsDialog.getByText(
        "Use 3 to 32 lowercase letters, digits, or hyphens",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking address error",
      include: "[role='dialog']",
    });
  });

  test("address change warning has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await settingsDialog.getByText("More options", { exact: true }).click();
    await dispatchFill(
      settingsDialog.getByLabel("Page address"),
      "new-address",
    );
    await expect(
      settingsDialog.getByText(
        "Links using your old address will stop working.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking address warning",
      include: "[role='dialog']",
    });
  });

  test("connect pills have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      healthyConnection: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(
      settingsDialog.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeVisible();
    await expect(
      settingsDialog.getByRole("button", {
        name: "Connect Microsoft Calendar",
      }),
    ).toBeVisible();
    await expect(
      settingsDialog.getByRole("button", { name: "Connect Apple Calendar" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking connect pills",
      include: "[role='dialog']",
    });
  });

  test("hold-Mod chips have no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(
      settingsDialog.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", "true");

    await holdSettingsMod(page);
    try {
      await expectMeetingShortcutChips(settingsDialog);
      await expectNoAxeViolations(page, {
        checkpoint: "settings booking hold-mod chips",
        include: "[role='dialog']",
      });
    } finally {
      await releaseSettingsMod(page);
    }
  });

  test("not-live status has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(
      settingsDialog.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      settingsDialog.getByText("Off. Turn it on to share your link."),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking not live",
      include: "[role='dialog']",
    });
  });

  test("open More options has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await settingsDialog.getByText("More options", { exact: true }).click();
    await expect(settingsDialog.getByLabel("Page address")).toBeVisible();
    await expect(
      settingsDialog.getByLabel("Minimum notice (hours)"),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking more options",
      include: "[role='dialog']",
    });
  });

  test("first-run address setup has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      configured: false,
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(
      settingsDialog
        .locator("p.text-text-muted")
        .filter({ hasText: /^Step 1 of \d+$/ }),
    ).toBeVisible();
    await expect(
      settingsDialog.getByRole("heading", { name: "Pick your address" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking first-run address",
      include: "[role='dialog']",
    });
  });

  test("first-run hours step has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      configured: false,
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Continue/ }),
    );
    await expect(
      settingsDialog
        .locator("p.text-text-muted")
        .filter({ hasText: /^Step 2 of \d+$/ }),
    ).toBeVisible();
    await expect(
      settingsDialog.getByRole("heading", {
        name: "When can people meet with you?",
      }),
    ).toBeVisible();
    await expect(
      settingsDialog.getByRole("button", { name: /Continue/ }),
    ).toBeEnabled();
    await expect(
      settingsDialog.getByRole("combobox", { name: "Monday start" }),
    ).toHaveAccessibleDescription(/Times are in/);
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking first-run hours",
      include: "[role='dialog']",
    });
  });

  test("first-run duration step has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      configured: false,
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Continue/ }),
    );
    await expect(
      settingsDialog
        .locator("p.text-text-muted")
        .filter({ hasText: /^Step 2 of \d+$/ }),
    ).toBeVisible();
    await page.keyboard.press("k");
    await expect(
      settingsDialog.getByRole("heading", { name: "How long is a meeting?" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking first-run duration",
      include: "[role='dialog']",
    });
  });

  test("first-run go-live step has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      configured: false,
      enabled: false,
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Continue/ }),
    );
    await expect(
      settingsDialog
        .locator("p.text-text-muted")
        .filter({ hasText: /^Step 2 of \d+$/ }),
    ).toBeVisible();
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await expect(
      settingsDialog.getByRole("heading", { name: "Ready to go live" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking first-run go live",
      include: "[role='dialog']",
    });
  });

  test("first-run taken-address error has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page, {
      configured: false,
      enabled: false,
    });
    await page.route("**/api/booking/page", async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "SLUG_TAKEN",
            message: "taken",
          }),
        });
      }
      return route.fallback();
    });
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(
      settingsDialog
        .locator("p.text-text-muted")
        .filter({ hasText: /^Step 1 of \d+$/ }),
    ).toBeVisible();
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Continue/ }),
    );
    await expect(
      settingsDialog.getByRole("alert").filter({
        hasText: "That address is already taken",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking first-run slug taken",
      include: "[role='dialog']",
    });
  });

  test("discard confirmation has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await settingsDialog.getByLabel("Duration").selectOption("30");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      checkpoint: "settings booking discard confirmation",
      include: "[role='dialog']",
    });
  });
});
