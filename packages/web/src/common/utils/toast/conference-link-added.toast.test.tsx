import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { ConferenceLinkAddedToast } from "@web/common/utils/toast/conference-link-added.toast";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const copyText = mock(async (_text: string) => true);

// bun's mock.module is global and leaks into every other test file in the
// shard. Spread the real module and only override copyText while this file
// runs; the flag flips back to the real implementation in afterAll.
const actualClipboard = {
  ...(await import("@web/common/utils/clipboard/clipboard.util")),
};
let isCopyMocked = true;

mock.module("@web/common/utils/clipboard/clipboard.util", () => ({
  ...actualClipboard,
  copyText: (text: string) =>
    isCopyMocked ? copyText(text) : actualClipboard.copyText(text),
}));

afterAll(() => {
  isCopyMocked = false;
});

const conference = {
  url: "https://meet.google.com/abc-defg-hij",
  label: "Google Meet",
};

const renderToast = () =>
  render(
    <HotkeysProvider>
      <ConferenceLinkAddedToast conference={conference} />
    </HotkeysProvider>,
  );

describe("ConferenceLinkAddedToast", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    copyText.mockClear();
    copyText.mockImplementation(async () => true);
  });

  it("names the minted link and copies it when the button is clicked", async () => {
    renderToast();

    expect(screen.getByText("Google Meet link added")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Copy link/ }));

    expect(copyText).toHaveBeenCalledWith(conference.url);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("copies from the keyboard with L and swallows the release so the Life view stays put", async () => {
    renderToast();
    const keyupListener = mock();
    document.addEventListener("keyup", keyupListener);

    pressKey("L");

    expect(copyText).toHaveBeenCalledWith(conference.url);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    // swallowNextKeyup stops the keyup in the capture phase on window.
    expect(keyupListener).not.toHaveBeenCalled();
    document.removeEventListener("keyup", keyupListener);
  });

  it("ignores L typed into a text field", () => {
    renderToast();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    pressKey("L", {}, input);

    expect(copyText).not.toHaveBeenCalled();
    input.remove();
  });

  it("points at the event when the clipboard refuses", async () => {
    copyText.mockImplementation(async () => false);
    renderToast();

    await userEvent.click(screen.getByRole("button", { name: /Copy link/ }));

    expect(
      await screen.findByText(
        "Could not copy. Open the event to copy the link.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Copy link/ }),
    ).not.toBeInTheDocument();
  });
});
