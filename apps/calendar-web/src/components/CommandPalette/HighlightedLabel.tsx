import { type ReactNode } from "react";

interface HighlightedLabelProps {
  label: string;
  ranges: Array<[number, number]>;
}

/** Renders `label` with `ranges` (from `getLabelMatchRanges`) bolded. */
export function HighlightedLabel({ label, ranges }: HighlightedLabelProps) {
  if (ranges.length === 0) return <>{label}</>;

  const segments: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push(label.slice(cursor, start));
    segments.push(
      <strong key={start} className="font-semibold text-text">
        {label.slice(start, end)}
      </strong>,
    );
    cursor = end;
  }
  if (cursor < label.length) segments.push(label.slice(cursor));

  return <>{segments}</>;
}
