import { fireEvent, render, screen } from "@testing-library/react";
import {
  initialFirstEventPromptState,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { datePickerHintActions } from "@web/shortcuts/tips/date-picker-hint.store";
import { useEventFormFocusStore } from "@web/shortcuts/tips/event-form-focus.store";
import { EventFormFooterTips } from "@web/views/Forms/EventForm/SaveSection/EventFormFooterTips";
import { beforeEach, describe, expect, it } from "bun:test";

describe("EventFormFooterTips", () => {
  beforeEach(() => {
    useFirstEventPromptStore.setState(initialFirstEventPromptState, true);
    useEventFormFocusStore.setState(
      {
        focusInsideForm: true,
        tabNavigationApplies: true,
        syncFromDocument: useEventFormFocusStore.getState().syncFromDocument,
        resetForTests: useEventFormFocusStore.getState().resetForTests,
      },
      true,
    );
    datePickerHintActions.pop("date-picker-event-form");
  });

  it("shows tab navigation with actions behind More while focus is in the form", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    render(<EventFormFooterTips />);

    const tips = screen.getByTestId("event-form-footer-tips");
    expect(tips.textContent).toContain("between fields");
    expect(tips.textContent).not.toContain("0 for actions");

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(tips.textContent).toContain("0 for actions");
    expect(screen.queryByRole("button", { name: "Hide tips" })).toBeNull();
  });

  it("hides footer tips while the date picker sidebar hint is active", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    datePickerHintActions.push({
      id: "date-picker-event-form",
      parts: [{ keys: ["Enter"] }, " pick"],
      secondaryParts: [{ keys: ["PageDown"] }, " month"],
    });
    render(<EventFormFooterTips />);
    expect(screen.queryByTestId("event-form-footer-tips")).toBeNull();
  });

  it("shows actions on the primary row when tab navigation does not apply", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    useEventFormFocusStore.setState({ tabNavigationApplies: false }, false);
    render(<EventFormFooterTips />);

    const tips = screen.getByTestId("event-form-footer-tips");
    expect(tips.textContent).not.toContain("between fields");
    expect(tips.textContent).toContain("0 for actions");
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });
});
