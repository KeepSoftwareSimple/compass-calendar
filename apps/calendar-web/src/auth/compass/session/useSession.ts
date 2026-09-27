import { useContext } from "react";
import { SessionContext } from "@web/auth/compass/session/session.context";

export const useSession = () => useContext(SessionContext);
