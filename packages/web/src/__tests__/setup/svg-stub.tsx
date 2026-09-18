import { createElement, forwardRef } from "react";

const SvgrMock = forwardRef<HTMLSpanElement, Record<string, unknown>>(
  (props, ref) => createElement("span", { ref, ...props }),
);
SvgrMock.displayName = "SvgrMock";

export const ReactComponent = SvgrMock;
export default SvgrMock;
