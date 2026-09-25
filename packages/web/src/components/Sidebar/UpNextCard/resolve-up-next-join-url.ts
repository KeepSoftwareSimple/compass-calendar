import { type Event } from "@core/types/event.contracts";
import { type GridEvent } from "@web/common/types/web.event.types";

const DESCRIPTION_HREF_PATTERN = /href=["'](https?:[^"']+)["']/i;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"']+/;

function normalizeHttpUrl(raw: string): string | undefined {
  try {
    return new URL(raw).href;
  } catch {
    return undefined;
  }
}

/** First joinable http(s) URL embedded in a description (HTML or plain text). */
export function joinUrlFromDescription(
  description: string | undefined,
): string | undefined {
  if (!description?.trim()) return undefined;

  const hrefMatch = description.match(DESCRIPTION_HREF_PATTERN);
  if (hrefMatch?.[1]) {
    const fromHref = normalizeHttpUrl(hrefMatch[1]);
    if (fromHref) return fromHref;
  }

  const plainMatch = description.match(PLAIN_URL_PATTERN);
  if (!plainMatch?.[0]) return undefined;

  let candidate = plainMatch[0];
  while (candidate.length > 0 && /[.,)>]$/.test(candidate)) {
    candidate = candidate.slice(0, -1);
  }

  return normalizeHttpUrl(candidate);
}

/**
 * Conference links from the provider, plus description links (Zoom/Teams in a
 * Google body) that never land in the structured conference field.
 */
export function resolveUpNextJoinUrl(
  gridEvent: GridEvent | undefined,
  sourceEvent: Event | undefined,
): string | undefined {
  const fromGrid = gridEvent?.conference?.url;
  if (fromGrid) return fromGrid;

  const details =
    sourceEvent?.content.kind === "details" ? sourceEvent.content : undefined;
  const fromSource = details?.conference?.url;
  if (fromSource) return fromSource;

  return joinUrlFromDescription(
    details?.description ?? gridEvent?.description ?? undefined,
  );
}
