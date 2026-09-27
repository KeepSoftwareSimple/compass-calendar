import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface DeleteAccountConfirmationContextValue {
  isOpen: boolean;
  closeDeleteAccountConfirmation: () => void;
  openDeleteAccountConfirmation: () => void;
}

const defaultContextValue: DeleteAccountConfirmationContextValue = {
  isOpen: false,
  closeDeleteAccountConfirmation: () => {},
  openDeleteAccountConfirmation: () => {},
};

export const DeleteAccountConfirmationContext =
  createContext<DeleteAccountConfirmationContextValue>(defaultContextValue);

export function useDeleteAccountConfirmation(): DeleteAccountConfirmationContextValue {
  return useContext(DeleteAccountConfirmationContext);
}

export function useDeleteAccountConfirmationState(): DeleteAccountConfirmationContextValue {
  const [isOpen, setIsOpen] = useState(false);

  const openDeleteAccountConfirmation = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDeleteAccountConfirmation = useCallback(() => {
    setIsOpen(false);
  }, []);

  return useMemo(
    () => ({
      isOpen,
      closeDeleteAccountConfirmation,
      openDeleteAccountConfirmation,
    }),
    [isOpen, closeDeleteAccountConfirmation, openDeleteAccountConfirmation],
  );
}
