import { RouterProvider } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import * as trackModule from "@web/auth/posthog/track";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { CalendarHeader } from "./CalendarHeader";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

describe("CalendarHeader pointer teaching", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("pulses nav-previous after a pointer click on the previous arrow", async () => {
    const onPrev = mock();
    const onNext = mock();
    const router = createTestRouter(
      <CalendarHeader
        label="June 2026"
        nextLabel="Next week"
        onNext={onNext}
        onPrev={onPrev}
        prevLabel="Previous week"
      />,
      { initialEntries: [ROOT_ROUTES.WEEK] },
    );

    render(<RouterProvider router={router} />);
    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }), {
      detail: 1,
    });

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(usePointerHintStore.getState().latestAttempt?.shortcutKey).toEqual([
      "j",
    ]);
    expect(track).toHaveBeenCalledWith("pointer_hint_shown", {
      intent: "chrome-click",
      shortcut_id: "nav-previous",
      source: "pointer",
      view: expect.any(String),
    });
  });
});
