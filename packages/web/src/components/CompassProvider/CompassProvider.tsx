import { GoogleOAuthProvider } from "@react-oauth/google";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, type PropsWithChildren, Suspense } from "react";
import { Slide, ToastContainer } from "react-toastify";
import { queryClient as defaultQueryClient } from "@web/api/query-client";
import { SessionProvider } from "@web/auth/compass/session/SessionProvider";
import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import { PostHogProvider } from "@web/auth/posthog/posthog-react";
import { UpgradeConfirmationProvider } from "@web/billing/UpgradeConfirmation/UpgradeConfirmationProvider";
import { ENV_WEB, IS_DEV } from "@web/common/constants/env.constants";
import { TOAST_CHROME_STYLE } from "@web/common/constants/toast.constants";
import { useEscapeToDismissToast } from "@web/common/utils/toast/useEscapeToDismissToast";
import { AboutModalHost } from "@web/components/About/AboutModalHost";
import { DeleteAccountConfirmationProvider } from "@web/components/DeleteAccountConfirmation/DeleteAccountConfirmationProvider";
import { FeedbackDialogHost } from "@web/components/Feedback/FeedbackDialogHost";
import { IconProvider } from "@web/components/IconProvider/IconProvider";
import { LogoutConfirmationProvider } from "@web/components/LogoutConfirmation/LogoutConfirmationProvider";
import { SettingsModalHost } from "@web/components/Settings/SettingsModalHost";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";
import { TimezoneDialogHost } from "@web/timezone/TimezoneDialogHost";

const LazyReactQueryDevtoolsHost = lazy(async () => {
  const { ReactQueryDevtoolsHost } = await import("./ReactQueryDevtoolsHost");
  return { default: ReactQueryDevtoolsHost };
});

function ThemeAwareToastContainer() {
  const theme = useThemeStore(selectTheme);
  useEscapeToDismissToast();

  return (
    <ToastContainer
      position="bottom-left"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeButton={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={theme === "dark-abyss" ? "dark" : "light"}
      toastStyle={TOAST_CHROME_STYLE}
      limit={1}
      transition={Slide}
    />
  );
}

interface CompassRequiredProvidersProps extends PropsWithChildren {
  queryClient?: QueryClient;
}

export const CompassRequiredProviders = ({
  children,
  queryClient = defaultQueryClient,
}: CompassRequiredProvidersProps) => (
  <QueryClientProvider client={queryClient}>
    <HotkeysProvider>
      <SessionProvider>
        <GoogleOAuthProvider
          clientId={ENV_WEB.GOOGLE_CLIENT_ID || "google-not-configured"}
        >
          <IconProvider>
            <LogoutConfirmationProvider>
              <DeleteAccountConfirmationProvider>
                <UpgradeConfirmationProvider>
                  {children}
                  <SettingsModalHost />
                  <TimezoneDialogHost />
                  <AboutModalHost />
                </UpgradeConfirmationProvider>
              </DeleteAccountConfirmationProvider>
              <ThemeAwareToastContainer />
            </LogoutConfirmationProvider>
          </IconProvider>
        </GoogleOAuthProvider>
      </SessionProvider>
    </HotkeysProvider>
    {IS_DEV ? (
      <Suspense fallback={null}>
        <LazyReactQueryDevtoolsHost />
      </Suspense>
    ) : null}
  </QueryClientProvider>
);

export const CompassOptionalProviders = ({ children }: PropsWithChildren) => {
  const posthogClient = getPosthogClient();

  if (!posthogClient) {
    return children;
  }

  return (
    <PostHogProvider client={posthogClient}>
      {children}
      <FeedbackDialogHost />
    </PostHogProvider>
  );
};
