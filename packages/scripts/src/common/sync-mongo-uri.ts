import { loadCompassConfig } from "@core/config/compass.config";

/**
 * Resolve the isolated Sync Mongo URI from the environment, then compass.yaml.
 * `purpose` is the "before <purpose>" clause in the missing-config error.
 */
export function resolveSyncMongoUri(purpose: string): string {
  const fromEnv = process.env["SYNC_MONGO_URI"]?.trim();
  if (fromEnv) return fromEnv;
  const uri = loadCompassConfig().sync?.mongoUri?.trim();
  if (!uri) {
    throw new Error(
      `Set SYNC_MONGO_URI or add sync.mongoUri to compass.yaml before ${purpose}`,
    );
  }
  return uri;
}
