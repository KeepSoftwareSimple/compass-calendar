import {
  cardContextMenuPoint,
  contextMenuAnchorFromPointer,
} from "./contextMenu.anchor";
import { describe, expect, it } from "bun:test";

describe("cardContextMenuPoint", () => {
  it("anchors near the card's top center", () => {
    expect(cardContextMenuPoint(new DOMRect(10, 20, 80, 200))).toEqual({
      clientX: 50,
      clientY: 44,
    });
  });
});

describe("contextMenuAnchorFromPointer", () => {
  it("uses the cursor for a pointer click", () => {
    const target = document.createElement("div");
    const { reference, fromKeyboard } = contextMenuAnchorFromPointer(
      { clientX: 120, clientY: 80 },
      target,
    );

    expect(fromKeyboard).toBe(false);
    expect(reference.getBoundingClientRect()).toEqual(
      new DOMRect(120, 80, 0, 0),
    );
  });

  it("re-anchors Shift+F10 onto the card instead of 0,0", () => {
    const card = document.createElement("button");
    card.getBoundingClientRect = () => new DOMRect(10, 20, 80, 200);
    const { reference, fromKeyboard } = contextMenuAnchorFromPointer(
      { clientX: 0, clientY: 0 },
      card,
    );

    expect(fromKeyboard).toBe(true);
    expect(reference.getBoundingClientRect()).toEqual(
      new DOMRect(50, 44, 0, 0),
    );
  });
});
