import { renderHook, waitFor } from "@testing-library/react";
import { createProviderAvailability } from "./provider-availability.factory";
import { describe, expect, it, mock } from "bun:test";

const getConfig = mock();

const providerConfig = {
  providers: {
    google: { signIn: true, connect: true },
    microsoft: { signIn: false, connect: true },
    apple: { signIn: false, connect: false },
  },
};

describe("useIsProviderAvailable", () => {
  it("reads connect flags from providers on the same config fetch", async () => {
    getConfig.mockClear();
    getConfig.mockResolvedValue(providerConfig);
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

  it("gates google sign-in on the baked client id even when the backend is configured", async () => {
    getConfig.mockClear();
    getConfig.mockResolvedValue({
      providers: {
        google: { signIn: true, connect: true },
        microsoft: { signIn: false, connect: false },
        apple: { signIn: false, connect: false },
      },
    });
    const { resetProviderAvailabilityForTests, useIsProviderAvailable } =
      createProviderAvailability({
        getConfig,
        isGoogleAuthConfigured: false,
      });
    resetProviderAvailabilityForTests();

    const { result } = renderHook(() =>
      useIsProviderAvailable("google", "signIn"),
    );

    await waitFor(() => {
      expect(getConfig).toHaveBeenCalledTimes(1);
    });
    expect(result.current).toBe(false);
  });

  it("lets google connect succeed without a baked client id", async () => {
    getConfig.mockClear();
    getConfig.mockResolvedValue({
      providers: {
        google: { signIn: true, connect: true },
        microsoft: { signIn: false, connect: false },
        apple: { signIn: false, connect: false },
      },
    });
    const { resetProviderAvailabilityForTests, useIsProviderAvailable } =
      createProviderAvailability({
        getConfig,
        isGoogleAuthConfigured: false,
      });
    resetProviderAvailabilityForTests();

    const { result } = renderHook(() =>
      useIsProviderAvailable("google", "connect"),
    );

    expect(result.current).toBe(false);
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});
