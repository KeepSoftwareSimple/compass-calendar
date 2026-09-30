import { beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import {
  initialPointerHintState,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { resetPointerIntentSessionForTests } from "@web/views/Week/pointer-intent/pointer-intent.session";
import { SaveSection } from "./SaveSection";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

describe("SaveSection pointer teaching", () => {
  beforeEach(() => {
    track.mockClear();
    resetPointerIntentSessionForTests();
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("pulses edit-save after a pointer click on save", () => {
    const onSubmit = mock();

    render(<SaveSection onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /save/i }), {
      detail: 1,
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(
      "pointer_hint_shown",
      expect.objectContaining({ shortcut_id: "edit-save" }),
    );
  });
});
