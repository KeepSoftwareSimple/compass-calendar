import { render, screen } from "@testing-library/react";
import { ShortcutKeys } from "./ShortcutKeys";
import { afterEach, describe, expect, it } from "bun:test";

const keycaps = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[aria-hidden='true']"));

// detectPlatform() reads navigator.platform and navigator.userAgent.
const stubPlatform = (platform: string) => {
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true,
  });
  Object.defineProperty(navigator, "userAgent", {
    value: platform,
    configurable: true,
  });
};

describe("ShortcutKeys", () => {
  afterEach(() => {
    // Drop the own-property stubs so the jsdom prototype getters apply again.
    Reflect.deleteProperty(navigator, "platform");
    Reflect.deleteProperty(navigator, "userAgent");
  });

  it("shows two keycaps and announces the key combination for Delete on macOS", () => {
    stubPlatform("MacIntel");
    const { container } = render(<ShortcutKeys announce keys="Delete" />);

    expect(keycaps(container).map((chip) => chip.textContent)).toEqual([
      "fn",
      "⌫",
    ]);
    expect(screen.getByText("Fn plus Backspace")).toBeInTheDocument();
  });

  it("keeps the Delete label on other platforms", () => {
    stubPlatform("Win32");
    const { container } = render(<ShortcutKeys keys={["Delete"]} />);

    expect(keycaps(container).map((chip) => chip.textContent)).toEqual([
      "Delete",
    ]);
  });

  it("renders one keycap chip per key and uppercases lone letters", () => {
    const { container } = render(<ShortcutKeys keys={["Shift", "w"]} />);

    const chips = keycaps(container);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent).toBe("Shift");
    expect(chips[1]?.textContent).toBe("W");
  });

  it("accepts a single key as a bare string (one chip)", () => {
    const { container } = render(<ShortcutKeys keys="?" />);

    const chips = keycaps(container);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe("?");
  });

  it("resolves the `cmd` alias to the Meta (Command) icon", () => {
    render(<ShortcutKeys keys={["cmd", "K"]} />);

    // `cmd` -> Meta, which renders an icon rather than literal text.
    expect(screen.getByTestId("meta-icon")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("renders plain-text or between alternative keys, not as a keycap", () => {
    const { container } = render(
      <ShortcutKeys keys={["Space", "."]} alternatives />,
    );

    expect(container.textContent).toBe("Spaceor.");
    const or = screen.getByText("or");
    expect(or.className).not.toContain("c-keycap");
    expect(or.previousElementSibling?.className).toContain("c-keycap");
    expect(or.nextElementSibling?.className).toContain("c-keycap");
  });

  it("does not render or for a chord", () => {
    const { container } = render(<ShortcutKeys keys={["Shift", "w"]} />);
    expect(container.textContent).not.toContain("or");
  });

  it("renders nothing when there are no keys", () => {
    const { container } = render(<ShortcutKeys keys={[]} />);
    expect(keycaps(container)).toHaveLength(0);

    // Blank/whitespace entries (string or array) are dropped.
    const { container: emptyString } = render(<ShortcutKeys keys="" />);
    expect(keycaps(emptyString)).toHaveLength(0);

    const { container: whitespace } = render(
      <ShortcutKeys keys={["", "  "]} />,
    );
    expect(keycaps(whitespace)).toHaveLength(0);
  });

  it("hides the chip row on touch-first devices", () => {
    const { container } = render(<ShortcutKeys keys={["Mod", "Enter"]} />);

    // The wrapper, not each chip: hiding it also drops the caller's margin.
    expect(container.firstElementChild?.className).toContain(
      "pointer-coarse:hidden",
    );
  });

  it("renders duplicate tokens as separate keycaps", () => {
    const { container } = render(<ShortcutKeys keys={["Shift", "Shift"]} />);

    const chips = keycaps(container);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent).toBe("Shift");
    expect(chips[1]?.textContent).toBe("Shift");
  });
});
