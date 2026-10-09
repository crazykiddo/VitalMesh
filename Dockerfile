FROM node:22-bookworm-slim AS build

ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

ARG APP_VERSION=dev
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION

LABEL org.opencontainers.image.title="VitalMesh"
LABEL org.opencontainers.image.version=$APP_VERSION

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data

VOLUME ["/app/data"]

EXPOSE 3007

CMD ["npm", "start"]