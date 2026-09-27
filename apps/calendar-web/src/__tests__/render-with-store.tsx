import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { type PropsWithChildren, type ReactElement } from "react";
import { type Event } from "@core/types/event.contracts";
import { createCompassQueryClient } from "@web/api/query-client";
import { seedEventQueries } from "./utils/event-query-test-data";
import {
  seedStoresFromState,
  type TestAppState,
} from "./utils/state/seed-stores";

type StoreOptions = {
  /** Seed the event query cache  */
  events?: Event[];
};

export function createStoreWrapper(
  state?: TestAppState,
  { events }: StoreOptions = {},
) {
  seedStoresFromState(state);
  const queryClient = createCompassQueryClient();
  if (events?.length) seedEventQueries(queryClient, events);

  function StoreWrapper({ children }: PropsWithChildren) {
    return (
      <HotkeysProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </HotkeysProvider>
    );
  }

  return { queryClient, wrapper: StoreWrapper };
}

export function renderWithStore(
  ui: ReactElement,
  state?: TestAppState,
  options?: StoreOptions,
) {
  const { wrapper } = createStoreWrapper(state, options);

  return render(ui, { wrapper });
}
