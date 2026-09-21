FROM docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies (the local studio editor) are not needed to build the site.
RUN npm ci --omit=dev
COPY . .
# CI generates src/data/*.json with an authenticated token beforehand; locally they are fetched here.
RUN [ -f src/data/status.json ] || node scripts/fetch-status.mjs
RUN [ -f src/data/changelog.json ] || node scripts/fetch-changelog.mjs
# Empty by default; set it (build arg) to enable RSS, sitemap and canonical URLs.
ARG SITE_URL=""
ENV SITE_URL=$SITE_URL TZ=UTC
RUN npx astro build

FROM docker.io/library/caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
