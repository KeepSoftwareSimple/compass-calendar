import {
  brandedSwiftTypeForProperty,
  buildBrandedIdLookup,
  emitBrandedIdStructs,
} from "@scripts/swift-contracts/branded-ids";
import {
  isSchemaObject,
  type JsonSchema,
} from "@scripts/swift-contracts/json-schema.types";
import {
  compareAscii,
  stableJsonStringify,
} from "@scripts/swift-contracts/stable-json";
import { assertSwiftPublicTypeName } from "@scripts/swift-contracts/swift-reserved-types";
import { z } from "zod/v4";
import {
  SWIFT_BRANDED_ID_ENTRIES,
  SWIFT_CONTRACT_MANIFEST,
} from "@core/desktop/swift-contracts.manifest";

export class SwiftEmitError extends Error {
  constructor(
    readonly schemaPath: string,
    message: string,
  ) {
    super(`${schemaPath}: ${message}`);
    this.name = "SwiftEmitError";
  }
}

type EmitContext = {
  lookup: Map<string, string>;
  emitted: Map<string, string>;
  pending: Set<string>;
  fingerprintToName: Map<string, string>;
};

function schemaFingerprint(schema: JsonSchema): string {
  return stableJsonStringify(schema);
}

function toPascalCase(segment: string): string {
  return segment
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function swiftPropertyName(name: string): string {
  if (name === "default") {
    return "`default`";
  }
  return name;
}

function isDiscriminatedUnion(
  schemas: JsonSchema[],
): { discriminator: string; variants: JsonSchema[] } | null {
  if (schemas.length === 0) {
    return null;
  }
  const firstObjects = schemas
    .filter(isSchemaObject)
    .filter((s) => s.type === "object");
  if (firstObjects.length !== schemas.length) {
    return null;
  }
  const keys = firstObjects.map((s) =>
    Object.keys(s.properties ?? {}).find((key) => {
      const prop = s.properties?.[key];
      return isSchemaObject(prop) && prop.const !== undefined;
    }),
  );
  const discriminator = keys[0];
  if (!discriminator || keys.some((key) => key !== discriminator)) {
    return null;
  }
  return { discriminator, variants: schemas };
}

function mergeObjectSchemas(schemas: JsonSchema[]): JsonSchema {
  const objects = schemas
    .filter(isSchemaObject)
    .filter((s) => s.type === "object");
  if (objects.length !== schemas.length) {
    throw new Error("allOf contains non-object members");
  }
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  for (const obj of objects) {
    Object.assign(properties, obj.properties ?? {});
    for (const key of obj.required ?? []) {
      required.add(key);
    }
  }
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

function unwrapNullable(schema: JsonSchema): {
  inner: JsonSchema;
  optional: boolean;
  nullable: boolean;
} {
  if (!isSchemaObject(schema)) {
    return { inner: schema, optional: false, nullable: false };
  }
  if (Array.isArray(schema.type)) {
    const nullable = schema.type.includes("null");
    const nonNull = schema.type.filter((t) => t !== "null");
    if (nonNull.length === 1) {
      return {
        inner: { ...schema, type: nonNull[0]! },
        optional: false,
        nullable,
      };
    }
  }
  if (schema.anyOf?.length === 2) {
    const nullBranch = schema.anyOf.find(
      (branch) => isSchemaObject(branch) && branch.type === "null",
    );
    const other = schema.anyOf.find((branch) => branch !== nullBranch);
    if (nullBranch && other) {
      return { inner: other, optional: false, nullable: true };
    }
  }
  return { inner: schema, optional: false, nullable: false };
}

function emitType(
  schema: JsonSchema,
  path: string,
  ctx: EmitContext,
  propertyName?: string,
): string {
  const { inner, nullable } = unwrapNullable(schema);
  let swiftType = emitTypeCore(inner, path, ctx, propertyName);
  if (nullable) {
    swiftType = `${swiftType}?`;
  }
  return swiftType;
}

function emitTypeCore(
  schema: JsonSchema,
  path: string,
  ctx: EmitContext,
  propertyName?: string,
): string {
  if (!isSchemaObject(schema)) {
    throw new SwiftEmitError(path, "unsupported boolean schema");
  }

  if (propertyName) {
    const branded = brandedSwiftTypeForProperty(
      propertyName,
      schema,
      ctx.lookup,
    );
    if (branded) {
      return branded;
    }
  }

  if (schema.const !== undefined) {
    if (typeof schema.const === "string") {
      return "String";
    }
    if (typeof schema.const === "boolean") {
      return "Bool";
    }
    if (typeof schema.const === "number") {
      return "Double";
    }
    throw new SwiftEmitError(path, "unsupported const type");
  }

  if (schema.enum) {
    if (schema.enum.some((value) => typeof value !== "string")) {
      throw new SwiftEmitError(path, "only string enums are supported");
    }
    const enumName = `${toPascalCase(path.split(".").pop() ?? "Value")}Enum`;
    ensureStringEnum(enumName, schema.enum as string[], ctx);
    return enumName;
  }

  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const discriminated = isDiscriminatedUnion(variants);
    if (discriminated) {
      const unionName = toPascalCase(path.replace(/\./g, "_"));
      return ensureDiscriminatedUnion(
        unionName,
        discriminated.discriminator,
        variants,
        path,
        ctx,
      );
    }
    const primitive = emitPrimitiveUnion(variants, path, ctx);
    if (primitive) {
      return primitive;
    }
    throw new SwiftEmitError(
      path,
      "unsupported anyOf/oneOf (not a discriminated union)",
    );
  }

  if (schema.allOf) {
    return emitType(mergeObjectSchemas(schema.allOf), path, ctx, propertyName);
  }

  if (schema.type === "string") {
    return "String";
  }
  if (schema.type === "boolean") {
    return "Bool";
  }
  if (schema.type === "integer" || schema.type === "number") {
    return schema.type === "integer" ? "Int" : "Double";
  }
  if (schema.type === "array") {
    if (!schema.items) {
      throw new SwiftEmitError(path, "array missing items");
    }
    const element = emitType(schema.items, `${path}[]`, ctx);
    return `[${element}]`;
  }
  if (schema.type === "object") {
    if (
      schema.additionalProperties !== undefined &&
      schema.additionalProperties !== false
    ) {
      const valueSchema =
        schema.additionalProperties === true
          ? true
          : schema.additionalProperties;
      if (valueSchema === true) {
        return "[String: JSONValue]";
      }
      if (
        isSchemaObject(valueSchema) &&
        Object.keys(valueSchema).length === 0
      ) {
        return "[String: JSONValue]";
      }
      const valueType = emitType(valueSchema, `${path}.*`, ctx);
      return `[String: ${valueType}]`;
    }
    const structName = toPascalCase(path.replace(/\./g, "_"));
    return ensureStruct(structName, schema, path, ctx);
  }

  throw new SwiftEmitError(
    path,
    `unsupported schema construct: ${JSON.stringify(schema)}`,
  );
}

function emitPrimitiveUnion(
  variants: JsonSchema[],
  path: string,
  ctx: EmitContext,
): string | null {
  if (variants.every(isWireDateOrStringBranch)) {
    return "String";
  }
  const literalNumbers = variants
    .filter(isSchemaObject)
    .map((branch) => branch.const)
    .filter((value): value is number => typeof value === "number");
  if (literalNumbers.length === variants.length && literalNumbers.length > 0) {
    const enumName = `${toPascalCase(path.split(".").pop() ?? "Value")}Enum`;
    ensureIntEnum(enumName, literalNumbers, ctx);
    return enumName;
  }
  const stringLiterals = variants
    .filter(isSchemaObject)
    .map((branch) => branch.const)
    .filter((value): value is string => typeof value === "string");
  if (stringLiterals.length === variants.length && stringLiterals.length > 0) {
    const enumName = `${toPascalCase(path.split(".").pop() ?? "Value")}Enum`;
    ensureStringEnum(enumName, stringLiterals, ctx);
    return enumName;
  }
  return null;
}

function isWireDateOrStringBranch(branch: JsonSchema): boolean {
  if (!isSchemaObject(branch)) {
    return false;
  }
  if (branch.type === "string") {
    return true;
  }
  if (branch.type === undefined && Object.keys(branch).length === 0) {
    return true;
  }
  if (branch.format === "date-time" || branch.format === "date") {
    return true;
  }
  return false;
}

function ensureIntEnum(name: string, values: number[], ctx: EmitContext): void {
  if (ctx.emitted.has(name)) {
    return;
  }
  assertSwiftPublicTypeName(name, "generated enum");
  const cases = [...values]
    .sort((left, right) => left - right) // numeric
    .map((value) => `    case v${value} = ${value}`)
    .join("\n");
  ctx.emitted.set(
    name,
    `public enum ${name}: Int, Codable, Hashable, Sendable, CaseIterable {
${cases}
}
`,
  );
}

function ensureStringEnum(
  name: string,
  values: string[],
  ctx: EmitContext,
): void {
  if (ctx.emitted.has(name)) {
    return;
  }
  assertSwiftPublicTypeName(name, "generated enum");
  const cases = [...values]
    .sort(compareAscii)
    .map((value) => `    case ${swiftEnumCaseName(value)} = "${value}"`)
    .join("\n");
  ctx.emitted.set(
    name,
    `public enum ${name}: String, Codable, Hashable, Sendable, CaseIterable {
${cases}
}
`,
  );
}

function swiftEnumCaseName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, "_");
  if (/^[0-9]/.test(cleaned)) {
    return `_${cleaned}`;
  }
  if (cleaned === "default") {
    return "`default`";
  }
  const camel =
    cleaned.charAt(0).toLowerCase() +
    cleaned.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return camel.replace(/__/g, "_");
}

