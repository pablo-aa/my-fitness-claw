// launch.ts against a fake claude in a real terminal: what it answers, what stops it, and that it starts again.
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '..', '..')
const PLUGIN = 'whatsapp@test-market'
const FAKE = `#!/bin/sh
# Fake Claude Code: draws one of the screens the launcher must read, from $FAKE_SCREEN.
env > "$FAKE_DIR/env"
for a; do printf '%s\\0' "$a"; done > "$FAKE_DIR/args"
warning() {
  printf '\\033[2J\\033[H────────\\r\\nWARNING:\\033[1CLoading development channels\\r\\n'
  printf 'Channels: plugin:%s\\r\\n' "\${1:-$WA_PLUGIN}"
  printf '\\033[36m❯ 1. I am using this for local development\\033[39m\\r\\n  2. Exit\\r\\nEnter to confirm · Esc to cancel\\r\\n'
  read x
}
case $FAKE_SCREEN in
  ok) warning; printf '\\r\\n▎Channels (experimental) messages from plugin:%s inject directly in this session\\r\\n' "$WA_PLUGIN"; sleep 600 ;;
  trust) printf 'Accessing workspace:\\r\\n/home/sam/my-fitness\\r\\n❯ 1. Yes, I trust this folder\\r\\nEnter to confirm · Esc to cancel\\r\\n'; read x; sleep 600 ;;
  other) warning whatsapp@someone-else; sleep 600 ;;
  menu) warning; printf 'Pick a theme\\r\\n❯ 1. Dark\\r\\nEnter to confirm · Esc to cancel\\r\\n'; read x; sleep 600 ;;
  crash) exit 3 ;;
esac
`

let launcher: ReturnType<typeof Bun.spawn> | undefined
afterEach(() => { launcher?.kill('SIGKILL'); launcher = undefined })

function setup(screen: string) {
    const tmp = mkdtempSync(join(tmpdir(), 'wa-launch-'))
    const bin = join(tmp, 'bin')
    const dir = join(tmp, 'state')
    const folder = join(tmp, 'fitness')
    mkdirSync(bin)
    mkdirSync(dir)
    cpSync(join(ROOT, 'template'), folder, { recursive: true })
    writeFileSync(join(bin, 'claude'), FAKE)
    chmodSync(join(bin, 'claude'), 0o755)
    const env = {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, WHATSAPP_STATE_DIR: dir, WA_PLUGIN: PLUGIN,
        FAKE_SCREEN: screen, FAKE_DIR: tmp, ANTHROPIC_API_KEY: 'sk-must-not-leak'
    }
    launcher = Bun.spawn(['bun', join(ROOT, 'whatsapp', 'launch.ts'), 'run', folder], { env, stdout: 'ignore', stderr: 'ignore' })
    const state = () => existsSync(join(dir, 'bot.state')) ? readFileSync(join(dir, 'bot.state'), 'utf8').trim() : ''
    const until = async (want: (s: string) => boolean, ms = 15_000) => {
        const end = Date.now() + ms
        while (Date.now() < end) { if (want(state())) return state(); await Bun.sleep(100) }
        return state()
    }
    return { tmp, dir, folder, state, until }
}

describe('launch', () => {
    test('accepts its own warning, then runs until WhatsApp logs out', async () => {
        const t = setup('ok')
        expect(await t.until((s) => s === 'running')).toBe('running')
        const args = readFileSync(join(t.tmp, 'args'), 'utf8').split('\0')
        expect(args).toContain('--dangerously-load-development-channels')
        expect(args).toContain(`plugin:${PLUGIN}`)
        const settings = JSON.parse(args[args.indexOf('--settings') + 1])
        expect(settings.enabledPlugins).toEqual({ [PLUGIN]: true })
        expect(args.at(-2)).toStartWith('Bot started: follow Bot start in')
        const env = readFileSync(join(t.tmp, 'env'), 'utf8')
        expect(env).not.toContain('sk-must-not-leak')
        expect(env).toContain('DISABLE_AUTOUPDATER=1')
        expect(env).toContain('MFC_CHANNEL=whatsapp')
        expect(readFileSync(join(t.dir, 'bot.log'), 'utf8')).toContain('inject directly')
        writeFileSync(join(t.dir, 'wa.state'), 'logged out\n')
        expect(await t.until((s) => s.startsWith('stuck'))).toBe('stuck: logged out')
        expect(await launcher!.exited).toBe(0)
    }, 30_000)

    test('an untrusted folder stops it with the reason', async () => {
        const t = setup('trust')
        expect(await t.until((s) => s.startsWith('stuck'))).toStartWith('stuck: folder not trusted')
        expect(await launcher!.exited).toBe(0)
    }, 30_000)

    test('a warning for another channel is never accepted', async () => {
        const t = setup('other')
        expect(await t.until((s) => s.startsWith('stuck'))).toStartWith('stuck: ')
        expect(t.state()).not.toBe('running')
    }, 30_000)

    test('a menu after the warning is not its to answer', async () => {
        const t = setup('menu')
        expect(await t.until((s) => s.startsWith('stuck'))).toBe('stuck: Pick a theme')
    }, 30_000)

    test('a session that ends is started again, later', async () => {
        const t = setup('crash')
        expect(await t.until((s) => s.startsWith('restarting'))).toBe('restarting in 10s: Claude Code exited (3)')
        launcher!.kill('SIGTERM')
        expect(await t.until((s) => s === 'stopped', 5_000)).toBe('stopped')
    }, 30_000)

    test('a stop ends the session and the launcher', async () => {
        const t = setup('ok')
        await t.until((s) => s === 'running')
        launcher!.kill('SIGTERM')
        expect(await launcher!.exited).toBe(0)
        expect(t.state()).toBe('stopped')
    }, 30_000)
})
