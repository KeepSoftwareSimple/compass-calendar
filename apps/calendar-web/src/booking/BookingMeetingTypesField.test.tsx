import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type AdminPutBookingPageInput } from "@core/types/booking.contracts";
import {
  BookingMeetingTypesField,
  MEETING_TYPE_KEYBOARD_HINT_LABEL,
} from "@web/booking/BookingMeetingTypesField";
import { useSettingsShortcuts } from "@web/settings/useSettingsShortcuts";
import { describe, expect, it } from "bun:test";

type Form = Pick<AdminPutBookingPageInput, "durationMinutes" | "meetingTypes">;

function Harness({ initial }: { initial: Form }) {
  const [form, setForm] = useState<Form>(initial);
  useSettingsShortcuts({
    enabled: true,
    hasBilling: false,
    hasBooking: true,
    page: "booking",
  });
  return (
    <>
      <BookingMeetingTypesField
        form={form}
        invalid={false}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
      />
      <output aria-label="Saved meeting types">
        {JSON.stringify(form.meetingTypes ?? null)}
      </output>
    </>
  );
}

const twoTypes: Form = {
  durationMinutes: 30,
  meetingTypes: [
    { id: "default", label: "Intro", durationMinutes: 30 },
    { id: "type-deep", label: "Deep dive", durationMinutes: 60 },
  ],
};

const rows = () => screen.getAllByRole("listitem");

describe("BookingMeetingTypesField", () => {
  it("shows type #1 from durationMinutes with the Duration name kept", () => {
    render(<Harness initial={{ durationMinutes: 45 }} />);
    expect(screen.getByLabelText("Duration")).toHaveValue("45");
    expect(screen.getByLabelText("Meeting type")).toHaveValue("45 min meeting");
    expect(
      screen.getByRole("button", { name: "Remove 45 min meeting" }),
    ).toHaveClass("invisible");
  });

  it("T adds a type and focuses its name; Add type hides at three", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={{ durationMinutes: 30 }} />);
    await user.keyboard("t");
    expect(rows()).toHaveLength(2);
    expect(screen.getByLabelText("Meeting type 2 name")).toHaveFocus();

    await user.keyboard("t");
    // Typing in the name input never triggers T.
    expect(rows()).toHaveLength(2);
    expect(screen.getByLabelText("Meeting type 2 name")).toHaveValue(
      "15 min meetingt",
    );

    screen.getByLabelText("Meeting type 2 name").blur();
    await user.keyboard("t");
    expect(rows()).toHaveLength(3);
    const addButton = screen.getByText("Add type").closest("button");
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveClass("invisible");
    addButton?.blur();
    await user.keyboard("t");
    expect(rows()).toHaveLength(3);
  });

  it("Delete removes the focused row and moves focus to its neighbor", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    rows()[0]?.focus();
    await user.keyboard("{Delete}");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveFocus();
    expect(screen.getByLabelText("Meeting type")).toHaveValue("Deep dive");
    expect(screen.getByLabelText("Duration")).toHaveValue("60");

    // The last type stays.
    await user.keyboard("{Delete}");
    expect(rows()).toHaveLength(1);
  });

  it("Delete and Backspace inside the name input only edit text", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    const name = screen.getByLabelText("Meeting type 2 name");
    await user.click(name);
    await user.keyboard("{End}{Backspace}{Home}{Delete}");
    expect(rows()).toHaveLength(2);
    expect(name).toHaveValue("eep div");
  });

  it("Enter on a focused row edits its name; Enter in the name returns", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    rows()[1]?.focus();
    await user.keyboard("{Enter}");
    const name = screen.getByLabelText("Meeting type 2 name");
    expect(name).toHaveFocus();
    await user.keyboard("{Delete}");
    expect(rows()).toHaveLength(2);
    await user.keyboard("{Enter}");
    expect(rows()[1]).toHaveFocus();
    await user.keyboard("{Delete}");
    expect(rows()).toHaveLength(1);
  });

  it("shows row Delete hint only when the row is focused, not while editing a name", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    const status = screen.getByRole("status", {
      name: MEETING_TYPE_KEYBOARD_HINT_LABEL,
    });
    expect(status).toHaveTextContent("On row:");
    expect(status).toHaveTextContent("removes type");

    await user.click(screen.getByLabelText("Meeting type 2 name"));
    expect(status).toHaveTextContent("returns to row");
    expect(status).not.toHaveTextContent("removes type");

    act(() => {
      rows()[1]?.focus();
    });
    expect(status).toHaveTextContent("removes type");
    expect(status).not.toHaveTextContent("On row:");
  });

  it("Escape in the name returns focus to the row without removing the type", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    await user.click(screen.getByLabelText("Meeting type 2 name"));
    await user.keyboard("{Escape}");
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).toHaveFocus();
  });

  it("does not remove a type from the duration select and still updates duration", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    const duration = screen.getByLabelText("Meeting type 2 duration");
    await user.click(duration);
    expect(
      screen.getByRole("status", { name: MEETING_TYPE_KEYBOARD_HINT_LABEL }),
    ).toHaveTextContent("On row:");
    await user.keyboard("{Delete}");
    expect(rows()).toHaveLength(2);
    await user.selectOptions(duration, "45");
    expect(duration).toHaveValue("45");
  });

  it("the remove button removes its row", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    await user.click(screen.getByRole("button", { name: "Remove Deep dive" }));
    expect(rows()).toHaveLength(1);
    expect(
      screen.getByRole("status", { name: "Saved meeting types" }),
    ).toHaveTextContent(
      JSON.stringify([{ id: "default", label: "Intro", durationMinutes: 30 }]),
    );
  });
});
