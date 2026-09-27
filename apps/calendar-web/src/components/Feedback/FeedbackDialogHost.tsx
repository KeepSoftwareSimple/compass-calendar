import { useState } from "react";
import { usePostHog } from "@web/auth/posthog/posthog-react";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { FeedbackDialog } from "@web/components/Feedback/FeedbackDialog";
import { captureFeedback } from "@web/components/Feedback/feedback.posthog";
import {
  feedbackActions,
  selectFeedbackRequest,
  useFeedbackStore,
} from "@web/components/Feedback/feedback.store";
import { settingsActions } from "@web/settings/settings.store";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";

export const restoreCommandPaletteFocus = () => {
  document
    .querySelector<HTMLButtonElement>(
      'button[aria-label^="Open command palette"], button[aria-label="Open sidebar"]',
    )
    ?.focus();
};

export function FeedbackDialogHost() {
  const request = useFeedbackStore(selectFeedbackRequest);
  const posthog = usePostHog();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { skipFocusRestoreRef, handleDismiss } = usePaletteAwareOverlayDismiss(
    Boolean(request),
    feedbackActions.close,
  );

  if (!request || !posthog) return null;

  const handleSubmit = async (details: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await captureFeedback(posthog, { ...request, details });
    } catch {
      setIsSubmitting(false);
      showErrorToast("Couldn't send your feedback. Please try again.");
      return;
    }

    setIsSubmitting(false);
    feedbackActions.close();
    settingsActions.clearOverlayOpenedFromPalette();
    showStatusToast("feedback-sent", "Feedback sent to the big boss, thanks!");
  };

  return (
    <FeedbackDialog
      isSubmitting={isSubmitting}
      onDismiss={handleDismiss}
      restoreFocus={restoreCommandPaletteFocus}
      skipFocusRestoreRef={skipFocusRestoreRef}
      onSubmit={handleSubmit}
    />
  );
}
