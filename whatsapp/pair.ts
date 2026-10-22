// Links the bot to a WhatsApp number as a new device, with an 8-character code typed on the phone.
//   bun pair.ts start <number>   start pairing in the background; prints `code XXXX-XXXX`, `paired <number>` or `failed: <why>`
//   bun pair.ts wait             wait for the owner to type the code (up to 4 minutes); prints `paired <number>` or `failed: <why>`
//   bun pair.ts whoami           prints `paired <number>` or `not paired`, without connecting
//   bun pair.ts unpair           unlinks the device from the phone and forgets the session; prints `unpaired`
// Only one connection per session at a time: the bot must be stopped first (wa.sh does it).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { digits, stateDir, user, variants } from './lib'
import { createClient, fileLogger } from './wa'

const dir = stateDir()
mkdirSync(dir, { recursive: true, mode: 0o700 })
const statePath = join(dir, 'pair.state')
const logger = fileLogger(join(dir, 'pair.log'))
const say = (s: string) => writeFileSync(statePath, `${s}\n`)
const read = () => existsSync(statePath) ? readFileSync(statePath, 'utf8').trim() : ''
const [cmd, arg] = process.argv.slice(2)
const PAIR_TIMEOUT = 180_000

async function poll(done: (s: string) => boolean, ms: number) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        const s = read()
        if (done(s)) return s
        await Bun.sleep(500)
    }
    return read()
}

// The background pairing, if one still runs: a new one replaces it, so two never share the session.
function stopRun() {
    const pid = existsSync(join(dir, 'pair.pid')) ? readFileSync(join(dir, 'pair.pid'), 'utf8').trim() : ''
    if (pid && spawnSync('ps', ['-p', pid, '-o', 'args='], { encoding: 'utf8' }).stdout.includes('pair.ts')) {
        try { process.kill(Number(pid), 'SIGTERM') } catch {}
        Bun.sleepSync(1_000)
    }
    rmSync(join(dir, 'pair.pid'), { force: true })
}

if (cmd === 'stop') {
    stopRun()
    process.exit(0)
} else if (cmd === 'start') {
    const number = digits(arg ?? '')
    if (number.length < 10) { console.log('usage: pair.ts start <number with country code>'); process.exit(1) }
    stopRun()
    say('starting')
    // Detached, so it keeps waiting for the code after this command (and the tool that ran it) is gone.
    const child = spawn(process.execPath, [import.meta.path, 'run', number], {
        detached: true, stdio: ['ignore', openSync(join(dir, 'pair.log'), 'a'), openSync(join(dir, 'pair.log'), 'a')]
    })
    child.unref()
    console.log(await poll((s) => /^(code|paired|failed)/.test(s), 45_000) || 'failed: no answer from WhatsApp')
    process.exit(0)
} else if (cmd === 'wait') {
    console.log(await poll((s) => /^(paired|failed)/.test(s), 240_000))
    process.exit(0)
} else if (cmd === 'whoami') {
    const client = createClient(dir, logger)
    const me = (await client.auth.loadOrCreateCredentials()).meJid
    console.log(me ? `paired ${user(me)}` : 'not paired')
    process.exit(0)
} else if (cmd === 'unpair') {
    const client = createClient(dir, logger)
    if ((await client.auth.loadOrCreateCredentials()).meJid) {
        await client.connect().catch(() => undefined)
        await client.logout().catch((e) => logger.line(['logout failed', e]))
        await client.disconnect().catch(() => undefined)
    }
    for (const f of ['wa.sqlite', 'wa.sqlite-wal', 'wa.sqlite-shm', 'wa.state', 'config.json', 'polls.json']) rmSync(join(dir, f), { force: true })
    console.log('unpaired')
    process.exit(0)
} else if (cmd === 'run') {
    const number = digits(arg ?? '')
    writeFileSync(join(dir, 'pair.pid'), String(process.pid))
    process.on('exit', () => { try { if (readFileSync(join(dir, 'pair.pid'), 'utf8') === String(process.pid)) rmSync(join(dir, 'pair.pid')) } catch {} })
    process.on('SIGTERM', () => process.exit(1))
    const client = createClient(dir, logger)
    const fail = async (why: string) => {
        say(`failed: ${why}`)
        await client.disconnect().catch(() => undefined)
        process.exit(1)
    }
    const timer = setTimeout(() => void fail('the code expired before it was typed on the phone'), PAIR_TIMEOUT + 45_000)
    const paired = new Promise((r) => client.once('auth_paired', r))
    const opened = new Promise<void>((r) => client.on('connection', (e) => { if (e.status === 'open') r() }))
    client.on('connection', (e) => {
        logger.line(['connection', e.status, e.reason, e.code ?? ''])
        if (e.status === 'close' && e.isLogout) void fail('WhatsApp refused the link')
    })
    try {
        await client.connect()
        const me = client.auth.getCurrentCredentials()?.meJid
        if (me) {
            // Already linked: to this number it is done; to another, the owner must unpair first.
            if (variants(number).includes(user(me))) { say(`paired ${user(me)}`); await client.disconnect(); process.exit(0) }
            await fail(`already linked to ${user(me)}: unpair first`)
        }
        const code = await client.auth.requestPairingCode(number)
        say(`code ${code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code}`)
        await paired
        await opened
        // A short wait lets the first sync finish, so the phone shows the device as connected.
        await Bun.sleep(10_000)
        clearTimeout(timer)
        say(`paired ${user(client.auth.getCurrentCredentials()?.meJid)}`)
        await client.presence.send('unavailable').catch(() => undefined)
        await client.disconnect()
        process.exit(0)
    } catch (e) {
        logger.line(['pairing failed', e])
        await fail(e instanceof Error ? e.message : String(e))
    }
} else {
    console.log('usage: pair.ts start <number> | wait | whoami | unpair')
    process.exit(1)
}
