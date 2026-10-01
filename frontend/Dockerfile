# --- Build the static site -------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

# Dependencies first, so editing the code does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Serve it with nginx, which also proxies /api to the backend ------------
FROM nginxinc/nginx-unprivileged:stable-alpine

# Where /api requests are forwarded. The image's entrypoint substitutes this
# into the config template at start-up.
ENV API_UPSTREAM=http://backend:8000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# 127.0.0.1, not localhost: busybox wget tries ::1 first and nginx only
# listens on IPv4, so the probe would always be refused.
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
