#!/bin/sh
# The Telegram bot: a background Claude Code session in the fitness folder, running the official Telegram plugin.
#   bot.sh start <fitness folder>   stop any running bot, start a new one, pin it and wait until it answers; prints running or why not
#   bot.sh stop                     stop and remove every bot session
#   bot.sh status                   print running, stopped, stuck: <why>, deaf (messages wait unread) or outdated (the plugin updated since)
#   bot.sh ready                    print yes, no or offline: whether Claude Code's own login works (a background session needs it)
#   bot.sh account                  print personal, company (Team or Enterprise: an admin must allow channels) or none
#   bot.sh trusted <folder>         print yes if Claude Code trusts the folder (a background session needs it)
#   bot.sh settings [folder]        print the bot session's settings
#   bot.sh autostart <folder>       on a Linux server, start the bot again after each reboot (cron); noautostart undoes it
# MFC_PERMISSION_MODE=acceptEdits starts it outside auto mode, for accounts without it; later starts keep that mode.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/hooks/lib.sh"
# Over ssh and from cron the profile isn't read: the usual install places come last, so a PATH set on purpose wins.
PATH="$PATH:$HOME/.local/bin:$HOME/.bun/bin"
NAME=fitness-telegram
TAG='# my-fitness-claw bot'
PLUGIN=telegram@claude-plugins-official
BUN=$(command -v bun || echo "$HOME/.bun/bin/bun")
MODE=${MFC_PERMISSION_MODE:-$(cat "$TG_DIR/permission-mode" 2>/dev/null)}
case $MODE in acceptEdits | default) ;; *) MODE=auto ;; esac

# The plugin stays disabled everywhere else on purpose: enabled, any new Claude Code session would take over the bot.
# Telegram tools skip the permission check; the deny rules keep the bot's edit tools off its own rules, the plugin,
# Claude Code's settings and the bot token (a guard, not a sandbox: shell commands still follow the permission mode).
# Background sessions only write in a worktree by default; the bot writes the fitness folder itself, so that is off.
# On a server, TZ keeps the user's time zone (Timezone in profile.md) for dates and check-ins.
# The plugin and the inbox are working directories, so reading skills, evidence and the photos the user sends never stops the session with a question.
settings() {
  tz=$(timezone "${1:-.}")
  tz=${tz:+", \"TZ\": \"$tz\""}
  cat <<EOF
{
  "enabledPlugins": { "$PLUGIN": true },
  "env": { "PATH": "$HOME/.bun/bin:$HOME/.local/bin:$PATH", "MFC_CHANNEL": "telegram"$tz },
  "worktree": { "bgIsolation": "none" },
  "permissions": {
    "additionalDirectories": ["$ROOT", "$TG_DIR/inbox"],
    "allow": ["mcp__plugin_telegram_telegram__*", "Bash(sh $ROOT/scripts/ask.sh:*)", "Bash(sh $ROOT/scripts/keep.sh:*)", "Bash(sh $ROOT/hooks/voice.sh:*)", "Bash(date:*)"],
    "deny": ["Edit(CLAUDE.md)", "Edit(.claude/**)", "Edit(~/.claude/**)", "Read(/$TG_DIR/.env)",
             "Bash(claude mcp:*)", "Bash(claude plugin:*)"]
  }
}
EOF
}

# Background sessions use Claude Code's own login, which the desktop app doesn't share: ask for one word.
# A login error never starts with ok; only when the answer doesn't mention the login, no connection is told apart.
ready() {
  out=$(cd "${TMPDIR:-/tmp}" && claude -p 'Reply with the single word: ok' --model haiku 2>&1)
  printf '%s\n' "$out" | grep -qi '^[[:space:]]*ok' && { echo yes; return; }
  printf '%s\n' "$out" | grep -qi 'login' && { echo no; return; }
  curl -s -m 5 -o /dev/null https://api.anthropic.com/ && echo no || echo offline
}

