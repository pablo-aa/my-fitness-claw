# The coach's WhatsApp bot in a container, for any Docker host or Coolify: Claude Code, this plugin and what the coach
# runs (bun, Chromium for the plan's PDF, uv for voice notes). Everything that changes lives in the volume at /home/coach:
# the fitness folder, the WhatsApp link and Claude Code's own files. How to run it: skills/connect/server.md, Container.
FROM node:22.21.0-bookworm-slim
# Chromium's sandbox needs privileges a container doesn't have.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git procps tini chromium \
      fonts-dejavu-core fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/* && \
    echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' > /etc/chromium.d/container
COPY --from=oven/bun:1.4.4-slim /usr/local/bin/bun /usr/local/bin/bun
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /uvx /usr/local/bin/
# A fixed Claude Code: a new image is the update, never the updater in the middle of a session.
RUN npm install -g @anthropic-ai/claude-code@2.1.308 && npm cache clean --force
RUN useradd -m -s /bin/bash coach
COPY --chown=coach . /opt/my-fitness-claw
USER coach
RUN cd /opt/my-fitness-claw/whatsapp && bun install --production --frozen-lockfile --no-summary
ENV DISABLE_AUTOUPDATER=1
WORKDIR /home/coach
VOLUME /home/coach
HEALTHCHECK --interval=1m --start-period=5m CMD test "$(sed -n 1p /home/coach/.claude/channels/whatsapp/bot.state)" = running
# tini reaps the processes Claude Code leaves behind.
ENTRYPOINT ["tini", "--", "sh", "/opt/my-fitness-claw/scripts/container.sh"]
