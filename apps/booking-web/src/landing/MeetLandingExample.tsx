import { PUBLIC_BOOKING_TEXT_LINK_CLASS } from "@booking-web/booking/PublicBookingLayout";
import { PublicBookingPicker } from "@booking-web/booking/PublicBookingPicker";
import { PublicBookingSlotSummary } from "@booking-web/booking/PublicBookingSlotSummary";
import {
  formatBookingDateKey,
  formatBookingMonthKey,
  listBookingAvailableDateKeysInMonth,
} from "@booking-web/booking/public-booking.format";
import { useBookingHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { useState } from "react";
import dayjs from "@core/util/date/dayjs";

const TIME_ZONE = "America/Denver";
const HORIZON_DAYS = 35;
const DURATION_MINUTES = 30;
const START_TIMES = ["10:00", "10:30", "11:30", "13:30", "14:00", "15:30"];

function exampleAvailability() {
  const today = dayjs().tz(TIME_ZONE);
  const slots: { slotStart: string }[] = [];
  for (let offset = 1; offset < HORIZON_DAYS; offset += 1) {
    const date = today.add(offset, "day");
    if (date.day() === 0 || date.day() === 6) continue;
    const dateKey = date.format("YYYY-MM-DD");
    for (const time of START_TIMES) {
      slots.push({
        slotStart: dayjs.tz(`${dateKey}T${time}`, TIME_ZONE).toISOString(),
      });
    }
  }
  return { slots, today };
}

export function MeetLandingExample() {
  const [{ slots, today }] = useState(exampleAvailability);
  const firstSlot = slots[0]?.slotStart ?? today;
  const [monthKey, setMonthKey] = useState(() =>
    formatBookingMonthKey(firstSlot, TIME_ZONE),
  );
  const [dateKey, setDateKey] = useState<string | null>(() =>
    formatBookingDateKey(firstSlot, TIME_ZONE),
  );
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [step, setStep] = useState<"times" | "details" | "confirmed">("times");
  const headingRef = useBookingHeadingFocus(step);

  const changeMonth = (nextMonth: string) => {
    setMonthKey(nextMonth);
    const days = listBookingAvailableDateKeysInMonth(
      slots,
      nextMonth,
      TIME_ZONE,
      formatBookingDateKey(dayjs(), TIME_ZONE),
    );
    setDateKey(days[0] ?? null);
    setSlotStart(null);
  };

  return (
    <section
      aria-labelledby="meeting-example-heading"
      className="mt-3 border-border border-t"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
        <h2 id="meeting-example-heading" className="font-medium text-sm">
          What your guests see
        </h2>
        <p className="text-text-muted text-xs">Interactive example</p>
      </div>
      <div className="flex flex-col gap-4 rounded-md border border-border p-4 sm:p-6">
        {step !== "confirmed" ? (
          <header className="flex flex-col gap-1">
            <h3 className="font-semibold text-xl">Meet with Alex Chen</h3>
            <p className="text-sm text-text-muted">30 minutes · Google Meet</p>
            <p className="text-sm text-text-muted">
              Times shown in Mountain Time
            </p>
          </header>
        ) : null}

        {step === "times" || !slotStart ? (
          <PublicBookingPicker
            monthKey={monthKey}
            timeZone={TIME_ZONE}
            maxHorizonDays={HORIZON_DAYS}
            slots={slots}
            slotsPending={false}
            slotsError={false}
            slotsFetching={false}
            selectedDateKey={dateKey}
            selectedSlotStart={slotStart}
            slotsHeadingRef={slotStart ? headingRef : undefined}
            onMonthChange={changeMonth}
            onPrefetchMonth={() => {}}
            onRetrySlots={() => {}}
            onSelectDate={(nextDate) => {
              setDateKey(nextDate);
              setSlotStart(null);
            }}
            onSelectSlot={(nextSlot) => {
              setSlotStart(nextSlot);
              setStep("details");
            }}
          />
        ) : (
          <div className="flex max-w-md flex-col items-start gap-3">
            <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3">
              <h3
                ref={headingRef}
                tabIndex={-1}
                className="font-medium text-base"
              >
                {step === "details"
                  ? "Your details"
                  : "You’re meeting with Alex Chen"}
              </h3>
              {step === "details" ? (
                <button
                  type="button"
                  className={PUBLIC_BOOKING_TEXT_LINK_CLASS}
                  onClick={() => setStep("times")}
                >
                  Change time
                </button>
              ) : null}
            </div>
            <div className="w-full">
              <PublicBookingSlotSummary
                slotStart={slotStart}
                durationMinutes={DURATION_MINUTES}
                timeZone={TIME_ZONE}
              />
            </div>
            {step === "details" ? (
              <>
                <div className="grid w-full gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-text-muted">Name</span>
                    <input className="c-field" value="Sam Rivera" readOnly />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-text-muted">Email</span>
                    <input
                      className="c-field"
                      type="email"
                      value="sam@example.com"
                      readOnly
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="c-button c-button-primary"
                  onClick={() => setStep("confirmed")}
                >
                  Confirm example booking
                </button>
              </>
            ) : (
              <>
                <p className="text-sm">
                  In a real booking, you’d get a calendar invite with a Google
                  Meet link.
                </p>
                <button
                  type="button"
                  className={PUBLIC_BOOKING_TEXT_LINK_CLASS}
                  onClick={() => setStep("times")}
                >
                  Back to available times
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
