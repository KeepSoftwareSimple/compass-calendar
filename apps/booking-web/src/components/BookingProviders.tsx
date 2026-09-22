import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren } from "react";
import { queryClient } from "@web/api/query-client";

export function BookingProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>{children}</HotkeysProvider>
    </QueryClientProvider>
  );
}
