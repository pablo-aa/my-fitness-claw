#!/bin/sh
# Faster Telegram replies: react with 👀 at once and hand the coach today's context with each channel message,
# so it can answer in a single turn without reading files first. Terminal prompts are left alone.
input=$(cat)
case "$input" in *'<channel source='*) ;; *) exit 0 ;; esac
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
TOTAL_MAX=8800
{
  echo "Fitness context, read just now (no need to read these files again):"
  date '+Now: %A %F %H:%M'
  printf '\n--- profile.md\n'; head -c $PROFILE_MAX profile.md
  [ -f relationship.md ] && { printf '\n--- relationship.md\n'; head -c $RELATIONSHIP_MAX relationship.md; }
  printf '\n--- plan.md\n'; head -c $PLAN_MAX plan.md
  printf '\n--- reminders.md (open)\n'; grep '^- \[ \]' reminders.md | head -10
  printf '\n--- log/metrics.csv (header and last 5 rows)\n'; head -1 log/metrics.csv; tail -n +2 log/metrics.csv | tail -5
  printf '\n--- log/journal.md (last 10 lines)\n'; tail -10 log/journal.md
} 2>/dev/null | head -c $TOTAL_MAX

# During the setup the setup skill sets the pace, not the daily voice.
if ! grep -q '^- Name: *[^[:space:]]' profile.md; then
  printf '\n\n--- setup\nThe setup is not done (no Name in profile.md): follow the my-fitness-claw:setup skill (load it if it is not loaded), with its cards and buttons; Name is written last.\n'
  exit 0
fi

# The voice goes last and outside the cap: the model weighs what is newest, and a long plan must never cut it.
# Three exchanges drawn at random from voice.md keep the tone recognizable without one fixed template.
printf '\n\n--- voice\n'
echo "Reply as their training buddy texting back, not an app: the person before the data, a number only with what it means, no generic praise, no closing offer, no em dashes."
echo "learned.md and their level win over this. A few exchanges, for the tone only:"
grep -E '^- (them|check-in)' "$(dirname "$0")/../skills/coach/voice.md" 2>/dev/null | awk 'BEGIN { srand() } { print rand() "\t" $0 }' | sort -n | cut -f2- | head -3
exit 0
