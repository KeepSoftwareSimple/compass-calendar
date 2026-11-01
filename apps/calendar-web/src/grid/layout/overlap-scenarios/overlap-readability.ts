import { MIN_EVENT_WIDTH_FOR_TIME_LABEL } from "@web/grid/grid.constants";

export interface ReadabilityCard {
  height: number;
  id: string;
  left: number;
  top: number;
  width: number;
  zIndex: number;
}

/** Height of the strip at the top of a card that holds its title. */
export const TITLE_STRIP_HEIGHT = 15;

/** Visible title width at which a card reads at a glance. */
export const GOOD_TITLE_WIDTH = MIN_EVENT_WIDTH_FOR_TIME_LABEL;
/** Below this a title shows about five characters. */
export const TIGHT_TITLE_WIDTH = 50;

export interface ReadabilityScore {
  good: number;
  poor: number;
  tight: number;
}

/**
 * Width of each card's title strip not covered by a card painted above it.
 * Equal z paints in array order, matching DOM order on the grid.
 */
export const visibleTitleWidths = (
  cards: ReadabilityCard[],
): Map<string, number> => {
  const paintsAbove = (below: number, above: number) =>
    cards[above].zIndex > cards[below].zIndex ||
    (cards[above].zIndex === cards[below].zIndex && above > below);

  return new Map(
    cards.map((card, index) => {
      const stripBottom = card.top + Math.min(TITLE_STRIP_HEIGHT, card.height);
      const covers = cards
        .map((other, otherIndex) => ({ other, otherIndex }))
        .filter(
          ({ other, otherIndex }) =>
            otherIndex !== index &&
            paintsAbove(index, otherIndex) &&
            other.top < stripBottom &&
            other.top + other.height > card.top,
        )
        .map(({ other }): [number, number] => [
          Math.max(card.left, other.left),
          Math.min(card.left + card.width, other.left + other.width),
        ])
        .filter(([from, to]) => to > from)
        .sort((a, b) => a[0] - b[0]);

      let covered = 0;
      let open: [number, number] | null = null;
      for (const [from, to] of covers) {
        if (open && from <= open[1]) {
          open[1] = Math.max(open[1], to);
        } else {
          if (open) covered += open[1] - open[0];
          open = [from, to];
        }
      }
      if (open) covered += open[1] - open[0];

      return [card.id, Math.max(0, card.width - covered)];
    }),
  );
};

export const scoreReadability = (
  visibleWidths: Iterable<number>,
): ReadabilityScore => {
  const score = { good: 0, poor: 0, tight: 0 };
  for (const width of visibleWidths) {
    if (width >= GOOD_TITLE_WIDTH) score.good++;
    else if (width >= TIGHT_TITLE_WIDTH) score.tight++;
    else score.poor++;
  }
  return score;
};