# Team and Enterprise plans keep channels off until an admin turns them on.
account() {
  s=$(claude auth status --json 2>/dev/null | tr -d ' \t\r\n')
  case $s in *'"loggedIn":true'*) ;; *) echo none; return ;; esac
  case $s in *'"subscriptionType":"team"'* | *'"subscriptionType":"enterprise"'*) echo company ;; *) echo personal ;; esac
}

running() { ps -p "$(cat "$TG_DIR/bot.pid" 2>/dev/null)" -o args= 2>/dev/null | grep -q server.ts; }

# Telegram keeps messages until the bot fetches them: some still waiting 10 seconds later means the bot stopped listening
# (the plugin gives up after repeated conflicts with another poller of the same token, and its process stays up).
deaf() {
  for i in 1 2 3; do
    n=$(tg getWebhookInfo | sed -n 's/.*"pending_update_count":\([0-9]*\).*/\1/p')
    [ "${n:-0}" -gt 0 ] || return 1
    [ $i = 3 ] || sleep 5
  done
}

# The bot's sessions, one "id state waiting" line each (waiting: it asks for a permission); with all, also those that ended.
sessions() {
  claude agents --json ${1:+--all} 2>/dev/null |
    "$BUN" -e 'for (const s of JSON.parse(await Bun.stdin.text())) if (s.kind === "background" && s.name === "'$NAME'") console.log(s.id, s.state ?? "", s.waitingFor ? "waiting" : "")' 2>/dev/null
}

# stuck STATE: whether a session in that state can't answer; a permission prompt is fine outside auto mode,
# where the bot asks for it on Telegram.
stuck() {
  case $1 in
    blocked*waiting) [ "$MODE" = auto ] ;;
    blocked*) true ;;
    *) false ;;
  esac
}

# screen ID: the session's screen as text (it draws spaces as cursor moves; a cut character must not stop sed).
screen() {
  esc=$(printf '\033')
  claude logs "$1" 2>/dev/null | LC_ALL=C sed "s/${esc}\[[0-9]*C/ /g; s/${esc}\[[0-9;?]*[a-zA-Z]//g" | tr '\r' '\n' |
    LC_ALL=C sed 's/[[:space:]]*$//' | awk 'NF'
}

# why ID: what keeps the session from serving the bot, read from its screen, or nothing.
# Without a login Claude Code also says channels are not available, so the login comes first.
why() {
  s=$(screen "$1" | tr -d ' \t\n' | LC_ALL=C tr '[:upper:]' '[:lower:]')
  case $s in
    *notloggedin* | *run/login*) echo "not logged in" ;;
    *--channelsblockedbyorgpolicy* | *channelsarenotenabledforyourorg*)
      echo "channels disabled by your organization: an admin must turn on channels" ;;
    *--channelsignored* | *channelsarenotcurrentlyavailable* | *channelsarenotavailable*) echo "channels not available on this account" ;;
    *automodeisunavailableforyourplan* | *automodeunavailableforthismodel*)
      echo "auto mode unavailable: start it with MFC_PERMISSION_MODE=acceptEdits" ;;
  esac
}

# Claude Code skips a plugin server that failed in the last 15 minutes, even in a new session: a start always tries again.
forget_failure() {
  f="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/mcp-needs-auth-cache.json"
  [ -f "$f" ] || return 0
  F="$f" "$BUN" -e 'const j = JSON.parse(await Bun.file(process.env.F).text())
    if (j["plugin:telegram:telegram"]) { delete j["plugin:telegram:telegram"]; await Bun.write(process.env.F, JSON.stringify(j)) }' 2>/dev/null
}

