import { type FC, type ReactNode } from "react";
import { AuthModalContext, useAuthModalState } from "./hooks/useAuthModal";

interface AuthModalProviderProps {
  children: ReactNode;
}

/**
 * Provider for auth modal state
 *
 * Wrap your app (or relevant subtree) with this provider to enable
 * useAuthModal hook functionality throughout the component tree.
 */
export const AuthModalProvider: FC<AuthModalProviderProps> = ({ children }) => {
  const value = useAuthModalState();

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
};
