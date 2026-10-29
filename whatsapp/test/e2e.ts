// The real channel inside a real Claude Code session, linked to Zapo's fake WhatsApp instead of WhatsApp:
// a test plugin's .mcp.json runs this file in place of server.ts. A local HTTP port plays the owner's phone:
//   POST /say          body: text      the owner sends a message
//   POST /voice        body: audio     the owner sends a voice note
//   POST /vote         body: option    the owner answers the last poll (handed to the channel as WhatsApp would)
//   GET  /out                          what the bot sent the owner, one JSON object per line
// Port: WA_E2E_PORT (default 18790); state: WHATSAPP_STATE_DIR.
for (const k of ['log', 'info', 'debug', 'trace'] as const) console[k] = console.error

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stateDir } from '../lib'
import { startChannel } from '../server'
import { fakeWorld, media, OWNER } from './fake'

const dir = stateDir()
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'config.json'), JSON.stringify({ owner: OWNER }))
const log = (...a: unknown[]) => appendFileSync(join(dir, 'e2e.log'), `${new Date().toISOString()} ${a.map(String).join(' ')}\n`)
const world = await fakeWorld()
const channel = await startChannel({ client: world.client, dir, transport: new StdioServerTransport(), log })
const owner = await (async () => { for (;;) { if (channel.state() === 'open') return world.peer(OWNER); await Bun.sleep(100) } })()

type Out = { at: string; text?: string; reaction?: string; poll?: { name: string; options: string[]; id: string }; document?: string; image?: boolean }
const out: Out[] = []
let lastPoll: Out['poll']
void (async () => {
    for (;;) {
        try {
            const r = await owner.expectMessage({ timeoutMs: 3_600_000 })
            const m = r.message
            const poll = m.pollCreationMessageV3 ?? m.pollCreationMessage
            const o: Out = {
                at: new Date().toISOString(),
                ...(m.conversation || m.extendedTextMessage?.text ? { text: m.conversation ?? m.extendedTextMessage?.text ?? '' } : {}),
                ...(m.reactionMessage ? { reaction: m.reactionMessage.text ?? '' } : {}),
                ...(poll ? { poll: { name: poll.name ?? '', options: (poll.options ?? []).map((x) => x.optionName ?? ''), id: String(r.stanza.attrs.id) } } : {}),
                ...(m.documentMessage ? { document: m.documentMessage.fileName ?? '' } : {}),
                ...(m.imageMessage ? { image: true } : {})
            }
            if (o.poll) lastPoll = o.poll
            out.push(o)
            log('out', JSON.stringify(o))
        } catch (e) {
            log('expect failed', e)
        }
    }
})()

const port = Number(process.env.WA_E2E_PORT || 18790)
Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(req) {
        const url = new URL(req.url)
        if (req.method === 'GET' && url.pathname === '/out') return new Response(out.map((o) => JSON.stringify(o)).join('\n') + '\n')
        if (req.method === 'POST' && url.pathname === '/say') {
            await owner.sendConversation(await req.text())
            return new Response('ok\n')
        }
        if (req.method === 'POST' && url.pathname === '/voice') {
            const bytes = new Uint8Array(await req.arrayBuffer())
            await owner.sendAudioMessage({ ...(await media(world.server, 'ptt', bytes)), mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 3 })
            return new Response('ok\n')
        }
        if (req.method === 'POST' && url.pathname === '/vote') {
            // The fake phone can't encrypt a vote, so the vote is handed to the channel the way the client emits it.
            const option = await req.text()
            if (!lastPoll) return new Response('no poll\n', { status: 400 })
            world.client.emit('message_addon', {
                kind: 'poll_vote', targetMessageId: lastPoll.id,
                key: { id: `3EB0VOTE${Date.now()}`, remoteJid: `${OWNER}@s.whatsapp.net`, fromMe: false, isGroup: false },
                decrypted: { kind: 'poll_vote', pollVote: { selectedOptions: [new Uint8Array(createHash('sha256').update(option).digest())] } }
            } as never)
            return new Response('ok\n')
        }
        return new Response('not found\n', { status: 404 })
    }
})
log('e2e ready on', port)
process.stdin.on('close', async () => { await channel.stop(); await world.stop(); process.exit(0) })
