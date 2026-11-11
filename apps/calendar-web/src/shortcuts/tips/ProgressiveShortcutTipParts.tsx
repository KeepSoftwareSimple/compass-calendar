import { type FC, useState } from "react";
import { flattenTieredHint } from "@core/shortcuts/contextual-hint-tiers";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

type Props = {
  hintId: string;
  primary: readonly ShortcutTipPart[];
  secondary?: readonly ShortcutTipPart[];
  className?: string;
};

/**
 * Renders a scannable primary shortcut row and a compact More control that
 * reveals secondary keys for the same focus state.
 */
export const ProgressiveShortcutTipParts: FC<Props> = (props) => (
  <ProgressiveShortcutTipPartsBody key={props.hintId} {...props} />
);

const ProgressiveShortcutTipPartsBody: FC<Props> = ({
  hintId,
  primary,
  secondary = [],
  className,
}) => {
  const [expanded, setExpanded] = useState(false);

  const hasSecondary = secondary.length > 0;
  const parts = flattenTieredHint({ primary, secondary }, expanded);

  return (
    <span className={className}>
      <ShortcutTipParts hintId={hintId} parts={parts} />
      {hasSecondary && !expanded ? (
        <>
          {" "}
          <button
            aria-expanded={false}
            className="c-focus-ring ml-1 inline rounded-xs px-1 text-text underline decoration-text-muted/50 underline-offset-2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setExpanded(true)}
            type="button"
          >
            More
          </button>
        </>
      ) : null}
      {hasSecondary && expanded ? (
        <>
          {" "}
          <button
            aria-expanded
            className="c-focus-ring ml-1 inline rounded-xs px-1 text-text underline decoration-text-muted/50 underline-offset-2"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setExpanded(false)}
            type="button"
          >
            Less
          </button>
        </>
      ) : null}
    </span>
  );
};
