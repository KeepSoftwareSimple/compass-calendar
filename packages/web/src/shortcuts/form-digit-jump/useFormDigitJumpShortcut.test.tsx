import { resolveModifier } from "@tanstack/react-hotkeys";
import { act, renderHook, waitFor } from "@testing-library/react";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import {
  MOD_HOLD_HINT_MS,
  useFormDigitJumpShortcut,
} from "@web/shortcuts/form-digit-jump/useFormDigitJumpShortcut";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

/** Matches what the hook resolves Mod to on this platform. */
const isMac = resolveModifier("Mod") === "Meta";
const MOD_KEY = isMac ? "Meta" : "Control";
const MOD_INIT: KeyboardEventInit = isMac
  ? { metaKey: true }
  : { ctrlKey: true };

const PAST_HOLD_MS = MOD_HOLD_HINT_MS + 150;
const waitPastHold = () =>
  new Promise((resolve) => setTimeout(resolve, PAST_HOLD_MS));

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

const pressModDown = ({ repeat = false }: { repeat?: boolean } = {}) =>
  dispatch("keydown", { key: MOD_KEY, repeat, ...MOD_INIT });
const releaseMod = () => dispatch("keyup", { key: MOD_KEY, ...MOD_INIT });

const pressModDigit = (digit: string, code: string) =>
  dispatch("keydown", { key: digit, code, ...MOD_INIT });

/**
 * A minimal real event-form DOM matching form.util.ts's FIELD_SELECTORS, so
 * focusEventFormField (the hook's real dispatch target) actually moves focus
 * instead of needing to be mocked. Mocking `form.util` here would replace it
 * process-wide for every other test file that imports it (bun's mock.module
 * has no per-file scope), so this builds real elements instead.
 */
const buildForm = () => {
  const form = document.createElement("form");
  form.setAttribute("name", "Event Form");
  document.body.append(form);

  const title = document.createElement("input");
  title.setAttribute("name", "Event Title");
  form.append(title);

  const start = document.createElement("input");
  start.id = "startTimePicker";
  form.append(start);

  const end = document.createElement("input");
  end.id = "endTimePicker";
  form.append(end);

  const recurrence = document.createElement("div");
  recurrence.id = "event-form-recurrence";
  const recurrenceButton = document.createElement("button");
  recurrenceButton.setAttribute("aria-label", "Edit recurrence");
  recurrence.append(recurrenceButton);
  form.append(recurrence);

  // A real button, like CalendarSelect.tsx (see the id on its own combobox
  // button) — a plain div would silently fail to focus in jsdom too.
  const calendar = document.createElement("button");
  calendar.id = "event-form-calendar";
  document.body.append(calendar);

  const color = document.createElement("div");
  color.id = "event-form-color";
  const radio = document.createElement("input");
  radio.type = "radio";
  color.append(radio);
  document.body.append(color);

  const location = document.createElement("input");
  location.id = "event-form-location";
  form.append(location);

  const attendees = document.createElement("div");
  attendees.id = "event-form-attendees";
  const attendeesInput = document.createElement("input");
  attendeesInput.setAttribute("role", "combobox");
  attendees.append(attendeesInput);
  form.append(attendees);

  // Real usage sets this id on TipTap's contenteditable root, which is what
  // makes it focusable; jsdom doesn't treat contenteditable as focusable on
  // its own, so tabIndex is also set to reproduce that here.
  // The action toolbar above the title. Each button is tabbable; Mod+0
  // focuses the first one, which is the one FIELD_SELECTORS resolves to.
  const actions = document.createElement("div");
  actions.id = "event-form-actions";
  actions.setAttribute("role", "group");
  const duplicate = document.createElement("button");
  actions.append(duplicate);
  form.append(actions);

  const description = document.createElement("div");
  description.id = "event-form-description";
  description.contentEditable = "true";
  description.tabIndex = 0;
  document.body.append(description);

  const rsvp = document.createElement("div");
  rsvp.id = "event-form-rsvp";
  const going = document.createElement("input");
  going.type = "radio";
  going.name = "event-rsvp";
  going.checked = true;
  rsvp.append(going);
  form.append(rsvp);

  return {
    title,
    start,
    end,
    recurrence: recurrenceButton,
    calendar,
    color: radio,
    location,
    attendees: attendeesInput,
    description,
    actions: duplicate,
    rsvp: going,
  };
};

