import { act, renderHook } from "@testing-library/react";
import { type Calendar } from "@core/types/calendar.contracts";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  createMockCalendar,
  createMockConnection,
} from "@web/__tests__/utils/factories/calendar.factory";
import { AuthApi } from "@web/api/auth.api";
import { useDisconnectGoogleAccount } from "@web/auth/providers/useDisconnectAccount";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

const EMAIL = "lance@gmail.com";

describe("useDisconnectGoogleAccount", () => {
  afterEach(() => {
    resetToastPort();
  });

  it("drops only the disconnected provider's calendars when another provider shares the address", async () => {
    registerToastPort(createTestToastPort().port);
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);
    const google = createMockConnection(EMAIL, { id: "google-conn" });
    const microsoft = createMockConnection(EMAIL, {
      id: "ms-conn",
      provider: "microsoft",
    });
    userMetadataActions.set({
      google: { connectionState: "HEALTHY", connections: [google, microsoft] },
    });
    const googleCal = createMockCalendar({
      name: "Google primary",
      accountEmail: EMAIL,
    });
    const microsoftCal = createMockCalendar({
      name: "Microsoft primary",
      provider: "microsoft",
      accountEmail: EMAIL,
    });
    const { queryClient, wrapper } = createStoreWrapper();
    queryClient.setQueryData<Calendar[]>(calendarQueryKeys.all, [
      googleCal,
      microsoftCal,
    ]);

    const { result } = renderHook(() => useDisconnectGoogleAccount(), {
      wrapper,
    });
    await act(() => result.current.disconnect(microsoft));

    expect(disconnect).toHaveBeenCalledWith("ms-conn");
    // No calendar query is observed here, so the invalidation does not
    // refetch and the optimistic cache is what stays behind.
    expect(queryClient.getQueryData<Calendar[]>(calendarQueryKeys.all)).toEqual(
      [googleCal],
    );

    disconnect.mockRestore();
  });
});
