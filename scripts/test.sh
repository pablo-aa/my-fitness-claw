#!/bin/sh
# Offline checks for the hooks, scripts and server: no phone, no Telegram, no real token.
# Usage: sh scripts/test.sh   (needs Node 20+ and curl; MFC_TEST_VOICE=1 also checks voice, downloading ~500 MB once)
root=$(cd "$(dirname "$0")/.." && pwd)
# Where Claude Code and the Telegram plugin keep their files: never the developer's own here.
unset CLAUDE_CONFIG_DIR TELEGRAM_STATE_DIR
fail=0
ok() { echo "ok   $1"; }
ko() { echo "FAIL $1"; fail=1; }
check() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }

for f in "$root"/hooks/*.sh "$root"/scripts/*.sh "$root"/test/no-login/claude; do check "syntax $(basename "$f")" "sh -n '$f'"; done
check "syntax clawdino.mjs" "node --check '$root/server/clawdino.mjs'"
check "syntax simulate.mjs" "node --check '$root/test/simulate.mjs'"
check "json bot settings" "sh '$root/scripts/bot.sh' settings | node -e 'JSON.parse(require(\"fs\").readFileSync(0))'"
for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json hooks/hooks.json; do
  check "json $f" "node -e 'JSON.parse(require(\"fs\").readFileSync(\"$root/$f\"))'"
done

# A fitness folder and a home without the real Telegram token.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; kill $server 2>/dev/null' EXIT
trap 'exit 1' INT TERM
cp -R "$root/template/." "$tmp/folder/" 2>/dev/null || { mkdir -p "$tmp/folder" && cp -R "$root/template/." "$tmp/folder/"; }
sed -i.bak -e 's/^- Name:.*/- Name: Sam/' -e 's/^- Language:.*/- Language: en/' -e 's/^- Connections:.*/- Connections: Voice notes/' "$tmp/folder/profile.md"
hook() { (cd "$tmp/folder" && HOME="$tmp" sh "$root/hooks/$1" < "$root/test/fixtures/$2"); }

