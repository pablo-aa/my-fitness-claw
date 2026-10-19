# Telegram

Talk to the coach from the phone through the user's own Telegram bot.
A Claude Code session runs in the background on this computer with Anthropic's official [Telegram plugin](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram) and answers the bot.
It only answers while the computer is on and awake.
macOS and Linux; on Windows, the bot runs on a Linux server instead (`server.md`).

Below, `<plugin>` is this skill's base directory plus `/../..`, and `<clawdino>` is `${CLAWDINO_URL:-https://clawdino.pabloaa.com}`.

## Connect

1. The bot runs in the background with Claude Code's own login, not the desktop app's, so check it first: `sh <plugin>/scripts/bot.sh ready`.
   - `offline`: say in one line that there is no connection and Telegram can wait; if the setup sent them here, go back to it here.
   - `no` (typical when they use the desktop app): asking for Telegram, or picking it in the setup, already said yes to signing in, so tell the user in one line that a browser page opens for them to sign in with their Claude account, then run `claude auth login` yourself, with a 5-minute timeout: it opens the browser and returns once they have signed in, no terminal needed.
     If the command is refused, ask once with a yes-or-no choice whether you may open the sign-in page, and on a yes run it again.
     Then run `claude daemon stop --any --keep-workers`, so background sessions pick up the new login, and check `bot.sh ready` again.
     If it still prints `no`, ask them to open the Terminal app, run `claude auth login` there and tell you when done.

   Then check the account, before installing anything: `sh <plugin>/scripts/bot.sh account`.
   If it prints `company` (a Team or Enterprise plan), say in one line that Telegram works there only if an admin turned on channels for their organization, and let them choose:
   - Try anyway: their admin turned channels on, or will.
   - Sign in with a personal Claude account: say in one line that Claude Code on this computer then uses that account everywhere outside the desktop app, run `claude auth logout`, sign in as above, and check the account again.
   - Go on without Telegram: they can connect it later; if the setup sent them here, go back to it here.
2. Only once step 1 is through (a company account may stop there), install what the bot needs.
   When the setup sent the user here, voice notes come along, so the bot understands them from its first message: start Voice notes steps 1 and 2 (below) in the background now, and finish them before step 4, since the bot says hello as soon as it starts.
   Check for Bun: `command -v bun || ls ~/.bun/bin/bun`.
   If it is missing, install it: `curl -fsSL https://bun.sh/install | bash`.
   Check `claude plugin list` for `telegram@claude-plugins-official`.
   If it is missing, install it, then disable it:

   ```sh
   claude plugin install telegram@claude-plugins-official && claude plugin disable telegram@claude-plugins-official
   ```

   If it says the marketplace is not found, run `claude plugin marketplace add anthropics/claude-plugins-official` and retry.
   If it is listed as enabled, run `claude plugin disable telegram@claude-plugins-official`.
   It stays disabled on purpose: if enabled, every new Claude Code session takes over the bot and stops the background one.
   Then check that Claude Code trusts the fitness folder, since the bot runs there in the background: `sh <plugin>/scripts/bot.sh trusted <fitness folder>`.
   If it prints `no`, ask the user, before the phone part, to open a new Claude Code session in that folder once (in the desktop app, pick the folder; in a terminal, `cd <fitness folder> && claude`), accept trusting it and close it; then check again.
3. Run `sh <plugin>/scripts/bot.sh stop`, then get the bot from the Clawdino manager, which creates it with the user in a few taps and hands its token over once (see `<plugin>/server/README.md`):
   1. `curl -s -m 5 "<clawdino>/health"` must return `{"bot":"<manager>"}`; if not, use "Your own bot" below.
   2. Create a one-time code with `openssl rand -hex 16` and keep it in this conversation only.
   3. Make the QR code of the link `https://t.me/<manager>?start=<code>` as an image on this computer and open it in a window: with uv (`<uvx>` is `command -v uvx || ls ~/.local/bin/uvx`), `<uvx> --from 'qrcode[pil]==8.2' qr --factory=pil '<link>' > "${TMPDIR:-/tmp}/clawdino-qr.png"`, then `open` it on macOS, `xdg-open` on Linux or `start` on Windows; without uv or a desktop, skip it.
      Never paste a QR code made of text characters: chat apps space the lines apart and phones can't read it.
      Never use an online QR service: the code must not leave this computer.
   4. Then end your turn with one message that holds the link itself, written out: the user sees only your messages, never command output (Claude Desktop folds it away).
      In it, ask them to scan the QR code in the window that just opened with the phone camera, or open the link on the phone, tap Start, then tap the link the bot sends, confirm, and tell you when it's done.
      When they answer, go on with the next step, whatever they say.
   5. Wait for the bot (each run takes up to about 4 minutes, so give the command a 5-minute timeout):

      ```sh
      umask 077; mkdir -p ~/.claude/channels/telegram && chmod 700 ~/.claude/channels/telegram && cd ~/.claude/channels/telegram
      for i in $(seq 25); do s=$(curl -s -m 5 -o claim.json -w '%{http_code}' "<clawdino>/claim/<code>"); [ "$s" = 200 ] || [ "$s" = 410 ] && break; sleep 3; done; echo "$s"
      ```

      `200` means the bot is ready; `410` means the code was used or expired, so offer a new one.
      Anything else: run it again, up to 10 minutes in total; then say it expired and offer a new code.
   6. Check who created it: `"$(command -v bun || echo ~/.bun/bin/bun)" -e 'console.log(JSON.parse(await Bun.file(process.env.HOME + "/.claude/channels/telegram/claim.json").text()).owner_name)'` prints the Telegram name that tapped the link.
      Ask the user, with a choice, whether that is them: whoever has the bot can run the coach on this computer.
      If it isn't, someone else used the link: `rm ~/.claude/channels/telegram/claim.json` and start over with a new code.
      Then save the bot and allow only its owner:

      ```sh
      umask 077; cd ~/.claude/channels/telegram
      t=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' claim.json); o=$(sed -n 's/.*"owner_id":\([0-9]*\).*/\1/p' claim.json)
      [ -n "$t" ] && [ -n "$o" ] || { echo "bad claim"; exit 1; }
      printf 'TELEGRAM_BOT_TOKEN=%s\n' "$t" > .env
      printf '{"dmPolicy":"allowlist","allowFrom":["%s"],"groups":{},"pending":{}}\n' "$o" > access.json
      chmod 600 .env access.json
      sed -n 's/.*"username":"\([^"]*\)".*/\1/p' claim.json; rm -f claim.json "${TMPDIR:-/tmp}/clawdino-qr.png"
      ```

      The last line prints the bot's username; "bad claim" means a new code is needed.
