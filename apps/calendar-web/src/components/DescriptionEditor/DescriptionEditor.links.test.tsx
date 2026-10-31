import { HotkeysProvider, resolveModifier } from "@tanstack/react-hotkeys";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { DescriptionEditor } from "@web/components/DescriptionEditor/DescriptionEditor";
import {
  collectDescriptionTextRects,
  rectsIntersect,
} from "@web/components/DescriptionEditor/description-link-chrome-geometry.test.utils";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const copyTextMock = mock(() => Promise.resolve(true));

mock.module("@web/common/utils/clipboard/clipboard.util", () => ({
  copyText: copyTextMock,
}));

const lastToastMessage = (toastMock: { mock: { calls: unknown[][] } }) => {
  const call = toastMock.mock.calls.at(-1);
  return call ? String(call[0]) : "";
};

function renderDescriptionEditor(
  props: {
    value: string;
    resetKey: string;
    onChange?: ReturnType<typeof mock>;
  },
  options?: { withHotkeys?: boolean },
) {
  const onChange = props.onChange ?? mock();
  const editor = (
    <DescriptionEditor
      value={props.value}
      onChange={onChange}
      editable={true}
      resetKey={props.resetKey}
    />
  );

  if (options?.withHotkeys) {
    return render(<HotkeysProvider>{editor}</HotkeysProvider>);
  }
  return render(editor);
}

describe("DescriptionEditor link UX", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-app-locked");
    copyTextMock.mockClear();
  });

  it("exposes keyboard-focusable links with a copy control and shortcut", async () => {
    const user = userEvent.setup();
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const meetingUrl = "https://example.com/meet";
    await renderDescriptionEditor(
      {
        value: `<p><a href="${meetingUrl}">Join</a></p>`,
        resetKey: "link-ux",
      },
      { withHotkeys: true },
    );

    const link = screen.getByRole("link", { name: /Join/ });
    expect(link).toHaveAttribute("tabindex", "0");

    link.focus();
    expect(link).toHaveFocus();

    const copyButton = await waitFor(() =>
      screen.getByRole("button", { name: "Copy link" }),
    );
    await user.click(copyButton);
    expect(copyTextMock).toHaveBeenCalledWith(meetingUrl);
    expect(
      lastToastMessage(mocks.toast as { mock: { calls: unknown[][] } }),
    ).toBe("Link copied");

    copyTextMock.mockClear();
    mocks.toast.mockClear();

    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}{Shift>}c{/Shift}{/${modKey}}`);

    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith(meetingUrl);
    });
    expect(
      lastToastMessage(mocks.toast as { mock: { calls: unknown[][] } }),
    ).toBe("Link copied");
  });

  it("keeps the copy control visible while the pointer moves onto it", async () => {
    const user = userEvent.setup();
    await renderDescriptionEditor({
      value: `<p><a href="https://example.com/meet">https://example.com/meet</a></p>`,
      resetKey: "hover-chrome",
    });

    await user.click(document.body);
    const link = screen.getByRole("link", { name: /example\.com/ });
    await user.hover(link);
    const copyButton = await waitFor(() =>
      screen.getByRole("button", { name: "Copy link" }),
    );

    await user.hover(copyButton);
    await expect(copyButton).toBeVisible();
    await user.click(copyButton);
    expect(copyTextMock).toHaveBeenCalledWith("https://example.com/meet");
  });

  it("keeps link hint chrome inside a narrow description panel", async () => {
    const user = userEvent.setup();
    const meetingUrl = "https://app.mn.co";
    render(
      <section
        aria-label="Description panel fixture"
        style={{ width: "240px", overflow: "hidden" }}
      >
        <DescriptionEditor
          value={`<p><a href="${meetingUrl}">${meetingUrl}</a> for the meeting</p>`}
          onChange={mock()}
          editable={true}
          resetKey="narrow-panel"
        />
      </section>,
    );

    const panel = screen.getByRole("region", {
      name: "Description panel fixture",
    });
    const link = screen.getByRole("link", { name: /app\.mn\.co/ });
    await user.hover(link);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible(),
    );

    const editor = screen.getByRole("textbox", { name: "Description" });
    const panelRect = panel.getBoundingClientRect();
    const hintGroup = screen.getByRole("group", {
      name: "Link shortcut and copy",
    });
    const chromeRect = hintGroup.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();

    expect(chromeRect.left).toBeGreaterThanOrEqual(panelRect.left);
    expect(chromeRect.right).toBeLessThanOrEqual(panelRect.right + 1);
    expect(chromeRect.top).toBeGreaterThanOrEqual(linkRect.bottom - 1);
    expect(link).not.toHaveAttribute("title");

    for (const textRect of collectDescriptionTextRects(editor)) {
      expect(rectsIntersect(chromeRect, textRect)).toBe(false);
    }
  });

  it("opens a hovered link with Mod+Shift+Enter", async () => {
    const user = userEvent.setup();
    const openSpy = mock();
    const originalOpen = window.open;
    window.open = openSpy as typeof window.open;

    const meetingUrl = "https://example.com/meeting-room";
    await renderDescriptionEditor(
      {
        value: `<p><a href="${meetingUrl}">${meetingUrl}</a></p>`,
        resetKey: "hover-open",
      },
      { withHotkeys: true },
    );

    const link = screen.getByRole("link", { name: /example\.com/ });
    await user.hover(link);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible(),
    );

    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}{Shift>}{Enter}{/Shift}{/${modKey}}`);
    expect(openSpy).toHaveBeenCalledWith(
      meetingUrl,
      "_blank",
      expect.any(String),
    );

    window.open = originalOpen;
  });

  it("opens the caret link with Mod+Shift+Enter and preserves html on blur", async () => {
    const user = userEvent.setup();
    const openSpy = mock();
    const originalOpen = window.open;
    window.open = openSpy as typeof window.open;
    const onChange = mock();

    const meetingUrl = "https://example.com/meeting-room";
    await renderDescriptionEditor(
      {
        value: `<p>Join at <a href="${meetingUrl}">${meetingUrl}</a></p>`,
        resetKey: "open-caret",
        onChange,
      },
      { withHotkeys: true },
    );

    const description = screen.getByRole("textbox", { name: "Description" });
    await user.click(description);
    const link = screen.getByRole("link", { name: /example\.com/ });
    await user.click(link);
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}{Shift>}{Enter}{/Shift}{/${modKey}}`);
    expect(openSpy).toHaveBeenCalledWith(
      meetingUrl,
      "_blank",
      expect.any(String),
    );

    onChange.mockClear();
    await user.click(document.body);
    expect(onChange).not.toHaveBeenCalled();

    window.open = originalOpen;
  });

  it("still opens links on Mod+click without copying on a plain click", async () => {
    const openSpy = mock();
    const originalOpen = window.open;
    window.open = openSpy as typeof window.open;

    const meetingUrl = "https://compass.example/join";
    await renderDescriptionEditor({
      value: `<p><a href="${meetingUrl}">Join</a></p>`,
      resetKey: "mod-click",
    });

    const link = screen.getByRole("link", { name: /Join/ });
    fireEvent.click(link);
    expect(openSpy).not.toHaveBeenCalled();

    const modClick =
      resolveModifier("Mod") === "Control"
        ? { ctrlKey: true }
        : { metaKey: true };
    fireEvent.click(link, modClick);
    expect(openSpy).toHaveBeenCalled();

    window.open = originalOpen;
  });
});
