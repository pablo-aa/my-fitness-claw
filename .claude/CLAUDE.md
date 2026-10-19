# my-fitness-claw

The public plugin repo.

- Never put anyone's personal data here: no real names, bodies, plans, logs, injuries or habits.
- Examples use the fictional user Sam (F, 31, 1.65 m, 64 kg, grinder, lower back).
- Personal fitness data lives in each user's own fitness folder, never in this repo.
- Everything in this repo is in English, one sentence per line in Markdown.
- Run `sh scripts/test.sh` after changing hooks, scripts or the server.
- Each rule lives in one place: coach behavior in `skills/coach/`, Telegram replies in `skills/coach/telegram.md`, connection steps in `skills/connect/`, commands in `scripts/` and `hooks/`.
- A release bumps `version` in `.claude-plugin/plugin.json` only.
