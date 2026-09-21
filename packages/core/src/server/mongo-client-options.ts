import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Offered in preference order. The driver negotiates the first one the server
// also supports. A missing optional module is skipped so a build without the
// native addon still connects.
const COMPRESSOR_MODULES = [
  ["zstd", "@mongodb-js/zstd"],
  ["snappy", "snappy"],
] as const;

export type MongoCompressor = (typeof COMPRESSOR_MODULES)[number][0];

export interface MongoPerformanceOptions {
  compressors?: MongoCompressor[];
  minPoolSize: number;
  maxIdleTimeMS: number;
}

export function supportedMongoCompressors(): MongoCompressor[] {
  return COMPRESSOR_MODULES.flatMap(([id, specifier]) => {
    try {
      require(specifier);
      return [id];
    } catch {
      return [];
    }
  });
}

// Pool and compression for the long-lived backend and Sync clients. minPoolSize
// keeps a warm connection across the poll cadence; maxIdleTimeMS drops sockets
// that sit unused so a quiet self-host does not hold them forever. Applying
// this does not migrate data. Restart both processes so the new handshake is
// used.
export function mongoPerformanceOptions(): MongoPerformanceOptions {
  const compressors = supportedMongoCompressors();
  return {
    ...(compressors.length > 0 ? { compressors } : {}),
    minPoolSize: 2,
    maxIdleTimeMS: 60_000,
  };
}
