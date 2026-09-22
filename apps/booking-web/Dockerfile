FROM oven/bun:1.3.14 AS build

WORKDIR /app

# Install before COPY . . so source edits do not bust the install layer.
COPY package.json bun.lock bunfig.toml ./
COPY patches ./patches
COPY apps/booking-web/package.json apps/booking-web/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/scripts/package.json packages/scripts/package.json
COPY packages/sync/package.json packages/sync/package.json
COPY packages/web/package.json packages/web/package.json
RUN bun install --frozen-lockfile
COPY . .

ARG API_BASEURL=http://localhost:3000/api
ENV NODE_ENV=production
ENV API_BASEURL=${API_BASEURL}

RUN cd apps/booking-web && bun run build.ts

FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app

# groupadd/useradd, not addgroup/adduser: Debian 13 (trixie) based
# oven/bun slim images no longer ship the adduser package.
RUN groupadd --system --gid 1001 compass \
 && useradd --system --uid 1001 --gid compass --no-create-home --shell /usr/sbin/nologin compass

ENV WEB_PORT=9081
ENV WEB_ROOT=/app/build/booking-web

COPY --from=build --chown=compass:compass /app/build/booking-web ./build/booking-web
# serve-web.ts imports this map at runtime, so the runtime stage needs the
# file on disk; without it bun exits on an unresolved module and the container
# restart-loops.
COPY --from=build --chown=compass:compass /app/packages/web/compressible-static-types.ts ./packages/web/compressible-static-types.ts
COPY --from=build --chown=compass:compass /app/self-host/serve-web.ts ./self-host/serve-web.ts

USER compass

EXPOSE 9081
CMD ["bun", "self-host/serve-web.ts"]
