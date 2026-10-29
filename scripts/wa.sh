#!/bin/sh
# The WhatsApp bot: an interactive Claude Code session in the fitness folder with this repo's WhatsApp channel,
# kept running by whatsapp/launch.ts (under launchd on macOS, detached on Linux).
#   wa.sh install                  install the WhatsApp plugin, disabled everywhere but in the bot; prints installed
#   wa.sh pair <number>            stop the bot and link it to that WhatsApp number; prints code XXXX-XXXX, paired <number> or failed: <why>
#   wa.sh paired                   wait until the code is typed on the phone; prints paired <number> or failed: <why>
#   wa.sh whoami                   print paired <number> or not paired
#   wa.sh unpair                   unlink the bot from WhatsApp and forget the session
#   wa.sh owner <number>|self      who the bot answers: another number (the bot has its own), or the self-chat
#   wa.sh start <fitness folder>   stop any running bot, start a new one and wait until it answers; prints running or why not
#   wa.sh stop                     stop the bot
#   wa.sh status                   print running, stopped, connecting, outdated or stuck: <why>
#   wa.sh settings [folder]        print the bot session's settings
#   wa.sh autostart <folder>       on Linux, start the bot again after each reboot (cron); noautostart undoes it
# MFC_PERMISSION_MODE=acceptEdits starts it outside auto mode, for accounts without it; later starts keep that mode.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/hooks/lib.sh"
PATH="$PATH:$HOME/.local/bin:$HOME/.bun/bin"
PLUGIN=${WA_PLUGIN:-whatsapp@my-fitness-claw}
LABEL=com.my-fitness-claw.whatsapp
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"
TAG='# my-fitness-claw whatsapp'
BUN=$(command -v bun || echo "$HOME/.bun/bin/bun")
mkdir -p "$WA_DIR" && chmod 700 "$WA_DIR"

# Like the Telegram bot's: the plugin stays disabled everywhere else, or every new session would link to WhatsApp too.
# The bot's edit tools stay off its rules, the plugin, Claude Code's settings and the WhatsApp session.
# The plugin and the inbox are working directories, so reading skills, evidence and the photos the user sends never stops the session with a question.
settings() {
  tz=$(timezone "${1:-.}")
  tz=${tz:+", \"TZ\": \"$tz\""}
  cat <<EOF
{
  "enabledPlugins": { "$PLUGIN": true },
  "env": { "PATH": "$HOME/.bun/bin:$HOME/.local/bin:$PATH", "MFC_CHANNEL": "whatsapp"$tz },
  "permissions": {
    "additionalDirectories": ["$ROOT", "$WA_DIR/inbox"],
    "allow": ["mcp__plugin_whatsapp_whatsapp__*", "Bash(sh $ROOT/scripts/keep.sh:*)", "Bash(sh $ROOT/hooks/voice.sh:*)", "Bash(date:*)"],
    "deny": ["Edit(CLAUDE.md)", "Edit(.claude/**)", "Edit(~/.claude/**)", "Edit(/$WA_DIR/**)", "Read(/$WA_DIR/wa.sqlite*)",
             "Bash(claude mcp:*)", "Bash(claude plugin:*)"]
  }
}
EOF
}

pair_ts() { "$BUN" "$ROOT/whatsapp/pair.ts" "$@"; }
# The pairing command runs from this copy of the plugin, which needs its own packages.
deps() { (cd "$ROOT/whatsapp" && "$BUN" install --production --frozen-lockfile --no-summary >/dev/null 2>&1); }

pid() { cat "$WA_DIR/bot.pid" 2>/dev/null; }
running() { p=$(pid); [ -n "$p" ] && kill -0 "$p" 2>/dev/null && ps -p "$p" -o args= 2>/dev/null | grep -q launch.ts; }
state() { sed -n 1p "$WA_DIR/$1" 2>/dev/null; }

