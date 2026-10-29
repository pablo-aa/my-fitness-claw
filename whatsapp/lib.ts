// Pure helpers shared by the channel server, the pairing command and the tests: no network, no WhatsApp client.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'

// Where the bot keeps its WhatsApp session, owner and files, next to the Telegram plugin's own folder.
export const stateDir = (env = process.env) =>
    env.WHATSAPP_STATE_DIR || join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'channels', 'whatsapp')

// Replies in the self-chat start with this, so the owner tells them apart from their own notes.
export const PREFIX = '[🦖 clawdino]\n'

// The owner: another number (the bot has its own), or the bot's own number talking to itself.
export type Owner = { mode: 'number'; number: string; lid?: string } | { mode: 'self' }

export function parseOwner(config: unknown): Owner {
    const c = (config ?? {}) as { owner?: unknown; lid?: unknown }
    const number = typeof c.owner === 'string' ? digits(c.owner) : ''
    if (!number || c.owner === 'self') return { mode: 'self' }
    const lid = typeof c.lid === 'string' && /^\d+$/.test(c.lid) ? c.lid : undefined
    return { mode: 'number', number, ...(lid ? { lid } : {}) }
}

export const digits = (s: string) => s.replace(/\D/g, '')

// The user part of a JID: 5511999999999:7@s.whatsapp.net -> 5511999999999.
export const user = (jid?: string | null) => (jid ?? '').split('@')[0].split(':')[0]
export const server = (jid?: string | null) => (jid ?? '').split('@')[1] ?? ''

// Brazilian mobile numbers may be registered with or without the 9 after the area code.
export function variants(number: string): string[] {
    const n = digits(number)
    if (n.startsWith('55') && n.length === 13 && n[4] === '9') return [n, n.slice(0, 4) + n.slice(5)]
    if (n.startsWith('55') && n.length === 12) return [n, n.slice(0, 4) + '9' + n.slice(4)]
    return [n]
}

export interface Key {
    readonly id?: string | null
    readonly remoteJid?: string | null
    readonly remoteJidAlt?: string | null
    readonly fromMe?: boolean | null
    readonly isGroup?: boolean | null
    readonly participant?: string | null
}
export interface Me {
    readonly pn: string
    readonly lid: string
}

// Whether a message comes from the owner, in a direct chat. Groups, status, broadcasts and channels never pass.
// With its own number, the bot takes only what the owner sends it; in the self-chat, only what the owner writes to themself.
export function admitted(key: Key, owner: Owner, me: Me): boolean {
    if (!key.id || key.isGroup || key.participant) return false
    if (!['s.whatsapp.net', 'lid'].includes(server(key.remoteJid))) return false
    const users = [user(key.remoteJid), user(key.remoteJidAlt)].filter(Boolean)
    if (owner.mode === 'self') return !!key.fromMe && users.some((u) => u === me.pn || u === me.lid)
    if (key.fromMe) return false
    return users.some((u) => variants(owner.number).includes(u) || u === owner.lid)
}

// The owner's LID, learned from a message whose phone number matched: later messages may carry only the LID.
export function learnedLid(key: Key, owner: Owner): string | undefined {
    if (owner.mode !== 'number' || owner.lid) return undefined
    const pn = [key.remoteJid, key.remoteJidAlt].find((j) => server(j) === 's.whatsapp.net')
    const lid = [key.remoteJid, key.remoteJidAlt].find((j) => server(j) === 'lid')
    return pn && lid && variants(owner.number).includes(user(pn)) ? user(lid) : undefined
}

// A WhatsApp message wrapped in disappearing, view-once or captioned-document envelopes.
type Msg = Record<string, any>
export function unwrap(m: Msg | null | undefined): Msg {
    let cur = m ?? {}
    for (let i = 0; i < 5; i++) {
        const inner = cur.ephemeralMessage?.message ?? cur.viewOnceMessage?.message ?? cur.viewOnceMessageV2?.message ??
            cur.viewOnceMessageV2Extension?.message ?? cur.documentWithCaptionMessage?.message
        if (!inner) break
        cur = inner
    }
    return cur
}

export type Kind = 'text' | 'voice' | 'audio' | 'image' | 'document' | 'other' | 'ignore'

