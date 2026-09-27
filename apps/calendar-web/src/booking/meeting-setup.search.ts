/**
 * The public meeting page's footer CTA (`/?meetingSetup=1`) lands on the
 * calendar and opens Meeting settings. The param lives here rather than
 * beside the draft store so booking-web's guest bundle can link to it
 * without pulling the host-side draft code in.
 */
export const MEETING_SETUP_SEARCH_PARAM = "meetingSetup";
