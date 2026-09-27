import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { type FC } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { pageJumpAttrs } from "@web/shortcuts/page-jump/page-jump.targets";
import { useUpNextEvent } from "./useUpNextEvent";

/**
 * Countdown copy for the card's top row. Only ever called with a start that is
 * still ahead of `now` (the card drops an event the moment it begins), so
 * there's no "already started" branch - the sub-minute case reads "Starts now".
 */
export function formatStartsIn(start: Dayjs, now: Dayjs): string {
  const minutes = Math.round(start.diff(now, "minute", true));
  if (minutes <= 0) return "Starts now";
  if (minutes < 60) {
    return `Starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(minutes / 60);
  return `Starts in ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function formatEventStatus(
  start: Dayjs,
  end: Dayjs,
  now: Dayjs,
  isCurrentEvent: boolean,
): string {
  if (isCurrentEvent) {
    const minutesRemaining = Math.round(end.diff(now, "minute", true));
    if (minutesRemaining <= 0) return "Ending now";
    if (minutesRemaining < 60) {
      return `Ends in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}`;
    }
    const hours = Math.round(minutesRemaining / 60);
    return `Ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return formatStartsIn(start, now);
}

/**
 * The next timed event starting later today, with a live countdown. Clicking it
 * opens the event in the sidebar's details form. Renders nothing once today has
 * no upcoming timed events left.
 *
 * All-day events are excluded by construction: the view model's `timedEvents`
 * projection already splits them out, and "Starts in X minutes" is meaningless
 * for them.
 */
export const UpNextCard: FC = () => {
  const { now, openEventDetails, upNext, conferenceUrl, isCurrentEvent } =
    useUpNextEvent();
  const countdown = upNext
    ? formatEventStatus(
        dayjs(upNext.startDate),
        dayjs(upNext.endDate),
        now,
        isCurrentEvent,
      )
    : undefined;

  return (
    <section aria-label="Up next" {...pageJumpAttrs("up-next")}>
      {upNext ? (
        <div className="group relative flex min-h-14 w-full min-w-0 flex-col gap-0.5 rounded bg-surface px-2 py-1.5 hover:brightness-110">
          {/* Covers the whole card so clicking anywhere opens the event -
              the Join link below sits in normal flow above this in paint
              order (via relative + z-10), so it still receives its own
              clicks instead of the card intercepting them. */}
          <button
            aria-label={`${isCurrentEvent ? "Now" : "Up next"}: ${upNext.title}. ${countdown}.`}
            className="c-focus-ring absolute inset-0 w-full text-left"
            onClick={() => openEventDetails("gridClick")}
            type="button"
          />
          <span className="pr-8 text-accent text-xs">
            {isCurrentEvent ? "Now" : countdown}
          </span>
          {/* group-has-[:focus-visible], not group-focus-visible: the
              focusable element is this button's sibling (a descendant of
              .group), not .group itself, so a plain :focus-visible variant
              on the group never matches. */}
          <ShortcutHint className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
            {conferenceUrl ? "V" : "N"}
          </ShortcutHint>
          <span className="min-w-0 truncate font-medium text-sm text-text">
            {upNext.title}
          </span>
          {conferenceUrl && (
            <a
              href={conferenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="c-focus-ring relative z-10 flex w-fit items-center gap-1 text-accent text-xs hover:underline"
            >
              <VideoCameraIcon size={12} />
              Join
            </a>
          )}
        </div>
      ) : (
        <p className="flex min-h-14 items-center rounded bg-surface px-2 py-1.5 font-medium text-sm text-text-muted">
          All clear
        </p>
      )}
    </section>
  );
};
