// Week and day use the same range-list read; the query key scope is what
// distinguishes them for cache/prefetch.
export { fetchDayEvents as fetchWeekEvents } from "./day.event.query";
