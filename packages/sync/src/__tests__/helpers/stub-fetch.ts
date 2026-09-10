/** Minimal `fetch` stub that satisfies Bun/Node's extended `typeof fetch`. */
export function stubFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, {
    preconnect: async () => {},
  }) as typeof fetch;
}
