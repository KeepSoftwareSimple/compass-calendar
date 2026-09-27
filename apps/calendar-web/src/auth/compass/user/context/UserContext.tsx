import { createContext } from "react";
import { type UserProfile } from "@core/types/user.types";

export const UserContext = createContext<
  Partial<{ userId: string } & Omit<UserProfile, "_id">> | undefined
>(undefined);
