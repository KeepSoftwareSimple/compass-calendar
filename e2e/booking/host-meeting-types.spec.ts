import { expect, type Locator, test } from "@playwright/test";
import {
  dispatchClick,
  prepareSignedInBookingSettingsPage,
} from "./booking-harness";

test.use({ viewport: { width: 1600, height: 900 } });

const top = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return Math.round(rect!.y);
};

test.describe("host meeting types", () => {
  test("T adds a type below without moving the rows above", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    const list = settingsDialog.getByRole("list", { name: "Meeting types" });
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(1);
    const addButton = settingsDialog.getByRole("button", { name: /Add type/ });
    const firstRowTop = await top(rows.first());
    const addTop = await top(addButton);

    await rows.first().focus();
    await page.keyboard.press("t");
    await expect(rows).toHaveCount(2);
    await expect(
      settingsDialog.getByRole("textbox", { name: "Meeting type 2 name" }),
    ).toBeFocused();
    expect(await top(rows.first())).toBe(firstRowTop);

    await settingsDialog
      .getByRole("textbox", { name: "Meeting type 2 name" })
      .fill("Deep dive");
    await rows.nth(1).focus();
    await page.keyboard.press("t");
    await expect(rows).toHaveCount(3);
    expect(await top(rows.first())).toBe(firstRowTop);

    // At three types the add button hides but keeps its space.
    await expect(addButton).toHaveCount(0);
    const hiddenAdd = settingsDialog.locator(
      '[data-settings-shortcut="add-meeting-type"]',
    );
    await expect(hiddenAdd).toHaveCSS("visibility", "hidden");
    expect(await top(hiddenAdd)).toBeGreaterThan(addTop);
  });

  test("Delete removes a focused row but not while typing a name", async ({
    page,
  }) => {
    await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    const rows = settingsDialog
      .getByRole("list", { name: "Meeting types" })
      .getByRole("listitem");
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Add type/ }),
    );
    await expect(rows).toHaveCount(2);

    const name = settingsDialog.getByRole("textbox", {
      name: "Meeting type 2 name",
    });
    await expect(name).toBeFocused();
    await name.fill("Check-in");
    await page.keyboard.press("Home");
    await page.keyboard.press("Delete");
    await expect(rows).toHaveCount(2);
    await expect(name).toHaveValue("heck-in");

    await rows.nth(1).focus();
    await page.keyboard.press("Delete");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toBeFocused();
  });

  test("Mod+Enter still saves from a type name and a focused row", async ({
    page,
  }) => {
    const captured = await prepareSignedInBookingSettingsPage(page);
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    const rows = settingsDialog
      .getByRole("list", { name: "Meeting types" })
      .getByRole("listitem");
    await dispatchClick(
      settingsDialog.getByRole("button", { name: /Add type/ }),
    );
    const name = settingsDialog.getByRole("textbox", {
      name: "Meeting type 2 name",
    });
    await expect(name).toBeFocused();
    await name.fill("Deep dive");
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect.poll(() => captured.putBodies.length).toBe(1);
    expect(captured.putBodies[0]?.meetingTypes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Deep dive" })]),
    );

    await rows.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(name).toBeFocused();
    await name.fill("Deep dive 2");
    await page.keyboard.press("Enter");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect.poll(() => captured.putBodies.length).toBe(2);
    expect(captured.putBodies[1]?.meetingTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Deep dive 2" }),
      ]),
    );
  });
});
