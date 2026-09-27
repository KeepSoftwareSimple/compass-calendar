import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { type GridEventDraft } from "@web/events/event-draft.types";

export type ConvertToStandaloneDialogProps = {
  draft: GridEventDraft | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConvertToStandaloneDialog({
  draft,
  onCancel,
  onConfirm,
}: ConvertToStandaloneDialogProps) {
  if (!draft) return null;

  const eventName = draft.values.title || "this event";

  return (
    <OverlayPanel
      title="Convert to standalone event?"
      message={`“${eventName}” will be removed from its recurring series.`}
      onDismiss={onCancel}
      variant="modal"
    >
      <OverlayPanelActions>
        <OverlayPanelActionButton shortcut="Esc" onClick={onCancel}>
          Cancel
        </OverlayPanelActionButton>
        <OverlayPanelActionButton
          variant="primary"
          shortcut="Enter"
          onClick={onConfirm}
        >
          Convert
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
