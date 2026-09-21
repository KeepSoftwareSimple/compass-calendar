import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { useSession } from "@web/auth/compass/session/useSession";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { useLogoutConfirmation } from "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation";

export const useLogoutCmdItems = (): CommandItem[] => {
  const { authenticated } = useSession();
  const { openLogoutConfirmation } = useLogoutConfirmation();

  if (!authenticated) {
    return [];
  }

  return [
    {
      id: "log-out",
      label: "Log Out",
      icon: SignOutIcon,
      keywords: ["logout", "sign out"],
      onClick: openLogoutConfirmation,
    },
  ];
};
