import { PublicBookingPageOwnerEditButton } from "@booking-web/booking/PublicBookingPageOwnerEditButton";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, spyOn } from "bun:test";

describe("PublicBookingPageOwnerEditButton", () => {
  it("navigates to meeting settings when E is pressed outside inputs", async () => {
    const assignSpy = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );

    render(
      <HotkeysProvider>
        <PublicBookingPageOwnerEditButton enabled />
      </HotkeysProvider>,
    );

    const user = userEvent.setup({ delay: null });
    await user.keyboard("e");

    expect(assignSpy).toHaveBeenCalledWith("/?meetingSetup=1");
    assignSpy.mockRestore();
  });

  it("does not fire E while typing in an input", async () => {
    const assignSpy = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );

    render(
      <HotkeysProvider>
        <input aria-label="Notes" />
        <PublicBookingPageOwnerEditButton enabled />
      </HotkeysProvider>,
    );

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByLabelText("Notes"));
    await user.keyboard("e");

    expect(assignSpy).not.toHaveBeenCalled();
    assignSpy.mockRestore();
  });
});
