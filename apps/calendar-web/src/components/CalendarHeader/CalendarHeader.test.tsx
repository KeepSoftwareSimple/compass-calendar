import { RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import * as trackModule from "@web/auth/posthog/track";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { CalendarHeader } from "./CalendarHeader";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

describe("CalendarHeader pointer teach", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    writeShortcutUsageProfile({ version: 2, actions: {}, shortcuts: {} });
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  afterEach(() => {
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("pulses nav-previous when the previous arrow is clicked with the pointer", async () => {
    const onPrev = mock();
    const router = createTestRouter(
      <CalendarHeader
        label="July 2026"
        nextLabel="Next week"
        onNext={mock()}
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
    expect(track).toHaveBeenCalledWith(
      "pointer_hint_shown",
      expect.objectContaining({ shortcut_id: "nav-previous" }),
    );
  });
});
