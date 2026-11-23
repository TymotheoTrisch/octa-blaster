FROM node:22.22.2-bookworm-slim
WORKDIR /app/apps/local-helper
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY apps/local-helper/package.json apps/local-helper/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY apps/local-helper/*.mjs ./
COPY apps/team-gateway/*.mjs /app/apps/team-gateway/
COPY LICENSE /app/LICENSE
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/team-gateway
ENV OCTA_BIND=0.0.0.0 OCTA_DATA_DIR=/data OCTA_USERS_FILE=/run/config/users.json
CMD ["node", "server.mjs"]
