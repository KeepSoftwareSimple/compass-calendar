import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { clearAllBrowserStorage } from "@web/common/utils/cleanup/browser.cleanup.util";
import { AbsoluteOverflowLoader } from "@web/components/AbsoluteOverflowLoader/AbsoluteOverflowLoader";

const REDIRECT_DELAY_MS = 3000;

export const CleanupView = () => {
  const [isClearing, setIsClearing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleRedirect = () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    navigate({ to: ROOT_ROUTES.ROOT });
  };

  useEffect(() => {
    const performCleanup = async () => {
      try {
        await clearAllBrowserStorage();
        setIsClearing(false);

        // Set up automatic redirect after delay
        redirectTimeoutRef.current = setTimeout(() => {
          navigate({ to: ROOT_ROUTES.ROOT });
        }, REDIRECT_DELAY_MS);
      } catch (err) {
        setIsClearing(false);
        setError(
          "Failed to clear browser storage. Please try manually clearing your browser data.",
        );
        console.error("Cleanup error:", err);
      }
    };

    void performCleanup();

    // Cleanup timeout on unmount
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 flex min-h-screen flex-col items-center justify-center text-center">
      {isClearing && <AbsoluteOverflowLoader />}

      {!isClearing && !error && (
        <div className="flex flex-col items-center gap-6 p-8 text-center">
          <div className="text-text text-xl">
            Browser data cleared successfully!
          </div>
          <button
            type="button"
            onClick={handleRedirect}
            className="rounded-sm bg-accent px-6 py-3 text-on-accent transition-colors hover:bg-accent/90"
          >
            Continue to Home
          </button>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-text text-xl">{error}</div>
      )}
    </div>
  );
};
