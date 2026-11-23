# syntax=docker/dockerfile:1

# patteo in a container: a keyboard-first terminal client for a Paseo daemon.
#
#   docker build -t patteo .
#   docker run -it --rm --network host patteo                       # Linux: reaches the daemon on the host's 127.0.0.1:6767
#   docker run -it --rm patteo --host host.docker.internal:6767     # Docker Desktop (see the README: the daemon must allow that host name)
#
# Settings and hosts persist if you mount a volume on /home/patteo/.config/patteo.

ARG BUN_VERSION=1.4.2

# ── build: install with the patched OpenTUI, then compile one standalone binary ──
FROM oven/bun:${BUN_VERSION}-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile
COPY . .
RUN bun build --compile --minify --define 'process.env.OPENTUI_LIBC="glibc"' ./src/index.tsx --outfile /out/patteo

# ── test: `docker build --target test .` typechecks and runs the suite on Linux ──
FROM build AS test
RUN bun run typecheck && bun test

# ── runtime base: a slim image with a non-root user ──
FROM debian:bookworm-slim AS runtime-base
LABEL org.opencontainers.image.title="patteo" \
      org.opencontainers.image.description="A fast, keyboard-first terminal client for Paseo" \
      org.opencontainers.image.source="https://github.com/achintya-7/patteo" \
      org.opencontainers.image.licenses="Apache-2.0"
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 patteo
ENV TERM=xterm-256color COLORTERM=truecolor
VOLUME ["/home/patteo/.config/patteo"]
WORKDIR /home/patteo
ENTRYPOINT ["patteo"]

# ── release: the release workflow's prebuilt Linux binaries (amd64/arm64), no compiling under emulation ──
FROM runtime-base AS release
ARG TARGETARCH
COPY .release-docker/${TARGETARCH}/patteo /usr/local/bin/patteo
USER patteo

# ── runtime (the default target): the binary compiled above ──
FROM runtime-base AS runtime
COPY --from=build /out/patteo /usr/local/bin/patteo
USER patteo
