import classNames from "classnames";
import type React from "react";
import { type HTMLAttributes, useEffect, useState } from "react";
import { type CSSVariables } from "@web/common/styles/css.types";
import { getGradient } from "@web/common/styles/theme.util";

interface Props {
  color?: string;
  toggled?: boolean;
  width?: string;
  withAnimation?: boolean;
}

export const Divider: React.FC<Props & HTMLAttributes<HTMLDivElement>> = ({
  className,
  color,
  style,
  toggled: initialToggled,
  width,
  withAnimation: _withAnimation,
  ...props
}) => {
  const [toggled, toggle] = useState(false);

  useEffect(() => {
    toggle(true);
  }, []);

  const dividerStyle: CSSVariables = {
    ...style,
    background: getGradient(color ?? ""),
    width: initialToggled === false || !toggled ? 0 : width || "100%",
  };

  return (
    <div
      {...props}
      className={classNames("h-0.5 transition-[width] duration-300", className)}
      style={dividerStyle}
    />
  );
};
