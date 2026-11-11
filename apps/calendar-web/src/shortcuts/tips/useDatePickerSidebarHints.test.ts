import { renderHook } from "@testing-library/react";
import {
  resetDatePickerHintStoreForTests,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";
import { useCaptionableGridDatePickerHint } from "@web/shortcuts/tips/useDatePickerSidebarHints";
import { afterEach, describe, expect, it } from "bun:test";

describe("useCaptionableGridDatePickerHint", () => {
  afterEach(() => {
    resetDatePickerHintStoreForTests();
  });

  it("replaces the day-grid id with the caption id when year view opens", () => {
    const { rerender } = renderHook(
      (props: {
        baseId: "date-picker-event-form";
        isOpen: boolean;
        captionView: "day" | "year" | "month";
        inputPhrase: string;
      }) => useCaptionableGridDatePickerHint(props),
      {
        initialProps: {
          baseId: "date-picker-event-form",
          isOpen: true,
          captionView: "day",
          inputPhrase: "start date",
        },
      },
    );

    expect(useDatePickerHintStore.getState().stack.map((s) => s.id)).toEqual([
      "date-picker-event-form",
    ]);

    rerender({
      baseId: "date-picker-event-form",
      isOpen: true,
      captionView: "year",
      inputPhrase: "start date",
    });

    expect(useDatePickerHintStore.getState().stack.map((s) => s.id)).toEqual([
      "date-picker-event-form-caption",
    ]);
  });

  it("drops both ids when the picker closes", () => {
    const { rerender } = renderHook(
      (props: {
        baseId: "date-picker-life";
        isOpen: boolean;
        captionView: "day" | "year" | "month";
        inputPhrase: string;
      }) => useCaptionableGridDatePickerHint(props),
      {
        initialProps: {
          baseId: "date-picker-life",
          isOpen: true,
          captionView: "month",
          inputPhrase: "birth date",
        },
      },
    );

    rerender({
      baseId: "date-picker-life",
      isOpen: false,
      captionView: "month",
      inputPhrase: "birth date",
    });

    expect(useDatePickerHintStore.getState().stack).toEqual([]);
  });
});
