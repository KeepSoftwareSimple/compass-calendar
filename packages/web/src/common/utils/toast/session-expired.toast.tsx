import { type Id } from "react-toastify";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import {
  type AuthView,
  VIEW_TO_PARAM,
} from "@web/components/AuthModal/hooks/useAuthModal";

interface SessionExpiredToastProps {
  toastId: Id;
}

// Renders outside the router (inside ToastContainer, a sibling of
// RouterProvider), so it can't call useAuthModal's router hooks. Navigate
// through the production router singleton instead - an imperative call has
// no context-binding-order problem the way a hook would. Imported
// dynamically to avoid a module cycle: this file sits on the API error path
// (api.util -> error-toast.util -> here), and the router's root route
// renders AuthModal, which pulls that same API/error-toast chain back in.
export async function openAuthModalFromOutsideRouter(
  view: AuthView = "login",
): Promise<void> {
  const { router } = await importOrReload(() => import("@web/routers"));
  router.navigate({
    to: ".",
    search: (prev: Record<string, unknown>) => ({
      ...prev,
      auth: VIEW_TO_PARAM[view],
    }),
  });
}

export const SessionExpiredToast = ({ toastId }: SessionExpiredToastProps) => {
  const handleSignIn = () => {
    void openAuthModalFromOutsideRouter("login");
    getToast().dismiss(toastId);
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        You've been signed out. Please sign in again.
      </p>
      <ToastActionButton onClick={handleSignIn}>Sign in</ToastActionButton>
    </ToastNotice>
  );
};