check "first-run: a set-up folder gets nothing" "[ -z \"\$(hook first-run.sh terminal.json)\" ]"
check "first-run: a fresh home gets the nudge" "(cd \"\$tmp\" && HOME=\"\$tmp\" sh \"\$root/hooks/first-run.sh\") | grep -q 'not set up yet'"
check "first-run: the bot session gets nothing" "[ -z \"\$(cd \"\$tmp\" && HOME=\"\$tmp\" MFC_CHANNEL=telegram sh \"\$root/hooks/first-run.sh\")\" ]"
input='{"prompt":"<channel source=\\"t\\" chat_id=\\"12\\" attachment_file_id=\\"F\\" id=\\"7\\">id=\\"x\\"</channel>"}'
. "$root/hooks/lib.sh"
check "attr: first exact name in the tag only" "[ \"\$(attr id)\" = 7 ] && [ \"\$(attr chat_id)\" = 12 ]"
check "context: channel message gets the context" "hook context.sh text.json | grep -q 'Fitness context'"
check "context: terminal prompt gets nothing" "[ -z \"\$(hook context.sh terminal.json)\" ]"
check "context: stays under the hook limit" "[ \$(hook context.sh text.json | wc -c) -lt 10000 ]"
check "context: the voice block comes last, with 3 exchanges" "[ \$(hook context.sh text.json | sed -n '/^--- voice/,\$p' | grep -c '^- ') -eq 3 ]"
# A copy with every part over its own cap, so the total cap is what cuts.
cp -R "$tmp/folder" "$tmp/big"
long=$(head -c 3000 /dev/zero | tr '\0' x)
for f in profile.md relationship.md plan.md; do echo "$long$long" >> "$tmp/big/$f"; done
for i in 1 2 3 4 5 6 7 8 9 10; do echo "$long" >> "$tmp/big/log/journal.md"; done
big() { (cd "$tmp/big" && HOME="$tmp" sh "$root/hooks/context.sh" < "$root/test/fixtures/text.json"); }
check "context: a huge folder never cuts the voice" "big | grep -q '^--- voice' && [ \$(big | wc -c) -lt 10000 ]"
check "context: a huge folder keeps the reminders" "big | grep -q '^--- reminders.md'"
mkdir -p "$tmp/bare/hooks" && cp "$root/hooks/context.sh" "$root/hooks/lib.sh" "$tmp/bare/hooks/"
check "context: includes relationship.md" "hook context.sh text.json | grep -q '^--- relationship.md'"
rm "$tmp/folder/relationship.md"
check "context: works without relationship.md" "hook context.sh text.json | grep -q '^--- voice' && ! hook context.sh text.json | grep -q relationship.md"
cp "$root/template/relationship.md" "$tmp/folder/"
mkdir -p "$tmp/new" && cp -R "$root/template/." "$tmp/new/"
check "context: during the setup, the setup skill instead of the voice" "(cd \"\$tmp/new\" && HOME=\"\$tmp\" sh \"\$root/hooks/context.sh\" < \"\$root/test/fixtures/text.json\") | grep -q '^--- setup' && ! (cd \"\$tmp/new\" && HOME=\"\$tmp\" sh \"\$root/hooks/context.sh\" < \"\$root/test/fixtures/text.json\") | grep -q '^--- voice'"
check "context: works without voice.md" "(cd \"\$tmp/folder\" && HOME=\"\$tmp\" sh \"\$tmp/bare/hooks/context.sh\" < \"\$root/test/fixtures/text.json\") | grep -q '^--- voice'"
# A profile with Windows line endings, as an editor or a git setting on Windows can leave it.
mkdir -p "$tmp/crlf"
cp -R "$root/template/." "$tmp/crlf/"
sed -i.bak 's/$/'"$(printf '\r')"'/' "$tmp/crlf/profile.md"
crlf() { (cd "$tmp/crlf" && HOME="$tmp" sh "$root/hooks/$1" < "$root/test/fixtures/text.json"); }
check "first-run: a Windows line ending is no name" "crlf first-run.sh | grep -q 'not set up yet'"
check "context: a Windows line ending is no name" "crlf context.sh | grep -q '^--- setup'"
sed -i.bak "s/^- Name:.*/- Name: Sam$(printf '\r')/; s/^- Usage stats:.*/- Usage stats: on$(printf '\r')/" "$tmp/crlf/profile.md"
check "first-run: a name with a Windows line ending counts" "[ -z \"\$(crlf first-run.sh)\" ]"
printf '0123456789abcdef0123456789abcdef\r\n' > "$tmp/crlf/.usage"
check "usage: an id with a Windows line ending still counts the day" "(cd '$tmp/crlf' && HOME='$tmp' CLAWDINO_URL=http://127.0.0.1:9 sh '$root/hooks/usage.sh') && grep -qx \"\$(date +%F) terminal\" '$tmp/crlf/.usage'"
if git -C "$root" rev-parse 2>/dev/null; then
  check "gitattributes: scripts keep LF endings on any clone" "git -C '$root' check-attr eol -- hooks/context.sh scripts/bot.sh | grep -c 'eol: lf' | grep -qx 2"
fi
check "voice: text message gets nothing" "[ -z \"\$(hook voice.sh text.json)\" ]"
check "voice: no token, no transcript" "[ -z \"\$(hook voice.sh voice.json)\" ]"
if [ "$MFC_TEST_VOICE" = 1 ]; then
  check "voice: test file transcribes" "(cd '$tmp/folder' && sh '$root/hooks/voice.sh' --file '$root/assets/voice-test.ogg' en) | grep -qi testing"
else
  echo "skip voice: test file (set MFC_TEST_VOICE=1)"
fi

# bot.sh against a fake claude, which answers from the files in $fake and logs each call; a fake curl answers for
# Anthropic, and for Telegram with the lines of $fake/tg, one per call (the last one stays).
# The fake bot's process is a script named server.ts, as the real one is.
fake="$tmp/fake"
mkdir -p "$fake/bin" "$tmp/cfg/channels/telegram"
echo 'TELEGRAM_BOT_TOKEN=1:test' > "$tmp/cfg/channels/telegram/.env"
echo 'sleep 60' > "$fake/server.ts"
cat > "$fake/bin/claude" <<'EOF'
#!/bin/sh
case $1 in
  --bg) echo "--bg $(echo "$*" | sed -n 's/.*--permission-mode \([^ ]*\).*/\1/p')" >> "$FAKE/calls" ;;
  *) echo "$1" >> "$FAKE/calls" ;;
