import { type ReactNode } from "react";

interface StableLabelProps {
  /** The label currently shown. */
  children: ReactNode;
  /**
   * Every label this slot can show (idle and busy). The slot is as wide as the
   * widest, so swapping "Save changes" for "Saving…" never resizes the button
   * or slides its neighbours.
   */
  labels: readonly string[];
}

/** A label that keeps one width across its idle and busy copy. */
export function StableLabel({ children, labels }: StableLabelProps) {
  return (
    <span className="inline-grid justify-items-center">
      {labels.map((label) => (
        <span
          aria-hidden
          className="invisible col-start-1 row-start-1 select-none whitespace-nowrap"
          key={label}
        >
          {label}
        </span>
      ))}
      <span className="col-start-1 row-start-1 whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}
