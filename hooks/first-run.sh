#!/bin/sh
# Until the setup is done (a Name in profile.md), nudge Claude to run it.
# The Telegram bot greets new users itself (Bot start in skills/coach/telegram.md).
[ "$MFC_CHANNEL" = telegram ] && exit 0
dir=.
[ -f ./profile.md ] && [ -f ./plan.md ] || dir="$HOME/my-fitness"
grep -q '^- Name: *[^[:space:]]' "$dir/profile.md" 2>/dev/null && exit 0
grep -q '^- Connections:.*Telegram' "$dir/profile.md" 2>/dev/null &&
  { echo "The my-fitness-claw setup is going on in Telegram: if the user brings it up, say it continues on the phone."; exit 0; }
echo "The my-fitness-claw plugin is installed but not set up yet. If the user greets you or says anything that is not clearly about another task, offer in one short line to set up their fitness coach, and use the my-fitness-claw:setup skill when they accept; if they already asked to train or get fit, use it right away, without announcing it."
