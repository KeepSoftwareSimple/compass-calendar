import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  initialPointerHintState,
  pointerHintActions,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { useFlashedWelcomeShortcut } from "./useFlashedWelcomeShortcut";
import { WelcomeGuideBody } from "./WelcomeGuideBody";
import { afterEach, describe, expect, it, mock } from "bun:test";

function WelcomeGuideWithFlash() {
  return <WelcomeGuideBody flashedKey={useFlashedWelcomeShortcut()} />;
}

const pressWindowKey = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
  });
};

const renderWelcomeGuide = () => render(<WelcomeGuideWithFlash />);

const captureLinkClick = (name: string) => {
  const link = screen.getByRole("link", { name });
  const onClick = mock((event: Event) => {
    event.preventDefault();
  });
  link.addEventListener("click", onClick);
  return onClick;
};

describe("WelcomeGuideBody", () => {
  afterEach(() => {
    usePointerHintStore.setState(initialPointerHintState, true);
  });

  it("explains that numbered shortcuts open the FAQ", () => {
    renderWelcomeGuide();

    expect(screen.getByText(/Tip:/)).toBeTruthy();
    expect(
      screen.getByText(/Press a number to open a question or a link/),
    ).toBeTruthy();
  });

  it("shows numbered keycaps without holding Mod", () => {
    renderWelcomeGuide();

    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("toggles a FAQ with a bare digit", async () => {
    renderWelcomeGuide();

    const question = screen.getByRole("button", {
      name: "Who is Compass for?",
    });
    expect(question).toHaveAttribute("aria-expanded", "false");

    pressWindowKey({ key: "1", code: "Digit1" });

    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/Compass is for busy professionals who live at/),
    ).toBeTruthy();

    pressWindowKey({ key: "1", code: "Digit1" });
    expect(question).toHaveAttribute("aria-expanded", "false");
  });

  it("still lets a click expand a question", async () => {
    const user = userEvent.setup();
    renderWelcomeGuide();

    const question = screen.getByRole("button", {
      name: "How is Compass different?",
    });
    await user.click(question);

    expect(question).toHaveAttribute("aria-expanded", "true");
  });

  it("explains why the mouse does not work", async () => {
    const user = userEvent.setup();
    renderWelcomeGuide();

    await user.click(
      screen.getByRole("button", { name: "Why doesn't my mouse work?" }),
    );

    expect(
      screen.getByText(/This welcome screen works with your mouse, too/),
    ).toBeTruthy();
  });

  it("styles the legend and palette shortcuts in the lost FAQ", async () => {
    const user = userEvent.setup();
    renderWelcomeGuide();

    await user.click(
      screen.getByRole("button", {
        name: "I don't know any shortcuts yet. Will I be lost?",
      }),
    );

    // `[aria-hidden]` (not `.c-keycap`) because SelectView.test.tsx mocks
    // ShortcutHint process-wide (bun's mock.module leaks across files);
    // its stub keeps aria-hidden but drops the real class.
    expect(screen.getByText("?").closest("[aria-hidden]")).toBeTruthy();
    expect(screen.getByText("K").closest("[aria-hidden]")).toBeTruthy();
    expect(screen.getByText(/and \? opens the full legend/)).toBeTruthy();
  });

  it("opens footer links with digits 6 through 0, and P for Pricing", () => {
    renderWelcomeGuide();

    const x = captureLinkClick("X (Twitter)");
    const linkedin = captureLinkClick("LinkedIn");
    const github = captureLinkClick("GitHub");
    const pricing = captureLinkClick("Pricing");
    const privacy = captureLinkClick("Privacy");
    const terms = captureLinkClick("Terms");

    pressWindowKey({ key: "6", code: "Digit6" });
    pressWindowKey({ key: "7", code: "Digit7" });
    pressWindowKey({ key: "8", code: "Digit8" });
    pressWindowKey({ key: "p", code: "KeyP" });
    pressWindowKey({ key: "9", code: "Digit9" });
    pressWindowKey({ key: "0", code: "Digit0" });

    expect(x).toHaveBeenCalledTimes(1);
    expect(linkedin).toHaveBeenCalledTimes(1);
    expect(github).toHaveBeenCalledTimes(1);
    expect(pricing).toHaveBeenCalledTimes(1);
    expect(privacy).toHaveBeenCalledTimes(1);
    expect(terms).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/KeepSoftwareSimple/compass-calendar",
    );
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "https://compasscalendar.com/pricing",
    );
    expect(screen.getByRole("link", { name: "Shortcuts" })).toHaveAttribute(
      "href",
      "/shortcuts",
    );
  });

  it("flashes the matching FAQ key after a click, then clears", async () => {
    renderWelcomeGuide();

    const question = screen.getByRole("button", {
      name: "Who is Compass for?",
    });
    const hintWrap = within(question).getByText("1").parentElement;
    expect(hintWrap?.className).not.toMatch(/c-keycap-flash/);

    act(() => {
      pointerHintActions.pulse({
        shortcutKey: "1",
        source: "palette",
      });
    });

    expect(hintWrap?.className).toMatch(/c-keycap-flash/);

    act(() => {
      pointerHintActions.pulse({ shortcutKey: "?", source: "palette" });
    });

    expect(hintWrap?.className).not.toMatch(/c-keycap-flash/);
  });

  it("does not replay a leftover flash when the guide remounts", () => {
    const first = renderWelcomeGuide();

    act(() => {
      pointerHintActions.pulse({
        shortcutKey: "1",
        source: "palette",
      });
    });

    first.unmount();
    renderWelcomeGuide();

    const question = screen.getByRole("button", {
      name: "Who is Compass for?",
    });
    expect(question.nextElementSibling?.className).not.toMatch(
      /c-keycap-flash/,
    );
  });
});
