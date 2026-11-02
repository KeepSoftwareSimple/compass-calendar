import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type AdminPutBookingPageInput } from "@core/types/booking.contracts";
import { BookingMeetingTypesField } from "@web/booking/BookingMeetingTypesField";
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
      <output data-testid="types">
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

  it("shows Enter and Delete keycaps for the focused row", () => {
    render(<Harness initial={twoTypes} />);
    const hint = screen.getByTestId("meeting-types-keys-hint");
    expect(hint).toHaveTextContent("edits");
    expect(hint).toHaveTextContent("removes a focused type");
  });

  it("the remove button removes its row", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={twoTypes} />);
    await user.click(screen.getByRole("button", { name: "Remove Deep dive" }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("types")).toHaveTextContent(
      JSON.stringify([{ id: "default", label: "Intro", durationMinutes: 30 }]),
    );
  });
});
