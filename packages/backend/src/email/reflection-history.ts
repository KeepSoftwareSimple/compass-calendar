import { type WithId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import { reflectionCalendarContext } from "@backend/email/reflection-context";

/**
 * Ask Sync to import the history a reflection needs. Safe to repeat: Sync
 * dedupes jobs and refuses while passive. Never throws, because callers are
 * opt-in and send paths that must not fail on an import problem.
 */
export async function requestReflectionHistory(
  user: WithId<Schema_User>,
): Promise<void> {
  try {
    const context = await reflectionCalendarContext(user);
    const metadata = await context.client.readReflection(context.principal, {
      calendarIds: context.calendarIds,
      selfEmails: context.selfEmails,
      windows: [],
    });
    if (!metadata.ok || metadata.value.historyComplete) return;
    await context.client.importReflectionHistory(
      context.principal,
      context.calendarIds,
    );
  } catch {
    // Best effort; the next Sunday attempt asks again.
  }
}