esac
case $1 in
  -p) cat "$FAKE/p" ;;
  auth) cat "$FAKE/auth" ;;
  --bg) [ -f "$FAKE/refuse" ] && { cat "$FAKE/refuse"; exit 1; }
    sh "$FAKE/server.ts" >/dev/null 2>&1 & echo $! > "$CLAUDE_CONFIG_DIR/channels/telegram/bot.pid"; touch "$FAKE/session"
    echo "backgrounded · 0123abcd · fitness-telegram" ;;
  agents) dead=; case "$*" in *--all*) [ -f "$FAKE/noall" ] && { echo "error: unknown option '--all'" >&2; exit 1; }; [ -f "$FAKE/dead" ] && dead='{"id":"deadbeef","kind":"background","name":"fitness-telegram","state":"stopped"}' ;; esac
    [ -f "$FAKE/session" ] && printf '[{"id":"0123abcd","kind":"background","name":"fitness-telegram","state":"%s"%s}%s]\n' \
      "$(cat "$FAKE/state")" "$(cat "$FAKE/waiting")" "${dead:+,$dead}" || echo "[$dead]" ;;
  logs) printf '%b\n' "$(cat "$FAKE/screen")" ;;
  rm) rm -f "$FAKE/session"; kill "$(cat "$CLAUDE_CONFIG_DIR/channels/telegram/bot.pid")" 2>/dev/null ;;
esac
exit 0
EOF
cat > "$fake/bin/curl" <<'EOF'
#!/bin/sh
case "$*" in *api.anthropic.com*) [ -f "$FAKE/offline" ] && exit 7 || exit 0 ;; esac
case "$*" in *"-K -"*) cat >> "$FAKE/curl.in" ;; esac
head -1 "$FAKE/tg"
[ "$(wc -l < "$FAKE/tg")" -le 1 ] || sed -i.bak 1d "$FAKE/tg"
EOF
chmod +x "$fake/bin/claude" "$fake/bin/curl"
bot() { env FAKE="$fake" CLAUDE_CONFIG_DIR="$tmp/cfg" PATH="$fake/bin:$PATH" ${mode:+MFC_PERMISSION_MODE=$mode} sh "$root/scripts/bot.sh" "$@" 2>&1; }
# session STATE WAITING SCREEN: the next session's state, its permission prompt if any, and its screen (where spaces are cursor moves).
session() { echo "$1" > "$fake/state"; echo "$2" > "$fake/waiting"; echo "$3" > "$fake/screen"; : > "$fake/calls"; }
# unread N...: what Telegram says is waiting for the bot, call after call.
unread() { : > "$fake/tg"; for n in "$@"; do echo "{\"ok\":true,\"result\":{\"url\":\"\",\"pending_update_count\":$n}}" >> "$fake/tg"; done; }
: > "$fake/tg"
(cd "$tmp/folder" && FAKE="$fake" CLAUDE_CONFIG_DIR="$tmp/cfg" PATH="$fake/bin:$PATH" sh "$root/hooks/voice.sh" < "$root/test/fixtures/voice.json" >/dev/null)
check "voice: a voice message gets past the early exit to Telegram" "grep -q '/getFile?file_id=' '$fake/curl.in'"

