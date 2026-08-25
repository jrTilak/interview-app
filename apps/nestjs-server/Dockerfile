# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.22.1
ARG PNPM_VERSION=11.5.3

FROM node:${NODE_VERSION}-alpine AS pnpm-base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN set -eu; \
	corepack enable; \
	attempt=1; \
	until corepack prepare "pnpm@${PNPM_VERSION}" --activate; do \
		if [ "${attempt}" -ge 5 ]; then \
			echo >&2 "pnpm download failed after ${attempt} attempts"; \
			exit 1; \
		fi; \
		delay=$((attempt * 2)); \
		echo >&2 "pnpm download failed; retrying in ${delay}s"; \
		sleep "${delay}"; \
		attempt=$((attempt + 1)); \
	done; \
	pnpm --version
WORKDIR /workspace

FROM pnpm-base AS build-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/nestjs-server/package.json ./apps/nestjs-server/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile

FROM build-dependencies AS build
COPY tsconfig.json ./tsconfig.json
COPY apps/nestjs-server ./apps/nestjs-server
RUN pnpm --filter @interview-desk/nestjs-server build

FROM pnpm-base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/nestjs-server/package.json ./apps/nestjs-server/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile --prod --filter @interview-desk/nestjs-server

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/nestjs-server/node_modules ./apps/nestjs-server/node_modules
COPY apps/nestjs-server/package.json ./apps/nestjs-server/package.json
COPY apps/nestjs-server/docs ./apps/nestjs-server/docs
COPY --from=build /workspace/apps/nestjs-server/dist ./apps/nestjs-server/dist

WORKDIR /workspace/apps/nestjs-server
USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
