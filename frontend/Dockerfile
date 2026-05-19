ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
# --legacy-peer-deps: several deps (e.g. @emoji-mart/react) declare React peer
# ranges that exclude React 19, even though they work fine at runtime. The
# committed lockfile was resolved with this flag set; npm ci must match.
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build


FROM nginx:${NGINX_VERSION}-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80 443
