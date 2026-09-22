import { BookingProviders } from "@booking-web/components/BookingProviders";
import { BookingRouterProvider } from "@booking-web/routers";

export function App() {
  return (
    <BookingProviders>
      <BookingRouterProvider />
    </BookingProviders>
  );
}
