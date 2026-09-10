import { SignInIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useSession } from "@web/auth/compass/session/useSession";
import { trackSignupStarted } from "@web/auth/posthog/signup-funnel";
import { useAuthModal } from "@web/components/AuthModal/hooks/useAuthModal";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

/**
 * Returns command palette items for authentication actions.
 * Items are only returned when the user is not authenticated.
 */
export const useAuthCmdItems = (): CommandItem[] => {
  const { authenticated } = useSession();
  const { openModal } = useAuthModal();

  if (authenticated) {
    return [];
  }

  return [
    {
      id: "sign-up",
      label: "Sign Up",
      icon: UserPlusIcon,
      keywords: ["register", "create account"],
      onClick: () => {
        trackSignupStarted("command_palette");
        openModal("signUp");
      },
    },
    {
      id: "log-in",
      label: "Log In",
      icon: SignInIcon,
      keywords: ["login", "sign in"],
      onClick: () => openModal("login"),
    },
  ];
};
