import { renderHook, waitFor } from "@testing-library/react";
import { createProviderAvailability } from "./provider-availability.factory";
import { describe, expect, it, mock } from "bun:test";

const getConfig = mock();

describe("useIsProviderAvailable", () => {
  it("reads connect flags from providers on the same config fetch", async () => {
    getConfig.mockClear();
    getConfig.mockResolvedValue({
      google: { isConfigured: true },
      providers: {
        google: { signIn: true, connect: true },
        microsoft: { signIn: false, connect: true },
        apple: { signIn: false, connect: false },
      },
    });
    const { resetProviderAvailabilityForTests, useIsProviderAvailable } =
      createProviderAvailability({
        getConfig,
        isGoogleAuthConfigured: true,
      });
    resetProviderAvailabilityForTests();

    const { result } = renderHook(() =>
      useIsProviderAvailable("microsoft", "connect"),
    );

    expect(result.current).toBe(false);
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it("lists every provider whose connect flag is true", async () => {
    getConfig.mockClear();
    getConfig.mockResolvedValue({
      google: { isConfigured: true },
      providers: {
        google: { signIn: true, connect: true },
        microsoft: { signIn: false, connect: true },
        apple: { signIn: false, connect: false },
      },
    });
    const { resetProviderAvailabilityForTests, useConnectableProviders } =
      createProviderAvailability({
        getConfig,
        isGoogleAuthConfigured: true,
      });
    resetProviderAvailabilityForTests();

    const { result } = renderHook(() => useConnectableProviders());

    expect(result.current).toEqual([]);
    await waitFor(() => {
      expect(result.current).toEqual(["google", "microsoft"]);
    });
  });
});
