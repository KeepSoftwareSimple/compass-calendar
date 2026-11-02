import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import {
  type AdminPutBookingPageInput,
  BOOKING_MEETING_TYPE_LABEL_MAX_LENGTH,
  type BookingDurationMinutes,
} from "@core/types/booking.contracts";
import { BOOKING_DURATION_OPTIONS } from "@web/booking/booking.util";
import {
  BOOKING_SELECT_CLASS_NAME,
  BOOKING_TEXT_INPUT_CLASS_NAME,
} from "@web/booking/booking-form.styles";
import {
  addMeetingType,
  canAddMeetingType,
  canRemoveMeetingType,
  formMeetingTypes,
  removeMeetingType,
  setMeetingTypeDuration,
  setMeetingTypeLabel,
} from "@web/booking/booking-meeting-types.util";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { OverlayPanelActionButton } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { settingsShortcutAttrs } from "@web/settings/useSettingsShortcuts";

export const MEETING_TYPE_ROW_ATTR = "data-meeting-type-row";
const NAME_CAPTION_ID = "booking-meeting-type-name-caption";
const DURATION_CAPTION_ID = "booking-meeting-type-duration-caption";

const labelInputId = (id: string) => `booking-meeting-type-label-${id}`;

type Focus = { kind: "label" | "row"; id: string } | { kind: "add" };

const hasModifier = (event: KeyboardEvent<HTMLElement>) =>
  event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

const isRowDeleteKey = (event: KeyboardEvent<HTMLElement>) =>
  (event.key === "Delete" || event.key === "Backspace") && !hasModifier(event);

const isEnterKey = (event: KeyboardEvent<HTMLElement>) =>
  event.key === "Enter" &&
  !hasModifier(event) &&
  !event.nativeEvent.isComposing;

interface BookingMeetingTypesFieldProps {
  form: Pick<AdminPutBookingPageInput, "durationMinutes" | "meetingTypes">;
  invalid: boolean;
  onChange: (patch: Partial<AdminPutBookingPageInput>) => void;
}

/**
 * One to three meeting types. T adds one (Settings shortcut). On a focused
 * row, Enter edits its name and Delete removes it; Enter in the name returns
 * to the row. Delete only acts on the row itself, never while typing in its
 * name, so editing text keeps Backspace and Delete.
 */
