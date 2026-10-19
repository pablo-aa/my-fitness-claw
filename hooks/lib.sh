# Shared by the Telegram hooks and scripts. Source it with `. lib.sh` after setting $input when reading a channel tag.

# Where the official Telegram plugin keeps its token, access list and pid (it follows the same variables).
TG_DIR="${TELEGRAM_STATE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/channels/telegram}"

# attr NAME: the value of the first NAME="..." in the channel tag of $input, never in the message text after the tag
# (the hook payload is JSON, so quotes arrive escaped; the leading space keeps `id` from matching `file_id`).
attr() { printf '%s' "$input" | sed 's/>.*//' | grep -o " $1=\\\\*\"[^\"\\\\]*" | head -1 | sed 's/.*"//'; }

# tg METHOD [curl args...]: call the Bot API with the token read from the plugin's .env.
# The URL goes through stdin (curl -K -), so the token never shows on the command line.
tg() {
  _token=$(sed -n 's/^TELEGRAM_BOT_TOKEN=//p' "$TG_DIR/.env" 2>/dev/null)
  [ -n "$_token" ] || return 1
  _method=$1
  shift
  printf 'url = "https://api.telegram.org/%s/%s"\n' "bot$_token" "$_method" | curl -s -m 10 -K - "$@" 2>/dev/null
}

# tg_file PATH OUT: download a file the Bot API returned in getFile.
tg_file() {
  _token=$(sed -n 's/^TELEGRAM_BOT_TOKEN=//p' "$TG_DIR/.env" 2>/dev/null)
  [ -n "$_token" ] || return 1
  printf 'url = "https://api.telegram.org/file/%s/%s"\n' "bot$_token" "$1" | curl -sf -m 15 -K - -o "$2" 2>/dev/null
}

# timezone FOLDER: the IANA time zone in its profile.md (Timezone, written when it moved to a server), if this system has it.
timezone() {
  _tz=$(sed -n 's/^- Timezone: *//p' "$1/profile.md" 2>/dev/null | tr -d '\r' | sed 's/[[:space:]]*$//' | head -1)
  case $_tz in '' | /* | *..* | *[!A-Za-z0-9/_+-]*) return ;; esac
  [ -f "/usr/share/zoneinfo/$_tz" ] && echo "$_tz"
}
