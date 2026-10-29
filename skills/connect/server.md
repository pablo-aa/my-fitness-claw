# Server

Keep the coach on all the time: the fitness folder and the Telegram bot move, once, to a Linux server the user already has.
From then on the server is the coach's only home: nothing syncs, and the copy on this computer stays as a record.
It needs a Linux server they reach with `ssh` and a key; a small VPS is enough, and voice notes need about 2 GB of memory there.
You run every step from here over `ssh`; the user types one command, to sign in to Claude on the server.

Below, `<plugin>` is this skill's base directory plus `/../..`, `<server>` is what the user gives in step 1, and `<folder>` is the fitness folder here.
Run commands on the server as a quoted here-document, so their quotes survive, starting with these two lines (`ssh <server> '<command>'` doesn't read the shell's profile):

```sh
ssh <server> sh -s <<'EOF'
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
bot="$(sed -n 's|^ *"installPath": *"\(.*/my-fitness-claw/[^/"]*\)".*|\1|p' ~/.claude/plugins/installed_plugins.json | head -1)/scripts/bot.sh"
<commands, e.g. sh "$bot" status>
EOF
```

## Move

If `profile.md` here has `Server:`, the coach already lives there: never copy this folder over it; see Use.

1. Ask for the server, as `user@host` or a name from their `~/.ssh/config`, and test it: `ssh -o BatchMode=yes -o ConnectTimeout=10 <server> true`.
   - `Host key verification failed`: ask them to run `ssh <server>` once in their terminal, check and accept the key, and tell you when done.
   - Any other failure: say in one line that you need to reach it with an SSH key, no password (e.g. after `ssh-copy-id <server>` in their terminal, Git Bash on Windows), and stop.
     On Windows, a key kept in the Windows ssh-agent only works with its own ssh: try `/c/Windows/System32/OpenSSH/ssh.exe` in place of `ssh` before giving up.
2. Check it in one command: `uname -s`, the memory (`free -m`), and that `curl`, `git`, `unzip`, `tar` and `crontab` exist.
   Not Linux: say it isn't supported, and stop.
   Something missing: give the user the one line that installs it as root (e.g. `sudo apt install -y curl git unzip cron`), and wait until they say it's done.
3. Install on the server what it lacks:
   - Claude Code, if `claude` isn't found: `curl -fsSL https://claude.ai/install.sh | bash`.
   - Bun, if `~/.bun/bin/bun` isn't there: `curl -fsSL https://bun.sh/install | bash`.
   - This plugin, from the marketplace it came from here: `claude plugin marketplace list --json` here shows its `repo` or `url`; a local `path` doesn't exist on the server, so use `pablo-aa/my-fitness-claw` then.
     If `MFC_MARKETPLACE` is set here, use its value instead.
     Then, there, `claude plugin marketplace add <source> && claude plugin install my-fitness-claw@<marketplace name>`; if it was already installed, `claude plugin update my-fitness-claw@<marketplace name>`.
   - The Telegram plugin, installed and disabled, as in step 2 of `telegram.md`.
   - Voice notes, only if the server has 2 GB of memory or more: Voice notes in `telegram.md`, run there.
     With less, say in one line that voice notes stay off there.
4. Create the folder there (`mkdir -p ~/my-fitness`), and ask the user to run this once in their terminal: sign in to Claude, accept trusting the folder, ignore any offer to set up a coach (the folder is still empty), and type `/exit`:

   ```
   ssh -t <server> 'cd ~/my-fitness && PATH="$HOME/.local/bin:$PATH" claude'
   ```

   Then check there: `sh "$bot" ready` must print `yes`, and `sh "$bot" trusted ~/my-fitness` `yes`.
   If `sh "$bot" account` prints `company`, warn them as in step 1 of `telegram.md`.
