import { expect, type Page } from "@playwright/test";

const LOCAL_DB_NAME = "compass-local";

// LocalEventRecord (B13) nests the event under `.event`; title lives at
// `.event.content.title` (kind "details") and the schedule is a discriminated
// union ("timed"/"allDay" both use start/end) rather than flat
// startDate/endDate columns on the row.
export const getSavedEventsByTitle = (page: Page, title: string) =>
  page.evaluate(async (eventTitle) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("compass-local");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    type LocalEventRecord = {
      event: {
        content: { kind: string; title?: string };
        schedule: { kind: "timed" | "allDay"; start: string; end: string };
      };
    };

    try {
      const records = await new Promise<LocalEventRecord[]>(
        (resolve, reject) => {
          const transaction = db.transaction("events", "readonly");
          const request = transaction.objectStore("events").getAll();

          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        },
      );

      return records
        .filter(
          (record) =>
            record.event.content.kind === "details" &&
            record.event.content.title === eventTitle,
        )
        .map(({ event }) => ({
          title: event.content.title,
          startDate: event.schedule.start,
          endDate: event.schedule.end,
        }));
    } finally {
      db.close();
    }
  }, title);

/** Rendered week day-label dates in column order, as local YYYY-MM-DD. */
export const getVisibleDayDates = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#weekGridScroller [title]")]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => node.title)
      // Day labels use the compact YYYYMMDD title format; skips e.g. the now line
      .filter((title) => /^\d{8}$/.test(title))
      .map(
        (title) =>
          `${title.slice(0, 4)}-${title.slice(4, 6)}-${title.slice(6, 8)}`,
      ),
  );

// Shared timeout for form operations - use a single reasonable timeout instead of short retries
const FORM_TIMEOUT = 10000;

/**
 * Dispatch a keyboard shortcut on `document`. Playwright's Control+K is
 * swallowed by Chromium chrome; this matches the app's pressKey utility and
 * the `]` sidebar helper that already works in e2e.
 */
const pressShortcut = async (
  page: Page,
  key: string,
  modifiers: {
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  } = {},
) => {
  await page.evaluate(
    ({ shortcut, modifiers: nextModifiers }) => {
      const init = {
        key: shortcut,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: Boolean(nextModifiers.ctrlKey),
        metaKey: Boolean(nextModifiers.metaKey),
        altKey: Boolean(nextModifiers.altKey),
        shiftKey: Boolean(nextModifiers.shiftKey),
      };
      document.dispatchEvent(new KeyboardEvent("keydown", init));
      document.dispatchEvent(new KeyboardEvent("keyup", init));
    },
    { shortcut: key, modifiers },
  );
};

/**
 * The header's date title doubles as the Day/Week switcher trigger, so it's
 * the sole button inside the page's one <h1> regardless of which view or
 * date it displays.
 */
export const getViewSwitcherButton = (page: Page) =>
  page.getByRole("heading", { level: 1 }).getByRole("button");

const ensureWeekView = async (page: Page) => {
  if (page.url().includes("/week")) {
    return;
  }

  await getViewSwitcherButton(page).waitFor({
    state: "visible",
    timeout: 5000,
  });
  await blurActiveElement(page);
  await page.keyboard.press("w");
  await page.waitForURL((url) => url.pathname.startsWith("/week"), {
    timeout: 10000,
  });
};

const blurActiveElement = async (page: Page) => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
};

/**
 * Dispatch a key so browser chrome (Ctrl+K search) and Playwright's
 * synthesized focus path cannot swallow app shortcuts.
 */
export const dispatchDocumentKey = async (
  page: Page,
  key: string,
  modifiers: {
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  } = {},
) => {
  await blurActiveElement(page);
  await page.locator("#mainGrid").focus();
  await pressShortcut(page, key, modifiers);
};

export const getPaletteSearch = (page: Page) =>
  page.getByLabel("Command palette search");

