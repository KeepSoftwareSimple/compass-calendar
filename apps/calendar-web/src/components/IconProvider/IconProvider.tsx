import { IconContext } from "@phosphor-icons/react/dist/lib/context";
import type React from "react";

export const IconProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <IconContext.Provider
      value={{
        size: 25,
      }}
    >
      {children}
    </IconContext.Provider>
  );
};
