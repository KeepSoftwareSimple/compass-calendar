import { renderHook } from "@testing-library/react";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useEventContextMenuShortcut } from "@web/shortcuts/context-menu/useEventContextMenuShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const pressM = () => {
  (document.activeElement ?? document).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "m",
      bubbles: true,
      cancelable: true,
    }),
  );
};

const addEventCard = (eventId: string) => {
  const card = document.createElement("div");
  card.setAttribute("data-week-interaction-event-id", eventId);
  card.tabIndex = 0;
  document.body.appendChild(card);
  return card;
};

describe("useEventContextMenuShortcut", () => {
  beforeEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    document.body.innerHTML = "";
  });

  it("dispatches a synthetic contextmenu at the focused event card", () => {
    renderHook(() => useEventContextMenuShortcut());
    const card = addEventCard("event-1");
    card.focus();

    const contextMenuTargets: EventTarget[] = [];
    document.addEventListener(
      "contextmenu",
      (event) => {
        if (event.target) contextMenuTargets.push(event.target);
        event.preventDefault();
      },
      { once: true },
    );

    pressM();
    expect(contextMenuTargets).toEqual([card]);
  });

  it("does nothing when focus is not on an event card", () => {
    renderHook(() => useEventContextMenuShortcut());
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    let fired = false;
    document.addEventListener("contextmenu", () => {
      fired = true;
    });

    pressM();
    expect(fired).toBe(false);
  });

  it("yields while app-locked or event jump is active", () => {
    renderHook(() => useEventContextMenuShortcut());
    const card = addEventCard("event-1");
    card.focus();

    let fired = false;
    document.addEventListener("contextmenu", () => {
      fired = true;
    });

    setAppLockReason("commandPalette", true);
    pressM();
    expect(fired).toBe(false);
    clearAppLockReasons();

    eventJumpActions.setActive(true);
    pressM();
    expect(fired).toBe(false);
  });
});
