import {
  isSchemaObject,
  type JsonSchema,
} from "@scripts/swift-contracts/json-schema.types";
import { stableJsonStringify } from "@scripts/swift-contracts/stable-json";
import { assertSwiftPublicTypeName } from "@scripts/swift-contracts/swift-reserved-types";
import { z } from "zod/v4";
import {
  SWIFT_BRANDED_ID_ENTRIES,
  type SwiftBrandedIdEntry,
} from "@core/desktop/swift-contracts.manifest";

const OBJECT_ID_PATTERN = "^[0-9a-f]{24}$";

export function emitBrandedIdStructs(entries: SwiftBrandedIdEntry[]): string {
  return entries
    .map(({ swiftName }) => {
      assertSwiftPublicTypeName(swiftName, "branded id struct");
      return `public struct ${swiftName}: RawRepresentable, Codable, Hashable, Sendable, ExpressibleByStringLiteral {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(stringLiteral value: String) {
        self.rawValue = value
    }
}
`;
    })
    .join("\n");
}

function schemaFingerprint(schema: JsonSchema): string {
  return stableJsonStringify(schema);
}

/** Maps JSON Schema fingerprints for branded Zod schemas to Swift type names. */
export function buildBrandedIdLookup(
  entries: SwiftBrandedIdEntry[] = SWIFT_BRANDED_ID_ENTRIES,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const { swiftName, schema } of entries) {
    const jsonSchema = z.toJSONSchema(schema, {
      unrepresentable: "any",
    }) as JsonSchema;
    lookup.set(schemaFingerprint(jsonSchema), swiftName);
  }
  return lookup;
}

const PROPERTY_BRAND_OVERRIDES: Record<string, string> = {
  calendarId: "CalendarId",
  calendarIds: "CalendarId",
  eventId: "EventId",
  eventIds: "EventId",
  seriesId: "EventId",
  hiddenEventIds: "EventId",
  connectionId: "ConnectionId",
  start: "DateTime",
  end: "DateTime",
  createdAt: "DateTime",
  updatedAt: "DateTime",
  computedAt: "DateTime",
  timeZone: "IANATimeZone",
  trialEndsAt: "DateTime",
  currentPeriodEnd: "DateTime",
};

export function brandedSwiftTypeForProperty(
  propertyName: string,
  schema: JsonSchema,
  lookup: Map<string, string>,
): string | undefined {
  if (!isSchemaObject(schema)) {
    return undefined;
  }

  const direct = lookup.get(schemaFingerprint(schema));
  if (direct) {
    return direct;
  }

  if (propertyName === "id" && isEventIdShape(schema)) {
    return "EventId";
  }

  const override = PROPERTY_BRAND_OVERRIDES[propertyName];
  if (override && stringMatchesBrandedShape(schema, override)) {
    return override;
  }

  return undefined;
}

function isEventIdShape(schema: Exclude<JsonSchema, boolean>): boolean {
  return (
    schema.type === "string" &&
    schema.minLength === 1 &&
    schema.maxLength === 256 &&
    schema.pattern === undefined
  );
}

function stringMatchesBrandedShape(
  schema: Exclude<JsonSchema, boolean>,
  swiftName: string,
): boolean {
  if (schema.type !== "string") {
    return false;
  }
  switch (swiftName) {
    case "CalendarId":
    case "ConnectionId":
      return schema.pattern === OBJECT_ID_PATTERN;
    case "DateTime":
      return (
        schema.format === "date-time" || Boolean(schema.pattern?.includes("T"))
      );
    case "DateOnly":
      return schema.format === "date";
    case "IANATimeZone":
      return schema.type === "string";
    case "EventId":
      return isEventIdShape(schema);
    default:
      return false;
  }
}
