# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.22.1
ARG PNPM_VERSION=11.5.3

FROM node:${NODE_VERSION}-alpine AS pnpm-base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace

FROM pnpm-base AS build-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/react-client/package.json ./apps/react-client/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile

FROM build-dependencies AS build
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
COPY tsconfig.json ./tsconfig.json
COPY apps/react-client ./apps/react-client
RUN pnpm --filter @interview-app/react-client build

FROM nginx:1.28-alpine AS runtime
COPY apps/react-client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/react-client/dist /usr/share/nginx/html

EXPOSE 8080