describe("useFormDigitJumpShortcut", () => {
  beforeEach(() => {
    clearAppLockReasons();
  });

  afterEach(() => {
    clearAppLockReasons();
    document.body.innerHTML = "";
  });

  describe("Mod+digit dispatch", () => {
    it("jumps to the mapped field and prevents default", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = pressModDigit("3", "Digit3");

      expect(event.defaultPrevented).toBe(true);
      expect(fields.end).toHaveFocus();
    });

    it("jumps to the action toolbar on Mod+0", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = pressModDigit("0", "Digit0");

      expect(event.defaultPrevented).toBe(true);
      expect(fields.actions).toHaveFocus();
    });

    it("maps every digit 1-9 to its field, in DOM order", () => {
      const fields = buildForm();
      renderHook(() => useFormDigitJumpShortcut());

      const cases = [
        ["1", fields.title],
        ["2", fields.start],
        ["3", fields.end],
        ["4", fields.recurrence],
        ["5", fields.calendar],
        ["6", fields.color],
        ["7", fields.location],
        ["8", fields.attendees],
        ["9", fields.description],
        // 0 sits after 9 on the physical top row, so it lands on the actions
        // toolbar rather than shifting every field's digit by one. `-` is
        // RSVP, the next physical key after 0.
        ["0", fields.actions],
        ["-", fields.rsvp],
      ] as const;

      for (const [digit, element] of cases) {
        pressModDigit(digit, digit === "-" ? "Minus" : `Digit${digit}`);
        expect(element).toHaveFocus();
      }
    });

    it("jumps to RSVP on Mod+-", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = pressModDigit("-", "Minus");

      expect(event.defaultPrevented).toBe(true);
      expect(fields.rsvp).toHaveFocus();
    });

    it("ignores a bare digit with no modifier held", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = dispatch("keydown", { key: "3", code: "Digit3" });

      expect(event.defaultPrevented).toBe(false);
      expect(fields.title).toHaveFocus();
    });

    it("ignores Mod+Shift+digit", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = dispatch("keydown", {
        key: "3",
        code: "Digit3",
        shiftKey: true,
        ...MOD_INIT,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(fields.title).toHaveFocus();
    });

    it("ignores Mod+Alt+digit", () => {
      const fields = buildForm();
      fields.title.focus();
      renderHook(() => useFormDigitJumpShortcut());

      const event = dispatch("keydown", {
        key: "3",
        code: "Digit3",
        altKey: true,
        ...MOD_INIT,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(fields.title).toHaveFocus();
    });

    it("suppresses the digit's replayed keyup (macOS metaKey-false replay)", () => {
      buildForm();
      renderHook(() => useFormDigitJumpShortcut());

      pressModDigit("3", "Digit3");
      // macOS replays the keyup after Cmd is released, with metaKey already false.
      const keyUp = dispatch("keyup", { key: "3", code: "Digit3" });

      expect(keyUp.defaultPrevented).toBe(true);
    });
  });

  describe("hold-Mod hint chips", () => {
    it("stays hidden before the hold threshold", () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();

      expect(result.current.areHintsVisible).toBe(false);
    });

    it("shows hints once Mod is held past the threshold", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();
      await act(async () => {
        await waitPastHold();
      });

      await waitFor(() => {
        expect(result.current.areHintsVisible).toBe(true);
      });
    });

    it("hides hints on Mod keyup", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();
      await act(async () => {
        await waitPastHold();
      });
      await waitFor(() => expect(result.current.areHintsVisible).toBe(true));

      act(() => {
        releaseMod();
      });

      expect(result.current.areHintsVisible).toBe(false);
    });

    it("does not re-arm on a repeated Mod keydown", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown({ repeat: true });
      await act(async () => {
        await waitPastHold();
      });

      expect(result.current.areHintsVisible).toBe(false);
    });

    it("cancels the pending hold when another chord is pressed", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();
      // Mod+K: not a mapped digit, so it just cancels the pending arm.
      act(() => {
        dispatch("keydown", { key: "k", ...MOD_INIT });
      });
      await act(async () => {
        await waitPastHold();
      });

      expect(result.current.areHintsVisible).toBe(false);
    });

    it("hides on window blur", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();
      await act(async () => {
        await waitPastHold();
      });
      await waitFor(() => expect(result.current.areHintsVisible).toBe(true));

      act(() => {
        window.dispatchEvent(new Event("blur"));
      });

      expect(result.current.areHintsVisible).toBe(false);
    });

    it("hides on pointerdown", async () => {
      const { result } = renderHook(() => useFormDigitJumpShortcut());

      pressModDown();
      await act(async () => {
        await waitPastHold();
      });
      await waitFor(() => expect(result.current.areHintsVisible).toBe(true));

      act(() => {
        document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });

      expect(result.current.areHintsVisible).toBe(false);
    });
  });

  it("does not dispatch or arm hints while the app is locked", async () => {
    const fields = buildForm();
    fields.title.focus();
    setAppLockReason("test-lock", true);
    const { result } = renderHook(() => useFormDigitJumpShortcut());

    pressModDigit("3", "Digit3");
    expect(fields.title).toHaveFocus();

    pressModDown();
    await act(async () => {
      await waitPastHold();
    });
    expect(result.current.areHintsVisible).toBe(false);
  });
});