5. Write `- Timezone: <zone>` in `profile.md` here, under `Check-ins:`, with this computer's IANA time zone: servers usually run on UTC, and check-ins and dates must keep the user's time.
   macOS: `readlink /etc/localtime | sed 's|.*/zoneinfo/||'`; Linux: `timedatectl show -p Timezone --value`; Windows: `powershell -NoProfile -Command "(Get-TimeZone).Id"`, turned into its IANA name, confirmed with the user in one line.
6. Stop the bot here if it runs (`sh <plugin>/scripts/bot.sh stop`).
   If anything below fails, see When it fails.
7. Copy the folder into a new one there; only when both sides count the same files, swap it in, keeping any older folder:

   ```sh
   COPYFILE_DISABLE=1 tar -C <folder> -cf - . | ssh <server> 'umask 077 && rm -rf ~/my-fitness.new && mkdir ~/my-fitness.new && tar -C ~/my-fitness.new -xf - && find ~/my-fitness.new -type f | wc -l'
   find <folder> -type f | wc -l
   ssh <server> 'cd ~ && { [ ! -e my-fitness ] || rmdir my-fitness 2>/dev/null || mv my-fitness "my-fitness.bak-$(date +%F-%H%M%S)"; } && mv my-fitness.new my-fitness && chmod 700 my-fitness'
   ```

   If the bot ran here, copy its files too, keeping any the server already had:

   ```sh
   cd ~/.claude/channels/telegram && COPYFILE_DISABLE=1 tar -cf - .env access.json $(ls permission-mode 2>/dev/null) | ssh <server> 'umask 077 && mkdir -p ~/.claude/channels/telegram && cd ~/.claude/channels/telegram && for f in .env access.json; do [ ! -f $f ] || cp -p $f $f.bak; done && tar -xf -'
   ```

8. Write `- Server: <server>` in `profile.md` here, under `Timezone:`, right away: this copy is now a record, and the bot can't start here anymore.
9. Fix up the copy there, editing `~/my-fitness/profile.md` one item at a time:
   - Take `Garmin` out of `Connections:`: its login stays on this computer; on the server they send screenshots of the watch app.
   - Take `Voice notes` out too if voice stayed off in step 3.
   - If the folder is a git repo, give it the git name and email it has here (`git config user.name`, `git config user.email`), or `Clawdino` and `clawdino@localhost`: `git -C ~/my-fitness config user.name '<name>'`, and the same for the email.
   - `sh "$bot" settings ~/my-fitness` must show `"TZ"`; if not, the server lacks time zone data: give them `sudo apt install -y tzdata`.
10. Start the bot there:
    - If it ran here: `sh "$bot" start ~/my-fitness`, with a 5-minute timeout, must print `running`; anything else, as in step 4 of `telegram.md`.
    - If there was no bot yet: create it with step 3 of `telegram.md`, running its commands there in the here-document, with `<plugin>` being the plugin there (`$bot` without `/scripts/bot.sh`); show the link and the QR code here.
      Then its step 4 there.

    Then make it start again after each reboot: `sh "$bot" autostart ~/my-fitness` must print `on`.
11. Tell the user in a few short lines: the coach now answers on Telegram all the time; Garmin doesn't move with it, so send screenshots of the watch app instead; the server has no browser, so the plan comes as a page they print from the phone; and they can ask you here to check on it, update it or bring it back.

### When it fails

- Before step 8: start the bot here again (`sh <plugin>/scripts/bot.sh start <folder>`), then tell the user what failed.
- From step 8 on, never leave two bots on one token: stop it there first (`sh "$bot" stop; sh "$bot" noautostart`, then `sh "$bot" status` must print `stopped`), take `Server:` out here, and start the bot here again.
- If the server can't be reached at all, start nothing here, since a bot may still run there: tell the user, and try again later.
- On Windows there is no bot here to go back to: copy no bot files and start nothing here; take `Telegram` and `Voice notes` out of `Connections:` here and say Telegram is off until the bot runs on a server again.

## Use

When the user asks here, a terminal session on this computer, run it on the server:

