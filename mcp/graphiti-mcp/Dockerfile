# syntax=docker/dockerfile:1
# graphiti-mcp — custom Graphiti MCP server (HTTP transport for container deploys)
#
# Build (amd64 homelab target from an arm64 Mac):
#   docker buildx build --platform linux/amd64 \
#     -t ghcr.io/breissingerj/graphiti-mcp:latest --push .
#
# Run:
#   docker run -p 8000:8000 -e OPENAI_API_KEY=... -e FALKORDB_HOST=graphiti \
#     ghcr.io/breissingerj/graphiti-mcp:latest

FROM python:3.12-slim AS build

# uv for fast, reproducible installs from uv.lock
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Install dependencies first (cached layer) using only the lock + manifest.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Now copy the source and install the project itself.
COPY src ./src
COPY README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ── runtime image ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root runtime user.
RUN useradd --create-home --uid 10001 app

WORKDIR /app
COPY --from=build --chown=app:app /app /app

# Put the venv on PATH so `graphiti-mcp` resolves.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    GRAPHITI_MCP_HOME=/data

# Persisted local state (registry.db + docref cache) lives here.
RUN mkdir -p /data && chown app:app /data
VOLUME ["/data"]

USER app
EXPOSE 8000

# Default: serve streamable-HTTP on all interfaces so traefik/the host can reach it.
ENTRYPOINT ["graphiti-mcp", "serve", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8000"]
