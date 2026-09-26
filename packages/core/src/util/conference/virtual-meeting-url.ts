/** Hostname suffixes for well-known video conference join URLs. */
const VIRTUAL_MEETING_HOST_SUFFIXES = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "webex.com",
  "gotomeeting.com",
  "gotomeet.me",
  "whereby.com",
  "appear.in",
  "meet.jit.si",
  "bluejeans.com",
  "chime.aws",
  "join.skype.com",
  "daily.co",
] as const;

function hostnameForUrl(raw: string): string | undefined {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function hostMatchesVirtualMeeting(hostname: string): boolean {
  return VIRTUAL_MEETING_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

/** True when `raw` is an http(s) URL for a recognized video conference. */
export function isVirtualMeetingUrl(raw: string): boolean {
  const hostname = hostnameForUrl(raw);
  if (!hostname) return false;
  return hostMatchesVirtualMeeting(hostname);
}
