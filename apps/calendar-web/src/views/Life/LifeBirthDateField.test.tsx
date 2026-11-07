import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren, useState } from "react";
import { flushSync } from "react-dom";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { LifeBirthDateField } from "@web/views/Life/LifeBirthDateField";
import { describe, expect, it, mock } from "bun:test";

process.env.PORT ??= "3000";

await import("@testing-library/jest-dom");

const wrapper = ({ children }: PropsWithChildren) => (
  <HotkeysProvider>{children}</HotkeysProvider>
);

const today = new Date(2026, 0, 1);
const minDate = new Date(1900, 0, 1);

function ControlledBirthDateField({
  onCommit,
  storedBirthDate,
}: {
  onCommit: (date: Date | null) => void;
  storedBirthDate: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <LifeBirthDateField
      id="life-birth-date"
      isOpen={open}
      maxDate={today}
      minDate={minDate}
      onCalendarClose={() => setOpen(false)}
      onCalendarOpen={() => {
        flushSync(() => setOpen(true));
      }}
      onCommit={onCommit}
      storedBirthDate={storedBirthDate}
      today={today}
    />
  );
}

describe("LifeBirthDateField", () => {
  it("commits a typed ISO date on Enter and shows a live preview", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <ControlledBirthDateField onCommit={onCommit} storedBirthDate="" />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    await user.click(input);
    await user.clear(input);
    await user.type(input, "1993-04-12");

    expect(screen.getByTestId("life-birth-date-preview")).toHaveTextContent(
      "Apr 12, 1993",
    );

    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [[committed]] = onCommit.mock.calls as unknown as [[Date]];
    expect(committed.getFullYear()).toBe(1993);
    expect(committed.getMonth()).toBe(3);
    expect(committed.getDate()).toBe(12);
  });

  it("opens the grid and steps the month with PageDown", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <ControlledBirthDateField
        onCommit={onCommit}
        storedBirthDate="2000-01-15"
      />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    await user.click(input);
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(screen.getByText("Jan 2000")).toBeInTheDocument();
    });

    act(() => {
      pressKey("PageDown", {}, input);
    });

    await waitFor(() => {
      expect(screen.getByText("Feb 2000")).toBeInTheDocument();
    });
  });

  it("shows the parsed month in the grid while typing with the calendar open", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <ControlledBirthDateField
        onCommit={onCommit}
        storedBirthDate="2000-01-01"
      />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    await user.clear(input);
    await user.type(input, "4/12/1993");

    await waitFor(() => {
      expect(screen.getByText("Apr 1993")).toBeInTheDocument();
    });
  });

  it("commits a year typed with arrow-down day pick on Enter", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <ControlledBirthDateField onCommit={onCommit} storedBirthDate="" />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    await user.click(input);
    await user.type(input, "1993");
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(screen.getByText("Jan 1993")).toBeInTheDocument();
    });

    await user.keyboard("{ArrowRight}{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [[committed]] = onCommit.mock.calls as unknown as [[Date]];
    expect(committed.getFullYear()).toBe(1993);
    expect(committed.getMonth()).toBe(0);
    expect(committed.getDate()).toBeGreaterThan(1);
  });

  it("registers grid keyboard hints while the calendar is open before the grid is focused", async () => {
    const onCommit = mock(() => {});

    render(
      <LifeBirthDateField
        id="life-birth-date"
        isOpen
        maxDate={today}
        minDate={minDate}
        onCalendarClose={() => {}}
        onCalendarOpen={() => {}}
        onCommit={onCommit}
        storedBirthDate=""
        today={today}
      />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    act(() => {
      input.blur();
    });

    const { useDatePickerHintStore } = await import(
      "@web/shortcuts/tips/date-picker-hint.store"
    );
    await waitFor(() => {
      const top = useDatePickerHintStore.getState().stack.at(-1);
      expect(top?.id).toBe("date-picker-life");
      const plain = getPartsPlainText(top!.parts);
      expect(plain).toContain("PageDown");
      expect(plain).not.toMatch(/open/i);
    });
  });

  it("registers grid keyboard hints in the sidebar help store after moving focus into the calendar", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <ControlledBirthDateField onCommit={onCommit} storedBirthDate="" />,
      { wrapper },
    );

    const input = screen.getByRole("textbox", { name: "Date of birth" });
    await user.click(input);
    await user.type(input, "1993-09-14");
    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      expect(screen.getByText("Sep 1993")).toBeInTheDocument();
    });

    const { useDatePickerHintStore } = await import(
      "@web/shortcuts/tips/date-picker-hint.store"
    );
    await waitFor(() => {
      const top = useDatePickerHintStore.getState().stack.at(-1);
      expect(top?.id).toBe("date-picker-life");
      expect(getPartsPlainText(top!.parts)).toMatch(/day/i);
    });
  });

  it("selects a day from the open grid with a click", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onCommit = mock(() => {});

    render(
      <LifeBirthDateField
        id="life-birth-date"
        isOpen
        maxDate={today}
        minDate={minDate}
        onCalendarClose={() => {}}
        onCalendarOpen={() => {}}
        onCommit={onCommit}
        storedBirthDate="2000-01-15"
        today={today}
      />,
      { wrapper },
    );

    const calendar = document.querySelector(
      ".lifeBirthDatePicker",
    ) as HTMLElement;
    await user.click(within(calendar).getByText("20"));
    expect(onCommit).toHaveBeenCalled();
  });
});
