import { Minus, Plus } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  type LocalTimeOfDay,
  type WeeklyAvailability,
} from "@core/types/booking.contracts";
import {
  ISO_WEEKDAYS,
  type IsoWeekday,
  weekdayLabel,
  weekdayShortLabel,
} from "@web/booking/booking.util";
import { BOOKING_SELECT_CLASS_NAME } from "@web/booking/booking-form.styles";
import {
  addBlock,
  canAddBlock,
  endOptions,
  formatTimeLabel,
  intervalsForDay,
  removeBlock,
  setDayAvailable,
  startOptions,
  updateBlock,
} from "@web/booking/weekly-hours";
import IconButton from "@web/components/IconButton/IconButton";

interface BookingWeeklyHoursEditorProps {
  value: WeeklyAvailability;
  onChange: (value: WeeklyAvailability) => void;
  disabled?: boolean;
  describedBy?: string;
}

const HOURS_LINE_CLASS_NAME =
  "grid min-h-8 grid-cols-[auto_2.5rem_1fr_auto_1fr_2rem] items-center gap-2";

const blockSelectLabel = (
  weekday: IsoWeekday,
  kind: "start" | "end",
  index: number,
): string => {
  const day = weekdayLabel(weekday);
  return index === 0 ? `${day} ${kind}` : `${day} ${kind} ${index + 1}`;
};

const hoursSelectId = (
  weekday: IsoWeekday,
  kind: "start" | "end",
  index: number,
): string => `booking-hours-${weekday}-${kind}-${index}`;

const renderMenus = (
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  index: number,
  describedBy: string | undefined,
  onChange: (next: WeeklyAvailability) => void,
) => {
  const block = intervalsForDay(value, weekday)[index];
  if (block == null) return null;
  const starts = startOptions(value, weekday, index);
  const ends = endOptions(value, weekday, index);
  const startChoices = starts.includes(block.start)
    ? starts
    : [...starts, block.start].sort((left, right) => left.localeCompare(right));

  return (
    <>
      <select
        aria-describedby={describedBy}
        aria-label={blockSelectLabel(weekday, "start", index)}
        className={BOOKING_SELECT_CLASS_NAME}
        id={hoursSelectId(weekday, "start", index)}
        onChange={(event) =>
          onChange(
            updateBlock(value, weekday, index, {
              start: event.target.value as LocalTimeOfDay,
            }),
          )
        }
        value={block.start}
      >
        {startChoices.map((time) => (
          <option key={time} value={time}>
            {formatTimeLabel(time)}
          </option>
        ))}
      </select>
      <span className="text-sm text-text">to</span>
      <select
        aria-describedby={describedBy}
        aria-label={blockSelectLabel(weekday, "end", index)}
        className={BOOKING_SELECT_CLASS_NAME}
        id={hoursSelectId(weekday, "end", index)}
        onChange={(event) =>
          onChange(
            updateBlock(value, weekday, index, {
              end: event.target.value as LocalTimeOfDay,
            }),
          )
        }
        value={block.end}
      >
        {ends.map((time) => (
          <option key={time} value={time}>
            {formatTimeLabel(time)}
          </option>
        ))}
      </select>
    </>
  );
};

/**
 * Per-day weekly hours: checkbox, short label, Start, to, End, and + / -.
 */
export function BookingWeeklyHoursEditor({
  value,
  onChange,
  disabled = false,
  describedBy,
}: BookingWeeklyHoursEditorProps) {
  const pendingFocusIdRef = useRef<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  useLayoutEffect(() => {
    if (focusToken === 0) return;
    const id = pendingFocusIdRef.current;
    if (!id) return;
    const node = document.getElementById(id);
    if (!(node instanceof HTMLElement)) return;
    pendingFocusIdRef.current = null;
    node.focus();
  }, [focusToken]);

  const requestFocus = (id: string) => {
    pendingFocusIdRef.current = id;
    setFocusToken((token) => token + 1);
  };

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm text-text">Weekly hours</legend>
      {ISO_WEEKDAYS.map((weekday) => {
        const blocks = intervalsForDay(value, weekday);
        const available = blocks.length > 0;
        return (
          <div className="flex flex-col" key={weekday}>
            <div className={HOURS_LINE_CLASS_NAME}>
              <input
                aria-label={weekdayLabel(weekday)}
                checked={available}
                className="c-all-day-checkbox"
                onChange={(event) =>
                  onChange(
                    setDayAvailable(value, weekday, event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span aria-hidden="true" className="text-sm text-text">
                {weekdayShortLabel(weekday)}
              </span>
              {available ? (
                renderMenus(value, weekday, 0, describedBy, onChange)
              ) : (
                <>
                  <span />
                  <span />
                  <span />
                </>
              )}
              <div className="flex w-8 justify-center">
                {available ? (
                  <IconButton
                    aria-label={`Add hours to ${weekdayLabel(weekday)}`}
                    className="size-8 text-text"
                    disabled={!canAddBlock(value, weekday)}
                    onClick={() => {
                      requestFocus(
                        hoursSelectId(weekday, "start", blocks.length),
                      );
                      onChange(addBlock(value, weekday));
                    }}
                    size="small"
                  >
                    <Plus aria-hidden="true" size={16} />
                  </IconButton>
                ) : null}
              </div>
            </div>
            {blocks.slice(1).map((block, offset) => {
              const index = offset + 1;
              return (
                <div className="c-grow-in" key={`${weekday}-${block.start}`}>
                  <div className={HOURS_LINE_CLASS_NAME}>
                    <span />
                    <span />
                    {renderMenus(value, weekday, index, describedBy, onChange)}
                    <div className="flex w-8 justify-center">
                      <IconButton
                        aria-label={`Remove ${weekdayLabel(weekday)} ${formatTimeLabel(block.start)} to ${formatTimeLabel(block.end)}`}
                        className="size-8 text-text"
                        onClick={() => {
                          requestFocus(
                            hoursSelectId(weekday, "start", index - 1),
                          );
                          onChange(removeBlock(value, weekday, index));
                        }}
                        size="small"
                      >
                        <Minus aria-hidden="true" size={16} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
}
