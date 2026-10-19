#!/usr/bin/env node
// Plays a persona through a real Claude Code session with this plugin, in tmux, so you can watch it.
//   node test/simulate.mjs test/personas/<name>.md [--watch] [--telegram] [--folder <dir>] [--turns N]
//     [--permission-mode <mode>] [--no-login]
// --watch opens a Terminal window that mirrors the screen; or run the printed watch command yourself.
// --telegram runs the session the way bot.sh does and types the persona's messages as Telegram messages:
// the coach's replies really go out through the bot in ~/.claude/channels/telegram, to its owner.
// --folder starts from a copy of that fitness folder instead of a new one (e.g. test/fixtures/marina, setup done).
// --permission-mode runs the session in that mode (e.g. auto, as real users do) instead of skipping every permission.
// --no-login puts test/no-login/claude first in the session's PATH: the coach's own `claude` commands see no login,
// like a desktop app user's, until it runs `claude auth login` (MFC_FAKE_PLAN=team plays a company account).
// MFC_ variables set when running this reach the session.
// The persona is played by Claude (sonnet) reading the screen; each run costs tokens.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const personaFile = args.find(a => a.endsWith('.md'))
if (!personaFile) { console.error('usage: node test/simulate.mjs <persona.md> [--watch] [--telegram] [--folder <dir>] [--turns N] [--permission-mode <mode>] [--no-login]'); process.exit(1) }
const watch = args.includes('--watch')
const telegram = args.includes('--telegram')
const turns = Number(args[args.indexOf('--turns') + 1]) || 30
const fromArg = args.includes('--folder') ? args[args.indexOf('--folder') + 1] : null
if (args.includes('--folder') && (!fromArg || fromArg.startsWith('--'))) { console.error('--folder needs a folder'); process.exit(1) }
const from = fromArg && resolve(fromArg)
const mode = args.includes('--permission-mode') ? args[args.indexOf('--permission-mode') + 1] : null
if (args.includes('--permission-mode') && (!mode || mode.startsWith('--'))) { console.error('--permission-mode needs a mode'); process.exit(1) }
const noLogin = args.includes('--no-login')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const persona = readFileSync(personaFile, 'utf8')
const S = `mfc-sim-${process.pid}`
const botSh = join(root, 'scripts/bot.sh')

const tmux = (...a) => execFileSync('tmux', a, { encoding: 'utf8' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const screen = () => tmux('capture-pane', '-p', '-t', S)
const q = s => `'${s.replace(/'/g, `'\\''`)}'`

// On Telegram the persona's messages arrive as channel messages from the bot's owner.
let owner
if (telegram) {
  const access = JSON.parse(readFileSync(join(process.env.HOME, '.claude/channels/telegram/access.json'), 'utf8'))
  owner = access.allowFrom?.[0]
  if (!owner) { console.error('no bot owner in ~/.claude/channels/telegram/access.json'); process.exit(1) }
}
// Message ids no real message has, so the 👀 reaction never lands on one of the owner's messages.
let messageId = 900_000_000
const asTelegram = text => `<channel source="plugin:telegram:telegram" chat_id="${owner}" message_id="${++messageId}" user="sim" user_id="${owner}" ts="${new Date().toISOString()}">${text}</channel>`

// A fresh fitness folder, like a new user's (or a copy of --folder), and a session without the developer's own settings.
const folder = mkdtempSync(join(tmpdir(), 'mfc-sim-'))
const personaDir = mkdtempSync(join(tmpdir(), 'mfc-persona-'))
cpSync(from ?? join(root, 'template'), folder, { recursive: true })
spawnSync('git', ['init', '-q'], { cwd: folder })
// The session runs from tmux, whose environment is not this process's: variables go in the command itself,
// with any MFC_ ones set here (e.g. MFC_MARKETPLACE, MFC_FAKE_PLAN).
const vars = Object.entries(process.env).filter(([k]) => /^MFC_[A-Z_]+$/.test(k))
if (noLogin) vars.push(['MFC_FAKE_STATE', join(personaDir, 'signed-in')], ['PATH', `${join(root, 'test/no-login')}:${process.env.PATH}`])
const env = vars.map(([k, v]) => `${k}=${q(v)} `).join('')
const base = `${env}claude --setting-sources project --plugin-dir ${q(root)} ${mode ? `--permission-mode ${q(mode)}` : '--dangerously-skip-permissions'}`
const bot = () => {
  const settings = execFileSync('sh', [botSh, 'settings'], { encoding: 'utf8' })
  // --verbose shows the text of each Telegram reply, which is what the persona reads.
  // --channels takes several values, so it goes before another option, never right before the prompt.
  return `MFC_CHANNEL=telegram ${base} --verbose --model sonnet --effort low --channels plugin:telegram@claude-plugins-official` +
    ` --settings ${q(settings)} ${q(`Bot started: follow Bot start in ${root}/skills/coach/telegram.md.`)}`
}

// The simulated bot takes over the real one: stop it now, and say so at the end if it was running.
const realBot = telegram && spawnSync('sh', [botSh, 'status'], { encoding: 'utf8' }).stdout.trim() === 'running'
let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  spawnSync('tmux', ['kill-session', '-t', S])
  if (realBot) console.log('the real bot was stopped; start it again with: sh scripts/bot.sh start <fitness folder>')
}
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

// Claude is waiting for us when the screen stops changing (the spinner moves while it works).
async function idle() {
  let last = '', same = 0
  for (let i = 0; i < 600; i++) {
    await sleep(1000)
    const now = screen()
    same = now === last ? same + 1 : 0
    last = now
    if (same >= 3) return now
  }
  return last
}

const KEYS = new Set(['Up', 'Down', 'Left', 'Right', 'Enter', 'Tab', 'Escape', 'Space', 'BSpace', '1', '2', '3', '4', '5'])
try {
  if (telegram) {
    spawnSync('sh', [botSh, 'stop'])
    // Old messages waiting for the bot would reach the session before the persona's: drop them first.
    spawnSync('sh', ['-c', `. ${q(join(root, 'hooks/lib.sh'))}; tg deleteWebhook -d drop_pending_updates=true >/dev/null`])
  }
  tmux('new-session', '-d', '-s', S, '-x', '120', '-y', '45', '-c', folder, telegram ? bot() : base)
  // A mirror, not an attached client: tmux refuses keys while a read-only client is attached.
  const mirror = `while tmux has-session -t ${S} 2>/dev/null; do printf '\\033[H'; tmux capture-pane -p -e -t ${S}; printf '\\033[J'; sleep 1; done`
  if (watch) spawnSync('osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(mirror)}`, '-e', 'tell application "Terminal" to activate'])
  console.log(`folder: ${folder}\nwatch:  ${mirror}`)

  const said = []
  for (let t = 0; t < turns; t++) {
    const shown = await idle()
    const prompt = `${persona}

${telegram
  ? `You are this person, chatting on Telegram with a coach bot. Below is the bot's terminal: what you see on your phone is the text of its \`reply\` tool calls, the options of any \`ask.sh\` call are buttons (to tap one, send its exact text), and a \`react\` call is an emoji reaction on your last message. Ignore everything else on screen. Unless your story says you write first, send nothing until the bot has written to you.`
  : 'You are this person, using Claude Code in a terminal. Below is what the terminal shows now.'}
