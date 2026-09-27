import { type CSSProperties } from "react";

export type CSSVariables = CSSProperties & {
  [name: `--${string}`]: string | number | undefined;
};
