import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { EventFormHintKeys } from "@web/views/Forms/EventForm/EventFormFocusedHint";

export type LifeBirthDateHintMode =
  | "closed"
  | "typing"
  | "grid"
  | "year"
  | "month";

function HintRow({ keys, label }: { keys: string | string[]; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-text-muted text-xs">
      <ShortcutKeys keys={keys} className="shrink-0 translate-y-px" />
      <span className="min-w-0 leading-snug">{label}</span>
    </span>
  );
}

export function LifeBirthDatePopoverHints({
  mode,
}: {
  mode: LifeBirthDateHintMode;
}) {
  if (mode === "closed") {
    return (
      <EventFormHintKeys
        keys="ArrowDown"
        label="Arrow down opens the calendar"
      />
    );
  }

  if (mode === "year" || mode === "month") {
    return (
      <span
        data-testid="life-birth-date-calendar-hint"
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <HintRow keys="Enter" label="select" />
        <HintRow keys="Esc" label="close" />
      </span>
    );
  }

  if (mode === "typing") {
    return (
      <span
        data-testid="life-birth-date-calendar-hint"
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <HintRow keys="Enter" label="save typed date" />
        <HintRow keys="ArrowDown" label="move to calendar" />
        <HintRow keys="Esc" label="dismiss" />
      </span>
    );
  }

  return (
    <details
      data-testid="life-birth-date-calendar-hint"
      aria-label="Calendar keyboard shortcuts, expand for the full list"
      className="pointer-coarse:hidden w-full max-w-full text-left text-text-muted text-xs"
    >
      <summary className="cursor-pointer select-none list-none rounded-xs py-0.5 marker:content-none hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-medium text-[10px] text-text-muted uppercase tracking-wide">
            Keys
          </span>
          <ShortcutKeys keys={["ArrowUp", "ArrowDown", "ArrowLeft"]} />
          <span className="text-[10px]">move in grid</span>
          <span className="text-text-muted" aria-hidden>
            ·
          </span>
          <ShortcutKeys keys="Enter" />
          <span className="text-[10px]">pick</span>
          <span className="text-text-muted" aria-hidden>
            ·
          </span>
          <ShortcutKeys keys="Esc" />
          <span className="text-[10px]">close</span>
          <span className="text-[10px] text-text-muted" aria-hidden>
            (expand for Page keys and year)
          </span>
        </span>
      </summary>
      <section
        className="mt-1 max-h-[10.5rem] overflow-y-auto overscroll-contain border-color-border border-t pt-1"
        aria-label="Full calendar keyboard shortcuts"
      >
        <ul className="flex list-none flex-col gap-1.5 pl-0">
          <li>
            <HintRow keys={["ArrowUp", "ArrowDown"]} label="move by one week" />
          </li>
          <li>
            <HintRow
              keys={["ArrowLeft", "ArrowRight"]}
              label="move by one day"
            />
          </li>
          <li>
            <HintRow keys={["PageUp", "PageDown"]} label="change month" />
          </li>
          <li>
            <HintRow keys={["Shift", "PageUp"]} label="year back" />
          </li>
          <li>
            <HintRow keys={["Shift", "PageDown"]} label="year forward" />
          </li>
          <li>
            <HintRow keys="Enter" label="select the highlighted day" />
          </li>
          <li>
            <HintRow keys="Space" label="also selects the highlighted day" />
          </li>
          <li>
            <HintRow keys="Esc" label="close the calendar" />
          </li>
          <li>
            <HintRow
              keys="Tab"
              label="leave the field and save or revert typed text"
            />
          </li>
        </ul>
      </section>
    </details>
  );
}
