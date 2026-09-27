import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type SelectOption } from "@web/common/types/component.types";
import { getTimeOptions } from "@web/common/utils/datetime/web.date.util";
import { TimePicker } from "./TimePicker";
import { describe, expect, it } from "bun:test";

const intervalOptions: SelectOption<string>[] = [
  { value: "1:00 PM", label: "1 PM" },
  { value: "1:15 PM", label: "1:15 PM" },
  { value: "1:30 PM", label: "1:30 PM" },
];
const dayOptions = getTimeOptions();
const onePm = { label: "1 PM", value: "1:00 PM" };
const fiveThirty = { label: "5:30 PM", value: "5:30 PM" };
const nineFortyFive = { label: "9:45 AM", value: "9:45 AM" };

function Harness({
  initialValue = intervalOptions[0],
  options = intervalOptions,
  freshOptions = false,
}: {
  initialValue?: SelectOption<string>;
  options?: SelectOption<string>[];
  freshOptions?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const resolvedOptions = freshOptions ? getTimeOptions() : options;

  return (
    <div>
      <button type="button">Title</button>
      <TimePicker
        aria-label="Start time"
        inputId="startTimePicker"
        isMenuOpen={isMenuOpen}
        onChange={setValue}
        options={resolvedOptions}
        setIsMenuOpen={setIsMenuOpen}
        value={value}
      />
      <button type="button">Description</button>
    </div>
  );
}

describe("TimePicker", () => {
  it("closes its menu when focus moves elsewhere in the form, instead of staying open forever", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Start time" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Description" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("commits the focused filtered option when the user presses Tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "1:30");
    await user.tab();

    expect(screen.getByText("1:30 PM")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Description" })).toHaveFocus();
  });

  it("keeps the original time when Tabbing through without changing the draft", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={onePm} options={dayOptions} freshOptions />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Start time" })).toHaveFocus();

    await user.tab();

    expect(screen.getByText("1 PM")).toBeInTheDocument();
    expect(screen.queryByText("12 AM")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Description" })).toHaveFocus();
  });

  it("commits the next interval when ArrowDown then Tab", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={onePm} options={dayOptions} />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Start time" })).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    await user.tab();

    expect(screen.getByText("1:15 PM")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Description" })).toHaveFocus();
  });

  it("discards typed filter on Escape instead of committing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "1:30");
    await user.keyboard("{Escape}");

    expect(screen.getByText("1 PM")).toBeInTheDocument();
    expect(screen.queryByText("1:30 PM")).not.toBeInTheDocument();
  });

  it("does not commit while IME composition is active", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "1:30");
    fireEvent.keyDown(combobox, { key: "Tab", isComposing: true });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("1 PM")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("announces that Tab confirms a newly chosen option or leaves the time unchanged", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Start time" }));

    expect(
      screen.getByText(
        /press Tab to confirm a newly chosen option and exit, or to leave the current time unchanged/i,
      ),
    ).toBeInTheDocument();
  });
});

const focusedOptionName = (combobox: HTMLElement) => {
  const activeId = combobox.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const option = document.getElementById(activeId!);
  expect(option).toBeTruthy();
  return option!;
};

describe("TimePicker arrow-key focus", () => {
  it("focuses the current time on open so arrow keys move one interval", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={{ ...fiveThirty }} options={dayOptions} />);

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(focusedOptionName(combobox)).toHaveTextContent("5:30 PM");

    await user.keyboard("{ArrowUp}");
    expect(focusedOptionName(combobox)).toHaveTextContent("5:15 PM");

    await user.keyboard("{ArrowDown}");
    expect(focusedOptionName(combobox)).toHaveTextContent("5:30 PM");

    await user.keyboard("{ArrowDown}");
    expect(focusedOptionName(combobox)).toHaveTextContent("5:45 PM");
  });

  it("keeps a custom time selectable and arrow-navigable from nearby intervals", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={{ label: "5:33 PM", value: "5:33 PM" }}
        options={dayOptions}
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);

    const listbox = screen.getByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: "5:33 PM" }),
    ).toBeInTheDocument();
    expect(focusedOptionName(combobox)).toHaveTextContent("5:33 PM");

    await user.keyboard("{ArrowUp}");
    expect(focusedOptionName(combobox)).toHaveTextContent("5:30 PM");

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(focusedOptionName(combobox)).toHaveTextContent("5:45 PM");
  });
});

describe("TimePicker Enter commit", () => {
  it("commits an explicit meridiem typed after the clock", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={nineFortyFive}
        options={dayOptions}
        freshOptions
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "12:45p");
    await user.keyboard("{Enter}");

    expect(screen.getByText("12:45 PM")).toBeInTheDocument();
    expect(screen.queryByText("9:45 AM")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("commits a clicked filtered option instead of the announced first match", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={nineFortyFive}
        options={dayOptions}
        freshOptions
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "12:4");
    expect(focusedOptionName(combobox)).toHaveTextContent("12:45 AM");

    await user.click(screen.getByRole("option", { name: "12:45 PM" }));

    expect(screen.getByText("12:45 PM")).toBeInTheDocument();
    expect(screen.queryByText("9:45 AM")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("commits the first filtered match on Enter without arrowing", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={nineFortyFive}
        options={dayOptions}
        freshOptions
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "12:45");
    await user.keyboard("{Enter}");

    expect(screen.getByText("12:45 AM")).toBeInTheDocument();
    expect(screen.queryByText("9:45 AM")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("commits the parsed hour on Enter instead of a substring match like 12 AM", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialValue={nineFortyFive}
        options={dayOptions}
        freshOptions
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "2");
    await user.keyboard("{Enter}");

    expect(screen.getByText("2 AM")).toBeInTheDocument();
    expect(screen.queryByText("12 AM")).not.toBeInTheDocument();
    expect(screen.queryByText("9:45 AM")).not.toBeInTheDocument();
  });

  it("commits a glued meridiem like 8p as 8 PM", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={onePm} options={dayOptions} freshOptions />);

    const combobox = screen.getByRole("combobox", { name: "Start time" });
    await user.click(combobox);
    await user.type(combobox, "8p");
    await user.keyboard("{Enter}");

    expect(screen.getByText("8 PM")).toBeInTheDocument();
    expect(screen.queryByText("1 PM")).not.toBeInTheDocument();
  });

  it("keeps the original time when Enter is pressed without changing the draft", async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={onePm} options={dayOptions} freshOptions />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Start time" })).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(screen.getByText("1 PM")).toBeInTheDocument();
    expect(screen.queryByText("12 AM")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
