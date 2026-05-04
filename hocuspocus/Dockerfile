ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# Strip devDependencies from node_modules so the runtime stage can copy
# a production-only tree without re-running npm.
RUN npm prune --omit=dev


FROM node:${NODE_VERSION}-alpine

RUN addgroup -S app \
    && adduser -S -G app -u 10001 app

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 1234

CMD ["node", "dist/index.js"]
