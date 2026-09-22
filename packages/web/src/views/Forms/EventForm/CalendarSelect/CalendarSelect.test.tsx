import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection as makeConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { setDefaultCalendarId } from "@web/calendars/default-calendar.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { CalendarSelect } from "@web/views/Forms/EventForm/CalendarSelect/CalendarSelect";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const renderCalendarSelect = (
  calendars: Calendar[],
  {
    value = null,
    onChange = mock(),
    connections,
  }: {
    value?: CalendarId | null;
    onChange?: (id: CalendarId) => void;
    connections?: SyncConnectionSummary[];
  } = {},
) => {
  if (connections) {
    userMetadataActions.set({
      connections,
    });
  }

  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);

  const utils = render(<CalendarSelect onChange={onChange} value={value} />, {
    wrapper,
  });

  return { queryClient, onChange, ...utils };
};

async function openDropdown() {
  const user = userEvent.setup();
  const button = screen.getByRole("combobox", { name: /calendar/i });
  await user.click(button);

  await waitFor(() => {
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  return { button, user };
}

describe("CalendarSelect", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("lists only writable, active calendars and marks the primary one", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const writable = makeCalendar({ name: "Team" });
    const readOnly = makeCalendar({
      name: "Holidays",
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const inactive = makeCalendar({ name: "Archived", isActive: false });

    renderCalendarSelect([primary, writable, readOnly, inactive]);

    await openDropdown();

    const listbox = screen.getByRole("listbox");
    const optionNames = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);

    // Trailing digit is the appended pick-key chip (1st, 2nd option).
    expect(optionNames).toEqual(["Personal (primary)1", "Team2"]);
    expect(within(listbox).queryByText("Holidays")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Archived")).not.toBeInTheDocument();
  });

  it("defaults the displayed/selected calendar to the default target when no value is chosen yet", async () => {
    const primaryGoogle = makeCalendar({ name: "Personal", isPrimary: true });
    const other = makeCalendar({ name: "Team" });

    renderCalendarSelect([primaryGoogle, other], { value: null });

    expect(
      screen.getByRole("combobox", {
        name: /Calendar:.*Personal \(primary\)/,
      }),
    ).toBeInTheDocument();

    await openDropdown();
    const defaultOption = screen.getByRole("option", {
      name: "Personal (primary)",
    });
    expect(defaultOption).toHaveAttribute("aria-selected", "true");
  });

  it("calls onChange with the selected calendar's id and closes the dropdown", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const team = makeCalendar({ name: "Team" });
    const onChange = mock();

    renderCalendarSelect([primary, team], { onChange });

    const { user } = await openDropdown();
    await user.click(screen.getByRole("option", { name: "Team" }));

    expect(onChange).toHaveBeenCalledWith(team.id);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows a no-writable-calendar message and no combobox when every calendar is read-only", () => {
    const readOnly = makeCalendar({
      name: "Holidays",
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });

    renderCalendarSelect([readOnly]);

    expect(
      screen.getByText("No writable calendar available"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens with Enter, navigates options with the arrow keys, and closes with Escape", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const team = makeCalendar({ name: "Team" });

    renderCalendarSelect([primary, team]);

    const button = screen.getByRole("combobox", { name: /calendar/i });
    const user = userEvent.setup();
    button.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const primaryOption = screen.getByRole("option", {
      name: "Personal (primary)",
    });
    primaryOption.focus();

    await user.keyboard("{ArrowDown}");

    await waitFor(() => {
      const teamOption = screen.getByRole("option", { name: "Team" });
      expect(teamOption).toHaveAttribute("tabindex", "0");
      expect(primaryOption).toHaveAttribute("tabindex", "-1");
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("marks the trigger invalid and links the error id when provided", () => {
    const calendar = makeCalendar({ name: "Personal", isPrimary: true });
    const { queryClient, wrapper } = createStoreWrapper();
    queryClient.setQueryData(calendarQueryKeys.all, [calendar]);

    render(
      <CalendarSelect
        onChange={mock()}
        value={null}
        error="Calendar is required"
        errorId="event-form-error-calendarId"
        id="event-form-calendar"
      />,
      { wrapper },
    );

    const button = screen.getByRole("combobox", { name: /calendar/i });
    expect(button).toHaveAttribute("id", "event-form-calendar");
    expect(button).toHaveAttribute("aria-invalid", "true");
    expect(button).toHaveAttribute(
      "aria-describedby",
      "event-form-error-calendarId",
    );
  });

  it("names each option's account when two accounts are connected", async () => {
    // Both accounts have a calendar called "Work" with a primary; without the
    // account the two options would be indistinguishable.
    const work = makeCalendar({
      name: "Work",
      isPrimary: true,
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Work",
      isPrimary: true,
      accountEmail: "ahab@gmail.com",
    });

    renderCalendarSelect([work, personal], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });
    await openDropdown();

    expect(
      screen.getByRole("option", { name: "Work (primary) on ahab@pequod.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Work (primary) on ahab@gmail.com" }),
    ).toBeInTheDocument();
  });

  it("leaves option labels alone with a single account", async () => {
    const work = makeCalendar({
      name: "Work",
      isPrimary: true,
      accountEmail: "ahab@pequod.com",
    });

    renderCalendarSelect([work], {
      connections: [makeConnection("ahab@pequod.com")],
    });
    await openDropdown();

    expect(
      screen.getByRole("option", { name: "Work (primary)" }),
    ).toBeInTheDocument();
  });

  it("keeps each account's calendars together, oldest-connected account first", async () => {
    const newer = makeCalendar({
      name: "Aardvark",
      accountEmail: "new@example.com",
    });
    const older = makeCalendar({
      name: "Zebra",
      accountEmail: "old@example.com",
    });

    renderCalendarSelect([newer, older], {
      connections: [
        makeConnection("old@example.com"),
        makeConnection("new@example.com"),
      ],
    });
    await openDropdown();

    // Alphabetically "Aardvark" sorts first, but it belongs to the newer
    // account, so it comes second. Trailing digit is the pick-key chip.
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Zebraold@example.com1", "Aardvarknew@example.com2"]);
  });

  it("picks a calendar by digit from the closed trigger without opening it", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const team = makeCalendar({ name: "Team" });
    const onChange = mock();

    renderCalendarSelect([primary, team], { onChange });

    const button = screen.getByRole("combobox", { name: /calendar/i });
    button.focus();
    fireEvent.keyDown(button, { code: "Digit2", key: "2" });

    expect(onChange).toHaveBeenCalledWith(team.id);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks a calendar by digit from the open list and shows per-option chips", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const team = makeCalendar({ name: "Team" });
    const onChange = mock();

    renderCalendarSelect([primary, team], { onChange });
    await openDropdown();

    expect(
      within(
        screen.getByRole("option", { name: "Personal (primary)" }),
      ).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("option", { name: "Team" })).getByText("2"),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("listbox"), {
      code: "Digit2",
      key: "2",
    });

    expect(onChange).toHaveBeenCalledWith(team.id);
  });

  it("ignores an out-of-range digit", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const onChange = mock();

    renderCalendarSelect([primary], { onChange });

    const button = screen.getByRole("combobox", { name: /calendar/i });
    button.focus();
    fireEvent.keyDown(button, { code: "Digit9", key: "9" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("displays the user's starred calendar as the default target", async () => {
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const starred = makeCalendar({ name: "Side project" });
    setDefaultCalendarId(starred.id);

    renderCalendarSelect([primary, starred], { value: null });

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Calendar: Side project" }),
      ).toBeInTheDocument();
    });
  });
});
