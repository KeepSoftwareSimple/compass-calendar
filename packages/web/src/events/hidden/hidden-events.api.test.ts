import { http } from "msw";
import { SetEventHiddenInputSchema } from "@core/types/event-visibility.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { HiddenEventsApi } from "@web/events/hidden/hidden-events.api";
import { describe, expect, it } from "bun:test";

const hiddenEventsUrl = `${ENV_WEB.API_BASEURL}/user/hidden-events`;

describe("HiddenEventsApi", () => {
  it("throws when a list response fails the schema", async () => {
    server.use(
      http.get(hiddenEventsUrl, () =>
        jsonResponse({ hiddenEventIds: [], extra: true }),
      ),
    );

    await expect(HiddenEventsApi.list()).rejects.toThrow();
  });

  it("throws when a set response fails the schema", async () => {
    server.use(
      http.put(hiddenEventsUrl, () =>
        jsonResponse({ hiddenEventIds: "evt-1" }),
      ),
    );

    await expect(
      HiddenEventsApi.set(
        SetEventHiddenInputSchema.parse({ eventId: "evt-1", hidden: true }),
      ),
    ).rejects.toThrow();
  });
});
