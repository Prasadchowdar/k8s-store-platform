FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache tini
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
