import { type FormEvent, type RefObject, useId, useState } from "react";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

interface FeedbackDialogProps {
  isSubmitting?: boolean;
  onDismiss: () => void;
  restoreFocus?: () => void;
  skipFocusRestoreRef?: RefObject<boolean>;
  onSubmit: (details: string) => void | Promise<void>;
}

export function FeedbackDialog({
  isSubmitting = false,
  onDismiss,
  restoreFocus,
  skipFocusRestoreRef,
  onSubmit,
}: FeedbackDialogProps) {
  const [details, setDetails] = useState("");
  const textareaId = useId();
  const contextId = useId();
  const handleDismiss = () => {
    if (!isSubmitting) onDismiss();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedDetails = details.trim();
    if (trimmedDetails) onSubmit(trimmedDetails);
  };

  return (
    <OverlayPanel
      title="Share feedback"
      message="Send feedback without leaving Compass."
      onDismiss={handleDismiss}
      restoreFocus={restoreFocus}
      skipFocusRestoreRef={skipFocusRestoreRef}
      align="start"
      variant="modal"
      widthClassName="w-[480px]"
    >
      <form className="flex w-full flex-col gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-text" htmlFor={textareaId}>
            What would you like to share?
          </label>
          <textarea
            id={textareaId}
            value={details}
            required
            maxLength={5000}
            rows={6}
            aria-describedby={contextId}
            placeholder="Tell us what you think."
            className="w-full resize-y rounded border border-border bg-transparent px-3 py-2 text-text outline-none placeholder:text-text-muted focus-visible:border-accent"
            onChange={(event) => setDetails(event.target.value)}
          />
          <p id={contextId} className="text-text-muted text-xs">
            We&apos;ll include your account, app version, current view, and
            session details so we can follow up and troubleshoot.
          </p>
        </div>

        <OverlayPanelActions>
          <OverlayPanelActionButton
            disabled={isSubmitting}
            onClick={handleDismiss}
          >
            Cancel
          </OverlayPanelActionButton>
          <OverlayPanelActionButton
            type="submit"
            variant="primary"
            disabled={!details.trim() || isSubmitting}
          >
            {isSubmitting ? "Sending…" : "Send feedback"}
          </OverlayPanelActionButton>
        </OverlayPanelActions>
      </form>
    </OverlayPanel>
  );
}
