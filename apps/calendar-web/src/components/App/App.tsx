import React from "react";
import {
  CompassOptionalProviders,
  CompassRequiredProviders,
} from "@web/components/CompassProvider/CompassProvider";
import { ErrorBoundary } from "@web/components/ErrorBoundary/ErrorBoundary";
import { CompassRouterProvider } from "@web/routers";

export const App = () => {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <CompassOptionalProviders>
          <CompassRequiredProviders>
            <CompassRouterProvider />
          </CompassRequiredProviders>
        </CompassOptionalProviders>
      </ErrorBoundary>
    </React.StrictMode>
  );
};
