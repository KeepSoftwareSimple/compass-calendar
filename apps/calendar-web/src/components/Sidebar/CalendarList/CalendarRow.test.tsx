import { fireEvent, render, screen } from "@testing-library/react";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { CalendarRow } from "./CalendarRow";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

describe("CalendarRow pointer teach", () => {
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

  it("pulses focus-calendar-digit when toggled with the pointer", () => {
    const calendar = createMockCalendar({ name: "Work" });
    const onToggle = mock();

    render(
      <ul>
        <CalendarRow calendar={calendar} onToggle={onToggle} pickKey="1" />
      </ul>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /hide work calendar/i }),
      { detail: 1 },
    );

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      "pointer_hint_shown",
      expect.objectContaining({ shortcut_id: "focus-calendar-digit" }),
    );
    expect(usePointerHintStore.getState().latestAttempt?.message).toContain(
      "Next time: hold",
    );
  });
});
