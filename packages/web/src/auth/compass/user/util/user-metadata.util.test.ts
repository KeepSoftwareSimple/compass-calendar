import { type UserMetadata } from "@core/types/user.types";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { BaseApi } from "@web/api/base/base.api";
import { resetGoogleReconnectRequiredForTests } from "@web/auth/providers/reconnect.state";
import { GOOGLE_DELAYED_TOAST_ID } from "@web/common/constants/toast.constants";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  applyUserMetadataSideEffects,
  refreshUserMetadata,
} from "./user-metadata.util";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const googleConnection = (
  connectionState: UserMetadata["connections"] extends (infer T)[] | undefined
    ? T extends { connectionState: infer S }
      ? S
      : never
    : never,
) => ({
  id: "conn-1",
  provider: "google" as const,
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "lance@example.com",
  connectionState,
  canSuggestContacts: false,
});

const healthy: UserMetadata = {
  connections: [googleConnection("HEALTHY")],
};
const attention: UserMetadata = {
  connections: [
    {
      ...googleConnection("ATTENTION"),
      state: "delayed",
    },
  ],
};
const reconnectRequired: UserMetadata = {
  connections: [
    {
      ...googleConnection("RECONNECT_REQUIRED"),
      state: "actionRequired",
      stateReason: "authorizationRevoked",
    },
  ],
};

describe("applyUserMetadataSideEffects - delayed toast lifecycle", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.error.mockClear();
    mocks.dismiss.mockClear();
    registerToastPort(port);
    resetGoogleReconnectRequiredForTests();
  });

  it("shows the delayed toast on ATTENTION", () => {
    applyUserMetadataSideEffects(attention);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toastId: GOOGLE_DELAYED_TOAST_ID }),
    );
  });

  it("does not re-show the toast on a repeated ATTENTION payload", () => {
    applyUserMetadataSideEffects(attention);
    mocks.error.mockClear();

    applyUserMetadataSideEffects(attention);

    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("dismisses the toast once the connection recovers", () => {
    applyUserMetadataSideEffects(attention);

    applyUserMetadataSideEffects(healthy);

    expect(mocks.dismiss).toHaveBeenCalledWith(GOOGLE_DELAYED_TOAST_ID);
  });

  it("does not dismiss the delayed toast on recovery if it was never shown", () => {
    applyUserMetadataSideEffects(healthy);

    expect(mocks.dismiss).not.toHaveBeenCalledWith(GOOGLE_DELAYED_TOAST_ID);
  });

  it("shows the toast again for a later, separate ATTENTION episode after recovering", () => {
    applyUserMetadataSideEffects(attention);
    applyUserMetadataSideEffects(healthy);
    mocks.error.mockClear();

    applyUserMetadataSideEffects(attention);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toastId: GOOGLE_DELAYED_TOAST_ID }),
    );
  });
});

describe("applyUserMetadataSideEffects - reconnect toast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.error.mockClear();
    registerToastPort(port);
    resetGoogleReconnectRequiredForTests();
  });

  it("does not raise a reconnect toast from metadata load", () => {
    applyUserMetadataSideEffects(reconnectRequired);

    expect(mocks.error).not.toHaveBeenCalled();
  });
});

describe("refreshUserMetadata force coalescing", () => {
  let get: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    get?.mockRestore();
    get = undefined;
  });

  it("chains concurrent force calls onto one trailing fetch", async () => {
    get = spyOn(BaseApi, "get");

    let resolveFirst!: (value: { data: UserMetadata }) => void;
    const first = new Promise<{ data: UserMetadata }>((resolve) => {
      resolveFirst = resolve;
    });
    get
      .mockImplementationOnce(() => first as never)
      .mockResolvedValue({
        data: healthy,
      } as never);

    const inFlight = refreshUserMetadata();
    const forceA = refreshUserMetadata({ force: true });
    const forceB = refreshUserMetadata({ force: true });

    resolveFirst({ data: attention });
    await Promise.all([inFlight, forceA, forceB]);

    expect(get).toHaveBeenCalledTimes(2);
  });
});
