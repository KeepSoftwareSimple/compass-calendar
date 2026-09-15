import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { PostHog } from "posthog-node";
import { NodeEnv } from "@core/constants/core.constants";

export interface OtelLogsOptions {
  serviceName: string;
  nodeEnv: NodeEnv;
  posthogKey?: string;
  posthogHost?: string;
  version?: string;
}

export interface PostHogContext {
  service: string;
  environment: NodeEnv;
  version?: string;
}

let loggerProvider: LoggerProvider | undefined;
let posthogClient: PostHog | undefined;
let postHogContext: PostHogContext | undefined;

/** OTel resource attributes shared with PostHog `logs.resource_attributes`. */
export function buildOtelResourceAttributes(
  options: Pick<OtelLogsOptions, "serviceName" | "nodeEnv" | "version">,
): Record<string, string> {
  const attributes: Record<string, string> = {
    "service.name": options.serviceName,
    "deployment.environment": options.nodeEnv,
  };
  if (options.version) {
    attributes["service.version"] = options.version;
  }
  return attributes;
}

export function startOtelLogs(options: OtelLogsOptions): PostHog | null {
  const isRemoteLoggingEnvironment =
    options.nodeEnv === NodeEnv.Staging ||
    options.nodeEnv === NodeEnv.Production;

  if (isRemoteLoggingEnvironment && options.posthogKey) {
    const host = options.posthogHost || "https://us.i.posthog.com";

    loggerProvider = new LoggerProvider({
      resource: resourceFromAttributes(buildOtelResourceAttributes(options)),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${host}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${options.posthogKey}`,
            },
          }),
        }),
      ],
    });

    logs.setGlobalLoggerProvider(loggerProvider);

    posthogClient = new PostHog(options.posthogKey, {
      host,
      flushInterval: 1000,
    });

    postHogContext = {
      service: options.serviceName,
      environment: options.nodeEnv,
      version: options.version,
    };

    return posthogClient;
  }

  return null;
}

export async function stopOtelLogs(): Promise<void> {
  await loggerProvider?.shutdown();
  await posthogClient?.shutdown();
}

export function getPostHogClient(): PostHog | null {
  return posthogClient ?? null;
}

export function getPostHogContext(): PostHogContext | null {
  return postHogContext ?? null;
}
