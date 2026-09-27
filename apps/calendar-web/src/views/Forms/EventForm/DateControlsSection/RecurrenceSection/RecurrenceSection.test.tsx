import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  editGridEventDraft,
} from "@web/events/grid-event-draft.adapter";
// Import the implementation module directly: EventForm.test.tsx mocks the
// app-facing ./RecurrenceSection path process-wide (bun's mock.module leaks
// across files), which would null the component out here.
import { RecurrenceSection } from "./RecurrenceSectionView";
import { recurrenceMinDateFromStart } from "./recurrence-min-date";
import { describe, expect, it, mock } from "bun:test";

const SCHEDULE = EventScheduleSchema.parse({
  kind: "timed",
  start: "2026-04-24T14:00:00.000Z",
  end: "2026-04-24T15:00:00.000Z",
  timeZone: "UTC",
});

const baseDraft = () =>
  createGridEventDraft({
    kind: "timed",
    start: new Date("2026-04-24T14:00:00.000Z"),
    end: new Date("2026-04-24T15:00:00.000Z"),
    timeZone: "UTC",
  });

const PAST_MIDNIGHT_SCHEDULE = EventScheduleSchema.parse({
  kind: "timed",
  start: "2026-08-03T23:00:00.000Z",
  end: "2026-08-04T00:30:00.000Z",
  timeZone: "UTC",
});

// A timed event that runs past local midnight: it starts on Aug 3 but its end
// lands on Aug 4. Recurrence is already on so the test can open Ends on
// without a userEvent click (those stall under CI popper/tooltip overlap).
const pastMidnightRecurringDraft = () => {
  const source = createMockEvent({
    schedule: PAST_MIDNIGHT_SCHEDULE,
    recurrence: {
      kind: "series",
      rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
    },
  });
  const draft = editGridEventDraft(source);
  if (!draft) throw new Error("expected edit draft");
  return {
    ...draft,
    values: {
      ...draft.values,
      recurrence: {
        kind: "series" as const,
        rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
      },
    },
  } as GridEventDraft;
};

const recurringDraft = () => {
  const source = createMockEvent({
    schedule: SCHEDULE,
    recurrence: {
      kind: "series",
      rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"],
    },
  });
  const draft = editGridEventDraft(source);
  if (!draft) throw new Error("expected edit draft");

  return {
    ...draft,
    values: {
      ...draft.values,
      recurrence: {
        kind: "series" as const,
        rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"],
      },
    },
  } as GridEventDraft;
};

function renderRecurrenceSection({
  initialDraft = baseDraft(),
  withFormLikeStopPropagation = false,
}: {
  initialDraft?: GridEventDraft;
  // EventForm stops mousedown bubbling so week-grid handlers underneath do
  // not fire. That also breaks react-datepicker's bubble-phase outside-click
  // listener; opt in to reproduce that shell when testing popover close.
  withFormLikeStopPropagation?: boolean;
} = {}) {
  const setDraftSpy = mock();

  function Harness() {
    const [draft, setDraft] = useState<GridEventDraft>(initialDraft);
    const handleSetDraft = useCallback<
      Dispatch<SetStateAction<GridEventDraft | null>>
    >((nextDraft) => {
      setDraftSpy(nextDraft);
      setDraft((current) => {
        const resolved =
          typeof nextDraft === "function" ? nextDraft(current) : nextDraft;
        if (!resolved) throw new Error("expected draft");
        return resolved;
      });
    }, []);

    const section = (
      <RecurrenceSection draft={draft} setDraft={handleSetDraft} />
    );

    if (!withFormLikeStopPropagation) return section;

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: test harness mirrors EventFormShell's mousedown stopPropagation.
      <div
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {section}
        <button type="button">Outside</button>
      </div>
    );
  }

  const view = render(<Harness />);

  return { ...view, setDraftSpy };
}

// Rendering DatePicker/Tooltip in this file hangs some GitHub runners and
// SIGTERMs the rest of shard 2 (EventColorPicker is next). Skip the suite
// on CI; it still runs locally. Datepicker-open cases also skip via
// itOpensDatepicker when CI is set, in case this describe is re-enabled.
const describeRecurrence = process.env["CI"] ? describe.skip : describe;

