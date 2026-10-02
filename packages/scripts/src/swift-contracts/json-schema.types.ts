export type JsonSchema =
  | boolean
  | {
      $ref?: string;
      type?: string | string[];
      const?: string | number | boolean | null;
      enum?: Array<string | number | boolean>;
      properties?: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: JsonSchema | boolean;
      items?: JsonSchema;
      oneOf?: JsonSchema[];
      anyOf?: JsonSchema[];
      allOf?: JsonSchema[];
      format?: string;
      pattern?: string;
      minLength?: number;
      maxLength?: number;
      readOnly?: boolean;
      default?: unknown;
    };

export function isSchemaObject(
  schema: JsonSchema | undefined,
): schema is Exclude<JsonSchema, boolean> {
  return typeof schema === "object" && schema !== null;
}
