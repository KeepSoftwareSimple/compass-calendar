import { beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { CalendarRow } from "./CalendarRow";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

const sampleCalendar = createMockCalendar({
  backgroundColor: "#3366ff",
  isVisible: true,
  name: "Work",
});

describe("CalendarRow pointer teaching", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("pulses focus-calendar-digit after a pointer toggle click", () => {
    const onToggle = mock();

    render(
      <ul>
        <CalendarRow
          calendar={sampleCalendar}
          onToggle={onToggle}
          pickKey="1"
        />
      </ul>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /hide work calendar/i }),
      { detail: 1 },
    );

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(usePointerHintStore.getState().latestAttempt?.message).toContain(
      "Next time: hold",
    );
    expect(track).toHaveBeenCalledWith(
      "pointer_hint_shown",
      expect.objectContaining({ shortcut_id: "focus-calendar-digit" }),
    );
  });
});
