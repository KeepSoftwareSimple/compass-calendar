import {
  createKeyupSwallow,
  swallowNextKeyup,
} from "@web/shortcuts/swallow-next-keyup";
import { afterEach, describe, expect, it, mock } from "bun:test";

const dispatchKeyup = (
  key: string,
  target: Window | Document = window,
): KeyboardEvent => {
  const event = new KeyboardEvent("keyup", {
    bubbles: true,
    cancelable: true,
    composed: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
};

describe("swallowNextKeyup", () => {
  afterEach(() => {
    // Drain any leftover capture listener from a case that did not fire
    // the matching key (the helper times out at 1s).
    dispatchKeyup("l");
    dispatchKeyup("s");
  });

  it("preventsDefault the matching keyup and stops it reaching document", () => {
    const seen = mock((_event: KeyboardEvent) => {});
    document.addEventListener("keyup", seen, true);
    swallowNextKeyup("l");

    const event = dispatchKeyup("l");

    expect(event.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    document.removeEventListener("keyup", seen, true);
  });

  it("ignores a different letter and still swallows the target", () => {
    swallowNextKeyup("l");

    const other = dispatchKeyup("s");
    expect(other.defaultPrevented).toBe(false);

    const target = dispatchKeyup("l");
    expect(target.defaultPrevented).toBe(true);
  });

  it("swallows only the next matching keyup", () => {
    swallowNextKeyup("l");
    dispatchKeyup("l");

    const second = dispatchKeyup("l");
    expect(second.defaultPrevented).toBe(false);
  });
});

describe("createKeyupSwallow", () => {
  it("consumes only a recorded key and ignores others", () => {
    const swallow = createKeyupSwallow();
    swallow.add("h");

    const other = dispatchKeyup("s");
    expect(swallow.consume(other)).toBe(false);
    expect(other.defaultPrevented).toBe(false);

    const target = dispatchKeyup("h");
    expect(swallow.consume(target)).toBe(true);
    expect(target.defaultPrevented).toBe(true);

    const second = dispatchKeyup("h");
    expect(swallow.consume(second)).toBe(false);
  });
});
