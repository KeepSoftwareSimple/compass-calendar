import { type ReflectionWindow } from "@core/types/sync/reflection.contracts";
import dayjs from "@core/util/date/dayjs";

export type ReflectionCadence = "daily" | "weekly";

export function reflectionSendAt(date: string, timeZone: string): Date {
  return dayjs.tz(`${date} 10:30`, timeZone).toDate();
}

export function nextReflectionSend(
  now: Date,
  timeZone: string,
  cadence: ReflectionCadence,
): Date {
  const local = dayjs(now).tz(timeZone);
  let date = local.format("YYYY-MM-DD");
  if (local.hour() >= 12 || (cadence === "weekly" && local.day() !== 0)) {
    const days = cadence === "daily" ? 1 : (7 - local.day()) % 7 || 7;
    date = local.add(days, "day").format("YYYY-MM-DD");
  }
  return reflectionSendAt(date, timeZone);
}

export function reflectionExpiresAt(date: string, timeZone: string) {
  return dayjs.tz(`${date} 12:00`, timeZone).toDate();
}

function window(
  key: string,
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
): ReflectionWindow {
  return {
    key,
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start.format("YYYY-MM-DD"),
    endDate: (end.hour() || end.minute() ? end.add(1, "day") : end).format(
      "YYYY-MM-DD",
    ),
  };
}

export function reflectionWindows(
  date: string,
  timeZone: string,
  cadence: ReflectionCadence,
) {
  const cutoff = dayjs(reflectionSendAt(date, timeZone)).tz(timeZone);
  const startDate =
    cadence === "daily"
      ? cutoff.subtract(7, "day").format("YYYY-MM-DD")
      : cutoff.subtract((cutoff.day() + 6) % 7, "day").format("YYYY-MM-DD");
  const start = dayjs.tz(`${startDate} 00:00`, timeZone);
  const upcomingStart = dayjs.tz(
    `${cutoff.add(cadence === "daily" ? 0 : 1, "day").format("YYYY-MM-DD")} 00:00`,
    timeZone,
  );
  const upcomingEnd = dayjs.tz(
    `${upcomingStart.add(7, "day").format("YYYY-MM-DD")} 00:00`,
    timeZone,
  );
  return [
    window("recent", start, cadence === "daily" ? upcomingStart : cutoff),
    window("upcoming", upcomingStart, upcomingEnd),
  ];
}

export function historicalMemoryWindow(
  date: string,
  timeZone: string,
  year: number,
  recentStartDate: string,
): ReflectionWindow {
  const month = date.slice(5, 7);
  const start = dayjs.tz(`${year}-${month}-01 00:00`, timeZone);
  const nextMonthDate = start.add(1, "month").format("YYYY-MM-DD");
  const offset = dayjs(date).year(year).diff(dayjs(date), "day");
  const anniversaryStart = dayjs(recentStartDate)
    .add(offset, "day")
    .format("YYYY-MM-DD");
  const anniversaryEnd = dayjs(date)
    .year(year)
    .add(1, "day")
    .format("YYYY-MM-DD");
  const from =
    anniversaryStart < start.format("YYYY-MM-DD")
      ? anniversaryStart
      : start.format("YYYY-MM-DD");
  const to = anniversaryEnd > nextMonthDate ? anniversaryEnd : nextMonthDate;
  return window(
    `history:${year}`,
    dayjs.tz(`${from} 00:00`, timeZone),
    dayjs.tz(`${to} 00:00`, timeZone),
  );
}
