import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface UpgradeConfirmationContextValue {
  isOpen: boolean;
  closeUpgradeConfirmation: () => void;
  openUpgradeConfirmation: () => void;
}

const defaultContextValue: UpgradeConfirmationContextValue = {
  isOpen: false,
  closeUpgradeConfirmation: () => {},
  openUpgradeConfirmation: () => {},
};

export const UpgradeConfirmationContext =
  createContext<UpgradeConfirmationContextValue>(defaultContextValue);

export function useUpgradeConfirmation(): UpgradeConfirmationContextValue {
  return useContext(UpgradeConfirmationContext);
}

export function useUpgradeConfirmationState(): UpgradeConfirmationContextValue {
  const [isOpen, setIsOpen] = useState(false);

  const openUpgradeConfirmation = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeUpgradeConfirmation = useCallback(() => {
    setIsOpen(false);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      closeUpgradeConfirmation,
      openUpgradeConfirmation,
    }),
    [isOpen, closeUpgradeConfirmation, openUpgradeConfirmation],
  );
}
