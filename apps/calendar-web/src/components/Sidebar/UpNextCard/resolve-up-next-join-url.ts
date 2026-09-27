import { type Event } from "@core/types/event.contracts";
import { isVirtualMeetingUrl } from "@core/util/conference/virtual-meeting-url";
import { type GridEvent } from "@web/common/types/web.event.types";

const DESCRIPTION_HREF_PATTERN = /href=["'](https?:[^"']+)["']/gi;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function normalizeHttpUrl(raw: string): string | undefined {
  try {
    return new URL(raw).href;
  } catch {
    return undefined;
  }
}

function trimTrailingPunctuation(raw: string): string {
  let candidate = raw;
  while (candidate.length > 0 && /[.,)>]$/.test(candidate)) {
    candidate = candidate.slice(0, -1);
  }
  return candidate;
}

function* urlsFromDescription(description: string): Generator<string> {
  for (const match of description.matchAll(DESCRIPTION_HREF_PATTERN)) {
    const href = match[1];
    if (!href) continue;
    const normalized = normalizeHttpUrl(href);
    if (normalized) yield normalized;
  }

  for (const match of description.matchAll(PLAIN_URL_PATTERN)) {
    const raw = match[0];
    if (!raw) continue;
    const normalized = normalizeHttpUrl(trimTrailingPunctuation(raw));
    if (normalized) yield normalized;
  }
}

function joinableUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return isVirtualMeetingUrl(raw) ? raw : undefined;
}

/** First recognized video-meeting URL embedded in a description. */
export function joinUrlFromDescription(
  description: string | undefined,
): string | undefined {
  if (!description?.trim()) return undefined;

  const seen = new Set<string>();
  for (const candidate of urlsFromDescription(description)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const joinable = joinableUrl(candidate);
    if (joinable) return joinable;
  }

  return undefined;
}

/**
 * Conference links from the provider, plus description links (Zoom/Teams in a
 * Google body) that never land in the structured conference field.
 */
export function resolveUpNextJoinUrl(
  gridEvent: GridEvent | undefined,
  sourceEvent: Event | undefined,
): string | undefined {
  const fromGrid = joinableUrl(gridEvent?.conference?.url);
  if (fromGrid) return fromGrid;

  const details =
    sourceEvent?.content.kind === "details" ? sourceEvent.content : undefined;
  const fromSource = joinableUrl(details?.conference?.url);
  if (fromSource) return fromSource;

  return joinUrlFromDescription(
    details?.description ?? gridEvent?.description ?? undefined,
  );
}
