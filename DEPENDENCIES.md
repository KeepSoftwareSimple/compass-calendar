# Dependency pins and patches

One-line reasons for non-caret pins and root `resolutions` / `overrides`.

## Root resolutions and overrides

- `glob@^13`: Transitive tooling still pulls older glob majors; pin to v13 for a single supported release line.
- `google-auth-library@^10.5.0`: Floor for nested googleapis and auth stacks so the tree does not resolve to incompatible majors.
- `gaxios@^7.1.3`: Align nested Google HTTP client versions with google-auth-library and avoid mismatched gaxios majors.
- `typescript@7.0.2`: Match `type-check` scripts and keep CI and local `tsc -b` on one TypeScript 7 patch.
- `onetime@^5.1.2`: Keep CommonJS-compatible onetime for legacy CJS dependencies that break on onetime v6 ESM.

## Exact version pins

- `@stripe/react-stripe-js@6.9.0`: Pinned with `@stripe/stripe-js` so embedded checkout stays on a tested pair (peer range `>=9.10.0 <10.0.0`).
- `@stripe/stripe-js@9.15.0`: Pinned with `@stripe/react-stripe-js@6.9.0` for the same embedded checkout pair.

## Patches (`patches/`)

- `@tanstack/react-router@1.170.17`: Guard falsy CatchBoundary errors and never-resolving load promises during cold beforeLoad redirects (TanStack/router#7457).
- `@tanstack/hotkeys@0.3.3`: Treat non-string key names safely in `normalizeKeyName` so hotkey handling does not throw on bad input.