stop() {
  # A boot that is still retrying would start it again a minute later (not when that boot is the caller).
  b=$(cat "$WA_DIR/boot.pid" 2>/dev/null)
  [ -z "$MFC_BOOT" ] && [ -n "$b" ] && ps -p "$b" -o args= 2>/dev/null | grep -q 'wa.sh boot' && kill "$b" 2>/dev/null
  # A pairing left waiting for its code holds the same WhatsApp session.
  [ -f "$WA_DIR/pair.pid" ] && pair_ts stop
  if [ "$(uname -s)" = Darwin ] && [ -f "$AGENT" ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1
    rm -f "$AGENT"
  fi
  running && kill "$(pid)" 2>/dev/null
  i=0
  while running && [ $i -lt 20 ]; do sleep 1; i=$((i + 1)); done
  running && kill -9 "$(pid)" 2>/dev/null
  # A channel server left behind would keep the WhatsApp session busy for the next one.
  s=$(cat "$WA_DIR/server.lock" 2>/dev/null)
  [ -n "$s" ] && ps -p "$s" -o args= 2>/dev/null | grep -q server.ts && kill "$s" 2>/dev/null
  rm -f "$WA_DIR/bot.pid"
  [ "$(state bot.state)" = running ] && echo stopped > "$WA_DIR/bot.state"
  return 0
}

# On macOS launchd keeps it running across logins; elsewhere it runs detached from this shell.
launch() {
  : > "$WA_DIR/bot.log"
  echo starting > "$WA_DIR/bot.state"
  if [ "$(uname -s)" = Darwin ]; then
    mkdir -p "$(dirname "$AGENT")"
    cat > "$AGENT" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BUN</string><string>$ROOT/whatsapp/launch.ts</string><string>run</string><string>$1</string></array>
  <key>WorkingDirectory</key><string>$1</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>WHATSAPP_STATE_DIR</key><string>$WA_DIR</string>${CLAUDE_CONFIG_DIR:+
    <key>CLAUDE_CONFIG_DIR</key><string>$CLAUDE_CONFIG_DIR</string>}${WA_PLUGIN:+
    <key>WA_PLUGIN</key><string>$WA_PLUGIN</string>}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$WA_DIR/launch.log</string>
  <key>StandardErrorPath</key><string>$WA_DIR/launch.log</string>
</dict>
</plist>
EOF
    launchctl bootstrap "gui/$(id -u)" "$AGENT" 2>&1 || return 1
  else
    # Its own lines go to launch.log: this function's output is only the outcome.
    "$BUN" "$ROOT/whatsapp/launch.ts" start "$1" >/dev/null || return 1
  fi
  # The first start installs the channel's packages: up to a few minutes.
  end=$(($(date +%s) + 240))
  while [ "$(date +%s)" -lt $end ]; do
    sleep 2
    s=$(state bot.state)
    case $s in
      running) w=$(state wa.state)
        case $w in open) echo running; return ;; logged* | not\ paired | replaced* | banned* | locked* | outdated* | stuck*) echo "$w"; return ;; esac ;;
      stuck* | stopped) echo "$s"; return ;;
    esac
  done
  echo "the bot did not start: $(state bot.state), WhatsApp $(state wa.state)"
}

