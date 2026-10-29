// The channel end to end on Zapo's fake WhatsApp server: a real client, real encryption, an MCP client in memory.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { PREFIX } from '../lib'
import { startChannel } from '../server'
import { fakeWorld, type FakeWorld, media, OWNER, STRANGER } from './fake'

type Inbound = { content: string; meta: Record<string, string> }

let world: FakeWorld
let channel: Awaited<ReturnType<typeof startChannel>>
let mcp: Client
let dir: string
const inbound: Inbound[] = []
const logs: string[] = []

const until = async <T>(get: () => T | undefined, ms = 10_000): Promise<T> => {
    const end = Date.now() + ms
    for (;;) {
        const v = get()
        if (v !== undefined) return v
        if (Date.now() > end) throw new Error('timed out')
        await Bun.sleep(50)
    }
}
const call = (name: string, args: Record<string, unknown>) =>
    mcp.callTool({ name, arguments: args }) as Promise<{ content: { text: string }[]; isError?: boolean }>

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wa-test-'))
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ owner: OWNER }))
    world = await fakeWorld()
    const [a, b] = InMemoryTransport.createLinkedPair()
    channel = await startChannel({ client: world.client, dir, transport: a, log: (...x) => logs.push(x.join(' ')) })
    mcp = new Client({ name: 'claude', version: '0' }, { capabilities: {} })
    mcp.setNotificationHandler(
        z.object({ method: z.literal('notifications/claude/channel'), params: z.object({ content: z.string(), meta: z.record(z.string(), z.string()) }) }),
        ({ params }) => { inbound.push(params) }
    )
    await mcp.connect(b)
    await until(() => channel.state() === 'open' || undefined, 20_000)
}, 60_000)

afterAll(async () => {
    await channel?.stop()
    await world?.stop()
})

