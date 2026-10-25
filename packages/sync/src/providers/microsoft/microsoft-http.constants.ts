// Graph requests use fetch with no default timeout, so a hung socket blocks the
// job worker until the lease expires. 30s bounds the worst case while covering
// normal Graph latency.
export const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
export const MICROSOFT_REQUEST_TIMEOUT_MS = 30_000;

export const MICROSOFT_CALENDAR_LIST_SELECT =
  "id,name,color,hexColor,canEdit,canShare,isDefaultCalendar,owner,isRemovable";
export const MICROSOFT_EVENT_PAGE_SIZE = 200;

// Fields the M-04 normalizer reads from a Graph event resource.
export const MICROSOFT_EVENT_SELECT = [
  "id",
  "type",
  "subject",
  "body",
  "bodyPreview",
  "start",
  "end",
  "isAllDay",
  "showAs",
  "isCancelled",
  "recurrence",
  "seriesMasterId",
  "originalStart",
  "originalStartTimeZone",
  "originalEndTimeZone",
  "cancelledOccurrences",
  "organizer",
  "attendees",
  "location",
  "onlineMeeting",
  "onlineMeetingProvider",
  "categories",
  "lastModifiedDateTime",
  "iCalUId",
].join(",");
