import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  replaceGridDraftSchedule,
  scheduleDatesFromDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { getFormDates } from "../form.datetime.util";
import { TimePickers } from "./TimePickers";
import { describe, expect, it } from "bun:test";

const START_DATE = new Date("2026-04-24T14:00:00.000Z");
const END_DATE = new Date("2026-04-24T15:00:00.000Z");

// The selected dates and times come from getFormDates over the draft's
// schedule, which is how EventForm builds them. That mapping matters here:
// for a same-day draft getFormDates returns the *start* instant as the end
// date, so the two dates only diverge once a draft crosses midnight.
function Harness({
  start = START_DATE,
  end = END_DATE,
}: {
  start?: Date;
  end?: Date;
}) {
  const [draft, setDraft] = useState<GridEventDraft>(
    createGridEventDraft(timedGridSchedule(start, end)),
  );

  const { startDate, endDate } = scheduleDatesFromDraft(draft);
  const formDates = getFormDates(startDate, endDate);

  return (
    <>
      <TimePickers
        endTime={formDates.endTime}
        onScheduleChange={(schedule) => {
          setDraft((current) => replaceGridDraftSchedule(current, schedule));
        }}
        selectedEndDate={formDates.endDate}
        selectedStartDate={formDates.startDate}
        startTime={formDates.startTime}
      />
      <p>{`draft: ${startDate} / ${endDate}`}</p>
    </>
  );
}

// Selects by the option's accessible name rather than typing, so a label that
// is a substring of another ("12 AM" vs "12:30 AM") can never quietly commit
// the wrong option.
const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  picker: "Start time" | "End time",
  optionName: string,
) => {
  await user.click(screen.getByRole("combobox", { name: picker }));
  await user.click(screen.getByRole("option", { name: optionName }));
};

const expectDraft = (startDate: string, endDate: string) =>
  expect(
    screen.getByText(`draft: ${startDate} / ${endDate}`),
  ).toBeInTheDocument();

describe("TimePickers", () => {
  it("gives the start and end pickers distinct accessible names", () => {
    render(<Harness />);

    const start = screen.getByRole("combobox", { name: "Start time" });
    const end = screen.getByRole("combobox", { name: "End time" });

    expect(start).not.toBe(end);
  });

  // The compliment correction is computed on a fixed calendar-day anchor. When
  // it crosses midnight the corrected time was formatted back to a bare
  // "h:mm A" and paired with the unchanged date, producing end-before-start and
  // an unhandled ZodError out of mapToBackend.
  it("moves the start to the previous day when correcting it backwards past midnight", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T00:30:00.000Z")}
        end={new Date("2026-04-24T01:00:00.000Z")}
      />,
    );

    await pick(user, "End time", "12 AM");

    // 30-minute duration preserved by starting the previous evening, rather
    // than 11:30 PM on the 24th, which would end before it starts.
    expectDraft("2026-04-23T23:30:00+00:00", "2026-04-24T00:00:00+00:00");
  });

  it("moves the end to the next day when correcting it forwards past midnight", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T22:00:00.000Z")}
        end={new Date("2026-04-24T23:00:00.000Z")}
      />,
    );

    await pick(user, "Start time", "11:30 PM");

    expectDraft("2026-04-24T23:30:00+00:00", "2026-04-25T00:30:00+00:00");
  });

  // The day carry belongs on the date of the side the user changed. Applying
  // it to the compliment's date instead counts an already-overnight draft's
  // span twice, silently stretching this event to 47 hours.
  it("does not add a second day when correcting a draft that already crosses midnight", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T23:30:00.000Z")}
        end={new Date("2026-04-25T00:30:00.000Z")}
      />,
    );

    await pick(user, "Start time", "11 PM");

    expectDraft("2026-04-24T23:00:00+00:00", "2026-04-25T22:00:00+00:00");
  });

  it("shifts the end later to keep the duration when start moves past it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T06:00:00.000Z")}
        end={new Date("2026-04-24T07:00:00.000Z")}
      />,
    );

    await pick(user, "Start time", "8 AM");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectDraft("2026-04-24T08:00:00+00:00", "2026-04-24T09:00:00+00:00");
  });

  it("shifts the start earlier to keep the duration when end moves before it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T06:00:00.000Z")}
        end={new Date("2026-04-24T07:00:00.000Z")}
      />,
    );

    await pick(user, "End time", "5 AM");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectDraft("2026-04-24T04:00:00+00:00", "2026-04-24T05:00:00+00:00");
  });

  it("shifts the start from a keyboard commit that would invert the times", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T06:00:00.000Z")}
        end={new Date("2026-04-24T07:00:00.000Z")}
      />,
    );

    const end = screen.getByRole("combobox", { name: "End time" });
    await user.click(end);
    await user.keyboard("5 AM{Enter}");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectDraft("2026-04-24T04:00:00+00:00", "2026-04-24T05:00:00+00:00");
  });

  it("does not change the draft when Tabbing through the time pickers", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T13:00:00.000Z")}
        end={new Date("2026-04-24T14:15:00.000Z")}
      />,
    );

    await user.tab();
    expect(screen.getByRole("combobox", { name: "Start time" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "End time" })).toHaveFocus();
    await user.tab();

    expect(screen.queryByText("12 AM")).not.toBeInTheDocument();
    expect(screen.getByText("1 PM")).toBeInTheDocument();
    expect(screen.getByText("2:15 PM")).toBeInTheDocument();
    expectDraft("2026-04-24T13:00:00+00:00", "2026-04-24T14:15:00+00:00");
  });

  it("does not reject a later overnight end just because the clock is before start", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        start={new Date("2026-04-24T22:00:00.000Z")}
        end={new Date("2026-04-25T06:00:00.000Z")}
      />,
    );

    await pick(user, "End time", "5 AM");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
