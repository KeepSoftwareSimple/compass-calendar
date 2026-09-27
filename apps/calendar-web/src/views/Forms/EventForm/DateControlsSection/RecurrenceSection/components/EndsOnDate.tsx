import { useMemo, useState } from "react";
import { parseCompassEventDate } from "@core/util/event/event.util";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

export interface EndsOnDateProps {
  minDate?: string;
  until?: Date | null;
  setUntil: (date: Date | null) => void;
}

export const EndsOnDate = ({
  until,
  setUntil,
  minDate = new Date().toISOString(),
}: EndsOnDateProps) => {
  const [open, setOpen] = useState(false);
  const miniDate = useMemo(() => parseCompassEventDate(minDate), [minDate]);

  return (
    <div className="mb-1 flex w-full basis-full items-center gap-2 p-0">
      <span className="relative text-m">Ends on:</span>

      <div
        className="flex items-start"
        style={{
          cursor: "pointer",
          borderColor: "var(--border-strong)",
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
        }}
      >
        <TooltipWrapper description="Select recurrence end date">
          <div id="portal">
            <DatePicker
              animationOnToggle={false}
              calendarClassName="recurrenceUntilDatePicker"
              isOpen={open}
              minDate={miniDate.toDate()}
              onCalendarClose={() => setOpen(false)}
              onCalendarOpen={() => setOpen(true)}
              onChange={() => null}
              onInputClick={() => setOpen(true)}
              // Combobox convention: ArrowDown on the closed input opens the
              // calendar, matching onInputClick for the mouse.
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && !open) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(true);
                }
              }}
              onSelect={(date) => {
                setUntil(date);
                setOpen(false);
              }}
              // With no end chosen there is no selection, and react-datepicker
              // would open at today's month — possibly months away from the
              // event being extended. Open at the event's own month instead.
              openToDate={until ? undefined : miniDate.toDate()}
              selected={until}
              title="Select recurrence end date"
              view="grid"
              portalId="portal"
            />
          </div>
        </TooltipWrapper>
      </div>
    </div>
  );
};