# WhatsApp: the hooks with its channel's tags, and wa.sh's offline commands, next to the fake Telegram bot.
wa_dir="$tmp/cfg/channels/whatsapp"
mkdir -p "$wa_dir/inbox" "$tmp/elsewhere/inbox"
cat > "$fake/bin/uvx" <<'EOF'
#!/bin/sh
# Fake uvx: "transcribes" by writing a fixed text where whisper would.
while [ $# -gt 0 ]; do case $1 in --output_dir) out=$2; shift ;; *.ogg) f=$1 ;; esac; shift; done
n=$(basename "$f"); echo "sixty four two" > "$out/${n%.*}.txt"
EOF
chmod +x "$fake/bin/uvx"
for d in "$wa_dir" "$tmp/elsewhere"; do echo voice > "$d/inbox/1780000000000-3EB0C0FFEE02.ogg"; done
wa_hook() { sed "s|@WA_DIR@|$2|" "$root/test/fixtures/$1" | (cd "$tmp/folder" && HOME="$tmp" CLAUDE_CONFIG_DIR="$tmp/cfg" FAKE="$fake" PATH="$fake/bin:$PATH" sh "$root/hooks/$3"); }
check "first-run: the WhatsApp bot session gets nothing" "[ -z \"\$(cd \"\$tmp\" && HOME=\"\$tmp\" MFC_CHANNEL=whatsapp sh \"\$root/hooks/first-run.sh\")\" ]"
: > "$fake/curl.in"
check "context: a WhatsApp message gets the context" "wa_hook wa-text.json '' context.sh | grep -q 'Fitness context'"
sleep 1
check "context: a WhatsApp message never calls Telegram" "[ ! -s '$fake/curl.in' ]"
check "voice: a WhatsApp voice note from the inbox is transcribed" "wa_hook wa-voice.json '$wa_dir' voice.sh | grep -q 'sixty four two'"
check "voice: a WhatsApp path outside the inbox is ignored" "[ -z \"\$(wa_hook wa-voice.json '$tmp/elsewhere' voice.sh)\" ]"
check "voice: a path climbing out of the inbox is ignored" "[ -z \"\$(wa_hook wa-voice.json '$wa_dir/inbox/..' voice.sh)\" ]"
wa() { env HOME="$tmp" CLAUDE_CONFIG_DIR="$tmp/cfg" FAKE="$fake" PATH="$fake/bin:$PATH" sh "$root/scripts/wa.sh" "$@" 2>&1; }
check "json whatsapp settings" "wa settings '$tmp/folder' | node -e 'JSON.parse(require(\"fs\").readFileSync(0))'"
check "wa settings: the plugin on, the WhatsApp session off limits" "wa settings | grep -q '\"whatsapp@my-fitness-claw\": true' && wa settings | grep -q 'Read(/$wa_dir/wa.sqlite'"
check "wa owner: a number, digits only" "[ \"\$(wa owner '+55 61 99999-0000')\" = 'owner 5561999990000' ] && grep -q '\"owner\": \"5561999990000\"' '$wa_dir/config.json'"
check "wa owner: the self-chat" "[ \"\$(wa owner self)\" = 'owner self' ] && grep -q '\"owner\": \"self\"' '$wa_dir/config.json'"
check "wa owner: refuses a short number" "! wa owner 123 >/dev/null"
check "wa status: stopped without a bot" "[ \"\$(wa status)\" = stopped ]"
echo 'stuck: logged out' > "$wa_dir/bot.state"
check "wa status: a bot that stopped for a reason says why" "[ \"\$(wa status)\" = 'stuck: logged out' ]"
rm "$wa_dir/bot.state" "$wa_dir/config.json"
if command -v bun >/dev/null || [ -x "$HOME/.bun/bin/bun" ]; then
  echo ok > "$fake/p"
  unread 0
  echo '{"loggedIn":false}' > "$fake/auth"
  check "bot account: none without a login" "[ \"\$(bot account)\" = none ]"
  printf '{\n  "loggedIn": true,\n  "subscriptionType": "team"\n}\n' > "$fake/auth"
  check "bot account: company on Team" "[ \"\$(bot account)\" = company ]"
  printf '{\n  "loggedIn": true,\n  "subscriptionType": "max"\n}\n' > "$fake/auth"
  check "bot account: personal on Max" "[ \"\$(bot account)\" = personal ]"
  check "bot ready: yes when Claude answers" "[ \"\$(bot ready)\" = yes ]"
  echo 'Not logged in · Please run /login' > "$fake/p"
  check "bot ready: no without a login" "[ \"\$(bot ready)\" = no ]"
  check "bot start: refuses without a login" "bot start '$tmp/folder' | grep -q '^not logged in'"
  check "wa start: refuses without a login" "wa start '$tmp/folder' | grep -q '^not logged in'"
  touch "$fake/offline"
  check "bot ready: a login error is not mistaken for no connection" "[ \"\$(bot ready)\" = no ]"
  echo 'API Error: Connection error.' > "$fake/p"
  check "bot ready: offline without a connection" "[ \"\$(bot ready)\" = offline ]"
  check "bot start: refuses offline" "bot start '$tmp/folder' | grep -q '^offline'"
  rm "$fake/offline"
  echo ok > "$fake/p"
  echo 'Workspace not trusted. Run `claude` in the folder once and accept the trust prompt, then retry.' > "$fake/refuse"
  check "bot start: shows Claude Code's own refusal" "bot start '$tmp/folder' | grep -q '^Workspace not trusted'"
  rm "$fake/refuse"
  check "wa start: refuses an untrusted folder" "wa start '$tmp/folder' | grep -q '^folder not trusted'"
  printf '{"projects":{"%s":{"hasTrustDialogAccepted":true}}}\n' "$(cd "$tmp/folder" && pwd -P)" > "$tmp/cfg/.claude.json"
  check "wa start: refuses without an owner" "wa start '$tmp/folder' | grep -q '^no owner'"
  wa owner self >/dev/null
  check "wa start: refuses before pairing" "wa start '$tmp/folder' | grep -q '^not paired'"
  rm -f "$tmp/cfg/.claude.json" "$wa_dir/config.json"
  session working '' 'Bot\033[1Cstarted'
  echo '{"plugin:telegram:telegram":{"timestamp":1,"id":"x"},"other":{"timestamp":1,"id":"y"}}' > "$tmp/cfg/mcp-needs-auth-cache.json"
  mkdir -p "$tmp/cfg/jobs" && echo '["feedbeef"]' > "$tmp/cfg/jobs/pins.json"
  check "bot start: running when the session works" "[ \"\$(bot start '$tmp/folder')\" = running ]"
  check "bot start: forgets a cached plugin failure, and only that" "! grep -q telegram '$tmp/cfg/mcp-needs-auth-cache.json' && grep -q other '$tmp/cfg/mcp-needs-auth-cache.json'"
  pins() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).join(" "))' "$tmp/cfg/jobs/pins.json"; }
  check "bot start: pins the session, so an idle bot is never stopped, keeping other pins" "[ \"\$(pins)\" = 'feedbeef 0123abcd' ]"
  check "bot status: running" "[ \"\$(bot status)\" = running ]"
  unread 2 0
  check "bot status: a message being fetched is not deaf" "[ \"\$(bot status)\" = running ]"
  unread 2
  check "bot status: deaf when messages wait unread" "[ \"\$(bot status)\" = deaf ]"
  unread 0
  echo /elsewhere > "$tmp/cfg/channels/telegram/bot.root"
  check "bot status: outdated after the plugin updates" "[ \"\$(bot status)\" = outdated ]"
  session blocked '' 'Not\033[1Clogged\033[1Cin · Please run /login'
  check "bot status: stuck when the session can't answer" "[ \"\$(bot status)\" = 'stuck: not logged in' ]"
  bot stop >/dev/null
  check "bot stop: removes the session and its process" "[ ! -f '$fake/session' ] && grep -qx rm '$fake/calls' && [ \"\$(bot status)\" = stopped ]"
  check "bot stop: unpins it, keeping other pins" "[ \"\$(pins)\" = feedbeef ]"
  # A bot that ended on its own (Claude Code stopped it, or the computer ran out of memory) leaves its pin behind.
  touch "$fake/dead"; echo '["feedbeef","deadbeef"]' > "$tmp/cfg/jobs/pins.json"
  bot stop >/dev/null
  check "bot stop: also unpins and removes a bot that ended on its own" "[ \"\$(pins)\" = feedbeef ]"
  rm "$fake/dead"
  session working '' 'Bot\033[1Cstarted'
  bot start "$tmp/folder" >/dev/null; touch "$fake/noall"
  bot stop >/dev/null
  check "bot stop: still stops the bot on a Claude Code without --all" "[ ! -f '$fake/session' ] && [ \"\$(pins)\" = feedbeef ]"
  rm "$fake/noall"
  session blocked '' 'Not\033[1Clogged\033[1Cin · Please run /login'
  out=$(bot start "$tmp/folder")
  check "bot start: a login still stuck after a restart of the service says so" "[ \"\$out\" = \"background sessions not logged in: run 'claude auth login' in a terminal\" ]"
  check "bot start: restarts the background service once" "[ \$(grep -c '^daemon' '$fake/calls') = 1 ] && [ \$(grep -c '^--bg' '$fake/calls') = 2 ]"
  check "bot start: reads the screen before removing the session" "awk '/^--bg/ { b = 1 } b && /^logs/ { l = 1 } b && /^rm/ { r = 1; exit !l } END { exit !r }' '$fake/calls'"
  check "bot start: leaves no session behind" "[ ! -f '$fake/session' ]"
  session working '' '▎--channels\033[1Cblocked\033[1Cby\033[1Corg\033[1Cpolicy\033[1C(plugin:telegram@claude-plugins-official)'
  check "bot start: channels off by the organization" "bot start '$tmp/folder' | grep -q '^channels disabled by your organization'"
  session working '' 'Claude\033[1Cin\033[1CChrome\033[1Cis\033[1Cblocked\033[1Cby\033[1Corg\033[1Cpolicy'
  check "bot start: another feature blocked by policy is not about channels" "[ \"\$(bot start '$tmp/folder')\" = running ]"
  session working '' '▎--channels\033[1Cignored\033[1C(plugin:telegram@claude-plugins-official)\n▎Channels\033[1Care\033[1Cnot\033[1Ccurrently\033[1Cavailable'
  check "bot start: channels not available" "bot start '$tmp/folder' | grep -q '^channels not available on this account'"
  session blocked '' 'Something\033[1Celse'
  check "bot start: stuck for an unknown reason shows the screen" "bot start '$tmp/folder' | grep -q '^the bot did not start'"
  session blocked ',"waitingFor":"permission prompt"' 'Auto\033[1Cmode\033[1Cis\033[1Cunavailable\033[1Cfor\033[1Cyour\033[1Cplan'
  check "bot start: auto mode unavailable" "bot start '$tmp/folder' | grep -q '^auto mode unavailable'"
  session working '' 'Auto\033[1Cmode\033[1Cis\033[1Cunavailable:\033[1Cthe\033[1Cserver\033[1Creturned\033[1Cno\033[1Csafety\033[1Cverdict'
  check "bot start: a passing auto mode outage is not a plan limit" "[ \"\$(bot start '$tmp/folder')\" = running ]"
  session blocked ',"waitingFor":"permission prompt"' 'Do\033[1Cyou\033[1Cwant\033[1Cto\033[1Cproceed?'
  check "bot start: a permission prompt in auto mode is an error" "bot start '$tmp/folder' | grep -q '^waiting for a permission'"
  check "bot start: outside auto mode the bot asks on Telegram" "[ \"\$(mode=acceptEdits bot start '$tmp/folder')\" = running ]"
  session working '' 'Bot\033[1Cstarted'
  check "bot start: later starts keep the mode" "[ \"\$(bot start '$tmp/folder')\" = running ] && grep -qx -- '--bg acceptEdits' '$fake/calls'"
  bot stop >/dev/null
