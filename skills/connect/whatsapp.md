# WhatsApp

Talk to the coach on WhatsApp.
A Claude Code session runs in the background on this computer with this plugin's WhatsApp channel, linked to a WhatsApp account as one more device, as WhatsApp Web is.
It only answers while the computer is on and awake; to keep it on all the time, it runs on a Linux server instead (WhatsApp in `server.md`).
macOS and Linux.

Below, `<plugin>` is this skill's base directory plus `/../..`.

## Two ways

- **A number just for the bot** (recommended): the coach is a contact of its own and its messages notify the phone like any other.
  It needs a second WhatsApp account: a second chip, or WhatsApp Business on the same phone with another number.
- **Their own number**: they talk to the coach in the chat with themselves ("Message yourself"); it works, but WhatsApp never notifies messages from a linked device there, so replies and check-ins arrive silently.

WhatsApp doesn't allow unofficial apps like this one, and it can ban a number that behaves like a bot; a number just for the bot keeps their own out of that risk.

## Connect

1. Check the login and the account exactly as in step 1 of `telegram.md`, with WhatsApp in place of Telegram.
2. Say in two short lines what the two ways are and the ban risk, then ask with a choice: a number just for the bot (recommended), or their own number.
3. Install what the bot needs (Bun as in step 2 of `telegram.md`), then `sh <plugin>/scripts/wa.sh install`, which must print `installed`.
   If it says the plugin could not be installed, run `claude plugin marketplace update my-fitness-claw` and try again.
   When the setup sent the user here, start Voice notes steps 1 and 2 of `telegram.md` in the background now, and finish them before step 7.
   Check that Claude Code trusts the fitness folder as in step 2 of `telegram.md`.
4. Ask for the number the bot will use, with the country code: the bot's own number, or their own with the second way.
   Run `sh <plugin>/scripts/wa.sh pair <number>`, with a 2-minute timeout.
   - `code XXXX-XXXX`: end your turn with one message holding the code, written out, and how to type it on the phone that has that number: WhatsApp, Settings, Linked devices, Link a device, then "Link with phone number instead", and type the code; ask them to tell you when it's done.
     When they answer, whatever they say, run `sh <plugin>/scripts/wa.sh paired`, with a 5-minute timeout.
   - `paired <number>`: linked; go on.
   - `failed: <why>`: if the code expired, run the pair command again for a new one.
     If the phone says the number or the code is wrong and it is a Brazilian mobile number, WhatsApp may know it without the 9 after the area code (or with it): run the pair command with the other form once.
     Anything else: tell the user in one line and stop here.
5. Who the bot answers:
   - With a number just for the bot, ask for their own number, the one they will write from, and run `sh <plugin>/scripts/wa.sh owner <their number>`.
   - With their own number, run `sh <plugin>/scripts/wa.sh owner self`.
   One bot per number: if another bot or app already answers on that number, both would reply.
6. Voice notes, if they don't have them yet: offer them as in step 6 of `telegram.md`.
7. Add `WhatsApp` to `Connections:` now, since the bot edits `profile.md` as soon as it runs; then start it, with a 5-minute timeout: `sh <plugin>/scripts/wa.sh start <fitness folder>`.
   If it prints anything but `running` while connecting WhatsApp for the first time, take `WhatsApp` out of `Connections:` again; then:
   - `not logged in`, `offline`, `folder not trusted`, `channels disabled by your organization`, `channels not available on this account`, `auto mode unavailable`: as in step 4 of `telegram.md`, with `wa.sh` in place of `bot.sh`.
   - `not paired` or `logged out`: the link is gone (unlinked on the phone, or WhatsApp dropped it); pair again from step 4.
   - `replaced: ...`: another copy of the bot (another computer or a server) uses this same link; stop it there first, then run this step again.
   - `banned: ...` or `locked: ...`: WhatsApp blocked that number; say so plainly, and offer Telegram instead.
   - Anything else (`stuck: ...`, `the bot did not start`): tell the user in one line what it says, and offer to try again.
8. If the setup is not done (no `Name` in `profile.md`), the bot says hello on WhatsApp by itself within a minute: from the bot's number, or in their chat with themselves.
   Tell the user to pick up the phone and carry on there.
   Otherwise ask them to send the coach a message, e.g. their weight, and confirm the answer arrived.
   If the setup is done, also offer check-ins (see the coach skill's `telegram.md`): on a yes, write `Check-ins:` and run step 7 again, so the bot schedules them.

## Use

- `sh <plugin>/scripts/wa.sh status` prints `running`, or why not: `stopped`, `connecting` (WhatsApp is reconnecting), `outdated` (the plugin updated since it started), `logged out`, or `stuck: <why>`; start it again with step 7, or pair again for `logged out`.
- `sh <plugin>/scripts/wa.sh stop` turns the bot off.
- On macOS it starts again by itself after a restart of the computer, once the user logs in.
  On Linux, `sh <plugin>/scripts/wa.sh autostart <fitness folder>` must print `on` to start it after each reboot.
- To move the bot to another number, pair that number (step 4), then steps 5 and 7.
- `sh <plugin>/scripts/wa.sh unpair` unlinks it from the phone and forgets the session.
