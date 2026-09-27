import { type QueryClient } from "@tanstack/react-query";
import { type AnyRouter, RouterProvider } from "@tanstack/react-router";
import {
  type RenderHookOptions,
  type RenderOptions,
  render,
  renderHook,
} from "@testing-library/react";
import {
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { type Event } from "@core/types/event.contracts";
import { seedEventQueries } from "@web/__tests__/utils/event-query-test-data";
import {
  seedStoresFromState,
  type TestAppState,
} from "@web/__tests__/utils/state/seed-stores";
import { createCompassQueryClient } from "@web/api/query-client";
import { ID_ROOT } from "@web/common/constants/web.constants";
import { CompassRequiredProviders } from "@web/components/CompassProvider/CompassProvider";
import { mock } from "bun:test";

mock.module("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children?: unknown }) => children,
  useGoogleLogin: () => mock(),
}));

interface CustomRenderOptions extends RenderOptions {
  state?: TestAppState;
  queryClient?: QueryClient;
  router?: AnyRouter;
  wrapper?: ComponentType<PropsWithChildren>;
  /** Seed the event query cache directly. */
  events?: Event[];
}

interface CustomRenderHookOptions<Props>
  extends CustomRenderOptions,
    Omit<RenderHookOptions<Props>, "wrapper"> {}

interface TestProvidersProps {
  queryClient?: QueryClient;
  router?: AnyRouter;
}

function TestProvidersWrapper({
  children,
  queryClient,
  router,
}: PropsWithChildren<TestProvidersProps>) {
  if (!router) {
    return (
      <div id={ID_ROOT} data-testid={ID_ROOT}>
        <CompassRequiredProviders queryClient={queryClient}>
          {children}
        </CompassRequiredProviders>
      </div>
    );
  }

  return (
    <div id={ID_ROOT} data-testid={ID_ROOT}>
      <CompassRequiredProviders queryClient={queryClient}>
        <RouterProvider router={router} />
      </CompassRequiredProviders>
    </div>
  );
}

const customRender = (
  ui: ReactElement,
  {
    state,
    router,
    queryClient = createCompassQueryClient(),
    wrapper: CustomWrapper,
    events,
    ...renderOptions
  }: CustomRenderOptions = {},
) => {
  seedStoresFromState(state);
  if (events?.length) seedEventQueries(queryClient, events);
  const options: RenderOptions = { ...renderOptions };
  const Wrapper = ({ children }: PropsWithChildren) => {
    if (!CustomWrapper) {
      return (
        <TestProvidersWrapper queryClient={queryClient} router={router}>
          {children}
        </TestProvidersWrapper>
      );
    }

    return (
      <TestProvidersWrapper queryClient={queryClient} router={router}>
        <CustomWrapper>{children}</CustomWrapper>
      </TestProvidersWrapper>
    );
  };

  // wraps test component with providers
  return render(ui, {
    wrapper: Wrapper,
    ...options,
  });
};

const customRenderHook = <ReturnType, Props>(
  hook: (props: Props) => ReturnType,
  {
    wrapper: WrapperComponent,
    state,
    router,
    queryClient = createCompassQueryClient(),
    events,
    ...renderOptions
  }: CustomRenderHookOptions<Props> = {},
) => {
  seedStoresFromState(state);
  if (events?.length) seedEventQueries(queryClient, events);
  const options: RenderHookOptions<Props> = { ...renderOptions };

  const Wrapper = (props: PropsWithChildren) => {
    if (!WrapperComponent) {
      return (
        <TestProvidersWrapper queryClient={queryClient} router={router}>
          {props.children}
        </TestProvidersWrapper>
      );
    }

    return (
      <TestProvidersWrapper queryClient={queryClient} router={router}>
        <WrapperComponent {...options.initialProps} {...props} />
      </TestProvidersWrapper>
    );
  };

  // wraps test component with providers
  return renderHook(hook, {
    wrapper: Wrapper,
    ...options,
  });
};

export * from "@testing-library/react";
export { customRender as render, customRenderHook as renderHook };
