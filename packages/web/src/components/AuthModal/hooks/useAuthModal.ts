import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  type SearchFlag,
  searchFlagValue,
} from "@web/common/utils/parse/search-flag.util";

export type AuthView =
  | "login"
  | "loginAfterReset"
  | "signUp"
  | "forgotPassword"
  | "resetPassword";

/**
 * The `?auth=` URL param is the single source of truth for the auth modal:
 * param present = modal open on that view, param absent = modal closed.
 * Opening pushes a history entry, so the browser back button closes the
 * modal; view switches and closing replace the entry, so one back press
 * always exits.
 */
export const VIEW_TO_PARAM: Record<AuthView, string> = {
  login: "login",
  loginAfterReset: "login-after-reset",
  signUp: "signup",
  forgotPassword: "forgot",
  resetPassword: "reset",
};

const PARAM_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_TO_PARAM).map(([view, param]) => [param, view]),
) as Record<string, AuthView>;

export interface AuthSearch {
  auth?: string;
  token?: string;
  /** ?play=1 launches the Block Party practice game directly (any value). */
  play?: SearchFlag;
  /** ?meetingSetup=1 opens Meeting settings from the public /meet footer. */
  meetingSetup?: SearchFlag;
}

export function validateAuthSearch(
  search: Record<string, unknown>,
): AuthSearch {
  return {
    auth: typeof search.auth === "string" ? search.auth : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
    play: searchFlagValue(search.play),
    meetingSetup: searchFlagValue(search.meetingSetup),
  };
}

interface AuthModalContextValue {
  isOpen: boolean;
  currentView: AuthView;
  openModal: (view?: AuthView) => void;
  closeModal: () => void;
  setView: (view: AuthView) => void;
}

const defaultContextValue: AuthModalContextValue = {
  isOpen: false,
  currentView: "login",
  openModal: () => {},
  closeModal: () => {},
  setView: () => {},
};

export const AuthModalContext =
  createContext<AuthModalContextValue>(defaultContextValue);

/**
 * Hook to access auth modal state and controls
 *
 * Must be used within an AuthModalProvider
 */
export function useAuthModal(): AuthModalContextValue {
  return useContext(AuthModalContext);
}

function getViewFromParam(param: string | undefined): AuthView | null {
  return param ? (PARAM_TO_VIEW[param.toLowerCase()] ?? null) : null;
}

/**
 * Hook to create auth modal state
 *
 * Used by AuthModalProvider to create the context value
 */
export function useAuthModalState(): AuthModalContextValue {
  const { auth } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const { authenticated } = useSession();
  const view = getViewFromParam(auth);

  const setAuthView = useCallback(
    (nextView: AuthView | null) => {
      // Only opening from a closed state pushes an entry; view switches and
      // closing replace it, so the modal occupies at most one history entry.
      const replace = !(nextView !== null && view === null);
      navigate({
        to: ".",
        replace,
        search: (prev) => ({
          ...prev,
          auth: nextView ? VIEW_TO_PARAM[nextView] : undefined,
        }),
      });
    },
    [navigate, view],
  );

  useEffect(() => {
    if (!authenticated || !auth) return;
    navigate({
      to: ".",
      replace: true,
      search: (prev) => ({ ...prev, auth: undefined }),
    });
  }, [authenticated, auth, navigate]);

  return useMemo(
    () => ({
      isOpen: view !== null && !authenticated,
      currentView: view ?? "login",
      openModal: (nextView: AuthView = "login") => setAuthView(nextView),
      closeModal: () => setAuthView(null),
      setView: (nextView: AuthView) => setAuthView(nextView),
    }),
    [authenticated, view, setAuthView],
  );
}