else
  echo "skip bot: fake sessions (needs Bun)"
fi

# A folder that moved to a server, and the server side: its time zone, and cron starting the bot after a reboot.
cp -R "$tmp/folder" "$tmp/moved"
sed -i.bak 's/^- Check-ins:.*/&\
- Timezone: Pacific\/Kiritimati\
- Server: sam@example.net/' "$tmp/moved/profile.md"
check "bot start: refuses in a folder that moved to a server" "bot start '$tmp/moved' | grep -q '^the bot runs on sam@example.net'"
check "wa start: refuses in a folder that moved to a server" "wa start '$tmp/moved' | grep -q '^the bot runs on sam@example.net'"
check "bot settings: TZ from Timezone" "bot settings '$tmp/moved' | node -e 'process.exit(JSON.parse(require(\"fs\").readFileSync(0)).env.TZ === \"Pacific/Kiritimati\" ? 0 : 1)'"
check "bot settings: no TZ without Timezone" "bot settings '$tmp/folder' | node -e 'process.exit(JSON.parse(require(\"fs\").readFileSync(0)).env.TZ === undefined ? 0 : 1)'"
# The hooks run 26 hours behind the folder's zone, so the two dates always differ.
moved() { (cd "$tmp/moved" && HOME="$tmp" TZ=Etc/GMT+12 sh "$root/hooks/context.sh" < "$root/test/fixtures/text.json"); }
check "context: dates in the folder's time zone" "moved | grep -q \"^Now: \$(TZ=Pacific/Kiritimati date '+%A %F')\""
printf '%s\r\n' '- Timezone: Pacific/Kiritimati' > "$tmp/crlf.md"
sed -i.bak '/^- Timezone:/d' "$tmp/moved/profile.md" && cat "$tmp/crlf.md" >> "$tmp/moved/profile.md"
check "context: a Windows line ending in Timezone still works" "moved | grep -q \"^Now: \$(TZ=Pacific/Kiritimati date '+%A %F')\""
sed -i.bak 's/^- Timezone:.*/- Timezone: ..\/..\/etc\/passwd/' "$tmp/moved/profile.md"
check "context: a bad Timezone is ignored" "moved | grep -q \"^Now: \$(TZ=Etc/GMT+12 date '+%A %F')\""
cat > "$fake/bin/crontab" <<'EOF'
#!/bin/sh
case $1 in
  -l) [ -f "$FAKE/crontab" ] && cat "$FAKE/crontab" || { echo "no crontab for this user" >&2; exit 1; } ;;
  -) cat > "$FAKE/crontab.new" && mv "$FAKE/crontab.new" "$FAKE/crontab" ;;
