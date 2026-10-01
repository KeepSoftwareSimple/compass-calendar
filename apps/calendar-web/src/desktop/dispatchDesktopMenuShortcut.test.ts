import { dispatchDesktopMenuShortcut } from "@web/desktop/dispatchDesktopMenuShortcut";
import { afterEach, describe, expect, it } from "bun:test";

describe("dispatchDesktopMenuShortcut", () => {
  afterEach(() => {
    delete window.__compassDesktopDispatchProbe;
  });

  it("dispatches keyup for nav-today", () => {
    const events: KeyboardEvent[] = [];
    const listener = (event: Event) => {
      events.push(event as KeyboardEvent);
    };
    document.body.addEventListener("keyup", listener);
    expect(dispatchDesktopMenuShortcut("nav-today")).toBe(true);
    document.body.removeEventListener("keyup", listener);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("keyup");
    expect(events[0]?.key).toBe("T");
    expect(window.__compassDesktopDispatchProbe).toBe("nav-today");
  });

  it("rejects unknown shortcut names", () => {
    expect(dispatchDesktopMenuShortcut("not-a-shortcut")).toBe(false);
  });
});
