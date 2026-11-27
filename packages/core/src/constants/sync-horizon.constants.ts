// The rolling window Sync keeps events for. Sync clamps reads to it, so the
// web app uses it to tell "no events" apart from "older than we keep".
export const HORIZON_PAST_MONTHS = 12;
export const HORIZON_FUTURE_MONTHS = 18;
