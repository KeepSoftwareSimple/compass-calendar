import {
  isSearchFlagOn,
  type SearchFlag,
} from "@web/common/utils/parse/search-flag.util";

/**
 * The public meeting page's footer CTA (`/?meetingSetup=1`) lands on the
 * calendar and opens Meeting settings. The param lives here rather than
 * beside the draft store so booking-web's guest bundle can link to it
 * without pulling the host-side draft code in.
 */
export const MEETING_SETUP_SEARCH_PARAM = "meetingSetup";

/** Same-origin href the public /meet footer and landing both use. */
export function meetingSetupRootHref(): string {
  return `/?${MEETING_SETUP_SEARCH_PARAM}=1`;
}

/**
 * Both readers of the flag go through here: the phone handoff in `RootView`
 * and the wizard entry hook. The param name then has one owner, so renaming
 * it cannot leave a reader silently matching the old spelling.
 */
export function isMeetingSetupRequested(search: {
  meetingSetup?: SearchFlag;
}): boolean {
  return isSearchFlagOn(search[MEETING_SETUP_SEARCH_PARAM]);
}