function ensureStruct(
  name: string,
  schema: Exclude<JsonSchema, boolean>,
  path: string,
  ctx: EmitContext,
): string {
  const fingerprint = schemaFingerprint(schema);
  const existing = ctx.fingerprintToName.get(fingerprint);
  if (existing) {
    return existing;
  }
  if (ctx.emitted.has(name) || ctx.pending.has(name)) {
    return name;
  }
  assertSwiftPublicTypeName(name, `struct at ${path}`);
  ctx.pending.add(name);
  const properties = schema.properties ?? {};
  const propertyNames = Object.keys(properties).sort(compareAscii);
  const required = new Set(schema.required ?? []);
  const fields: string[] = [];
  for (const propName of propertyNames) {
    const propSchema = properties[propName]!;
    const fieldPath = `${path}.${propName}`;
    let swiftType = emitType(propSchema, fieldPath, ctx, propName);
    if (!required.has(propName)) {
      if (!swiftType.endsWith("?")) {
        swiftType = `${swiftType}?`;
      }
    }
    fields.push(`    public let ${swiftPropertyName(propName)}: ${swiftType}`);
  }
  const codingKeys = propertyNames.some((key) => key === "default")
    ? `\n    enum CodingKeys: String, CodingKey {\n${propertyNames
        .map((key) => `        case ${swiftPropertyName(key)} = "${key}"`)
        .join("\n")}\n    }\n`
    : "";
  ctx.emitted.set(
    name,
    `public struct ${name}: Codable, Hashable, Sendable {
${fields.join("\n")}${codingKeys}}
`,
  );
  ctx.fingerprintToName.set(fingerprint, name);
  ctx.pending.delete(name);
  return name;
}

