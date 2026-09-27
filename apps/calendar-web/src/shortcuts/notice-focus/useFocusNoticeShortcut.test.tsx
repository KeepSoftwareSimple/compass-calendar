import { renderHook } from "@testing-library/react";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import {
  findNextNoticeTarget,
  getVisibleNotices,
} from "@web/shortcuts/notice-focus/notice-focus";
import { useFocusNoticeShortcut } from "@web/shortcuts/notice-focus/useFocusNoticeShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Real keydowns target the focused element; isEditableKeyboardTarget reads
// event.target, so dispatch from wherever focus is.
const pressF = () => {
  (document.activeElement ?? document).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
    }),
  );
};

const addNotice = (id: string, buttonLabel: string) => {
  const notice = document.createElement("div");
  notice.setAttribute("data-notice", "");
  notice.id = id;
  const button = document.createElement("button");
  button.textContent = buttonLabel;
  notice.appendChild(button);
  document.body.appendChild(notice);
  return { notice, button };
};

describe("useFocusNoticeShortcut", () => {
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

  it("focuses the first notice action on f and cycles on repeat", () => {
    renderHook(() => useFocusNoticeShortcut());
    const first = addNotice("notice-1", "Sign up");
    const second = addNotice("notice-2", "Switch");

    pressF();
    expect(document.activeElement).toBe(first.button);

    pressF();
    expect(document.activeElement).toBe(second.button);

    pressF();
    expect(document.activeElement).toBe(first.button);
  });

  it("does nothing when no notice is visible", () => {
    renderHook(() => useFocusNoticeShortcut());
    const before = document.activeElement;

    pressF();
    expect(document.activeElement).toBe(before);
  });

  it("yields while typing, app-locked, or event jump is active", () => {
    renderHook(() => useFocusNoticeShortcut());
    const { button } = addNotice("notice-1", "Sign up");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressF();
    expect(document.activeElement).toBe(input);

    input.blur();
    setAppLockReason("commandPalette", true);
    pressF();
    expect(document.activeElement).not.toBe(button);
    clearAppLockReasons();

    eventJumpActions.setActive(true);
    pressF();
    expect(document.activeElement).not.toBe(button);
  });
});

describe("notice-focus queries", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("orders toast-container notices ahead of banners", () => {
    const banner = addNotice("banner", "Keep");
    const toastify = document.createElement("div");
    toastify.className = "Toastify";
    document.body.appendChild(toastify);
    const toastNotice = document.createElement("div");
    toastNotice.setAttribute("data-notice", "");
    const toastButton = document.createElement("button");
    toastButton.textContent = "Reconnect";
    toastNotice.appendChild(toastButton);
    toastify.appendChild(toastNotice);

    const notices = getVisibleNotices();
    expect(notices[0]).toBe(toastNotice);
    expect(notices[1]).toBe(banner.notice);
  });

  it("skips notices with no focusable control", () => {
    const empty = document.createElement("div");
    empty.setAttribute("data-notice", "");
    empty.textContent = "Just text";
    document.body.appendChild(empty);

    expect(getVisibleNotices()).toHaveLength(0);
    expect(findNextNoticeTarget([], document.activeElement)).toBeNull();
  });
});
