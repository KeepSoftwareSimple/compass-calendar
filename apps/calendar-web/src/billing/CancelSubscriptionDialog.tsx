import { type KeyboardEvent, useEffect, useId, useState } from "react";
import {
  SUBSCRIPTION_CANCEL_REASONS,
  type SubscriptionCancelReasonSlug,
} from "@core/billing/subscription-cancel-reason.constants";
import { type SubscriptionCancelReasonSubmission } from "@web/billing/track-subscription-cancel-reason";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

interface CancelSubscriptionDialogProps {
  isOpen: boolean;
  isSubmitting: boolean;
  isTrialing: boolean;
  periodEndLabel: string;
  onCancel: () => void;
  onConfirm: (reason?: SubscriptionCancelReasonSubmission) => void;
}

const reasonOptionClassName =
  "c-focus-ring flex w-full items-center gap-3 rounded border border-border px-3 py-2 text-left text-sm text-text hover:bg-surface-panel aria-checked:border-accent aria-checked:bg-surface-panel";

/**
 * Confirms scheduling cancel-at-period-end. Access continues until the
 * named date; resume is available until then.
 */
export function CancelSubscriptionDialog({
  isOpen,
  isSubmitting,
  isTrialing,
  periodEndLabel,
  onCancel,
  onConfirm,
}: CancelSubscriptionDialogProps) {
  const [selectedReason, setSelectedReason] =
    useState<SubscriptionCancelReasonSlug | null>(null);
  const [otherDetails, setOtherDetails] = useState("");
  const otherDetailsId = useId();
  const reasonGroupId = useId();

  useEffect(() => {
    if (isOpen) return;
    setSelectedReason(null);
    setOtherDetails("");
  }, [isOpen]);

  if (!isOpen) return null;

  const message = isTrialing
    ? `You keep access until the trial ends on ${periodEndLabel}. You can resume any time before then.`
    : `Your plan stays active until ${periodEndLabel}. You can resume any time before then.`;

  const dismiss = () => {
    if (isSubmitting) return;
    onCancel();
  };

  const buildSubmission = ():
    | SubscriptionCancelReasonSubmission
    | undefined => {
    if (!selectedReason) return undefined;
    if (selectedReason !== "other") {
      return { reason: selectedReason };
    }
    const trimmed = otherDetails.trim();
    return trimmed
      ? { reason: "other", details: trimmed }
      : { reason: "other" };
  };

  const submit = () => {
    if (isSubmitting) return;
    onConfirm(buildSubmission());
  };

  const handleReasonKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = selectedReason
      ? SUBSCRIPTION_CANCEL_REASONS.findIndex(
          (option) => option.slug === selectedReason,
        )
      : -1;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        nextIndex =
          index < 0
            ? 0
            : Math.min(index + 1, SUBSCRIPTION_CANCEL_REASONS.length - 1);
        break;
      case "ArrowUp":
        nextIndex =
          index < 0
            ? SUBSCRIPTION_CANCEL_REASONS.length - 1
            : Math.max(index - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = SUBSCRIPTION_CANCEL_REASONS.length - 1;
        break;
      case " ":
        if (index < 0) return;
        event.preventDefault();
        setSelectedReason(SUBSCRIPTION_CANCEL_REASONS[index]?.slug ?? null);
        return;
      default:
        return;
    }

    const next = SUBSCRIPTION_CANCEL_REASONS[nextIndex ?? 0];
    if (!next) return;
    event.preventDefault();
    setSelectedReason(next.slug);
    const radios =
      event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[nextIndex ?? 0]?.focus();
  };

  return (
    <OverlayPanel
      title="Cancel your plan?"
      message={message}
      onDismiss={dismiss}
      onModEnter={submit}
      align="start"
      variant="modal"
      widthClassName="w-[480px]"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm text-text" id={reasonGroupId}>
            Why are you canceling? (optional)
          </p>
          <div
            aria-labelledby={reasonGroupId}
            className="flex flex-col gap-2"
            onKeyDown={handleReasonKeyDown}
            role="radiogroup"
          >
            {SUBSCRIPTION_CANCEL_REASONS.map((option) => (
              // biome-ignore lint/a11y/useSemanticElements: pill radios match booking duration pills
              <button
                aria-checked={selectedReason === option.slug}
                className={reasonOptionClassName}
                key={option.slug}
                onClick={() => setSelectedReason(option.slug)}
                role="radio"
                tabIndex={
                  selectedReason == null
                    ? option.slug === SUBSCRIPTION_CANCEL_REASONS[0]?.slug
                      ? 0
                      : -1
                    : selectedReason === option.slug
                      ? 0
                      : -1
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedReason === "other" ? (
            <textarea
              aria-label="Other reason"
              className="w-full resize-y rounded border border-border bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus-visible:border-accent"
              id={otherDetailsId}
              maxLength={500}
              onChange={(event) => setOtherDetails(event.target.value)}
              placeholder="Tell us more (optional)."
              rows={3}
              value={otherDetails}
            />
          ) : null}
        </div>

        <OverlayPanelActions align="start">
          <OverlayPanelActionButton
            aria-keyshortcuts="Meta+Enter Control+Enter"
            disabled={isSubmitting}
            onClick={submit}
            shortcut={["Mod", "Enter"]}
            variant="destructive"
          >
            {isSubmitting ? "Canceling…" : "Cancel subscription"}
          </OverlayPanelActionButton>
          <OverlayPanelActionButton
            disabled={isSubmitting}
            onClick={dismiss}
            shortcut="Esc"
          >
            Keep plan
          </OverlayPanelActionButton>
        </OverlayPanelActions>
      </div>
    </OverlayPanel>
  );
}
