import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function ReactQueryDevtoolsHost() {
  return <ReactQueryDevtools initialIsOpen={false} />;
}
