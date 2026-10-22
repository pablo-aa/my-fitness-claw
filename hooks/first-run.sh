#!/bin/sh
# Until the setup is done (a Name in profile.md), nudge Claude to run it.
# The Telegram and WhatsApp bots greet new users themselves (Bot start in skills/coach/telegram.md and whatsapp.md).
case $MFC_CHANNEL in telegram | whatsapp) exit 0 ;; esac
dir=.
[ -f ./profile.md ] && [ -f ./plan.md ] || dir="$HOME/my-fitness"
grep -q '^- Name: *[^[:space:]]' "$dir/profile.md" 2>/dev/null && exit 0
for c in Telegram WhatsApp; do
  grep -q "^- Connections:.*$c" "$dir/profile.md" 2>/dev/null &&
    { echo "The my-fitness-claw setup is going on in $c: if the user brings it up, say it continues on the phone."; exit 0; }
done
echo "The my-fitness-claw plugin is installed but not set up yet. If the user greets you or says anything that is not clearly about another task, offer in one short line to set up their fitness coach, and use the my-fitness-claw:setup skill when they accept; if they already asked to train or get fit, use it right away, without announcing it."
