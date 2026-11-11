import { RepeatIcon } from "@web/components/Icons/Repeat";

interface Props {
  /** Same readable foreground as the card title and time (from theme.getContrastText). */
  contentColor: string;
}

/**
 * The recurrence indicator shared by the timed and all-day grid cards: a small
 * repeat glyph pinned to the card's bottom-right. It uses the same contrast
 * foreground as the title and time so it stays legible on both light and dark
 * event fills across themes. Keeping it in one place stops the two cards from
 * drifting apart. Decorative — the recurring state is announced via each
 * card's aria-label.
 */
export const EventRepeatIcon = ({ contentColor }: Props) => (
  <RepeatIcon
    aria-hidden="true"
    className="pointer-events-none absolute right-1 bottom-0.5"
    color={contentColor}
    size={10}
    weight="bold"
  />
);