export function BookingMeetingTypesField({
  form,
  invalid,
  onChange,
}: BookingMeetingTypesFieldProps) {
  const types = formMeetingTypes(form);
  const canAdd = canAddMeetingType(form);
  const canRemove = canRemoveMeetingType(form);
  // A save error lands on the first unnamed type, else on type #1's length.
  const errorAnchorIndex = types.findIndex((type) => type.label.trim() === "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [pendingFocus, setPendingFocus] = useState<Focus | null>(null);

  useLayoutEffect(() => {
    if (!pendingFocus) return;
    const root = rootRef.current;
    setPendingFocus(null);
    if (!root) return;
    const target =
      pendingFocus.kind === "add"
        ? root.querySelector<HTMLElement>(
            '[data-settings-shortcut="add-meeting-type"]',
          )
        : pendingFocus.kind === "label"
          ? root.querySelector<HTMLElement>(
              `#${CSS.escape(labelInputId(pendingFocus.id))}`,
            )
          : root.querySelector<HTMLElement>(
              `[${MEETING_TYPE_ROW_ATTR}="${CSS.escape(pendingFocus.id)}"]`,
            );
    target?.focus();
  }, [pendingFocus]);

  const add = () => {
    const next = addMeetingType(form);
    if (!next) return;
    onChange(next.patch);
    setPendingFocus({ kind: "label", id: next.id });
  };

  const remove = (index: number) => {
    const patch = removeMeetingType(form, index);
    if (!patch) return;
    const remaining = types.filter((_, i) => i !== index);
    const neighbor = remaining[Math.min(index, remaining.length - 1)];
    onChange(patch);
    setPendingFocus(neighbor ? { kind: "row", id: neighbor.id } : null);
  };

  return (
    <div className="flex flex-col gap-2" ref={rootRef}>
      <div
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)_8rem_4.5rem] gap-2 px-1"
      >
        <span className="text-sm text-text" id={NAME_CAPTION_ID}>
          Meeting type
        </span>
        <span className="text-sm text-text" id={DURATION_CAPTION_ID}>
          Duration
        </span>
        <span />
      </div>
      <ul aria-label="Meeting types" className="flex flex-col gap-1">
        {types.map((type, index) => {
          const position = index + 1;
          return (
            <li
              aria-label={type.label.trim() || `Meeting type ${position}`}
              className="c-focus-ring grid grid-cols-[minmax(0,1fr)_8rem_4.5rem] items-center gap-2 rounded p-1"
              key={type.id}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (isEnterKey(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  setPendingFocus({ kind: "label", id: type.id });
                  return;
                }
                if (!isRowDeleteKey(event) || !canRemove) return;
                event.preventDefault();
                event.stopPropagation();
                remove(index);
              }}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the row takes focus so Delete can remove it without stealing Delete from the name input.
              tabIndex={0}
              {...{ [MEETING_TYPE_ROW_ATTR]: type.id }}
            >
              <input
                aria-invalid={invalid && type.label.trim() === ""}
                aria-labelledby={index === 0 ? NAME_CAPTION_ID : undefined}
                aria-label={
                  index === 0 ? undefined : `Meeting type ${position} name`
                }
                className={`${BOOKING_TEXT_INPUT_CLASS_NAME} w-full min-w-0`}
                id={labelInputId(type.id)}
                maxLength={BOOKING_MEETING_TYPE_LABEL_MAX_LENGTH}
                onChange={(event) =>
                  onChange(setMeetingTypeLabel(form, index, event.target.value))
                }
                onKeyDown={(event) => {
                  if (!isEnterKey(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setPendingFocus({ kind: "row", id: type.id });
                }}
                type="text"
                value={type.label}
                {...(index === errorAnchorIndex
                  ? bookingFieldAttrs("duration")
                  : {})}
              />
              <select
                aria-labelledby={index === 0 ? DURATION_CAPTION_ID : undefined}
                aria-label={
                  index === 0 ? undefined : `Meeting type ${position} duration`
                }
                className={BOOKING_SELECT_CLASS_NAME}
                id={index === 0 ? "booking-duration" : undefined}
                onChange={(event) =>
                  onChange(
                    setMeetingTypeDuration(
                      form,
                      index,
                      Number(event.target.value) as BookingDurationMinutes,
                    ),
                  )
                }
                value={type.durationMinutes}
                {...(index === 0 && errorAnchorIndex === -1
                  ? bookingFieldAttrs("duration")
                  : {})}
              >
                {BOOKING_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
              <button
                aria-keyshortcuts="Delete"
                aria-label={`Remove ${type.label.trim() || `meeting type ${position}`}`}
                className={`c-focus-ring inline-flex h-8 items-center justify-center rounded text-text-muted hover:text-text ${canRemove ? "" : "invisible"}`}
                disabled={!canRemove}
                onClick={() => remove(index)}
                tabIndex={canRemove ? 0 : -1}
                title="Remove"
                type="button"
              >
                <ShortcutKeys keys="Delete" />
                <span className="pointer-coarse:inline hidden text-sm">
                  Remove
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <OverlayPanelActionButton
          aria-hidden={canAdd ? undefined : true}
          aria-keyshortcuts="T"
          className={canAdd ? "" : "invisible"}
          disabled={!canAdd}
          onClick={add}
          shortcut="T"
          tabIndex={canAdd ? 0 : -1}
          variant="ghost"
          {...settingsShortcutAttrs("add-meeting-type")}
        >
          Add type
        </OverlayPanelActionButton>
        <p
          className="flex pointer-coarse:hidden items-center gap-1 text-text-muted text-xs"
          data-testid="meeting-types-keys-hint"
        >
          <ShortcutKeys keys="Enter" />
          <span>edits</span>
          <ShortcutKeys className="ml-1" keys="Delete" />
          <span>removes a focused type</span>
        </p>
      </div>
    </div>
  );
}