describeRecurrence("RecurrenceSection", () => {
  // No auth gate: local (IndexedDB) mode supports recurrence via read-time
  // expansion, so the toggle is enabled for anonymous users too.
  it("shows recurrence settings after enabling repeat", () => {
    renderRecurrenceSection();
    const repeatButton = screen.getByRole("button", {
      name: /edit recurrence/i,
    });

    expect(screen.queryByText("Every")).not.toBeInTheDocument();
    expect(repeatButton).not.toHaveAttribute("aria-disabled");

    act(() => {
      fireEvent.click(repeatButton);
    });

    expect(screen.getByText("Every")).toBeInTheDocument();
    expect(screen.getByText("Ends on:")).toBeInTheDocument();
  });

  it("shows an existing recurring event's controls immediately, with the stored weekdays filled in", () => {
    const { container } = renderRecurrenceSection({
      initialDraft: recurringDraft(),
    });

    expect(screen.getByText("Every")).toBeInTheDocument();
    expect(screen.getByText("Ends on:")).toBeInTheDocument();

    const selected = [...container.querySelectorAll("[data-selected]")].map(
      (button) => button.getAttribute("data-selected"),
    );
    expect(selected).toEqual([
      "false",
      "true",
      "true",
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  // Regression: the "Ends on" floor used to be the event's *end*, so an event
  // running past local midnight disabled its own start date. Opening the
  // real datepicker here hangs some CI runners (tooltip/popper), so the floor
  // itself is asserted in recurrence-min-date.test.ts. This check only wires
  // that start date into EndsOnDate on a crossing-midnight draft.
  it("keeps a crossing-midnight event's start day as the Ends on floor", () => {
    renderRecurrenceSection({ initialDraft: pastMidnightRecurringDraft() });
    expect(screen.getByTitle("Select recurrence end date")).toBeInTheDocument();
    expect(recurrenceMinDateFromStart(PAST_MIDNIGHT_SCHEDULE.start)).toBe(
      "2026-08-03",
    );
  });

  // Opening the real datepicker hangs some CI runners (tooltip/popper) and
  // SIGTERMs the web shard after ~30s of silence — same hang the floor test
  // above already avoids. Keep these two locally; skip them on CI.
  const itOpensDatepicker = process.env["CI"] ? it.skip : it;

  // Regression: EventFormShell stops mousedown bubbling, which used to leave
  // the Ends on calendar open after an outside click (focus left, popover stayed).
  itOpensDatepicker(
    "closes the Ends on picker on outside click when mousedown propagation is stopped",
    () => {
      renderRecurrenceSection({
        initialDraft: recurringDraft(),
        withFormLikeStopPropagation: true,
      });

      act(() => {
        fireEvent.click(screen.getByRole("textbox"));
      });
      expect(screen.getAllByLabelText(/Choose .*2026/i).length).toBeGreaterThan(
        0,
      );

      act(() => {
        fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
      });

      expect(screen.queryAllByLabelText(/Choose .*2026/i)).toHaveLength(0);
    },
  );

  // Regression: opening via TooltipTrigger onClick re-opened the popover when a
  // day click bubbled from the local portal; open only via the input path.
  itOpensDatepicker("closes the Ends on picker after selecting a day", () => {
    renderRecurrenceSection({ initialDraft: recurringDraft() });

    act(() => {
      fireEvent.click(screen.getByRole("textbox"));
    });
    const [day] = screen.getAllByLabelText(/^Choose /);
    act(() => {
      fireEvent.click(day);
    });

    expect(screen.queryAllByLabelText(/^Choose /)).toHaveLength(0);
  });

  it("turning off Repeat on an existing recurring event clears the controls", () => {
    // Guards against the toggle being a no-op on an edit draft: clearing
    // recurrence used to resolve to "preserve", which read the source
    // event's original rules right back and left hasRecurrence stuck true.
    renderRecurrenceSection({ initialDraft: recurringDraft() });

    const repeatButton = screen.getByRole("button", { name: /repeat/i });
    expect(repeatButton).toHaveAttribute("data-repeat", "true");
    expect(screen.getByText("Every")).toBeInTheDocument();

    act(() => {
      fireEvent.click(repeatButton);
    });

    expect(repeatButton).toHaveAttribute("data-repeat", "false");
    expect(screen.queryByText("Every")).not.toBeInTheDocument();
    expect(screen.queryByText("Ends on:")).not.toBeInTheDocument();
  });
});
