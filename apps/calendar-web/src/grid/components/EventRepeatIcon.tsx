import { darken } from "@web/common/styles/color.utils";
import { RepeatIcon } from "@web/components/Icons/Repeat";

interface Props {
  baseColor: string;
}

/**
 * The recurrence indicator shared by the timed and all-day grid cards: a small
 * repeat glyph pinned to the card's bottom-right, tinted a darker shade of the
 * event color so it complements the card instead of a loud fixed white.
 * Keeping it in one place stops the two cards from drifting apart.
 * Decorative — the recurring state is announced via each card's aria-label.
 */
export const EventRepeatIcon = ({ baseColor }: Props) => (
  <RepeatIcon
    aria-hidden="true"
    className="pointer-events-none absolute right-1 bottom-0.5"
    color={darken(baseColor, 30)}
    size={10}
    weight="bold"
  />
);
