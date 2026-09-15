import type { IconProps } from "@phosphor-icons/react/dist/lib/types";
import { SidebarSimpleIcon } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { getInteractiveIconClassName } from "./icon.utils";

// Mirrored so the panel glyph reads as sitting on the right, matching the
// sidebar's position in the layout.
export const SidebarIcon = ({ className, ...props }: IconProps) => (
  <SidebarSimpleIcon
    mirrored
    className={getInteractiveIconClassName(className)}
    {...props}
  />
);
