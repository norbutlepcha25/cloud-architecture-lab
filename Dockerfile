# This app is a pure client-side SPA (React + Vite, no backend server) - the only thing that
# ever needs to run is the compiled static output. A single Node-based image running `npm run
# dev`/`vite preview` would work, but ships the whole toolchain (Node, node_modules, TypeScript,
# Vite) into every container just to serve unchanging static files. A multi-stage build
# compiles once and throws all of that away, leaving only nginx + the static output - smaller,
# faster to start, and nothing to patch for Node/npm CVEs at runtime.

# --- Stage 1: build the static bundle ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_UMAMI_WEBSITE_ID
ARG VITE_UMAMI_SCRIPT_URL
ARG VITE_UMAMI_DOMAINS
ARG RELEASE_CHANNEL=stable
ARG RELEASE_ID
RUN RELEASE_CHANNEL="$RELEASE_CHANNEL" RELEASE_ID="$RELEASE_ID" npm run build

# --- Stage 2: serve it with nginx ---
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
