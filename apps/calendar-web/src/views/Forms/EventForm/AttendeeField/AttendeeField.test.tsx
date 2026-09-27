import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type AttendeeInput } from "@core/types/event-attendance.contracts";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";
import { AttendeeField } from "./AttendeeField";
import { describe, expect, it, mock } from "bun:test";

mock.module("@web/common/utils/clipboard/clipboard.util", () => ({
  copyText: mock(async () => true),
}));

const alice: AttendeeInput = { email: "alice@example.com", displayName: null };
const bob: AttendeeInput = { email: "bob@example.com", displayName: "Bob B" };

function Harness({
  initialValue = [],
  onFormSubmit = () => {},
  onEscapeReachedForm = () => {},
  onValueChange = () => {},
}: {
  initialValue?: readonly AttendeeInput[];
  onFormSubmit?: () => void;
  onEscapeReachedForm?: (key: string) => void;
  onValueChange?: (next: readonly AttendeeInput[]) => void;
}) {
  const [value, setValue] = useState<readonly AttendeeInput[]>(initialValue);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test stand-in for the form's document-level key handling
    <div
      onKeyDown={(e) => {
        // Stand-in for the form's own Escape/Enter handling: only keys the
        // combobox lets bubble arrive here.
        onEscapeReachedForm(e.key);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onFormSubmit();
        }}
      >
        <AttendeeField
          value={value}
          onChange={(next) => {
            setValue(next);
            onValueChange(next);
          }}
        />
        <button type="submit">Save</button>
      </form>
    </div>
  );
}

describe("AttendeeField", () => {
  it("creates a chip from a valid email on Enter without submitting the form", async () => {
    const user = userEvent.setup();
    const onFormSubmit = mock();
    const onValueChange = mock();
    render(
      <Harness onFormSubmit={onFormSubmit} onValueChange={onValueChange} />,
    );

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "alice@example.com");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith([alice]);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(
      screen.getByLabelText("alice@example.com, awaiting"),
    ).toBeInTheDocument();
    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it("rejects an invalid email inline: no chip, no submit, form still usable", async () => {
    const user = userEvent.setup();
    const onFormSubmit = mock();
    const onValueChange = mock();
    render(
      <Harness onFormSubmit={onFormSubmit} onValueChange={onValueChange} />,
    );

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.click(combobox);
    await user.paste("not-an-email");
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onFormSubmit).not.toHaveBeenCalled();

    // The rejection is inline only - the form's own submit path still works.
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onFormSubmit).toHaveBeenCalledTimes(1);
  });

  it("refuses a duplicate email (case-insensitive) with an inline message", async () => {
    const user = userEvent.setup();
    const onValueChange = mock();
    render(<Harness initialValue={[alice]} onValueChange={onValueChange} />);

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "ALICE@example.com");

    expect(
      screen.getByText("ALICE@example.com is already a guest"),
    ).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("shows displayName on chips and removes one via its remove button", async () => {
    const user = userEvent.setup();
    const onValueChange = mock();
    render(
      <Harness initialValue={[alice, bob]} onValueChange={onValueChange} />,
    );

    expect(screen.getByText("Bob B")).toBeInTheDocument();
    expect(screen.getByLabelText("Bob B, awaiting")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Bob B" }));

    expect(onValueChange).toHaveBeenCalledWith([alice]);
  });

  it("offers a copy button per guest that copies that guest's email", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[alice, bob]} />);

    expect(
      screen.queryByRole("button", { name: "copy attendee list" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "copy alice@example.com" }),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "copy bob@example.com" }),
    ).toBeInTheDocument();
  });

  it("copies a guest email when the copy button is activated from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={[alice]} />);

    screen.getByRole("button", { name: "copy alice@example.com" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("does not show a copy button when there are no guests", () => {
    render(<Harness />);

    expect(
      screen.queryByRole("button", { name: /copy / }),
    ).not.toBeInTheDocument();
  });

  it("paints provider RSVP on chips from the display-only status map", () => {
    const statusByEmail = new Map([
      ["alice@example.com", "accepted" as const],
      ["bob@example.com", "declined" as const],
    ]);
    render(
      <AttendeeField
        value={[alice, bob]}
        onChange={() => {}}
        statusByEmail={statusByEmail}
      />,
    );

    expect(screen.getByLabelText("alice@example.com, yes")).toBeInTheDocument();
    expect(screen.getByLabelText("Bob B, no")).toBeInTheDocument();
  });

  it("removes the last chip with Backspace on an empty input", async () => {
    const user = userEvent.setup();
    const onValueChange = mock();
    render(
      <Harness initialValue={[alice, bob]} onValueChange={onValueChange} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Guests" }));
    await user.keyboard("{Backspace}");

    expect(onValueChange).toHaveBeenCalledWith([alice]);
  });

  it("registers a floating layer while the listbox is open and closes it on Escape before the form sees the key", async () => {
    const user = userEvent.setup();
    const escapesAtForm: string[] = [];
    render(
      <Harness
        onEscapeReachedForm={(key) => {
          if (key === "Escape") escapesAtForm.push(key);
        }}
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "alice@");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(isFloatingLayerOpen()).toBe(true);

    // First Escape: closes the listbox, never reaches the form.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(isFloatingLayerOpen()).toBe(false);
    expect(escapesAtForm).toHaveLength(0);

    // Second Escape: nothing left to close here, so the form gets it.
    await user.keyboard("{Escape}");
    expect(escapesAtForm).toHaveLength(1);
  });

  it("offers entries from the pluggable suggestion source and maps a pick to its attendee", async () => {
    const user = userEvent.setup();
    const onValueChange = mock();
    const suggestionSource = mock(async (query: string) =>
      "carol team".includes(query.toLowerCase())
        ? [{ email: "carol@example.com", displayName: "Carol" }]
        : [],
    );
    render(
      <AttendeeField
        value={[]}
        onChange={onValueChange}
        suggestionSource={suggestionSource}
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "carol");

    expect(await screen.findByText("Carol")).toBeInTheDocument();
    await user.click(screen.getByText("Carol"));

    expect(onValueChange).toHaveBeenCalledWith([
      { email: "carol@example.com", displayName: "Carol" },
    ]);
    expect(suggestionSource).toHaveBeenCalledWith("carol");
  });

  it("renders the menuFooter inside the open listbox menu, and not before", async () => {
    const user = userEvent.setup();
    render(
      <AttendeeField
        value={[]}
        onChange={() => {}}
        menuFooter={<div>Enable contact suggestions</div>}
      />,
    );

    // Closed menu: no footer anywhere (the affordance lives in the combobox
    // footer only — never floating free, never a modal).
    expect(
      screen.queryByText("Enable contact suggestions"),
    ).not.toBeInTheDocument();

    const combobox = screen.getByRole("combobox", { name: "Guests" });
    await user.type(combobox, "ca");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Enable contact suggestions")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Menu closes -> footer goes with it.
    await user.keyboard("{Escape}");
    expect(
      screen.queryByText("Enable contact suggestions"),
    ).not.toBeInTheDocument();
  });

  it("puts the jump-target id on the visible wrapper, not the dummy input", () => {
    render(
      <AttendeeField
        id="event-form-attendees"
        value={[]}
        onChange={() => {}}
      />,
    );

    const wrapper = document.getElementById("event-form-attendees");
    const combobox = screen.getByRole("combobox", { name: "Guests" });

    expect(wrapper).not.toBeNull();
    expect(wrapper?.contains(combobox)).toBe(true);
    expect(combobox.id).toBe("event-form-attendees-input");
  });
});
