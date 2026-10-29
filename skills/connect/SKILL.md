---
name: connect
description: Connect the user's fitness folder to outside apps and channels. Use whenever the user wants the coach to get data by itself from any app, watch, scale or tracker, wants to talk to the coach somewhere other than this terminal (e.g. on the phone), wants voice messages understood, wants the coach on all the time or on their own server (or back from it), or asks what can be connected, however they phrase it.
---

# Connect

Each connection has its own guide in this skill's base directory:

| Connection | Guide | Brings |
|---|---|---|
| Telegram | `telegram.md` | The coach on the phone, voice notes included. |
| WhatsApp | `whatsapp.md` | The coach on WhatsApp, voice notes included. |
| Hevy | `hevy.md` | Workouts and routines. |
| Garmin | `wearables.md` | Steps, sleep, resting heart rate, weight. |
| Other watch | `wearables.md` | The same numbers, from a screenshot. |
| Server | `server.md` | The coach on all the time, on their own Linux server. |

Start by showing the connections card exactly as in `<this skill's base directory>/../coach/ascii.md`, with what is already connected, and connect what the user picks, one at a time; picking a connected one reconnects it.
Skip the card only when the user names one specific app or channel (e.g. "connect my Hevy"), or the setup sent you for one.
Questions about a need ("can you see my sleep?", "can I text you?") get the card, with the matching option pointed out.
Follow each guide step by step, in the user's language: one message per step that needs the user, and go straight on through the ones that don't.

## Rules

- A guide's own instructions win over these rules, except the install rule.
- Never show the user a command with a path inside the plugin: it changes with each update. To start, stop or restart the bot later, they just ask you.
- Run the plugin's scripts as written, without opening them first: what they print is what you need.
- A link the user must open goes in your message, written out: they may not see command output (Claude Desktop folds it away).
- The fitness folder is the current directory if it has a `profile.md` and a `plan.md`, otherwise `~/my-fitness`.
- If its `profile.md` is missing or has no `Name`, use the setup skill first, unless the setup sent you here.
- If it has `Server:`, the folder lives on that server: connect from a session there (Use in `server.md`), never in this copy.
- If the user asks for a source with no guide here, say in one line that it is not supported yet.
- When a guide needs a tool installed, say what it is and why in one line, ask once, then run the install yourself; if they decline, skip that connection.
  Picking Telegram in the setup's choice screen already said yes to its installs.
- Connect only in a terminal session; from Telegram or WhatsApp, name the options in a few lines (see the coach skill).
- On Windows, the Telegram bot can only run on a Linux server: if they pick Telegram, say so in one line and offer Server instead, which creates the bot there.
- Secrets go in the fitness folder's `.env`, one `KEY=value` per line, with `chmod 600 .env`.
- Never print secrets, never put them in another file, never commit them.
- Before writing `.env`, make sure `.gitignore` lists it; add the line if it is missing.
- Every connection ends with a real test.
- Only after it passes, add the connection to the `Connections:` line in `profile.md` (create it under `Language:` if missing) and say it is connected in one line.
- `Connections:` is a comma-separated list: add or remove only the item at hand, keeping the others as they are.
- If the test fails, remove the key and the source from `Connections:` (keep `.gitignore`), and say why in one line.
- If the fitness folder is a git repo, commit `profile.md` and `.gitignore`: `git add profile.md .gitignore && git commit -m "connect: <name>"`.