export const openCommandPaletteWithKeyboard = async (page: Page) => {
  await blurActiveElement(page);
  await page.locator("#mainGrid").focus();
  const search = getPaletteSearch(page);

  // Chromium steals Playwright's Control+K for browser search. Bare G also
  // opens the palette (nav-go-to-date) and is what capture-phase e2e can
  // actually deliver; try the Mod chord first, then G.
  const useMeta = await page.evaluate(
    () => /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent),
  );
  await pressShortcut(
    page,
    "k",
    useMeta ? { metaKey: true } : { ctrlKey: true },
  );
  try {
    await expect(search).toBeVisible({ timeout: 1500 });
    return;
  } catch {
    await pressShortcut(page, "g");
  }
  await expect(search).toBeVisible({ timeout: FORM_TIMEOUT });
};

/** Returns a locator for the form's title input */
const getFormTitleInput = (page: Page) =>
  page.getByRole("form").getByPlaceholder("Title");

const waitForCalendarShell = async (page: Page) => {
  await getViewSwitcherButton(page).waitFor({
    state: "visible",
    timeout: 15000,
  });
};

const clearClientAuthState = async (page: Page) => {
  await page.evaluate(() => {
    localStorage.removeItem("compass.auth");
  });
};

export const createEventTitle = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const updateEventTitle = (prefix: string) =>
  `${prefix} Updated ${Date.now()}`;

export const prepareCalendarPage = async (page: Page) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await waitForCalendarShell(page);
  await clearClientAuthState(page);

  await resetLocalEventDb(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForCalendarShell(page);

  await ensureWeekView(page);
  await page.locator("#mainGrid").waitFor({ state: "visible", timeout: 15000 });
  await blurActiveElement(page);
  await page.locator("#mainGrid").focus();
};

export const resetLocalEventDb = async (page: Page) => {
  await page.evaluate(async (dbName) => {
    const clearStore = async (
      db: IDBDatabase,
      storeName: string,
    ): Promise<void> => {
      if (!db.objectStoreNames.contains(storeName)) {
        return;
      }

      await new Promise<void>((resolve) => {
        const transaction = db.transaction(storeName, "readwrite");
        const clearRequest = transaction.objectStore(storeName).clear();
        clearRequest.onerror = () => resolve();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      });
    };

    await new Promise<void>((resolve) => {
      const deleteRequest = indexedDB.deleteDatabase(dbName);

      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => resolve();
      deleteRequest.onblocked = () => {
        // If the app still has an open connection, fall back to clearing stores
        // so tests still start from a clean state.
        const openRequest = indexedDB.open(dbName);
        openRequest.onerror = () => resolve();
        openRequest.onsuccess = async () => {
          const db = openRequest.result;
          await clearStore(db, "events");
          await clearStore(db, "tasks");
          db.close();
          resolve();
        };
      };
    });
  }, LOCAL_DB_NAME);
};

// The content pane transitions width over 200ms when the sidebar toggles
// (see WeekView.tsx's `transition-[width]` wrapper), so #mainGrid's column
// layout keeps changing for a beat after the sidebar becomes visible. Poll
// until its measured width stops moving so callers don't compute click/drag
// targets against a mid-transition column count.
const waitForMainGridWidthToSettle = async (page: Page) => {
  const mainGrid = page.locator("#mainGrid");
  const getWidth = () =>
    mainGrid.evaluate((el) => el.getBoundingClientRect().width);

  let previousWidth = await getWidth();

  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(50);
    const width = await getWidth();
    if (width === previousWidth) {
      return;
    }
    previousWidth = width;
  }

  throw new Error(
    `#mainGrid width never settled after 1s (still moving at ${previousWidth}px). ` +
      "A caller computed click/drag targets against this width right after " +
      "this timeout previously gave up silently, so a genuine layout stall " +
      "would show up as a confusing downstream failure instead of here.",
  );
};

export const ensureSidebarOpen = async (page: Page) => {
  const sidebar = page.locator("#sidebar");
  if (!(await sidebar.isVisible())) {
    await blurActiveElement(page);
    await page.locator("#mainGrid").focus();
    await pressShortcut(page, "]");
    await expect(sidebar).toBeVisible();
    await waitForMainGridWidthToSettle(page);
  }
};