- How it is: `sh "$bot" status`; anything but `running`: `sh "$bot" start ~/my-fitness`, with a 5-minute timeout.
- Stop it: `sh "$bot" stop`, plus `sh "$bot" noautostart` to keep it off after reboots.
- Update the plugin there: `claude plugin marketplace update <marketplace name> && claude plugin update my-fitness-claw@<marketplace name>`, then start the bot again, since it keeps the old version until then.
- Sign in again, when the bot says it is not logged in: the same `ssh -t` command as in step 4.
- Connect something (Hevy, voice notes) or talk to the coach in a terminal there: `ssh -t <server> 'cd ~/my-fitness && TZ=<zone> PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH" claude'`, with the zone from `Timezone:`, then ask that coach.

## WhatsApp

The WhatsApp bot moves the same way, alongside Move above, with these steps in place of the Telegram ones:

- Step 3: also run `sh "$bot"` with `wa.sh install` in place of `bot.sh` there (`wa="$(dirname "$bot")/wa.sh"`), which must print `installed`.
- Step 6: stop it here (`sh <plugin>/scripts/wa.sh stop`): one link must never run in two places, or WhatsApp keeps kicking one of them off (`replaced`).
- Step 7: copy its link and owner instead of the Telegram files, keeping any the server already had:

  ```sh
  cd ~/.claude/channels/whatsapp && COPYFILE_DISABLE=1 tar -cf - wa.sqlite config.json $(ls permission-mode 2>/dev/null) | ssh <server> 'umask 077 && mkdir -p ~/.claude/channels/whatsapp && cd ~/.claude/channels/whatsapp && for f in wa.sqlite config.json; do [ ! -f $f ] || cp -p $f $f.bak; done && tar -xf -'
  ```

- Step 10: `sh "$wa" start ~/my-fitness`, with a 5-minute timeout, must print `running` (anything else, as in step 7 of `whatsapp.md`), then `sh "$wa" autostart ~/my-fitness` must print `on`.
  With no bot here yet, link it there instead: steps 4 to 7 of `whatsapp.md`, running its commands there.
- When it fails, Use and Bring it back work the same, with `wa.sh` in place of `bot.sh` and these files in place of the Telegram ones.

## Bring it back

1. On the server: `sh "$bot" stop` and `sh "$bot" noautostart`; `sh "$bot" status` must print `stopped`.
2. Copy the folder back into a new one here, the bot's files too, and swap it in once both sides count the same files, keeping this copy as a backup:

   ```sh
   ssh <server> 'tar -C ~/my-fitness -cf - .' | { umask 077 && rm -rf <folder>.new && mkdir <folder>.new && tar -C <folder>.new -xf -; }
   ssh <server> 'find ~/my-fitness -type f | wc -l'; find <folder>.new -type f | wc -l
   mv <folder> "<folder>.bak-$(date +%F-%H%M%S)" && mv <folder>.new <folder>
   ssh <server> 'cd ~/.claude/channels/telegram && tar -cf - .env access.json $(ls permission-mode 2>/dev/null)' | (umask 077 && mkdir -p ~/.claude/channels/telegram && tar -C ~/.claude/channels/telegram -xf -)
   ```

3. The copy from the server has no `Server:`; if `profile.md` still has one, take it out.
   Then start the bot here: `sh <plugin>/scripts/bot.sh start <folder>`, with a 5-minute timeout.
   On Windows, skip the bot's files in step 2 and this start; take `Telegram` and `Voice notes` out of `Connections:` instead, and say Telegram is off until the bot runs on a server again.
4. Say the coach is back on this computer, and that the server keeps its copy until they delete `~/my-fitness` there.

If the server is gone for good, there is nothing to copy back: with the user's yes, take `Server:` out of `profile.md` here and start the bot here, from this record.
If that server ever comes back, stop the bot there first (`sh "$bot" stop; sh "$bot" noautostart`).