Decide your next action and answer with JSON only, one of:
{"type":"text","text":"<what you type>"}   to write a message on one line (Enter is pressed for you)
{"type":"keys","keys":["Down","Enter"]}     to work a menu or choice screen (keys: ${[...KEYS].join(', ')})
${telegram ? '{"type":"checkin","kind":"morning"}          when your story says a check-in fires ("morning", or "weekly" on a Monday)\n' : ''}{"type":"done"}                             when your story is over and you have nothing more to say

System dialogs (trusting the folder, accepting a mode) are not part of the story: accept them.
In a choice screen, move with Up/Down, pick with Enter; on a final review screen, submit.
Your messages so far: ${JSON.stringify(said)}

--- terminal ---
${shown}`
    // From an empty folder, so no CLAUDE.md around the caller reaches the persona.
    const out = spawnSync('claude', ['-p', prompt, '--model', 'sonnet', '--setting-sources', 'project', '--tools', ''],
      { encoding: 'utf8', timeout: 180_000, cwd: personaDir }).stdout ?? ''
    let action
    try { action = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) } catch { console.log('persona gave no action:', out); break }
    if (action.type === 'done') break
    if (action.type === 'checkin' && telegram) {
      // What the bot's check-in jobs type into its own session.
      const kind = action.kind === 'weekly' ? 'weekly' : 'morning'
      tmux('send-keys', '-t', S, '-l', '--', `Check-in: ${kind}.`)
      await sleep(300)
      tmux('send-keys', '-t', S, 'Enter')
      said.push(`(${kind} check-in fired)`)
      console.log(`[check-in: ${kind}]`)
      continue
    }
    if (action.type === 'text') {
      // A newline would send the message halfway.
      const text = String(action.text).replace(/\s*\n\s*/g, ' ')
      said.push(text)
      tmux('send-keys', '-t', S, '-l', '--', telegram ? asTelegram(text) : text)
      await sleep(300)
      tmux('send-keys', '-t', S, 'Enter')
      console.log(`> ${text}`)
    } else if (action.type === 'keys' && Array.isArray(action.keys)) {
      for (const k of action.keys.filter(k => KEYS.has(k))) { tmux('send-keys', '-t', S, k); await sleep(250) }
      console.log(`[${action.keys.join(' ')}]`)
    }
  }

  await idle()
  const log = join(folder, 'simulation.txt')
  writeFileSync(log, tmux('capture-pane', '-p', '-S', '-', '-t', S))
  console.log(`transcript: ${log}`)
} finally {
  cleanup()
}