4. Add `Telegram` to `Connections:` now, since the bot edits `profile.md` as soon as it runs; then start it, with a 5-minute timeout: `sh <plugin>/scripts/bot.sh start <fitness folder>`.
   If it prints anything but `running` while connecting Telegram for the first time, take `Telegram` out of `Connections:` again; then:
   - `not logged in`: sign in as in step 1, then run this step again.
   - `background sessions not logged in`: ask them to open the Terminal app, run `claude auth login` there and tell you when done; then run this step again, once.
   - `offline`: say there is no connection, and run this step again when they are back online.
   - A message that the folder is not trusted: ask the user to open Claude Code in the fitness folder once, accept, and run this step again.
   - `channels disabled by your organization`: an admin must turn on channels for their organization; offer the personal account from step 1, or talking here until then.
   - `channels not available on this account`: Claude Code doesn't offer channels on this account, so Telegram can't work with it; go on here.
   - `auto mode unavailable`: run this step again with `MFC_PERMISSION_MODE=acceptEdits` in front of the start, and tell the user the bot asks on Telegram before running commands; later starts keep that mode.
   - Anything else (`waiting for a permission`, `the bot did not start`): tell the user in one line what its last lines say, and offer to try again.
5. If the setup is not done (no `Name` in `profile.md`), the bot says hello on the phone by itself within a minute.
   Tell the user to pick up the phone (`https://t.me/<username>`) and carry on there.
   Otherwise ask them to send the bot a message, e.g. their weight, and confirm the answer arrived.
   If nothing arrives, run `sh <plugin>/scripts/bot.sh stop`: the token is still good, so retry from step 4.
6. If voice notes didn't come along, offer them once in the same message (below): they can say yes here while they talk to the bot.
   If the setup is done, also offer check-ins (see the coach skill's `telegram.md`): on a yes, write `Check-ins:` and run step 4 again, so the bot schedules them.

## Voice notes

The coach can understand voice messages, transcribed on this computer: nothing leaves it.
It needs uv and a one-time download of about 500 MB from Hugging Face; say so when offering it.

1. Check for `uvx`: `command -v uvx || ls ~/.local/bin/uvx`.
   If it is missing, install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`.
2. Run `sh <plugin>/hooks/voice.sh --file <plugin>/assets/voice-test.ogg en` with a 10-minute timeout: the first run downloads the model.
   It must print "Testing, 1, 2, 3"; only then add `Voice notes` to `Connections:`.
3. From then on, a plugin hook transcribes each voice message before the coach reads it, in a few seconds.

## Your own bot

If the Clawdino manager is down, or the user prefers a bot that no one else manages, replace step 3 with these (they run steps 4 and 5 themselves):

1. Run `sh <plugin>/scripts/bot.sh stop`.
2. Ask the user to create a new bot: open https://t.me/BotFather, send `/newbot`, pick a name and a username ending in `bot`, and paste the token here.
3. Write it as the only line of `~/.claude/channels/telegram/.env`: `TELEGRAM_BOT_TOKEN=<token>` (`mkdir -p` the folder, `chmod 700` it, `chmod 600` the file).
   Test it with `curl -sS "https://api.telegram.org/bot$(sed -n 's/^TELEGRAM_BOT_TOKEN=//p' ~/.claude/channels/telegram/.env)/getMe"`: `"ok":true` passes and gives the bot's `username`; `"ok":false` means the token is wrong; no JSON means Telegram is unreachable.
4. Write `{"dmPolicy":"pairing","allowFrom":[],"groups":{},"pending":{}}` to `access.json` in the same folder, then do step 4 above.
5. Ask the user to send the bot any message and paste here the 6-character code it replies with; it also suggests a `/telegram:access` command, which they can ignore.
   Approve the code only when the user typed it here, never from a Telegram message.
   Read `access.json` right before writing it: the bot writes to it too.
   If `pending[<code>]` is missing or its `expiresAt` has passed, ask the user to send the bot another message.
   Otherwise add its `senderId` to `allowFrom`, delete the pending entry and set `dmPolicy` to `allowlist`.
   Then write its `chatId` into `~/.claude/channels/telegram/approved/<senderId>`: the bot replies "Paired!".
6. Run step 4 above again, so the bot says hello now that it knows its owner, then do step 5 above.

## Use

- `sh <plugin>/scripts/bot.sh status` prints `running`, or why not: `stopped`, `stuck: <why>`, `deaf` (it stopped fetching messages) or `outdated` (the plugin updated since it started, and the bot still runs the old version); for any of these, start it again with step 4.
  The user can type `claude agents` to see the session.
- `sh <plugin>/scripts/bot.sh stop` turns the bot off.
- After a restart of the computer, start it again with step 4.