function ensureDiscriminatedUnion(
  name: string,
  discriminator: string,
  variants: JsonSchema[],
  path: string,
  ctx: EmitContext,
): string {
  const fingerprint = schemaFingerprint({
    oneOf: variants,
    discriminator,
  } as JsonSchema);
  const existing = ctx.fingerprintToName.get(fingerprint);
  if (existing) {
    return existing;
  }
  if (ctx.emitted.has(name)) {
    return name;
  }
  assertSwiftPublicTypeName(name, `discriminated union at ${path}`);
  const cases: string[] = [];
  const decodeCases: string[] = [];
  const encodeCases: string[] = [];
  const orderedVariants = [...variants].sort((left, right) => {
    const leftTag =
      isSchemaObject(left) &&
      isSchemaObject(left.properties?.[discriminator]) &&
      typeof left.properties[discriminator].const === "string"
        ? left.properties[discriminator].const
        : "";
    const rightTag =
      isSchemaObject(right) &&
      isSchemaObject(right.properties?.[discriminator]) &&
      typeof right.properties[discriminator].const === "string"
        ? right.properties[discriminator].const
        : "";
    return compareAscii(String(leftTag), String(rightTag));
  });
  for (const variant of orderedVariants) {
    if (!isSchemaObject(variant) || variant.type !== "object") {
      throw new SwiftEmitError(path, "discriminated variant is not an object");
    }
    const tagProp = variant.properties?.[discriminator];
    if (!isSchemaObject(tagProp) || typeof tagProp.const !== "string") {
      throw new SwiftEmitError(path, "discriminator const missing on variant");
    }
    const tag = tagProp.const;
    const caseName = swiftEnumCaseName(tag);
    const payloadName = `${name}_${toPascalCase(tag)}Payload`;
    const resolvedPayloadName = ensureStruct(
      payloadName,
      variant,
      `${path}.${tag}`,
      ctx,
    );
    cases.push(`    case ${caseName}(${resolvedPayloadName})`);
    decodeCases.push(
      `        case "${tag}":\n            self = .${caseName}(try ${resolvedPayloadName}(from: decoder))`,
    );
    encodeCases.push(
      `        case .${caseName}(let payload):\n            try payload.encode(to: encoder)`,
    );
  }
  const body = `public enum ${name}: Codable, Hashable, Sendable {
${cases.join("\n")}

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminatorKey.self)
        let kind = try container.decode(String.self, forKey: .${swiftPropertyName(discriminator)})
        switch kind {
${decodeCases.join("\n")}
        default:
            throw DecodingError.dataCorruptedError(forKey: .${swiftPropertyName(discriminator)}, in: container, debugDescription: "Unknown ${discriminator} \\(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
${encodeCases.join("\n")}
        }
    }

    private enum DiscriminatorKey: String, CodingKey {
        case ${swiftPropertyName(discriminator)}
    }
}
`;
  ctx.emitted.set(name, body);
  ctx.fingerprintToName.set(fingerprint, name);
  return name;
}

