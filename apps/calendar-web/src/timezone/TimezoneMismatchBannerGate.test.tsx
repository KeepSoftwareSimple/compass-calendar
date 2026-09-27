import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  getPinnedTimeZone,
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { TimezoneMismatchBannerGate } from "@web/timezone/TimezoneMismatchBannerGate";
import { timezoneMismatchCopy } from "@web/timezone/timezone-mismatch";
import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";

const mismatchRegion = () =>
  screen.queryByRole("region", { name: "Timezone mismatch" });

afterEach(() => {
  cleanup();
  act(() => {
    resetEffectiveTimeZoneStoreForTests();
  });
});

describe("TimezoneMismatchBannerGate", () => {
  it("does not render in Auto", () => {
    render(<TimezoneMismatchBannerGate />);
    expect(mismatchRegion()).not.toBeInTheDocument();
  });

  it("does not render when the pin matches the browser", () => {
    act(() => {
      setBrowserTimeZoneForTests("America/Denver");
      setPinnedTimeZone("America/Denver");
    });

    render(<TimezoneMismatchBannerGate />);
    expect(mismatchRegion()).not.toBeInTheDocument();
  });

  it("prompts to switch or keep when the pin differs from the browser", () => {
    act(() => {
      setBrowserTimeZoneForTests("America/Denver");
      setPinnedTimeZone("America/New_York");
    });

    const copy = timezoneMismatchCopy("America/Denver", "America/New_York");
    render(<TimezoneMismatchBannerGate />);

    expect(
      screen.getByRole("region", { name: "Timezone mismatch" }),
    ).toHaveTextContent(copy.message);
    expect(
      screen.getByRole("button", { name: copy.switchLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.keepLabel }),
    ).toBeInTheDocument();
  });

  it("pins the browser zone when Switch is chosen", async () => {
    const user = userEvent.setup();
    act(() => {
      setBrowserTimeZoneForTests("America/Denver");
      setPinnedTimeZone("America/New_York");
    });

    const copy = timezoneMismatchCopy("America/Denver", "America/New_York");
    render(<TimezoneMismatchBannerGate />);
    await user.click(screen.getByRole("button", { name: copy.switchLabel }));

    expect(getPinnedTimeZone()).toBe("America/Denver");
    expect(mismatchRegion()).not.toBeInTheDocument();
  });

  it("snoozes until the browser zone changes when Keep is chosen", async () => {
    const user = userEvent.setup();
    act(() => {
      setBrowserTimeZoneForTests("America/Denver");
      setPinnedTimeZone("America/New_York");
    });

    const denverCopy = timezoneMismatchCopy(
      "America/Denver",
      "America/New_York",
    );
    const { unmount } = render(<TimezoneMismatchBannerGate />);
    await user.click(
      screen.getByRole("button", { name: denverCopy.keepLabel }),
    );
    expect(mismatchRegion()).not.toBeInTheDocument();

    unmount();
    render(<TimezoneMismatchBannerGate />);
    expect(mismatchRegion()).not.toBeInTheDocument();

    act(() => {
      setBrowserTimeZoneForTests("America/Chicago");
    });
    const chicagoCopy = timezoneMismatchCopy(
      "America/Chicago",
      "America/New_York",
    );
    expect(
      screen.getByRole("region", { name: "Timezone mismatch" }),
    ).toHaveTextContent(chicagoCopy.message);
  });

  it("hides when another tab snoozes the same browser zone", () => {
    act(() => {
      setBrowserTimeZoneForTests("America/Denver");
      setPinnedTimeZone("America/New_York");
    });

    render(<TimezoneMismatchBannerGate />);
    expect(mismatchRegion()).toBeInTheDocument();

    act(() => {
      localStorage.setItem(
        STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
        "America/Denver",
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
        }),
      );
    });

    expect(mismatchRegion()).not.toBeInTheDocument();
  });
});
