import { NodeEnv } from "@core/constants/core.constants";
import { OpenTelemetryTransport } from "@core/logger/otel.transport";
import { buildOtelResourceAttributes } from "@core/logger/otel-logs";
import { Logger } from "@core/logger/winston.logger";
import { describe, expect, it } from "bun:test";

function otelTransportOf(logger: ReturnType<typeof Logger>) {
  return logger.transports.find(
    (transport) => transport instanceof OpenTelemetryTransport,
  );
}

describe("Logger", () => {
  it("reuses one OpenTelemetry transport across Logger() calls", () => {
    const first = Logger("logger-test:first");
    const second = Logger("logger-test:second");

    const firstOtel = otelTransportOf(first);
    const secondOtel = otelTransportOf(second);

    expect(firstOtel).toBeInstanceOf(OpenTelemetryTransport);
    expect(secondOtel).toBe(firstOtel);
  });

  it("puts environment and version on OTel resources from PostHog context config", () => {
    expect(
      buildOtelResourceAttributes({
        serviceName: "compass-backend",
        nodeEnv: NodeEnv.Production,
        version: "1.2.3",
      }),
    ).toEqual({
      "service.name": "compass-backend",
      "deployment.environment": "production",
      "service.version": "1.2.3",
    });

    expect(
      buildOtelResourceAttributes({
        serviceName: "compass-sync",
        nodeEnv: NodeEnv.Staging,
      }),
    ).toEqual({
      "service.name": "compass-sync",
      "deployment.environment": "staging",
    });
  });
});