case $1 in
  install)
    command -v claude >/dev/null || { echo "Claude Code is not installed"; exit 1; }
    list=$(claude plugin list 2>/dev/null)
    if ! printf '%s\n' "$list" | grep -q "$PLUGIN"; then
      claude plugin install "$PLUGIN" >/dev/null 2>&1 || { echo "could not install $PLUGIN"; exit 1; }
    fi
    claude plugin disable "$PLUGIN" >/dev/null 2>&1
    deps && echo installed || echo "could not install the WhatsApp packages (bun install)" ;;
  pair)
    n=$(printf '%s' "$2" | tr -cd 0-9)
    [ ${#n} -ge 10 ] || { echo "usage: wa.sh pair <number with country code>"; exit 1; }
    deps || { echo "could not install the WhatsApp packages (bun install)"; exit 1; }
    stop
    out=$(pair_ts start "$n")
    # Linked to another number: unlink it, then pair the new one.
    case $out in "failed: already linked"*) pair_ts unpair >/dev/null; out=$(pair_ts start "$n") ;; esac
    echo "$out" ;;
  paired) pair_ts wait ;;
  whoami) deps; pair_ts whoami ;;
  unpair) stop; deps; pair_ts unpair ;;
  owner)
    case $2 in
      self) n= && printf '{ "owner": "self" }\n' > "$WA_DIR/config.json" ;;
      *) n=$(printf '%s' "$2" | tr -cd 0-9)
        [ ${#n} -ge 10 ] || { echo "usage: wa.sh owner <number with country code>|self"; exit 1; }
        printf '{ "owner": "%s" }\n' "$n" > "$WA_DIR/config.json" ;;
    esac
    chmod 600 "$WA_DIR/config.json"
    echo "owner ${n:-self}" ;;
  start)
    dir=$(cd "$2" 2>/dev/null && pwd)
    [ -f "$dir/profile.md" ] || { echo "usage: wa.sh start <fitness folder>"; exit 1; }
    server=$(sed -n 's/^- Server: *//p' "$dir/profile.md" | tr -d '\r' | head -1)
    [ -z "$server" ] || { echo "the bot runs on $server: this folder is only a copy"; exit 1; }
    case $(sh "$ROOT/scripts/bot.sh" ready) in
      offline) echo "offline: no connection to Claude, try again when online"; exit 1 ;;
      no) echo "not logged in: run 'claude auth login', then start again"; exit 1 ;;
    esac
    [ "$(sh "$ROOT/scripts/bot.sh" trusted "$dir")" = yes ] ||
      { echo "folder not trusted: open Claude Code in the fitness folder once and accept"; exit 1; }
    [ -f "$WA_DIR/config.json" ] || { echo "no owner: run wa.sh owner <number>|self first"; exit 1; }
    deps
    case $(pair_ts whoami) in paired*) ;; *) echo "not paired: run wa.sh pair <number> first"; exit 1 ;; esac
    stop
    [ -z "$MFC_PERMISSION_MODE" ] || echo "$MFC_PERMISSION_MODE" > "$WA_DIR/permission-mode"
    out=$(launch "$dir")
    [ "$out" = running ] || { stop; echo "$out"; exit 1; }
    echo running ;;
  stop) stop; echo stopped ;;
  status)
    if ! running; then
      case $(state bot.state) in stuck*) state bot.state ;; *) echo stopped ;; esac
    else
      s=$(state bot.state)
      w=$(state wa.state)
      if [ "$s" != running ]; then echo "${s:-starting}"
      elif [ "$w" != open ]; then echo "${w:-connecting}"
      elif [ "$(cat "$WA_DIR/bot.root" 2>/dev/null)" != "$ROOT" ]; then echo outdated
      else echo running
      fi
    fi ;;
  settings) settings "$2" ;;
  autostart)
    dir=$(cd "$2" 2>/dev/null && pwd)
    [ -f "$dir/profile.md" ] || { echo "usage: wa.sh autostart <fitness folder>"; exit 1; }
    [ "$(uname -s)" = Darwin ] && { echo on; exit 0; } # launchd starts it at login already
    command -v crontab >/dev/null || { echo "no crontab"; exit 1; }
    cat > "$WA_DIR/autostart.sh" <<EOF
#!/bin/sh
# Written by my-fitness-claw (wa.sh autostart) for cron: starts the WhatsApp bot after a reboot.
root=\$(sed -n 's|^ *"installPath": *"\\(.*/my-fitness-claw/[^/"]*\\)".*|\\1|p' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json" | grep -v /whatsapp/ | head -1)
exec sh "\$root/scripts/wa.sh" boot "$dir"
EOF
    line="@reboot sh \"$WA_DIR/autostart.sh\" >> \"$WA_DIR/boot.log\" 2>&1 $TAG"
    { crontab -l 2>/dev/null | grep -vF "$TAG"; echo "$line"; } | crontab - && echo on ;;
  noautostart) { crontab -l 2>/dev/null | grep -vF "$TAG"; } | crontab - && rm -f "$WA_DIR/autostart.sh" && echo off ;;
  # After a reboot the network can come up late: try for about 10 minutes.
  boot)
    echo $$ > "$WA_DIR/boot.pid"
    for i in 1 2 3 4 5 6 7 8 9 10; do
      running && exit 0
      out=$(MFC_BOOT=1 sh "$0" start "$2")
      echo "$(date '+%F %T') $out"
      [ "$out" = running ] && exit 0
      sleep 60
    done
    exit 1 ;;
  *) echo "usage: wa.sh install | pair <number> | paired | whoami | unpair | owner <number>|self | start <folder> | stop | status | settings [folder] | autostart <folder> | noautostart"; exit 1 ;;
esac
