import { ZIndex } from "@web/common/constants/web.constants";

interface EventGridRetryOverlayProps {
  message: string;
  onRetry?: () => void;
}

export const EventGridRetryOverlay = ({
  message,
  onRetry,
}: EventGridRetryOverlayProps) => (
  <div
    className="absolute inset-0 flex items-center justify-center bg-background px-4"
    style={{ zIndex: ZIndex.MAX }}
  >
    <div className="flex max-w-sm flex-col items-center gap-3 rounded-md border border-border-strong bg-surface-raised px-5 py-4 text-center shadow-[0_8px_24px_var(--color-shadow-default)]">
      <p className="text-sm text-text" role="alert">
        {message}
      </p>
      {onRetry ? (
        <button
          className="c-focus-ring rounded-sm bg-accent px-3 py-1.5 text-on-accent text-sm hover:bg-accent-hover"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </div>
  </div>
);
