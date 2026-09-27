import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface LogoutConfirmationContextValue {
  isOpen: boolean;
  closeLogoutConfirmation: () => void;
  openLogoutConfirmation: () => void;
}

const defaultContextValue: LogoutConfirmationContextValue = {
  isOpen: false,
  closeLogoutConfirmation: () => {},
  openLogoutConfirmation: () => {},
};

export const LogoutConfirmationContext =
  createContext<LogoutConfirmationContextValue>(defaultContextValue);

export function useLogoutConfirmation(): LogoutConfirmationContextValue {
  return useContext(LogoutConfirmationContext);
}

export function useLogoutConfirmationState(): LogoutConfirmationContextValue {
  const [isOpen, setIsOpen] = useState(false);

  const openLogoutConfirmation = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeLogoutConfirmation = useCallback(() => {
    setIsOpen(false);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      closeLogoutConfirmation,
      openLogoutConfirmation,
    }),
    [isOpen, closeLogoutConfirmation, openLogoutConfirmation],
  );
}
