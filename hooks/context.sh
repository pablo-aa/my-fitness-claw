#!/bin/sh
# Faster Telegram replies: react with 👀 at once and hand the coach today's context with each channel message,
# so it can answer in a single turn without reading files first. Terminal prompts are left alone.
input=$(cat)
# Check-ins are most of what the bot sends, so they get the context and the voice too.
case "$input" in *'<channel source='* | *'"prompt":"Check-in:'*) ;; *) exit 0 ;; esac
[ -f ./profile.md ] || exit 0
. "$(dirname "$0")/lib.sh"
# On a server, the dates follow the user's own time zone (Timezone in profile.md).
tz=$(timezone .)
[ -z "$tz" ] || export TZ="$tz"

chat=$(attr chat_id)
msg=$(attr message_id)
case "$chat$msg" in *[!0-9-]*) chat= ;; esac
[ -n "$chat" ] && [ -n "$msg" ] &&
  tg setMessageReaction -o /dev/null -H 'content-type: application/json' \
    -d "{\"chat_id\":$chat,\"message_id\":$msg,\"reaction\":[{\"type\":\"emoji\",\"emoji\":\"👀\"}]}" >/dev/null 2>&1 &

# Hook output over 10,000 characters reaches the model only as a preview, so every part is capped.
PROFILE_MAX=2000
RELATIONSHIP_MAX=1500
PLAN_MAX=3500
SOUL_MAX=2500
TOTAL_MAX=9800
context() {
  {
    echo "Fitness context, read just now (no need to read these files again):"
    date '+Now: %A %F %H:%M'
    printf '\n--- profile.md\n'; head -c $PROFILE_MAX profile.md
    [ -f relationship.md ] && { printf '\n--- relationship.md\n'; head -c $RELATIONSHIP_MAX relationship.md; }
    printf '\n--- plan.md\n'; head -c $PLAN_MAX plan.md
    printf '\n--- reminders.md (open)\n'; grep '^- \[ \]' reminders.md | head -10
    printf '\n--- log/metrics.csv (header and last 5 rows)\n'; head -1 log/metrics.csv; tail -n +2 log/metrics.csv | tail -5
    printf '\n--- log/journal.md (last 10 lines)\n'; tail -10 log/journal.md
  } 2>/dev/null | head -c "$1"
}

# During the setup the setup skill sets the pace, not the daily voice.
if ! grep -q '^- Name: *[^[:space:]]' profile.md; then
  context $((TOTAL_MAX - 300))
  printf '\n\n--- setup\nThe setup is not done (no Name in profile.md): follow the my-fitness-claw:setup skill (load it if it is not loaded), with its cards and buttons; Name is written last.\n'
  exit 0
fi

# The voice goes last, and the context gets the room it leaves: the model weighs what is newest, and a long plan must
# never cut it. Who the coach is, in prose (a rulebook prompt gets rulebook replies), then three exchanges at random,
# so the tone comes through without one fixed template.
voice="$(dirname "$0")/../skills/coach/voice.md"
# Portuguese has its own voice: examples in English make it come out translated.
case $(sed -n 's/^- Language: *//p' profile.md | head -1) in pt* | [Pp]ortugu*) voice="$(dirname "$0")/../skills/coach/voice.pt-BR.md" ;; esac
text=$(printf '%s' "$input" | sed 's/.*"prompt":"//; s/<channel [^>]*>//' | tr 'A-Z' 'a-z')
block=$(
  printf '\n\n--- voice\n'
  # soul.md, when the user wrote one, is who the coach is: it takes the place of the voice file's own.
  if [ -s soul.md ]; then head -c $SOUL_MAX soul.md; echo; else sed -n '/^## Who/,/^## /{/^##/d;/^$/d;p;}' "$voice" 2>/dev/null; fi
  # Asked to be playful, a model jokes in every reply; a joke follows theirs, decided here for each message.
  case $text in
    (*kkk* | *haha* | *rsrs* | *😂* | *🤣* | *😅*) echo "They joked: you can play along, once." ;;
    (*) echo "No joke in this reply: the light tone comes from the words, never a punchline." ;;
  esac
  echo "learned.md wins over this. A few exchanges, for the tone only:"
  grep -E '^- (them|check-in)' "$voice" 2>/dev/null | awk 'BEGIN { srand() } { print rand() "\t" $0 }' | sort -n | cut -f2- | head -3
)
context $((TOTAL_MAX - ${#block}))
printf '%s\n' "$block"
exit 0
