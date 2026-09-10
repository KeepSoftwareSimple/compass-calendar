import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import { prepareCalendarPage } from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

type CompassE2EStoreWindow = Window & {
  __COMPASS_E2E_STORE__?: {
    connectApple?: {
      open: (initialEmail?: string) => void;
    };
  };
};

test("the Connect Apple Calendar form is accessible when open", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    if (pathname.endsWith("/api/config")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: E2E_APP_CONFIG_VERSION,
          providers: {
            google: { signIn: true, connect: true },
            microsoft: { signIn: false, connect: false },
            apple: { signIn: false, connect: true },
          },
        }),
      });
    }

    return route.continue();
  });

  await prepareCalendarPage(page);
  await page.waitForFunction(
    () =>
      (window as CompassE2EStoreWindow).__COMPASS_E2E_STORE__?.connectApple !=
      null,
  );
  await page.evaluate(() => {
    (
      window as CompassE2EStoreWindow
    ).__COMPASS_E2E_STORE__?.connectApple?.open();
  });

  await expect(
    page.getByRole("dialog", { name: "Connect Apple Calendar" }),
  ).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "connect apple calendar form",
  });
});
