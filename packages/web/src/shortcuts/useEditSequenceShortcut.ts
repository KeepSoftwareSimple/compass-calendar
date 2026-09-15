import { resolveModifier } from "@tanstack/react-hotkeys";
import { useEffect, useRef } from "react";
import { isBillingWriteLocked } from "@web/billing/billing-write-lock";
import { promptShortcutUpgrade } from "@web/billing/prompt-shortcut-upgrade";
import {
  type EventFormFocusField,
  isEditableKeyboardTarget,
} from "@web/common/utils/form/form.util";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { EDIT_SEQUENCE_FIELD_BY_KEY } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import {
  type EditSequenceScope,
  editSequenceActions,
  useEditSequenceStore,
} from "@web/shortcuts/edit-sequence/edit-sequence.store";
import {
  isBareLetterKey,
  keyboardKey,
  normalizedKeyboardKey,
} from "@web/shortcuts/is-bare-letter-key";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  eventJumpActions,
  isEventJumpActive,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { createKeyupSwallow } from "@web/shortcuts/swallow-next-keyup";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";

/**
 * How long the leader stays silent. A second key inside this window fires with
 * no UI at all (muscle memory); past it the which-key menu opens and the
 * sequence stays armed until the user picks or cancels.
 *
 * Exported so the Shortcut Showcase practises the real cadence.
 */
export const ARM_WINDOW_MS = 600;
const LEADER_KEY = KEYMAP.editTitle.sequence.leader;

/** Shared so other letter shortcuts (e.g. event-jump `s`) can yield to `e`… sequences. */
export const isEditSequenceArmed = () =>
  useEditSequenceStore.getState().isArmed;

/** Test helper: clear the shared arm state. */
export const resetEditSequenceArm = () => {
  editSequenceActions.disarm();
};

/** Any modifier at all, used to reject chords as the *second* key. */
const hasModifier = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

/**
 * The single owner of both edit leaders.
 *
 * Bare `e` is the grid fast path and bails on editable targets, so typing "e"
 * in the title does nothing. `Mod+E` is the same leader for use while the caret
 * is already inside the form, so it deliberately does not bail on editable
 * targets. Both land in the same arm/dispatch path, which is why this is one
 * listener rather than two: a second listener claiming `Mod+E` would fire the
 * sequence twice.
 *
 * Jump mode can still be on after focusing a card (`h` then a day letter).
 * Arming turns jump off so the follow key (`t` title vs Tuesday) cannot be
 * stolen. A stray `e` with nothing to edit does not arm (`canArm`).
 *
 * Capture-phase listeners suppress the follow key's keyup so existing keyup
 * shortcuts (e.g. `t` → today, `d` → day view) do not also run.
 */
export function useEditSequenceShortcut<
  TField extends string = EventFormFocusField,