# Claude Code stops a background session after an hour without messages, unless it is pinned (Ctrl+T in `claude agents`).
# pin add|remove ID...: edits Claude Code's list of pinned sessions, keeping the others; written whole, then renamed into place.
pin() {
  OP=$1 && shift
  OP=$OP IDS="$*" PINS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/jobs/pins.json" "$BUN" -e '
    const { mkdirSync, renameSync, writeFileSync } = require("fs"), f = process.env.PINS, ids = process.env.IDS.split(" ").filter(Boolean)
    let old = []
    try { old = JSON.parse(await Bun.file(f).text()) } catch {}
    if (!Array.isArray(old)) old = []
    const pins = process.env.OP === "add" ? [...new Set([...old, ...ids])] : old.filter((id) => !ids.includes(id))
    if (pins.length === old.length && pins.every((id, i) => id === old[i])) process.exit(0)
    mkdirSync(require("path").dirname(f), { recursive: true })
    writeFileSync(`${f}.${process.pid}`, JSON.stringify(pins, null, 2))
    renameSync(`${f}.${process.pid}`, f)' 2>/dev/null
}

# claude stop takes session ids, not names; claude rm drops stopped sessions from `claude agents`, and their pins go too,
# also for a bot that ended on its own (a Claude Code without --all lists only the live ones). The plugin's poller can
# outlive its session; it is killed too, so a new bot never shares the token with it.
stop() {
  ids=$(sessions all | cut -d' ' -f1)
  [ -n "$ids" ] || ids=$(sessions | cut -d' ' -f1)
  for id in $ids; do
    claude stop "$id" >/dev/null 2>&1
    claude rm "$id" >/dev/null 2>&1
  done
  [ -z "$ids" ] || pin remove $ids
  i=0
  while running && [ $i -lt 10 ]; do sleep 1; i=$((i + 1)); done
  running && kill "$(cat "$TG_DIR/bot.pid")" 2>/dev/null
  rm -f "$TG_DIR/bot.pid"
}

# Prints running, or why the bot can't serve: Claude Code's own message when it refuses to start (e.g. an untrusted folder),
# a reason from the session's screen, or its last lines.
# --channels takes several values: keep it before another option, never right before the prompt.
launch() {
  out=$(cd "$1" && claude --bg -n $NAME --model sonnet --effort low --permission-mode "$MODE" \
    --channels plugin:$PLUGIN --settings "$(settings "$1")" \
    "Bot started: follow Bot start in $ROOT/skills/coach/telegram.md." 2>&1) || { echo "$out" | head -3; return; }
  # The plugin's process comes up even when the session can't answer (no login, channels off), so the session is watched
  # a few seconds more. The first start installs the plugin's dependencies: up to 90 seconds.
  end=$(($(date +%s) + 90))
  up=0
  id=
  state=
  while [ "$(date +%s)" -lt $end ] && [ $up -lt 6 ]; do
    sleep 1
    running && up=$((up + 1))
    line=$(sessions | head -1)
    id=${line%% *}
    state=${line#"$id"}
    state=${state# }
    if stuck "$state"; then
      r=$(why "$id")
      [ -n "$r" ] && { echo "$r"; return; }
      case $state in *waiting) echo "waiting for a permission:"; screen "$id" | tail -5; return ;; esac
    fi
  done
  [ -n "$id" ] || { echo "the bot did not start:"; echo "$out" | tail -3; return; }
  r=$(why "$id")
  [ -n "$r" ] && { echo "$r"; return; }
  running && ! stuck "$state" && { echo running; return; }
  [ $up -gt 0 ] || { echo "the bot did not start: the Telegram plugin never came up"; return; }
  echo "the bot did not start:"
  screen "$id" | tail -5
}

case $1 in
  start)
    dir=$(cd "$2" 2>/dev/null && pwd)
    [ -f "$dir/profile.md" ] || { echo "usage: bot.sh start <fitness folder>"; exit 1; }
    # A folder that moved to a server stays here only as a record: two bots on one token would fight.
    server=$(sed -n 's/^- Server: *//p' "$dir/profile.md" | tr -d '\r' | head -1)
    [ -z "$server" ] || { echo "the bot runs on $server: this folder is only a copy"; exit 1; }
    case $(ready) in
      offline) echo "offline: no connection to Claude, try again when online"; exit 1 ;;
      no) echo "not logged in: run 'claude auth login', then start again"; exit 1 ;;
    esac
    stop
    forget_failure
    # Cut short (e.g. a tool's time limit), it leaves no half-started session behind.
    trap 'stop; exit 1' INT TERM
    out=$(launch "$dir")
    # The login works, so the background service still holds an older one: restart the service, keeping other sessions.
    if [ "$out" = "not logged in" ]; then
      stop
      claude daemon stop --any --keep-workers >/dev/null 2>&1
      out=$(launch "$dir")
      [ "$out" = "not logged in" ] && out="background sessions not logged in: run 'claude auth login' in a terminal"
    fi
    [ "$out" = running ] || { stop; echo "$out"; exit 1; }
    trap - INT TERM
    pin add "$(sessions | head -1 | cut -d' ' -f1)"
    # What status compares, and the mode later starts keep.
    echo "$ROOT" > "$TG_DIR/bot.root"
    [ -z "$MFC_PERMISSION_MODE" ] || echo "$MODE" > "$TG_DIR/permission-mode"
    echo running ;;
  stop) stop ;;
  status)
    line=$(sessions | head -1)
    id=${line%% *}
    state=${line#"$id"}
    if ! running; then echo stopped
    elif stuck "${state# }"; then r=$(why "$id"); echo "stuck: ${r:-see claude agents}"
    elif deaf; then echo deaf
    elif [ "$(cat "$TG_DIR/bot.root" 2>/dev/null)" != "$ROOT" ]; then echo outdated
    else echo running
    fi ;;
  settings) settings "$2" ;;
  # Cron runs a small script next to the token, which finds the plugin's installed version at boot time:
  # this script's own path changes with each update. Each boot's attempts go to boot.log.
  autostart)
    dir=$(cd "$2" 2>/dev/null && pwd)
    [ -f "$dir/profile.md" ] || { echo "usage: bot.sh autostart <fitness folder>"; exit 1; }
    [ "$(uname -s)" = Linux ] || { echo "autostart is for Linux servers"; exit 1; }
    command -v crontab >/dev/null || { echo "no crontab"; exit 1; }
    cat > "$TG_DIR/autostart.sh" <<EOF
