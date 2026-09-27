import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DescriptionEditor } from "@web/components/DescriptionEditor/DescriptionEditor";
import { describe, expect, it, mock } from "bun:test";

const DescriptionEditorHarness = ({ editable }: { editable: boolean }) => (
  <DescriptionEditor
    value="<p>Hello</p>"
    onChange={mock()}
    editable={editable}
    resetKey="same-event"
  />
);

describe("DescriptionEditor", () => {
  it("exposes an accessible textbox and does not call onChange on mount", () => {
    const onChange = mock();
    render(
      <DescriptionEditor
        value="<p>Hello <b>world</b></p>"
        onChange={onChange}
        editable={true}
        resetKey="test-1"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    expect(textbox).toBeTruthy();
    expect(textbox).toHaveAttribute("aria-multiline", "true");
    // TipTap's `content` option is only read at editor creation - onUpdate
    // must not fire just from mounting with existing content, or the
    // dirty-check (DirtyParser.isGridDraftDirty) would show every opened
    // event as dirty before the user touches anything.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports an empty string when the document is cleared", async () => {
    const user = userEvent.setup();
    const onChange = mock();
    render(
      <DescriptionEditor
        value="<p>Hello</p>"
        onChange={onChange}
        editable={true}
        resetKey="test-empty"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}{Backspace}");

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("");
  });

  it("hides the toolbar and marks the textbox non-editable when read-only", () => {
    render(
      <DescriptionEditor
        value="<p>Hello</p>"
        onChange={mock()}
        editable={false}
        resetKey="test-2"
      />,
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    const textbox = screen.getByRole("textbox", {
      name: "Description",
    }) as HTMLElement;
    expect(textbox.getAttribute("contenteditable")).toBe("false");
  });

  it("toggles bold and reflects the pressed state on the toolbar button", () => {
    render(
      <DescriptionEditor
        value="<p>Hello</p>"
        onChange={mock()}
        editable={true}
        resetKey="test-3"
      />,
    );

    const boldButton = screen.getByRole("button", {
      name: "Bold",
    }) as HTMLButtonElement;
    expect(boldButton.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      fireEvent.click(boldButton);
    });

    expect(boldButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("strips disallowed tags from untrusted HTML before rendering", () => {
    render(
      <DescriptionEditor
        value='<p onclick="alert(1)">Safe text<script>alert(1)</script></p>'
        onChange={mock()}
        editable={false}
        resetKey="test-4"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    expect(textbox.innerHTML).not.toContain("<script");
    expect(textbox.innerHTML).not.toContain("onclick");
    expect(textbox.textContent).toContain("Safe text");
  });

  it("preserves a plain link and forces target/rel regardless of the source", () => {
    // Meeting links pasted into a Google description (Zoom/Teams - the
    // structured `conference` field only ever covers Google Meet) must stay
    // clickable rather than getting flattened to plain text by sanitization.
    render(
      <DescriptionEditor
        value='Join here: <a href="https://zoom.us/j/123456789" target="_self" rel="opener">Zoom meeting</a>'
        onChange={mock()}
        editable={false}
        resetKey="test-5"
      />,
    );

    const link = screen.getByRole("link", { name: "Zoom meeting" });
    expect(link).toHaveAttribute("href", "https://zoom.us/j/123456789");
    // Forced at render time by the Link extension's HTMLAttributes, not
    // read from the source - an attacker-controlled target/rel in the
    // source HTML (target="_self" rel="opener" above) must never survive.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("neutralizes attacker-supplied target/rel pasted mid-session, not just on load", () => {
    // The previous test only covers the `value`-prop load path, which goes
    // through DOMPurify. Pasting into a live editor skips DOMPurify entirely
    // and goes straight through ProseMirror's own HTML parser instead - this
    // is the path the stock TipTap Link mark left unguarded (it reads
    // target/rel/class straight off the pasted <a> when no parseHTML is
    // configured for them), which is what SafeLink's addAttributes override
    // closes.
    render(
      <DescriptionEditor
        value=""
        onChange={mock()}
        editable={true}
        resetKey="test-paste"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });

    // jsdom has no DataTransfer (jsdom/jsdom#1568) - RTL's fireEvent falls
    // back to assigning a plain object as `clipboardData` verbatim when
    // window.DataTransfer isn't a constructor, so a minimal getData stub is
    // enough for ProseMirror's paste handler to read the pasted HTML.
    const clipboardData = {
      getData: (type: string) =>
        type === "text/html"
          ? '<a href="https://evil.example" target="_self" rel="opener">click</a>'
          : "",
    };

    fireEvent.paste(textbox, { clipboardData });

    const link = screen.getByRole("link", { name: "click" });
    expect(link).toHaveAttribute("href", "https://evil.example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("neutralizes a javascript: href instead of rendering it as a link", () => {
    render(
      <DescriptionEditor
        value='<a href="javascript:alert(1)">click me</a>'
        onChange={mock()}
        editable={false}
        resetKey="test-6"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    expect(textbox.innerHTML).not.toContain("javascript:");
    expect(screen.queryByRole("link")).toBeNull();
    expect(textbox.textContent).toBe("click me");
  });

  it("renders plain-text booking descriptions as three paragraphs with links", () => {
    const cancelUrl = "https://x/meet/cancel/1?token=a";
    const rescheduleUrl = "https://x/meet/reschedule/1?token=b";
    render(
      <DescriptionEditor
        value={`Recovered\n\nCancel: ${cancelUrl}\n\nReschedule: ${rescheduleUrl}`}
        onChange={mock()}
        editable={false}
        resetKey="test-booking-plain"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    const region = within(textbox);
    expect(region.getByText("Recovered")).toBeTruthy();
    expect(region.getByText(/^Cancel:/)).toBeTruthy();
    expect(region.getByText(/^Reschedule:/)).toBeTruthy();
    expect((textbox.innerHTML.match(/<p>/g) ?? []).length).toBe(3);
    expect(screen.getByRole("link", { name: cancelUrl })).toHaveAttribute(
      "href",
      cancelUrl,
    );
    expect(screen.getByRole("link", { name: rescheduleUrl })).toHaveAttribute(
      "href",
      rescheduleUrl,
    );
  });

  it("leaves existing HTML descriptions untouched", () => {
    render(
      <DescriptionEditor
        value='<p>Notes</p><p><a href="https://example.com/meet">https://example.com/meet</a></p>'
        onChange={mock()}
        editable={false}
        resetKey="test-booking-html"
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "Description" });
    expect(within(textbox).getByText("Notes")).toBeTruthy();
    expect((textbox.innerHTML.match(/<p>/g) ?? []).length).toBe(2);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("re-syncs contenteditable when editable flips on the same event", () => {
    // Regression: useEditor only recreates the editor when `resetKey`
    // changes, so `editable` must be applied via editor.setEditable in its
    // own effect - otherwise a mid-session read-only flip on the SAME event
    // (e.g. permissions revoked, a calendars-query refetch) would hide the
    // toolbar but leave the underlying region silently still editable.
    const { rerender } = render(<DescriptionEditorHarness editable={true} />);

    const textbox = screen.getByRole("textbox", {
      name: "Description",
    }) as HTMLElement;
    expect(textbox.getAttribute("contenteditable")).toBe("true");

    rerender(<DescriptionEditorHarness editable={false} />);
    expect(textbox.getAttribute("contenteditable")).toBe("false");

    rerender(<DescriptionEditorHarness editable={true} />);
    expect(textbox.getAttribute("contenteditable")).toBe("true");
  });
});
