import classNames from "classnames";
import { type HTMLAttributes } from "react";
import { PixelCompass } from "@web/components/PixelCompass/PixelCompass";

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
    <PixelCompass className="h-12 w-12" />
  </div>
);
