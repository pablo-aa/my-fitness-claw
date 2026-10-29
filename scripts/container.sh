#!/bin/sh
# The container's entrypoint (Dockerfile): gets Claude Code ready for the WhatsApp bot, waits for its link, then runs
# the bot in the foreground for as long as the container runs. Linking is from a shell in the container:
# sh /opt/my-fitness-claw/scripts/wa.sh pair <number>, then wa.sh owner <number>|self.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FOLDER=${MFC_FOLDER:-$HOME/fitness}
. "$ROOT/hooks/lib.sh"
say() { echo "$(date '+%F %T') $*"; }
mkdir -p "$WA_DIR"

# No one is there to answer Claude Code's first-run and trust screens: both are answered here, for the fitness folder only.
FOLDER="$FOLDER" CONFIG="${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json" node -e '
  const fs = require("fs"), f = process.env.CONFIG
  let c = {}
  try { c = JSON.parse(fs.readFileSync(f, "utf8")) } catch {}
  c.hasCompletedOnboarding = true
  c.projects ??= {}
  c.projects[process.env.FOLDER] = { ...c.projects[process.env.FOLDER], hasTrustDialogAccepted: true }
  fs.writeFileSync(f, JSON.stringify(c, null, 2))'

# Claude Code installs a copy of each plugin, kept in the volume: installed again at each start, a new image brings its
# new plugin even with the same version.
claude plugin marketplace add "$ROOT" >/dev/null 2>&1
for p in whatsapp my-fitness-claw; do claude plugin uninstall "$p@my-fitness-claw" >/dev/null 2>&1; done
claude plugin install my-fitness-claw@my-fitness-claw >/dev/null 2>&1 || { say "could not install the plugin"; exit 1; }
say "plugin $(sh "$ROOT/scripts/wa.sh" install)"

# A new fitness folder starts from the template; the setup happens in the first WhatsApp chat.
if [ ! -f "$FOLDER/profile.md" ]; then
  mkdir -p "$FOLDER" && cp -R "$ROOT/template/." "$FOLDER/"
  say "new fitness folder in $FOLDER"
fi

# Linked, with an owner, and no pairing under way (wa.sh pair and unpair stop the bot to use the link themselves).
linked() {
  [ -f "$WA_DIR/config.json" ] && ! ps -eo args= | grep -qE '[w]a\.sh (pair|unpair)|[p]air\.ts' &&
    sh "$ROOT/scripts/wa.sh" whoami | grep -q '^paired'
}
# The bot stops only for what a person must fix (a lost link, another copy, a stop): it runs again when the container
# restarts or the link changes, never in a loop that keeps knocking on WhatsApp.
changed() {
  for f in wa.sqlite wa.sqlite-wal config.json; do [ "$WA_DIR/$f" -nt "$WA_DIR/bot.state" ] && return 0; done
  return 1
}
# docker stop: the bot ends its session and lets go of WhatsApp first, given the 30 seconds the docs ask for (up to 10
# for Claude Code to exit); Docker's default 10 can cut it short.
trap '[ -n "$bot" ] && kill "$bot" 2>/dev/null && wait "$bot"; exit 0' TERM INT
fresh=1
i=0
while :; do
  if linked && { [ -n "$fresh" ] || changed; }; then
    fresh=
    bun "$ROOT/whatsapp/launch.ts" run "$FOLDER" &
    bot=$!
    wait "$bot"
    bot=
    say "the bot stopped ($(sed -n 1p "$WA_DIR/bot.state")): it runs again when the link changes or the container restarts"
  elif [ -n "$fresh" ] && [ $((i % 20)) -eq 0 ]; then
    say "waiting for WhatsApp: sh $ROOT/scripts/wa.sh pair <number>, then wa.sh owner <number>|self"
  fi
  i=$((i + 1))
  sleep 15
done
