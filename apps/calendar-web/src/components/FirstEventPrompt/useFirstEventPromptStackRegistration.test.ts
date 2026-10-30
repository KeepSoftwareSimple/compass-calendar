import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useFirstEventPromptStackRegistration } from "@web/components/FirstEventPrompt/useFirstEventPromptStackRegistration";
import { afterEach, describe, expect, it } from "bun:test";

describe("useFirstEventPromptStackRegistration", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-first-event-prompt-live");
    document.documentElement.style.removeProperty(
      "--compass-first-event-prompt-stack-height",
    );
  });

  it("marks the document while live and clears on unmount", () => {
    const anchorRef = createRef<HTMLDivElement>();
    const anchor = document.createElement("div");
    Object.defineProperty(anchor, "getBoundingClientRect", {
      value: () => ({
        height: 100,
        width: 200,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    anchorRef.current = anchor;
    document.body.append(anchor);

    const { unmount } = renderHook(() =>
      useFirstEventPromptStackRegistration(anchorRef, true),
    );

    expect(
      document.documentElement.getAttribute("data-first-event-prompt-live"),
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue(
        "--compass-first-event-prompt-stack-height",
      ),
    ).toBe("112px");

    unmount();
    expect(
      document.documentElement.getAttribute("data-first-event-prompt-live"),
    ).toBeNull();

    anchor.remove();
  });
});
