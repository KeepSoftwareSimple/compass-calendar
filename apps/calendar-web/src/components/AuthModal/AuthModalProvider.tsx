import { type FC, type ReactNode, useEffect } from "react";
import { signupTrialStepViewedNoOp } from "@web/auth/posthog/signup-funnel";
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

  useEffect(() => {
    signupTrialStepViewedNoOp();
  }, []);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
};
