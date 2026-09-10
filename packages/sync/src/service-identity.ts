import { type NodeEnv } from "@core/constants/core.constants";

// Stable identity for the Compass Sync service. Kept as a plain
// constant so health telemetry and internal-auth can reference one
// canonical service name rather than string literals. PostHog's `service.name`
// dimension uses this value.
export const SYNC_SERVICE_NAME = "compass-sync";

export interface SyncServiceIdentity {
  readonly name: string;
}

export const syncServiceIdentity: SyncServiceIdentity = {
  name: SYNC_SERVICE_NAME,
};

// Structured identity surfaced on liveness responses and (later) health
// telemetry. Environment and execution mode let an operator confirm which
// deployment and rollout state answered a probe.
export interface StructuredServiceIdentity {
  readonly name: string;
  readonly environment: NodeEnv;
  readonly execution: "passive" | "active";
  readonly version: string;
}

export function buildServiceIdentity(input: {
  environment: NodeEnv;
  execution: "passive" | "active";
  version: string;
}): StructuredServiceIdentity {
  return {
    name: SYNC_SERVICE_NAME,
    environment: input.environment,
    execution: input.execution,
    version: input.version,
  };
}