esac
EOF
printf '#!/bin/sh\necho Linux\n' > "$fake/bin/uname"
chmod +x "$fake/bin/crontab" "$fake/bin/uname"
echo '0 3 * * * backup' > "$fake/crontab"
check "bot autostart: adds the reboot line" "[ \"\$(bot autostart '$tmp/folder')\" = on ] && grep -q '^@reboot sh \"$tmp/cfg/channels/telegram/autostart.sh\"' '$fake/crontab'"
bot autostart "$tmp/folder" >/dev/null
check "bot autostart: twice keeps one line and the user's own" "[ \$(grep -c 'my-fitness-claw bot' '$fake/crontab') = 1 ] && grep -qx '0 3 \* \* \* backup' '$fake/crontab'"
# What cron runs at boot: the bot.sh of the version Claude Code has installed.
mkdir -p "$tmp/cfg/plugins" "$tmp/plugin/scripts"
printf '{\n  "plugins": {\n    "my-fitness-claw@m": [\n      {\n        "installPath": "%s/cache/m/my-fitness-claw/0.10.0",\n' "$tmp" > "$tmp/cfg/plugins/installed_plugins.json"
mkdir -p "$tmp/cache/m/my-fitness-claw/0.10.0/scripts" && echo 'echo "$1 $2"' > "$tmp/cache/m/my-fitness-claw/0.10.0/scripts/bot.sh"
check "bot autostart: at boot, runs the installed version's bot" "[ \"\$(sh '$tmp/cfg/channels/telegram/autostart.sh')\" = 'boot $tmp/folder' ]"
check "bot autostart: cron logs each boot" "grep -q '>> \"$tmp/cfg/channels/telegram/boot.log\" 2>&1 # my-fitness-claw bot\$' '$fake/crontab'"
check "bot noautostart: removes only its line" "[ \"\$(bot noautostart)\" = off ] && ! grep -q 'my-fitness-claw' '$fake/crontab' && grep -qx '0 3 \* \* \* backup' '$fake/crontab' && [ ! -f '$tmp/cfg/channels/telegram/autostart.sh' ]"

