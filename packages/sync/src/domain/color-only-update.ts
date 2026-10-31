import { type Attendee } from "@core/types/event-attendance.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";

/** Whether this update only changes Compass color (no schedule or guest edits). */
export function isColorOnlyProviderUpdate(
  command: CommandRecord,
  stored: SyncEventContent,
  merged: SyncEventContent,
  intendedAttendees: readonly Attendee[] | undefined,
): boolean {
  if (command.input.kind !== "update") return false;
  if (command.input.schedule !== undefined) return false;
  if (intendedAttendees !== undefined) return false;
  if (command.input.attendeesEdit === "replace") return false;

  if (
    stored.title !== merged.title ||
    stored.description !== merged.description ||
    stored.location !== merged.location
  ) {
    return false;
  }

  const storedColor = stored.color === null ? undefined : stored.color;
  const mergedColor = merged.color === null ? undefined : merged.color;
  return storedColor !== mergedColor;
}

/** Patch flags for provider writes that must not resend unchanged schedule. */
export function providerColorOnlyPatchFlags(
  command: CommandRecord,
  stored: SyncEventContent,
  merged: SyncEventContent,
  intendedAttendees?: readonly Attendee[],
): { writeSchedule: boolean; colorOnly?: true } {
  const writeSchedule =
    command.input.kind === "update" && command.input.schedule !== undefined;
  const colorOnly = isColorOnlyProviderUpdate(
    command,
    stored,
    merged,
    intendedAttendees,
  );
  return {
    writeSchedule,
    ...(colorOnly ? { colorOnly: true as const } : {}),
  };
}
