import { RepeatIcon as PhosphorRepeatIcon } from "@phosphor-icons/react/dist/csr/Repeat";
import { type IconProps } from "@phosphor-icons/react/dist/lib/types";
import { getInteractiveIconClassName } from "./icon.utils";

export const RepeatIcon = ({ className, ...props }: IconProps) => (
  <PhosphorRepeatIcon
    className={getInteractiveIconClassName(className)}
    {...props}
  />
);
