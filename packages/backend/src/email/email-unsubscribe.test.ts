import { CONFIG } from "@backend/common/constants/config.constants";
import { buildUnsubscribeUrls } from "@backend/email/email-unsubscribe";
import { afterEach, describe, expect, it } from "bun:test";

describe("buildUnsubscribeUrls", () => {
  const originalBaseUrl = CONFIG.BASEURL;
  const originalFrom = CONFIG.EMAIL_FROM;

  afterEach(() => {
    CONFIG.BASEURL = originalBaseUrl;
    CONFIG.EMAIL_FROM = originalFrom;
  });

  it("points at the mounted route under the API base URL", () => {
    CONFIG.BASEURL = "https://staging.compasscalendar.com/api";
    CONFIG.EMAIL_FROM = "Compass <hello@mail.compasscalendar.com>";

    const urls = buildUnsubscribeUrls("abc.def");

    expect(urls.httpsUrl).toBe(
      "https://staging.compasscalendar.com/api/email/unsubscribe?token=abc.def",
    );
    expect(urls.listUnsubscribeHeader).toBe(
      "<mailto:unsubscribe@mail.compasscalendar.com?subject=Unsubscribe&body=abc.def>, <https://staging.compasscalendar.com/api/email/unsubscribe?token=abc.def>",
    );
  });
});
