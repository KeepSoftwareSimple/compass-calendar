import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthenticatedLayout } from "./AuthenticatedLayout";

const createLayoutRouter = (path: string, testId: string) => {
  const rootRoute = createRootRoute();
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "authenticated",
    component: AuthenticatedLayout,
  });
  const childRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path,
    component: () => <div data-testid={testId}>Content</div>,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
  });
};

describe("AuthenticatedLayout", () => {
  it("should render child routes via Outlet", async () => {
    const router = createLayoutRouter("/", "child-route");

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("child-route")).toBeInTheDocument();
    });
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("should render nested routes correctly", async () => {
    const router = createLayoutRouter("/nested", "nested-route");

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("nested-route")).toBeInTheDocument();
    });
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
