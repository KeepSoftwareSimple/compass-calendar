import { http, HttpResponse } from "msw";
import { SetEventHiddenInputSchema } from "@core/types/event-visibility.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { HiddenEventsApi } from "@web/events/hidden/hidden-events.api";
import { describe, expect, it } from "bun:test";

const hiddenEventsUrl = `${ENV_WEB.API_BASEURL}/user/hidden-events`;

describe("HiddenEventsApi", () => {
  it("throws when a list response fails the schema", async () => {
    server.use(
      http.get(hiddenEventsUrl, () => HttpResponse.json({ hiddenEventIds: [], extra: true })),
    );

    await expect(HiddenEventsApi.list()).rejects.toThrow();
  });

  it("throws when a set response fails the schema", async () => {
    server.use(
      http.put(hiddenEventsUrl, () => HttpResponse.json({ hiddenEventIds: "evt-1" })),
    );

    await expect(
      HiddenEventsApi.set(
        SetEventHiddenInputSchema.parse({ eventId: "evt-1", hidden: true }),
      ),
    ).rejects.toThrow();
  });
});