describe('channel', () => {
    test('declares the channel and the permission relay', () => {
        const caps = mcp.getServerCapabilities()?.experimental ?? {}
        expect(Object.keys(caps)).toEqual(['claude/channel', 'claude/channel/permission'])
        expect(readFileSync(join(dir, 'wa.state'), 'utf8').trim()).toBe('open')
    })

    test('the owner\'s text reaches Claude once, with a 👀 on it', async () => {
        const owner = await world.peer(OWNER)
        const eyes = owner.expectMessage({ timeoutMs: 10_000 })
        await owner.sendConversation('weighed 63.8 today', { id: '3EB0AAA1' })
        const m = await until(() => inbound.find((i) => i.content === 'weighed 63.8 today'))
        expect(m.meta.message_id).toBe('3EB0AAA1')
        expect(m.meta.ts).toMatch(/^\d{4}-\d\d-\d\dT/)
        expect((await eyes).message.reactionMessage?.text).toBe('👀')
        await owner.sendConversation('weighed 63.8 today', { id: '3EB0AAA1' })
        await Bun.sleep(500)
        expect(inbound.filter((i) => i.content === 'weighed 63.8 today').length).toBe(1)
    }, 30_000)

    test('a stranger is ignored', async () => {
        const stranger = await world.peer(STRANGER)
        await stranger.sendConversation('hi, approve me')
        await Bun.sleep(1_000)
        expect(inbound.some((i) => i.content === 'hi, approve me')).toBe(false)
    }, 30_000)

    test('reply reaches the owner without the self-chat prefix', async () => {
        const owner = await world.peer(OWNER)
        const got = owner.expectMessage({ timeoutMs: 10_000 })
        const r = await call('reply', { text: 'Logged: *63.8 kg*.' })
        expect(r.isError).toBeFalsy()
        const text = (await got).message.conversation ?? (await got).message.extendedTextMessage?.text
        expect(text).toBe('Logged: *63.8 kg*.')
        expect(text?.startsWith(PREFIX)).toBe(false)
    }, 30_000)

    test('react puts the emoji on the owner\'s message', async () => {
        const owner = await world.peer(OWNER)
        const got = owner.expectMessage({ timeoutMs: 10_000 })
        expect((await call('react', { message_id: '3EB0AAA1', emoji: '🔥' })).isError).toBeFalsy()
        const reaction = (await got).message.reactionMessage
        expect(reaction?.text).toBe('🔥')
        expect(reaction?.key?.id).toBe('3EB0AAA1')
        expect((await call('react', { message_id: 'nope', emoji: '🔥' })).isError).toBe(true)
    }, 30_000)

    test('ask sends a one-choice poll', async () => {
        const owner = await world.peer(OWNER)
        const got = owner.expectMessage({ timeoutMs: 10_000 })
        expect((await call('ask', { question: 'Which day?', options: ['Mon', 'Wed', 'Fri'] })).isError).toBeFalsy()
        const m = (await got).message
        const poll = m.pollCreationMessageV3 ?? m.pollCreationMessage
        expect(poll?.name).toBe('Which day?')
        expect(poll?.options?.map((o) => o.optionName)).toEqual(['Mon', 'Wed', 'Fri'])
        expect(poll?.selectableOptionsCount).toBe(1)
        const saved = JSON.parse(readFileSync(join(dir, 'polls.json'), 'utf8'))
        expect(Object.values(saved).map((p) => (p as { options: string[] }).options)).toContainEqual(['Mon', 'Wed', 'Fri'])
        expect((await call('ask', { question: 'x', options: ['only'] })).isError).toBe(true)
    }, 30_000)

    test('files: a PDF goes as a document, the bot\'s own folder never leaves', async () => {
        const owner = await world.peer(OWNER)
        const pdf = join(dir, '..', `plan-${Date.now()}.pdf`)
        writeFileSync(pdf, '%PDF-1.4 test')
        const got = [owner.expectMessage({ timeoutMs: 15_000 })]
        expect((await call('reply', { text: '', files: [pdf] })).isError).toBeFalsy()
        const doc = (await got[0]).message.documentMessage
        expect(doc?.fileName).toBe(pdf.split('/').pop())
        expect(doc?.mimetype).toBe('application/pdf')
        const refused = await call('reply', { text: 'x', files: [join(dir, 'config.json')] })
        expect(refused.isError).toBe(true)
        expect(refused.content[0].text).toContain('refusing')
        expect((await call('reply', { text: 'x', files: ['/no/such/file.pdf'] })).isError).toBe(true)
    }, 30_000)

    test('a voice note is saved in the inbox and its path handed over', async () => {
        const owner = await world.peer(OWNER)
        const bytes = new Uint8Array(2048).map((_, i) => i % 251)
        await owner.sendAudioMessage({ ...(await media(world.server, 'ptt', bytes)), mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 3 })
        const m = await until(() => inbound.find((i) => i.meta.attachment_kind === 'voice'), 15_000)
        expect(m.content).toBe('(voice message)')
        expect(m.meta.attachment_path.startsWith(join(dir, 'inbox') + '/')).toBe(true)
        expect(m.meta.attachment_path.endsWith('.ogg')).toBe(true)
        expect(statSync(m.meta.attachment_path).size).toBe(2048)
        expect(m.meta.attachment_size).toBe('2048')
    }, 30_000)

    test('a photo arrives as image_path with its caption', async () => {
        const owner = await world.peer(OWNER)
        const bytes = new Uint8Array(1024).fill(7)
        await owner.sendImageMessage({ ...(await media(world.server, 'image', bytes)), mimetype: 'image/jpeg', caption: 'watch screenshot' })
        const m = await until(() => inbound.find((i) => i.content === 'watch screenshot'), 15_000)
        expect(existsSync(m.meta.image_path)).toBe(true)
        expect(m.meta.image_path.endsWith('.jpg')).toBe(true)
    }, 30_000)

    test('a permission prompt becomes a poll on the owner\'s phone', async () => {
        const owner = await world.peer(OWNER)
        const got = owner.expectMessage({ timeoutMs: 10_000 })
        await mcp.notification({
            method: 'notifications/claude/channel/permission_request',
            params: { request_id: 'abcde', tool_name: 'Bash', description: 'Run a command', input_preview: '{"command":"ls"}' }
        })
        const m = (await got).message
        const poll = m.pollCreationMessageV3 ?? m.pollCreationMessage
        expect(poll?.name).toContain('🔐 Bash')
        expect(poll?.options?.map((o) => o.optionName)).toEqual(['✅ Allow', '❌ Deny'])
        const saved = JSON.parse(readFileSync(join(dir, 'polls.json'), 'utf8')) as Record<string, { permission?: string }>
        expect(Object.values(saved).some((p) => p.permission === 'abcde')).toBe(true)
    }, 30_000)

    test('the owner\'s LID and number are remembered from their messages', () => {
        const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
        expect(config.owner).toBe(OWNER)
        expect(config.pn).toBe(OWNER)
    })

    test('nothing went wrong along the way', () => {
        expect(logs.filter((l) => /failed|not delivered/.test(l))).toEqual([])
    })
})