export const getMainGridPoint = async (
  page: Page,
  { xRatio = 0.3, yRatio = 0.3 } = {},
) => {
  const mainGrid = page.locator("#mainGrid");
  await mainGrid.scrollIntoViewIfNeeded();
  const box = await mainGrid.boundingBox();

  if (!box) {
    throw new Error("Expected the week grid to be visible.");
  }

  return {
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio,
  };
};

/**
 * Fills the event form title and submits via the Save control (role=button, name Save).
 * Keyboard shortcuts for submit (Enter / Mod+Enter) are not driven here: Playwright’s
 * synthesized keyboard events are unreliable in headless Chromium on Linux CI; the Save
 * button matches the accessible UI and stays stable. Shortcut submit is covered in
 * EventForm unit tests.
 */
export const fillTitleAndSaveEventForm = async (page: Page, title: string) => {
  const titleInput = getFormTitleInput(page);
  await expect(titleInput).toBeVisible({ timeout: FORM_TIMEOUT });
  await titleInput.fill(title);
  const saveButton = page.getByRole("form").getByRole("button", {
    name: "Save",
  });
  // Save often sits in floating form UI that can re-render while Playwright is
  // performing pointer actionability checks. Dispatch a DOM click so React
  // handlers run against the currently mounted control.
  await saveButton.evaluate((el) => {
    (el as HTMLElement).click();
  });
  await titleInput.waitFor({ state: "hidden", timeout: FORM_TIMEOUT });
};

/** Opens a timed draft via the `c` shortcut (KEYMAP.createEvent). */
export const openTimedEventFormWithKeyboard = async (page: Page) => {
  const titleInput = getFormTitleInput(page);

  if (!(await titleInput.isVisible().catch(() => false))) {
    await blurActiveElement(page);
    await page.locator("#mainGrid").focus();
    await page.keyboard.press("c");
  }

  await titleInput.waitFor({ state: "visible", timeout: FORM_TIMEOUT });
};

/** Opens an all-day draft via the `Shift+C` shortcut. */
export const openAllDayEventFormWithKeyboard = async (page: Page) => {
  await blurActiveElement(page);
  await page.locator("#mainGrid").focus();
  await page.keyboard.press("Shift+C");
  await getFormTitleInput(page).waitFor({
    state: "visible",
    timeout: FORM_TIMEOUT,
  });
};

/** Focuses the event card and opens its form with Enter. */
export const openEventForEditingWithKeyboard = async (
  page: Page,
  eventTitle: string,
) => {
  const titleInput = getFormTitleInput(page);
  const eventButton = page.getByRole("button", { name: eventTitle }).last();

  await eventButton.waitFor({ state: "visible", timeout: FORM_TIMEOUT });
  await eventButton.focus();
  await page.keyboard.press("Enter");
  await expect(titleInput).toHaveValue(eventTitle, { timeout: FORM_TIMEOUT });
};

/**
 * Deletes the event whose form is open, driving the action row above the
 * title by keyboard (focus + Enter on a native button, so this doubles as
 * coverage that keyboard activation works).
 */
export const deleteEventWithKeyboard = async (page: Page) => {
  const form = page.getByRole("form");
  await expect(form).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  const deleteButton = form
    .getByRole("group", { name: "Event actions" })
    .getByRole("button", { name: "Delete" });
  await deleteButton.waitFor({ state: "visible", timeout: FORM_TIMEOUT });
  await deleteButton.focus();
  await page.keyboard.press("Enter");
};

export const expectTimedEventVisible = async (page: Page, title: string) => {
  await expect(
    page.locator("#mainGrid").getByRole("button", { name: title }),
  ).toBeVisible({ timeout: 8000 });
};

export const expectAllDayEventVisible = async (page: Page, title: string) => {
  await expect(
    page.locator("#allDayRow").getByRole("button", { name: title }),
  ).toBeVisible({ timeout: 8000 });
};

export const expectTimedEventMissing = async (page: Page, title: string) => {
  await expect(
    page.locator("#mainGrid").getByRole("button", { name: title }),
  ).toHaveCount(0, { timeout: 8000 });
};
