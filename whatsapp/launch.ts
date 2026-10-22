// Runs the WhatsApp bot: an interactive Claude Code session in the fitness folder, in a terminal of its own (a PTY),
// with the WhatsApp channel loaded. It accepts the development-channel warning, and only that one; any other screen
// that waits for a person stops it with the reason. When the session ends it starts a new one, waiting longer each time.
//   bun launch.ts run <folder>     run in the foreground (what launchd runs on macOS)
//   bun launch.ts start <folder>   run detached from this terminal and the tool that started it (Linux)
// bot.state holds one line (starting, running, restarting in..., stopped, stuck: <why>); bot.log the screen as text.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { stateDir } from './lib'
import { dialog, menu, plain, ready, reason, squash, warning } from './screen'

const ROOT = resolve(import.meta.dir, '..')
const DIR = stateDir()
const PLUGIN = process.env.WA_PLUGIN || 'whatsapp@my-fitness-claw'
const STATE = join(DIR, 'bot.state')
const LOG = join(DIR, 'bot.log')
const UP_TIMEOUT = 120_000
const MAX_LOG = 2_000_000
// What the channel server reports that only the owner can fix (pairing again, stopping another copy).
const FATAL_WA = /^(logged out|not paired|replaced|banned|locked|outdated|stuck)/

const [cmd, arg] = process.argv.slice(2)
const folder = arg ? resolve(arg) : ''
if (!['run', 'start'].includes(cmd) || !existsSync(join(folder, 'profile.md'))) {
    console.log('usage: launch.ts run|start <fitness folder>')
    process.exit(1)
}
const state = (s: string) => { writeFileSync(STATE, `${s}\n`); console.log(new Date().toISOString(), s) }

if (cmd === 'start') {
    state('starting')
    const out = openSync(join(DIR, 'launch.log'), 'a')
    spawn(process.execPath, [import.meta.path, 'run', folder], { detached: true, stdio: ['ignore', out, out] }).unref()
    process.exit(0)
}

writeFileSync(join(DIR, 'bot.pid'), String(process.pid))
writeFileSync(join(DIR, 'bot.root'), ROOT)

