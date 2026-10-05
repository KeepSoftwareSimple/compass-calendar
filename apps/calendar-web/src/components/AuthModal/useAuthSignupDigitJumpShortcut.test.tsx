import { resolveModifier } from "@tanstack/react-hotkeys";
import { act, renderHook } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { useAuthSignupDigitJumpShortcut } from "@web/components/AuthModal/useAuthSignupDigitJumpShortcut";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const isMac = resolveModifier("Mod") === "Meta";
const MOD_KEY = isMac ? "Meta" : "Control";
const MOD_INIT: KeyboardEventInit = isMac
  ? { metaKey: true }
  : { ctrlKey: true };

const dispatch = (type: "keydown" | "keyup", init: KeyboardEventInit) => {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
};

describe("useAuthSignupDigitJumpShortcut", () => {
  let nameInput: HTMLInputElement;
  let emailInput: HTMLInputElement;
  let passwordInput: HTMLInputElement;
  let fieldRefs: Record<
    "name" | "email" | "password",
    RefObject<HTMLInputElement | null>
  >;

  beforeEach(() => {
    nameInput = document.createElement("input");
    emailInput = document.createElement("input");
    passwordInput = document.createElement("input");
    document.body.append(nameInput, emailInput, passwordInput);

    fieldRefs = {
      name: createRef(),
      email: createRef(),
      password: createRef(),
    };
    fieldRefs.name.current = nameInput;
    fieldRefs.email.current = emailInput;
    fieldRefs.password.current = passwordInput;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("reveals hints immediately when Mod is pressed and jumps with Mod+digit", () => {
    const { result } = renderHook(() =>
      useAuthSignupDigitJumpShortcut(fieldRefs, true),
    );

    act(() => {
      dispatch("keydown", { key: MOD_KEY, ...MOD_INIT });
    });
    expect(result.current.areHintsVisible).toBe(true);

    act(() => {
      dispatch("keydown", { key: "3", code: "Digit3", ...MOD_INIT });
    });
    expect(document.activeElement).toBe(passwordInput);
    expect(result.current.areHintsVisible).toBe(false);

    act(() => {
      dispatch("keyup", { key: MOD_KEY, ...MOD_INIT });
    });
    expect(result.current.areHintsVisible).toBe(false);
  });

  it("does not consume bare digits without Mod", () => {
    renderHook(() => useAuthSignupDigitJumpShortcut(fieldRefs, true));

    emailInput.focus();
    act(() => {
      dispatch("keydown", { key: "1", code: "Digit1" });
    });
    expect(document.activeElement).toBe(emailInput);
  });

  it("is inactive when disabled", () => {
    const { result } = renderHook(() =>
      useAuthSignupDigitJumpShortcut(fieldRefs, false),
    );

    act(() => {
      dispatch("keydown", { key: MOD_KEY, ...MOD_INIT });
    });
    expect(result.current.areHintsVisible).toBe(false);
  });
});
