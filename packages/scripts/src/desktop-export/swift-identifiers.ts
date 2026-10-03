import { escapeSwiftKeyword } from "@scripts/swift-contracts/swift-reserved-types";

export const kebabToCamelCase = (value: string): string => {
  const parts = value.split("-");
  const head = parts[0] ?? "";
  const tail = parts
    .slice(1)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `${head}${tail}`;
};

export const snakeToCamelCase = (value: string): string =>
  value
    .split("_")
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");

export const swiftEnumCaseName = (rawId: string): string =>
  escapeSwiftKeyword(kebabToCamelCase(rawId));

export const formatSwiftDouble = (value: number): string => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  const text = rounded.toString();
  return text.includes(".") ? text : `${text}.0`;
};