const log = (text: string) => {
    try {
        if ((statSync(LOG, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG) renameSync(LOG, `${LOG}.1`)
        appendFileSync(LOG, text)
    } catch {}
}
const read = (f: string) => existsSync(join(DIR, f)) ? readFileSync(join(DIR, f), 'utf8').trim() : ''

// Read again for each session, so a start with a new mode or time zone takes effect.
const settings = () => spawnSync('sh', [join(ROOT, 'scripts', 'wa.sh'), 'settings', folder], { encoding: 'utf8' }).stdout
const mode = () => {
    const m = process.env.MFC_PERMISSION_MODE || read('permission-mode')
    return ['acceptEdits', 'default'].includes(m) ? m : 'auto'
}

type End = { why: string; again: boolean }
let loginChecked = 0
const loggedIn = async () => {
    const r = Bun.spawn(['sh', join(ROOT, 'scripts', 'bot.sh'), 'ready'], { stdout: 'pipe', stderr: 'ignore' })
    return (await new Response(r.stdout).text()).trim() !== 'no'
}
// The channel server holding the WhatsApp session, as its lock file names it.
const serverAlive = () => {
    const pid = read('server.lock')
    return !!pid && spawnSync('ps', ['-p', pid, '-o', 'args='], { encoding: 'utf8' }).stdout.includes('server.ts')
}
let stopSession: (() => void) | undefined
let stopping = false

// One session, until it ends: why it ended, and whether a new one can help.
async function session(): Promise<End> {
    const env: Record<string, string | undefined> = { ...process.env, DISABLE_AUTOUPDATER: '1', MFC_CHANNEL: 'whatsapp' }
    // An API key would bill the API instead of the user's own subscription: never inherit one.
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k]
    const args = [
        '--model', 'sonnet', '--effort', 'low', '--permission-mode', mode(),
        '--dangerously-load-development-channels', `plugin:${PLUGIN}`,
        '--settings', settings(),
        `Bot started: follow Bot start in ${join(ROOT, 'skills', 'coach', 'whatsapp.md')}.`
    ]
    let screen = ''
    let accepted = false
    let up = false
    let end: End | undefined
    const finish = (why: string, again: boolean) => {
        if (end) return
        end = { why, again }
        proc.kill('SIGTERM')
        setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 10_000).unref()
    }
    stopSession = () => finish('stopped', false)
    writeFileSync(join(DIR, 'wa.state'), 'connecting\n')
    log(`\n===== ${new Date().toISOString()} starting Claude Code\n`)
    const claude = Bun.which('claude') ?? join(homedir(), '.local', 'bin', 'claude')
    const proc = Bun.spawn([claude, ...args], {
        cwd: folder,
        env,
        terminal: {
            cols: 120,
            rows: 40,
            data(t, d) {
                const text = plain(new TextDecoder().decode(d))
                log(text)
                screen = (screen + text).slice(-20_000)
                const flat = squash(screen)
                if (up) {
                    // A login that expires mid-run leaves a session that can't answer; the words alone may just be
                    // in a conversation, so Claude Code's own login is checked before stopping (at most every 10 minutes).
                    if (flat.slice(-3000).includes('pleaserun/login') && Date.now() - loginChecked > 600_000) {
                        loginChecked = Date.now()
                        void loggedIn().then((ok) => { if (!ok) finish('not logged in', false) })
                    }
                    return
                }
                if (ready(PLUGIN, flat)) {
                    up = true
                    state('running')
                    return
                }
                const why = reason(flat)
                if (why) return finish(why, false)
                if (!menu(flat)) return
                // Only this plugin's warning is answered, once; what comes after it is read on its own.
                if (!accepted && warning(PLUGIN, flat)) {
                    accepted = true
                    screen = ''
                    setTimeout(() => t.write('\r'), 300)
                    return
                }
                finish(`stuck: ${dialog(screen)}`, false)
            }
        }
    })
    const upTimer = setTimeout(() => up || finish(`stuck: the WhatsApp channel did not come up (${dialog(screen)})`, true), UP_TIMEOUT)
    // The channel server writes how WhatsApp is doing; a link only a new pairing fixes stops the bot.
    // A channel server that died leaves Claude Code running deaf: a new session brings it back.
    let opened = false
    const watch = setInterval(() => {
        const wa = read('wa.state')
        if (FATAL_WA.test(wa)) return finish(wa, false)
        if (wa === 'open') opened = true
        // Some Claude Code versions show no banner: a channel server that Claude Code started and that reached
        // WhatsApp, after the warning was accepted, is a channel that is listening.
        if (opened && accepted && !up) {
            up = true
            state('running')
        }
        if (opened && !serverAlive()) finish('the WhatsApp channel stopped', true)
    }, 5_000)
    const code = await proc.exited
    clearTimeout(upTimer)
    clearInterval(watch)
    stopSession = undefined
    return end ?? { why: `Claude Code exited (${code})`, again: true }
}

let wake: (() => void) | undefined
const stop = () => {
    stopping = true
    stopSession?.()
    wake?.()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)

let delay = 10_000
while (!stopping) {
    state('starting')
    const started = Date.now()
    const { why, again } = await session()
    if (stopping) break
    if (!again) {
        state(why.startsWith('stuck') ? why : `stuck: ${why}`)
        process.exit(0)
    }
    // A session that ran a while had a one-off problem; one that keeps dying right away waits longer each time.
    if (Date.now() - started > 10 * 60_000) delay = 10_000
    state(`restarting in ${delay / 1000}s: ${why}`)
    await new Promise<void>((r) => { wake = r; setTimeout(r, delay) })
    delay = Math.min(delay * 2, 5 * 60_000)
}
state('stopped')
process.exit(0)