// What a message is: a reply to it, or something the coach never sees (edits, reactions, poll votes, protocol).
export function classify(m: Msg | null | undefined): { kind: Kind; text: string; label?: string } {
    const msg = unwrap(m)
    if (msg.protocolMessage || msg.reactionMessage || msg.editedMessage || msg.pollUpdateMessage ||
        msg.senderKeyDistributionMessage && Object.keys(msg).length === 1 || msg.keepInChatMessage || msg.pinInChatMessage)
        return { kind: 'ignore', text: '' }
    const text = msg.conversation ?? msg.extendedTextMessage?.text
    if (typeof text === 'string' && text.trim()) return { kind: 'text', text }
    if (msg.audioMessage) return msg.audioMessage.ptt
        ? { kind: 'voice', text: '(voice message)' }
        : { kind: 'audio', text: '(audio)' }
    if (msg.imageMessage) return { kind: 'image', text: msg.imageMessage.caption || '(photo)' }
    if (msg.documentMessage) {
        const name = safe(msg.documentMessage.fileName || 'file')
        return { kind: 'document', text: msg.documentMessage.caption || `(document: ${name})`, label: name }
    }
    const other: Record<string, string> = {
        videoMessage: '(video)', ptvMessage: '(video)', stickerMessage: '(sticker)', locationMessage: '(location)',
        liveLocationMessage: '(location)', contactMessage: '(contact)', contactsArrayMessage: '(contacts)',
        pollCreationMessage: '(poll)', pollCreationMessageV3: '(poll)', eventMessage: '(event)'
    }
    for (const [k, v] of Object.entries(other)) if (msg[k]) return { kind: 'other', text: v }
    return { kind: 'ignore', text: '' }
}

// Names and captions come from the sender: they land inside the channel tag, so no tag or meta delimiters.
export const safe = (s: string) => s.replace(/[<>\[\]\r\n;"]/g, '_').slice(0, 120)

// A message older than a day, delivered after a long outage, is old news.
export const stale = (tsSeconds: number | null | undefined, now = Date.now()) =>
    !!tsSeconds && now / 1000 - tsSeconds > 24 * 60 * 60

// A bounded set of ids, for dedupe and echo checks.
export class Recent<T = true> {
    private map = new Map<string, T>()
    constructor(private max = 500) {}
    has(id: string) { return this.map.has(id) }
    get(id: string) { return this.map.get(id) }
    set(id: string, v: T) {
        this.map.delete(id)
        this.map.set(id, v)
        while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
    }
}

// WhatsApp sends a poll vote as the SHA-256 of each chosen option's name.
export function voted(options: readonly string[], selected: readonly Uint8Array[] | null | undefined): string[] {
    const hashes = (selected ?? []).map((h) => Buffer.from(h).toString('hex'))
    return options.filter((o) => hashes.includes(createHash('sha256').update(o).digest('hex')))
}

// Meta keys must be identifiers and every value a string, or Claude Code drops the attribute.
export function meta(fields: Record<string, string | number | undefined>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '' && /^[a-z_]+$/.test(k)) out[k] = String(v)
    return out
}

// Long texts go in several messages, cut at a paragraph or a line when possible.
export function chunks(text: string, max = 4000): string[] {
    const out: string[] = []
    let rest = text
    while (rest.length > max) {
        const window = rest.slice(0, max)
        const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '))
        const at = cut > max / 2 ? cut : max
        out.push(rest.slice(0, at).trimEnd())
        rest = rest.slice(at).replace(/^\s+/, '')
    }
    if (rest) out.push(rest)
    return out
}

const IMAGES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const DOCS: Record<string, string> = {
    '.pdf': 'application/pdf', '.html': 'text/html', '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/markdown',
    '.gif': 'image/gif', '.ogg': 'audio/ogg'
}

// How a file goes out: images as photos, the rest (the plan PDF) as documents.
export function outbound(path: string): { type: 'image' | 'document'; mimetype: string; fileName: string } {
    const ext = extname(path).toLowerCase()
    if (IMAGES[ext]) return { type: 'image', mimetype: IMAGES[ext], fileName: basename(path) }
    return { type: 'document', mimetype: DOCS[ext] ?? 'application/octet-stream', fileName: basename(path) }
}

// The bot's own folder never leaves the computer (it holds the WhatsApp session), except what the owner sent in.
export function sendable(path: string, dir: string): string | null {
    if (!path.startsWith('/')) return 'files need absolute paths'
    // Through any symlink: a link elsewhere to the session file is still the session file.
    const real = (f: string) => { try { return realpathSync(f) } catch { return resolve(f) } }
    const p = real(path)
    const d = real(dir)
    if ((p === d || p.startsWith(d + sep)) && !p.startsWith(join(d, 'inbox') + sep)) return `refusing to send a file from ${d}`
    return null
}

// Inbound file names: generated here, never the sender's, so they can't climb out of the inbox.
export const inboxName = (id: string, ext: string) => `${Date.now()}-${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 32)}${ext}`

export function extFor(mime: string | null | undefined, fallback: string): string {
    const m = (mime ?? '').split(';')[0].trim()
    const map: Record<string, string> = {
        'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'image/jpeg': '.jpg', 'image/png': '.png',
        'image/webp': '.webp', 'application/pdf': '.pdf'
    }
    return map[m] ?? fallback
}