/** Minimal JSON value for record values that use unknown payloads (e.g. user metadata). */
const JSON_VALUE_HELPER = `public enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}
`;

/** Test harness: emit Swift for one Zod schema. */
export function emitSwiftForSchema(
  schema: z.ZodType,
  rootName: string,
  lookup = buildBrandedIdLookup(SWIFT_BRANDED_ID_ENTRIES),
): string {
  const ctx: EmitContext = {
    lookup,
    emitted: new Map(),
    pending: new Set(),
    fingerprintToName: new Map(),
  };
  const jsonSchema = z.toJSONSchema(schema, {
    unrepresentable: "any",
  }) as JsonSchema;
  emitType(jsonSchema, rootName, ctx);
  return [...ctx.emitted.values()].join("\n");
}

export function emitContractsSwiftFile(): string {
  for (const { swiftName } of SWIFT_BRANDED_ID_ENTRIES) {
    assertSwiftPublicTypeName(swiftName, "swift branded id manifest");
  }
  for (const { swiftName } of SWIFT_CONTRACT_MANIFEST) {
    assertSwiftPublicTypeName(swiftName, "swift contract manifest");
  }

  const ctx: EmitContext = {
    lookup: buildBrandedIdLookup(SWIFT_BRANDED_ID_ENTRIES),
    emitted: new Map(),
    pending: new Set(),
    fingerprintToName: new Map(),
  };

  for (const { swiftName, schema } of SWIFT_CONTRACT_MANIFEST) {
    const jsonSchema = z.toJSONSchema(schema, {
      unrepresentable: "any",
    }) as JsonSchema;
    const rootType = emitType(jsonSchema, swiftName, ctx);
    if (rootType !== swiftName && ctx.emitted.has(rootType)) {
      const body = ctx.emitted.get(rootType)!;
      ctx.emitted.set(
        swiftName,
        body
          .replace(`public struct ${rootType}`, `public struct ${swiftName}`)
          .replace(`public enum ${rootType}`, `public enum ${swiftName}`),
      );
    }
  }

  const header = `// Generated by bun cli contracts:swift. Do not edit.\n\nimport Foundation\n\n`;
  const branded = emitBrandedIdStructs(SWIFT_BRANDED_ID_ENTRIES);
  const helpers = JSON_VALUE_HELPER;
  const types = [...ctx.emitted.entries()]
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([, body]) => body)
    .join("\n");
  return header + branded + helpers + types;
}
