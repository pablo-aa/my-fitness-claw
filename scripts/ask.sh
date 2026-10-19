#!/bin/sh
# Ask the Telegram bot's owner a question with tap-to-answer buttons.
#   ask.sh "<question>" "<option>" ["<option>"...]
# The buttons sit under the keyboard; a tap sends the option's text as a normal message, and they go away.
. "$(dirname "$0")/../hooks/lib.sh"
[ $# -ge 2 ] || { echo "usage: ask.sh <question> <option>..."; exit 1; }
# The owner is the first id in access.json, which the Telegram plugin rewrites in any JSON layout.
body=$(ACCESS="$TG_DIR/access.json" "$(command -v bun || echo "$HOME/.bun/bin/bun")" -e '
  const [text, ...options] = process.argv.slice(1)
  const owner = JSON.parse(await Bun.file(process.env.ACCESS).text()).allowFrom?.[0]
  if (!owner) process.exit(1)
  console.log(JSON.stringify({
    chat_id: owner, text,
    reply_markup: { keyboard: options.map(o => [{ text: o }]), one_time_keyboard: true, resize_keyboard: true },
  }))' "$@" 2>/dev/null) || { echo "no owner in access.json"; exit 1; }
tg sendMessage -H 'content-type: application/json' -d "$body" | grep -q '"ok":true' && echo sent || { echo "not sent"; exit 1; }
