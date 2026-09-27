import { createContext } from "react";
import { type CompassSession } from "./session.types";

export const SessionContext = createContext<CompassSession>({
  authenticated: false,
  setAuthenticated: () => {},
});