>({
  canArm,
  onSequence,
  fieldByKey = EDIT_SEQUENCE_FIELD_BY_KEY as unknown as Record<string, TField>,
  scope = "event",
  ignoreAppLock = false,
}: {
  /** Gate arming on there being something to edit, so a stray `e` does not
   * swallow the next keystroke. */
  canArm?: () => boolean;
  onSequence: (field: TField) => void;
  /** Second key -> field. Defaults to the event form's table. */
  fieldByKey?: Record<string, TField>;
  scope?: EditSequenceScope;
  /**
   * Run while the app is locked. Surfaces that live inside a modal need this:
   * the modal itself holds the lock, so the default bail would make the leader
   * dead exactly where it is wanted.
   */
  ignoreAppLock?: boolean;
}) {
  const onSequenceRef = useRef(onSequence);
  onSequenceRef.current = onSequence;
  const canArmRef = useRef(canArm);
  canArmRef.current = canArm;
  const fieldByKeyRef = useRef(fieldByKey);
  fieldByKeyRef.current = fieldByKey;

  useEffect(() => {
    const isMac = resolveModifier("Mod") === "Meta";
    let menuTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const keyupSwallow = createKeyupSwallow();

    const disarm = () => {
      if (menuTimeoutId !== null) {
        clearTimeout(menuTimeoutId);
        menuTimeoutId = null;
      }
      // Cheap guard: this runs from a capture-phase pointerdown on every click
      // in the grid, and an unguarded write would put a store update (and a
      // devtools entry) on that path for no reason.
      if (isEditSequenceArmed()) {
        editSequenceActions.disarm();
      }
    };

    const arm = () => {
      disarm();
      editSequenceActions.arm(scope);
      menuTimeoutId = setTimeout(() => {
        menuTimeoutId = null;
        if (isEditSequenceArmed()) {
          editSequenceActions.showMenu();
        }
      }, ARM_WINDOW_MS);
    };

    const isModLeader = (event: KeyboardEvent) => {
      if (keyboardKey(event).toLowerCase() !== LEADER_KEY) return false;
      if (event.shiftKey || event.altKey) return false;
      return isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (isEditSequenceArmed()) {
        // The grid listener stays mounted under Settings. Ignore a foreign
        // scope so a leftover arm from another surface cannot steal keys.
        if (useEditSequenceStore.getState().scope !== scope) {
          return;
        }
        if (!ignoreAppLock && isAppLocked()) {
          disarm();
          return;
        }
        if (!ignoreAppLock && isBillingWriteLocked()) {
          disarm();
          promptShortcutUpgrade({
            featureArea: "event_editing",
            actionId: "event.edit_title",
            source: "keyboard",
          });
          return;
        }

        if (event.key === "Escape") {
          disarm();
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        // The second key must be bare; a chord means the user moved on.
        if (hasModifier(event)) {
          disarm();
          return;
        }

        const key = normalizedKeyboardKey(event);
        const field = fieldByKeyRef.current[key] ?? null;

        if (field) {
          event.preventDefault();
          event.stopPropagation();
          keyupSwallow.add(key);
          disarm();
          onSequenceRef.current(field);
          shortcutHintProgressActions.demonstrate("edit-sequence");
          recordHandledShortcutInvocation(
            `edit-focus-${field}` as ShortcutRegistryId,
          );
          return;
        }

        // Unknown second key: disarm silently and let the key through.
        disarm();
        return;
      }

      if (!ignoreAppLock && isAppLocked()) {
        return;
      }

      if (!ignoreAppLock && isBillingWriteLocked()) {
        const isMod = isModLeader(event);
        const isLeader =
          isMod ||
          (isBareLetterKey(event, LEADER_KEY) &&
            !isEditableKeyboardTarget(event));
        const canArm = !canArmRef.current || canArmRef.current();
        if (isLeader && canArm) {
          promptShortcutUpgrade({
            featureArea: "event_editing",
            actionId: "event.edit_title",
            source: "keyboard",
          });
        }
        return;
      }

      // Mod+E works anywhere, including inside the form's inputs. Bare `e` only
      // outside them, or it would eat the letter you meant to type.
      const isMod = isModLeader(event);
      const isLeader =
        isMod ||
        (isBareLetterKey(event, LEADER_KEY) &&
          !isEditableKeyboardTarget(event));

      if (!isLeader) return;
      // `canArm` is the stray-`e` gate (nothing focused → do not swallow the
      // next key). Jump mode staying on after a focused card used to block
      // this path entirely, so `e` then `t` selected Tuesday instead of the
      // title. Drop jump once we are actually arming so the follow key cannot
      // be read as a day prefix.
      if (canArmRef.current && !canArmRef.current()) return;
      if (isEventJumpActive()) {
        eventJumpActions.setActive(false);
      }

      if (isMod) {
        event.preventDefault();
        event.stopPropagation();
      }
      arm();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyupSwallow.consume(event);
    };

    // Clicking or tabbing away abandons the sequence rather than leaving a
    // menu pinned to an event the user is no longer looking at.
    const onPointerDown = () => disarm();
    const onWindowBlur = () => disarm();

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      disarm();
      keyupSwallow.clear();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [ignoreAppLock, scope]);
}
