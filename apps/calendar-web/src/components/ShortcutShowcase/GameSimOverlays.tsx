import { type FC } from "react";
import { type GameSimOverlay } from "@web/components/ShortcutShowcase/game.state";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { KEYMAP } from "@web/shortcuts/keymap";

const LEGEND_ROWS: readonly { label: string; keys: readonly string[] }[] = [
  { label: "Create event", keys: KEYMAP.createEvent.keycaps },
  { label: "Lock it in", keys: KEYMAP.saveDraft.keycaps },
  { label: "Move event", keys: KEYMAP.moveEvent.keycaps },
  { label: "Focus an edge", keys: KEYMAP.edgeFocus.keycaps },
  { label: "Command palette", keys: KEYMAP.commandPalette.keycaps },
];

const PALETTE_ROWS = ["Go to today", "Show shortcuts", "Play Block Party"];

/**
 * Simulated overlays for the discovery tasks: small stand-ins for the real
 * shortcut legend, page-jump numbers, and command palette, drawn inside the
 * arena. The real components stay closed behind the takeover on purpose, so
 * a timed run can never end up buried under an app overlay.
 */
export const GameSimOverlays: FC<{ overlay: GameSimOverlay }> = ({
  overlay,
}) => {
  if (overlay === "pagejump") {
    // Numbered chips pinned roughly over the grid and the sidebar, matching
    // the real reveal's "every region gets a digit" shape.
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="c-keycap absolute top-1/2 left-[45%] -translate-x-1/2 scale-150">
          1
        </span>
        <span className="c-keycap absolute top-1/2 right-8 scale-150">2</span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
      {overlay === "legend" ? (
        <div
          className="flex w-72 flex-col gap-2 rounded-xl border border-border bg-surface-raised p-5 shadow-xl"
          data-game-sim-overlay="legend"
        >
          <p className="font-medium text-text-muted text-xs uppercase tracking-wide">
            Shortcuts
          </p>
          {LEGEND_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 text-sm text-text"
            >
              <span>{row.label}</span>
              <ShortcutKeys keys={[...row.keys]} />
            </div>
          ))}
          <p className="pt-1 text-text-muted text-xs">
            Press <ShortcutKeys keys="?" /> or Esc to close.
          </p>
        </div>
      ) : (
        <div
          className="flex w-80 flex-col gap-1 rounded-xl border border-border bg-surface-raised p-3 shadow-xl"
          data-game-sim-overlay="palette"
        >
          <div className="rounded-md bg-surface-overlay px-3 py-2 text-sm text-text-muted">
            Type a command...
          </div>
          {PALETTE_ROWS.map((row) => (
            <div key={row} className="px-3 py-1.5 text-sm text-text">
              {row}
            </div>
          ))}
          <p className="px-3 pt-1 text-text-muted text-xs">
            Press Esc to close.
          </p>
        </div>
      )}
    </div>
  );
};
