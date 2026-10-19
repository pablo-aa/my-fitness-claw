#!/bin/sh
# Anonymous usage stats: once a day per channel, if the user opted in and the coach was used,
# tell the Clawdino server this install was active. Sends only {id, day, channel, v}; fails silently.
# The server checks the same fields (PING in server/clawdino.mjs).
dir=.
[ -f ./profile.md ] && [ -f ./plan.md ] || dir="$HOME/my-fitness"
grep -q '^- Usage stats: on' "$dir/profile.md" 2>/dev/null || exit 0
[ -s "$dir/.usage" ] || { openssl rand -hex 16 2>/dev/null || od -An -N16 -tx1 /dev/urandom; } | tr -d ' \r\n' > "$dir/.usage"
id=$(sed -n 1p "$dir/.usage" 2>/dev/null | tr -d '\r')
echo "$id" | grep -Eq '^[0-9a-f]{32}$' || exit 0
. "$(dirname "$0")/lib.sh"
tz=$(timezone "$dir")
[ -z "$tz" ] || export TZ="$tz"
day=$(date +%F)
channel=${MFC_CHANNEL:-terminal}
grep -qx "$day $channel" "$dir/.usage" && exit 0
# Outside the fitness folder, count the day only if the coach logged something today.
[ "$dir" = . ] || [ -n "$(find "$dir/log" -type f -newermt "$day" 2>/dev/null)" ] || exit 0
{ echo "$id"; grep -x "$day .*" "$dir/.usage"; echo "$day $channel"; } > "$dir/.usage.$$" && mv "$dir/.usage.$$" "$dir/.usage"
v=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" 2>/dev/null)
body=$(printf '{"id":"%s","day":"%s","channel":"%s","v":"%s"}' "$id" "$day" "$channel" "${v:-unknown}")
curl -s -m 2 -o /dev/null -X POST -d "$body" "${CLAWDINO_URL:-https://clawdino.pabloaa.com}/ping" >/dev/null 2>&1 &
exit 0
