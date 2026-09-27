import classNames from "classnames";
import { type HTMLAttributes } from "react";

export const AbsoluteOverflowLoader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={classNames(
      "c-overflow-loader flex items-center justify-center",
      className,
    )}
    {...props}
  >
    <div className="c-loader-spinner" />
  </div>
);
