import classNames from "classnames";
import type React from "react";

export type IconButtonSize = "small" | "medium" | "large";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
}

const sizeClasses: Record<IconButtonSize, string> = {
  small: "text-[20px]",
  medium: "text-[27px]",
  large: "text-[34px]",
};

export function iconButtonClassName(
  size: IconButtonSize = "medium",
  className?: string,
) {
  return classNames(
    "flex cursor-pointer items-center justify-center rounded border-2 border-transparent bg-transparent p-0 font-[inherit] text-inherit outline-[inherit] transition-[background-color,box-shadow,transform] duration-300 hover:scale-105 hover:bg-border focus-visible:shadow-[0_0_0_2px_var(--color-border-strong)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
    sizeClasses[size],
    className,
  );
}

const IconButton: React.FC<IconButtonProps> = ({
  size = "medium",
  children: icon,
  className,
  ...props
}) => {
  return (
    <button
      type="button"
      className={iconButtonClassName(size, className)}
      {...props}
    >
      {icon}
    </button>
  );
};

export default IconButton;
