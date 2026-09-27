import { cleanup, render, screen } from "@testing-library/react";
import { FormDigitHintOverlay } from "@web/shortcuts/form-digit-jump/FormDigitHintOverlay";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const box = (
  top: number,
  left: number,
  bottom: number,
  right: number,
): DOMRect =>
  ({
    top,
    left,
    bottom,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const stubRect = (element: HTMLElement, rect: DOMRect) => {
  element.getBoundingClientRect = () => rect;
};

const overlayRoot = () => document.querySelector("[data-form-digit-hints]");
const chipsWrapper = () => overlayRoot()?.querySelector("[aria-hidden]");
const chipDigits = () =>
  Array.from(chipsWrapper()?.children ?? []).map((el) => el.textContent);

/**
 * Builds a minimal event-form DOM matching the real selectors
 * (`common/utils/form/form.util.ts`'s FIELD_SELECTORS) for every field except
 * calendar, which callers add separately to test its conditional absence.
 */
const buildForm = () => {
  const form = document.createElement("form");
  form.setAttribute("name", "Event Form");
  document.body.append(form);

  const title = document.createElement("input");
  title.setAttribute("name", "Event Title");
  form.append(title);

  const start = document.createElement("input");
  start.id = "startTimePicker";
  form.append(start);

  const end = document.createElement("input");
  end.id = "endTimePicker";
  form.append(end);

  const recurrence = document.createElement("div");
  recurrence.id = "event-form-recurrence";
  const recurrenceButton = document.createElement("button");
  recurrenceButton.setAttribute("aria-label", "Edit recurrence");
  recurrence.append(recurrenceButton);
  form.append(recurrence);

  const color = document.createElement("div");
  color.id = "event-form-color";
  const radio = document.createElement("input");
  radio.type = "radio";
  color.append(radio);
  document.body.append(color);

  const location = document.createElement("div");
  location.id = "event-form-location";
  form.append(location);

  const attendees = document.createElement("div");
  attendees.id = "event-form-attendees";
  const attendeesInput = document.createElement("input");
  attendeesInput.setAttribute("role", "combobox");
  attendees.append(attendeesInput);
  form.append(attendees);

  const description = document.createElement("div");
  description.id = "event-form-description";
  document.body.append(description);

  const actions = document.createElement("div");
  actions.id = "event-form-actions";
  actions.setAttribute("role", "group");
  form.append(actions);

  const elements = [
    title,
    start,
    end,
    recurrenceButton,
    color,
    location,
    attendees,
    description,
    actions,
  ];
  for (const element of elements) {
    stubRect(element, box(100, 80, 140, 240));
  }

  return { form };
};

describe("FormDigitHintOverlay", () => {
  let originalInnerHeight: number;
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerHeight = window.innerHeight;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("renders nothing when not visible", () => {
    buildForm();
    render(<FormDigitHintOverlay visible={false} />);

    expect(overlayRoot()).toBeNull();
  });

  it("renders a chip for every present field except the missing calendar picker", () => {
    buildForm();
    render(<FormDigitHintOverlay visible={true} />);

    // Digit 5 (calendar) has no chip: no #event-form-calendar element was added,
    // matching an edit draft where the calendar picker isn't rendered. RSVP
    // (`-`) is also absent here. Digit 0 is the action toolbar, chipped after
    // 9 because that's where the key sits on the physical top row.
    expect(chipDigits()).toEqual(["1", "2", "3", "4", "6", "7", "8", "9", "0"]);
  });

  it("renders the calendar chip once the picker is present", () => {
    buildForm();
    const calendar = document.createElement("div");
    calendar.id = "event-form-calendar";
    stubRect(calendar, box(100, 80, 140, 240));
    document.body.append(calendar);

    render(<FormDigitHintOverlay visible={true} />);

    expect(chipDigits()).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0",
    ]);
  });

  it("renders the RSVP chip once the Going control is present", () => {
    buildForm();
    const rsvp = document.createElement("div");
    rsvp.id = "event-form-rsvp";
    stubRect(rsvp, box(200, 80, 240, 240));
    document.body.append(rsvp);

    render(<FormDigitHintOverlay visible={true} />);

    expect(chipDigits()).toEqual([
      "1",
      "2",
      "3",
      "4",
      "6",
      "7",
      "8",
      "9",
      "0",
      "-",
    ]);
    expect(screen.getByRole("status").textContent).toContain("- for going");
  });

  it("exposes a screen-reader summary while the visible chips stay aria-hidden", () => {
    buildForm();
    render(<FormDigitHintOverlay visible={true} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Jump where?");
    expect(status.textContent).toContain("1 for title");
    expect(status.textContent).toContain("8 for guests");
    expect(status.textContent).toContain("9 for description");
    expect(status.textContent).toContain("0 for actions");
    expect(chipsWrapper()?.getAttribute("aria-hidden")).not.toBeNull();
  });

  it("does not announce a field with no chip, so the screen-reader summary never advertises a dead shortcut", () => {
    buildForm();
    render(<FormDigitHintOverlay visible={true} />);

    // No #event-form-calendar or #event-form-rsvp (edit-draft / not invited),
    // so those digits have neither a chip nor an announcement.
    expect(screen.getByRole("status").textContent).not.toContain("calendar");
    expect(screen.getByRole("status").textContent).not.toContain("going");
  });

  it("chips the guests wrapper even when react-select's inner input is too small to chip", () => {
    buildForm();
    const attendees = document.getElementById("event-form-attendees");
    const inner = attendees?.querySelector("input");
    expect(attendees).not.toBeNull();
    expect(inner).not.toBeNull();
    stubRect(inner!, box(112, 90, 114, 92));

    render(<FormDigitHintOverlay visible={true} />);

    expect(chipDigits()).toContain("8");
    expect(screen.getByRole("status").textContent).toContain("8 for guests");
  });
});