#!/bin/sh
# Written by my-fitness-claw (bot.sh autostart) for cron: starts the Telegram bot after a reboot.
root=\$(sed -n 's|^ *"installPath": *"\\(.*/my-fitness-claw/[^/"]*\\)".*|\\1|p' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json" | head -1)
exec sh "\$root/scripts/bot.sh" boot "$dir"
EOF
    line="@reboot sh \"$TG_DIR/autostart.sh\" >> \"$TG_DIR/boot.log\" 2>&1 $TAG"
    { crontab -l 2>/dev/null | grep -vF "$TAG"; echo "$line"; } | crontab - && echo on ;;
  noautostart) { crontab -l 2>/dev/null | grep -vF "$TAG"; } | crontab - && rm -f "$TG_DIR/autostart.sh" && echo off ;;
  # After a reboot the network can come up late: try for about 10 minutes.
  boot)
    for i in 1 2 3 4 5 6 7 8 9 10; do
      out=$(sh "$0" start "$2")
      echo "$(date '+%F %T') $out"
      [ "$out" = running ] && exit 0
      sleep 60
    done
    exit 1 ;;
  ready) ready ;;
  account) account ;;
  # Trust lives in Claude Code's config, per folder, and covers the folders inside it.
  trusted)
    dir=$(cd "$2" 2>/dev/null && pwd -P) || { echo no; exit 0; }
    DIR="$dir" CONFIG="${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json" "$BUN" -e '
      const projects = JSON.parse(await Bun.file(process.env.CONFIG).text()).projects ?? {}
      let d = process.env.DIR
      for (;;) { if (projects[d]?.hasTrustDialogAccepted) { console.log("yes"); process.exit(0) }; if (d === "/") break; d = d.slice(0, d.lastIndexOf("/")) || "/" }
      console.log("no")' 2>/dev/null || echo no ;;
  *) echo "usage: bot.sh start <fitness folder> | stop | status | ready | account | trusted <folder> | settings [folder] | autostart <folder> | noautostart"; exit 1 ;;
esac
