import { type KeyboardEvent, type ReactNode } from "react";
import {
  type EventColorSlot,
  EventColorSlotSchema,
} from "@core/types/event-color.contracts";
import {
  EVENT_COLOR_SLOT_HEX,
  eventColorLabel,
} from "@web/common/styles/theme.util";
import {
  digitPickIndex,
  PICK_KEY_LABELS,
} from "@web/shortcuts/digit-pick.util";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";

const COLOR_SLOTS = EventColorSlotSchema.options;

// Mirrors the render order below: "Calendar default" swatch, then each
// color slot. Digit-pick indexes into this list.
const PICK_OPTIONS: Array<EventColorSlot | null> = [null, ...COLOR_SLOTS];

export interface EventColorPickerProps {
  value: EventColorSlot | null;
  onChange: (color: EventColorSlot | null) => void;
  /** Radio group name; defaults to `event-color`. Pass a distinct value when
   * more than one picker can mount at once (e.g. form + context menu). */
  name?: string;
  id?: string;
}

const swatchClassName =
  "h-5 w-5 cursor-pointer appearance-none rounded-sm border border-transparent checked:border-text checked:outline checked:outline-2 checked:outline-offset-1 checked:outline-text focus-visible:ring-2 focus-visible:ring-accent";

const ColorSwatch = ({
  label,
  pickKey,
  children,
}: {
  label: string;
  pickKey: string | undefined;
  children: ReactNode;
}) => (
  <span className="group relative inline-flex">
    {children}
    <span className="c-context-tooltip" role="tooltip">
      {label}
    </span>
    {pickKey && (
      <span
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 flex items-center justify-center rounded-sm bg-bg-primary/70 font-semibold text-[10px] text-text group-focus-within/picker:visible"
      >
        {pickKey}
      </span>
    )}
  </span>
);

export const EventColorPicker = ({
  value,
  onChange,
  name = "event-color",
  id,
}: EventColorPickerProps) => {
  // Lets a single keypress pick a swatch directly instead of arrowing
  // through all 12. Only fires while focus is already inside the group
  // (radios bubble here), which is also exactly when the pick-key chips
  // are visible. Arrows/Tab/Space/Enter pass through untouched.
  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const index = digitPickIndex(event);
    if (index === null || index >= PICK_OPTIONS.length) return;

    event.preventDefault();
    event.stopPropagation();
    onChange(PICK_OPTIONS[index] ?? null);
    // Query by the same index just picked, rather than trusting radio order
    // in the DOM to match PICK_OPTIONS order.
    event.currentTarget
      .querySelector<HTMLInputElement>(`input[data-pick-index="${index}"]`)
      ?.focus();
    recordHandledShortcutInvocation("edit-pick-by-number");
  };

  return (
    <fieldset
      id={id}
      className="group/picker m-0 min-w-0 border-0 p-0"
      onKeyDown={handleKeyDown}
    >
      <legend className="sr-only">Event color</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        <ColorSwatch label={eventColorLabel(null)} pickKey={PICK_KEY_LABELS[0]}>
          <input
            type="radio"
            name={name}
            checked={value === null}
            aria-label={eventColorLabel(null)}
            className={`${swatchClassName} border-border bg-bg-primary`}
            onChange={() => onChange(null)}
            data-pick-index={0}
          />
        </ColorSwatch>
        {COLOR_SLOTS.map((slot, slotIndex) => {
          const label = eventColorLabel(slot);
          const index = slotIndex + 1;
          return (
            <ColorSwatch
              key={slot}
              label={label}
              pickKey={PICK_KEY_LABELS[index]}
            >
              <input
                type="radio"
                name={name}
                checked={value === slot}
                aria-label={label}
                className={swatchClassName}
                style={{ backgroundColor: EVENT_COLOR_SLOT_HEX[slot] }}
                onChange={() => onChange(slot)}
                data-pick-index={index}
              />
            </ColorSwatch>
          );
        })}
      </div>
    </fieldset>
  );
};
