FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime

LABEL org.opencontainers.image.title="MemPR"
LABEL org.opencontainers.image.description="Pull requests for AI memory."
LABEL org.opencontainers.image.source="https://github.com/In-sp3ctr3/memPR"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV MEMPR_MCP_HTTP_HOST=0.0.0.0
ENV MEMPR_MCP_HTTP_PORT=3927
ENV MEMPR_ROOT=/workspace

WORKDIR /workspace

RUN addgroup -S mempr \
  && adduser -S mempr -G mempr \
  && mkdir -p /opt/mempr /workspace \
  && chown -R mempr:mempr /workspace

COPY --from=build /app/package.json /app/package-lock.json /opt/mempr/
COPY --from=build /app/dist /opt/mempr/dist

RUN npm install -g /opt/mempr --omit=dev --fund=false --audit=false \
  && npm cache clean --force

USER mempr

EXPOSE 3927

ENTRYPOINT ["mempr-mcp-http"]
