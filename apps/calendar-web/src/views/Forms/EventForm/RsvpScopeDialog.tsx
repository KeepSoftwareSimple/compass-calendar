import { useState } from "react";
import { type RsvpEventInput } from "@core/types/event-command.contracts";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

type RsvpScope = RsvpEventInput["scope"];

const updateScopeOptionClassName =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 text-base text-text transition-colors hover:bg-surface-overlay";

const selectedUpdateScopeOptionClassName = "bg-surface-overlay";

const radioDotClassName =
  "relative flex size-[18px] flex-none rounded-full border-2 border-border-strong transition-colors after:absolute after:inset-0 after:m-auto after:size-2 after:scale-0 after:rounded-full after:bg-accent after:transition-transform peer-checked:border-accent peer-checked:after:scale-100 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface-panel";

// The per-occurrence choice for answering a recurring invitation.
// Deliberately only "This Event" / "All Events": an RSVP has no
// this-and-following semantics — sync refuses that scope typed, so this
// dialog must never offer it.
const RSVP_SCOPE_OPTIONS: ReadonlyArray<{ value: RsvpScope; label: string }> = [
  { value: "single", label: "This Event" },
  { value: "all", label: "All Events" },
];

interface RsvpScopeDialogProps {
  onCancel: () => void;
  onConfirm: (scope: RsvpScope) => void;
}

export function RsvpScopeDialog({ onCancel, onConfirm }: RsvpScopeDialogProps) {
  const [selectedScope, setSelectedScope] = useState<RsvpScope>("single");

  return (
    <OverlayPanel title="Respond for" onDismiss={onCancel} variant="modal">
      <div
        role="radiogroup"
        aria-label="Respond for"
        className="flex w-full flex-col gap-1"
      >
        {RSVP_SCOPE_OPTIONS.map(({ value, label }) => {
          const isSelected = selectedScope === value;

          return (
            <label
              key={value}
              className={`${updateScopeOptionClassName} ${
                isSelected ? selectedUpdateScopeOptionClassName : ""
              }`}
            >
              <input
                type="radio"
                name="rsvp-scope"
                value={value}
                checked={isSelected}
                onChange={() => setSelectedScope(value)}
                className="peer sr-only"
              />
              <span aria-hidden="true" className={radioDotClassName} />
              {label}
            </label>
          );
        })}
      </div>

      <OverlayPanelActions>
        <OverlayPanelActionButton onClick={onCancel}>
          Cancel
        </OverlayPanelActionButton>
        <OverlayPanelActionButton
          variant="primary"
          onClick={() => onConfirm(selectedScope)}
        >
          Ok
        </OverlayPanelActionButton>
      </OverlayPanelActions>
    </OverlayPanel>
  );
}
