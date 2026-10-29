// The WhatsApp client as the server and the pairing command build it, the log file and the state file.
import { createSqliteStore } from '@zapo-js/store-sqlite'
import { appendFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createStore, type Logger, WaClient } from 'zapo-js'

// The session's keys only: messages, chats and contacts are never stored, so the owner's conversations stay on the phone.
export function createClient(dir: string, logger: Logger): WaClient {
    const store = createStore({
        backends: { sqlite: createSqliteStore({ path: join(dir, 'wa.sqlite') }) },
        providers: {
            auth: 'sqlite', signal: 'sqlite', preKey: 'sqlite', session: 'sqlite', identity: 'sqlite',
            senderKey: 'sqlite', appState: 'sqlite', privacyToken: 'sqlite',
            messages: 'none', threads: 'none', contacts: 'none'
        }
    })
    // Never online and no history: the phone keeps notifying the owner, and old chats never come down.
    return new WaClient({ store, sessionId: 'bot', markOnlineOnConnect: false, history: { enabled: false } }, logger)
}

// What the server last knew about its connection: open, connecting, not paired, logged out, replaced: ...
export const writeState = (dir: string, state: string) => {
    try { writeFileSync(join(dir, 'wa.state'), `${state}\n`) } catch {}
}

const MAX_LOG = 1_000_000

// A Logger for the client that writes warnings and errors to a file, kept under about 1 MB (one old copy).
export function fileLogger(path: string, level: Logger['level'] = 'warn'): Logger & { line(a: unknown[]): void } {
    const order = ['trace', 'debug', 'info', 'warn', 'error'] as const
    const write = (text: string) => {
        try {
            if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG) renameSync(path, `${path}.1`)
            appendFileSync(path, `${new Date().toISOString()} ${text}\n`, { mode: 0o600 })
        } catch {}
    }
    const fmt = (v: unknown) => v instanceof Error ? (v.stack ?? v.message) : typeof v === 'string' ? v : JSON.stringify(v)
    const make = (bindings: Record<string, unknown>, min: Logger['level']): Logger & { line(a: unknown[]): void } => {
        const at = (l: (typeof order)[number]) => (message: string, context?: Readonly<Record<string, unknown>>) => {
            if (order.indexOf(l) < order.indexOf(min as (typeof order)[number])) return
            const ctx = { ...bindings, ...context }
            write(`${l} ${message}${Object.keys(ctx).length ? ' ' + fmt(ctx) : ''}`)
        }
        return {
            level: min,
            trace: at('trace'), debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error'),
            child: (b, o) => make({ ...bindings, ...b }, o?.level ?? min),
            line: (a) => write(a.map(fmt).join(' '))
        }
    }
    return make({}, level)
}