# The server against an unreachable Telegram: HTTP endpoints only.
port=18787
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(code http://127.0.0.1:$port/health)" = 000 ] || { ko "server: port $port is already in use"; exit 1; }
CLAWDINO_TOKEN=test TELEGRAM_API=http://127.0.0.1:9 PORT=$port CLAWDINO_EVENTS="$tmp/events.jsonl" node "$root/server/clawdino.mjs" >/dev/null 2>&1 &
server=$!
i=0
while [ "$(code http://127.0.0.1:$port/health)" = 000 ] && [ $i -lt 20 ]; do sleep 0.2; i=$((i + 1)); done
check "server: health waits for Telegram" "[ \$(code http://127.0.0.1:$port/health) = 503 ]"
check "server: unknown code is 404" "[ \$(code http://127.0.0.1:$port/claim/0123456789abcdef0123456789abcdef) = 404 ]"
check "server: valid ping is 204" "[ \$(code -X POST -d '{\"id\":\"0123456789abcdef0123456789abcdef\",\"day\":\"2026-06-01\",\"channel\":\"terminal\",\"v\":\"0.1.0\"}' http://127.0.0.1:$port/ping) = 204 ]"
check "server: a WhatsApp ping is 204" "[ \$(code -X POST -d '{\"id\":\"0123456789abcdef0123456789abcdef\",\"day\":\"2026-06-01\",\"channel\":\"whatsapp\",\"v\":\"0.1.0\"}' http://127.0.0.1:$port/ping) = 204 ]"
check "server: bad ping is 400" "[ \$(code -X POST -d '{\"id\":\"x\"}' http://127.0.0.1:$port/ping) = 400 ]"
check "server: texts never send the user to a terminal" "! sed -n '/^const TEXT/,/^};/p' '$root/server/clawdino.mjs' | grep -qi terminal"
check "server: the log exists and has no token" "[ -s '$tmp/events.jsonl' ] && ! grep -q 'CLAWDINO\\|test' '$tmp/events.jsonl'"

[ $fail = 0 ] && echo "all checks passed" || { echo "some checks failed"; exit 1; }
