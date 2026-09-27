import classNames from "classnames";

export const getInteractiveIconClassName = (
  className?: string,
  hoverBrightnessClass?: string,
) => classNames("c-icon", hoverBrightnessClass, className);
