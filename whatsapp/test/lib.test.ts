import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
    admitted, chunks, classify, inboxName, learnedLid, meta, outbound, parseOwner, PREFIX, Recent, sendable, stale, stateDir,
    variants, voted
} from '../lib'

const me = { pn: '5511900000000', lid: '111111111111111' }
const owner = parseOwner({ owner: '+55 61 99999-0000' })
const self = parseOwner({ owner: 'self' })

describe('owner', () => {
    test('a number, or the self-chat', () => {
        expect(owner).toEqual({ mode: 'number', number: '5561999990000' })
        expect(self).toEqual({ mode: 'self' })
        expect(parseOwner({})).toEqual({ mode: 'self' })
        expect(parseOwner({ owner: '5561999990000', lid: '222' })).toEqual({ mode: 'number', number: '5561999990000', lid: '222' })
        expect(parseOwner({ owner: '5561999990000', lid: '../x' })).toEqual({ mode: 'number', number: '5561999990000' })
    })
    test('Brazilian mobile numbers with and without the 9', () => {
        expect(variants('5561999990000')).toEqual(['5561999990000', '556199990000'])
        expect(variants('556199990000')).toEqual(['556199990000', '5561999990000'])
        expect(variants('14155550000')).toEqual(['14155550000'])
    })
    test('state folder follows the same variables as the hooks', () => {
        expect(stateDir({ WHATSAPP_STATE_DIR: '/x' })).toBe('/x')
        expect(stateDir({ CLAUDE_CONFIG_DIR: '/c' })).toBe('/c/channels/whatsapp')
    })
})

describe('admission', () => {
    const fromOwner = { id: 'A', remoteJid: '5561999990000@s.whatsapp.net', fromMe: false, isGroup: false }
    test('with its own number, only the owner, by phone number or LID', () => {
        expect(admitted(fromOwner, owner, me)).toBe(true)
        expect(admitted({ ...fromOwner, remoteJid: '556199990000@s.whatsapp.net' }, owner, me)).toBe(true)
        expect(admitted({ id: 'A', remoteJid: '333@lid', remoteJidAlt: '5561999990000@s.whatsapp.net' }, owner, me)).toBe(true)
        expect(admitted({ id: 'A', remoteJid: '333@lid' }, owner, me)).toBe(false)
        expect(admitted({ id: 'A', remoteJid: '333@lid' }, { ...owner, lid: '333' } as typeof owner, me)).toBe(true)
        expect(admitted({ ...fromOwner, remoteJid: '5511888880000@s.whatsapp.net' }, owner, me)).toBe(false)
    })
    test('never what the bot number sends itself, groups, status or channels', () => {
        expect(admitted({ ...fromOwner, fromMe: true }, owner, me)).toBe(false)
        expect(admitted({ ...fromOwner, isGroup: true }, owner, me)).toBe(false)
        expect(admitted({ ...fromOwner, remoteJid: '120363000000@g.us', participant: '5561999990000@s.whatsapp.net' }, owner, me)).toBe(false)
        expect(admitted({ ...fromOwner, remoteJid: 'status@broadcast', participant: '5561999990000@s.whatsapp.net' }, owner, me)).toBe(false)
        expect(admitted({ ...fromOwner, remoteJid: '1203630@newsletter' }, owner, me)).toBe(false)
        expect(admitted({ ...fromOwner, id: '' }, owner, me)).toBe(false)
    })
    test('in the self-chat, only what the owner writes to themself', () => {
        const note = { id: 'B', remoteJid: `${me.lid}@lid`, remoteJidAlt: `${me.pn}@s.whatsapp.net`, fromMe: true }
        expect(admitted(note, self, me)).toBe(true)
        expect(admitted({ ...note, remoteJidAlt: undefined }, self, me)).toBe(true)
        expect(admitted({ ...note, fromMe: false }, self, me)).toBe(false)
        expect(admitted({ id: 'B', remoteJid: '5561999990000@s.whatsapp.net', fromMe: true }, self, me)).toBe(false)
        expect(admitted({ id: 'B', remoteJid: '5561999990000@s.whatsapp.net', fromMe: false }, self, me)).toBe(false)
    })
    test('the owner LID is learned from a message that also carries their number', () => {
        expect(learnedLid({ id: 'A', remoteJid: '333@lid', remoteJidAlt: '556199990000@s.whatsapp.net' }, owner)).toBe('333')
        expect(learnedLid({ id: 'A', remoteJid: '333@lid', remoteJidAlt: '5511888880000@s.whatsapp.net' }, owner)).toBeUndefined()
        expect(learnedLid({ id: 'A', remoteJid: '333@lid' }, owner)).toBeUndefined()
    })
})

describe('messages', () => {
    test('text, captions and wrappers', () => {
        expect(classify({ conversation: 'oi' })).toEqual({ kind: 'text', text: 'oi' })
        expect(classify({ extendedTextMessage: { text: 'link' } }).text).toBe('link')
        expect(classify({ ephemeralMessage: { message: { conversation: 'some' } } }).text).toBe('some')
        expect(classify({ imageMessage: { caption: 'treino' } })).toEqual({ kind: 'image', text: 'treino' })
        expect(classify({ imageMessage: {} }).text).toBe('(photo)')
        expect(classify({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'plano<x>.pdf', caption: '' } } } }))
            .toEqual({ kind: 'document', text: '(document: plano_x_.pdf)', label: 'plano_x_.pdf' })
    })
    test('voice notes apart from other audio', () => {
        expect(classify({ audioMessage: { ptt: true } }).kind).toBe('voice')
        expect(classify({ audioMessage: { ptt: false } }).kind).toBe('audio')
    })
    test('what the coach never sees', () => {
        for (const m of [{ reactionMessage: {} }, { protocolMessage: {} }, { editedMessage: {} }, { pollUpdateMessage: {} }, {}, null,
            { conversation: '   ' }, { senderKeyDistributionMessage: {} }])
            expect(classify(m as never).kind).toBe('ignore')
    })
    test('the rest as a short placeholder', () => {
        expect(classify({ stickerMessage: {} })).toEqual({ kind: 'other', text: '(sticker)' })
        expect(classify({ videoMessage: {} }).text).toBe('(video)')
    })
    test('old messages after a long outage', () => {
        const now = 1_800_000_000_000
        expect(stale(now / 1000 - 25 * 3600, now)).toBe(true)
        expect(stale(now / 1000 - 3600, now)).toBe(false)
        expect(stale(undefined, now)).toBe(false)
    })
    test('meta keeps identifiers and strings only', () => {
        expect(meta({ message_id: 'X', size: 12, empty: '', 'bad-key': 'y', missing: undefined })).toEqual({ message_id: 'X', size: '12' })
    })
    test('the self-chat prefix ends the line', () => {
        expect(PREFIX.endsWith('\n')).toBe(true)
    })
})

describe('polls', () => {
    const h = (s: string) => new Uint8Array(createHash('sha256').update(s).digest())
    test('a vote maps back to the option names', () => {
        expect(voted(['Treino A', 'Treino B', 'Descanso'], [h('Treino B')])).toEqual(['Treino B'])
        expect(voted(['✅ Allow', '❌ Deny'], [h('❌ Deny')])).toEqual(['❌ Deny'])
        expect(voted(['a', 'b'], [])).toEqual([])
        expect(voted(['a', 'b'], null)).toEqual([])
        expect(voted(['a'], [h('z')])).toEqual([])
    })
})

describe('sending', () => {
    test('long text splits at a line', () => {
        const text = `${'a'.repeat(3000)}\n${'b'.repeat(3000)}`
        expect(chunks(text)).toEqual(['a'.repeat(3000), 'b'.repeat(3000)])
        expect(chunks('short')).toEqual(['short'])
        expect(chunks('x'.repeat(9000)).map((c) => c.length)).toEqual([4000, 4000, 1000])
    })
    test('images as photos, the rest as documents', () => {
        expect(outbound('/f/plan.pdf')).toEqual({ type: 'document', mimetype: 'application/pdf', fileName: 'plan.pdf' })
        expect(outbound('/f/card.PNG').type).toBe('image')
        expect(outbound('/f/plan.html').mimetype).toBe('text/html')
        expect(outbound('/f/data.bin').mimetype).toBe('application/octet-stream')
    })
    test('the bot folder never leaves, except what the owner sent', () => {
        const dir = '/home/sam/.claude/channels/whatsapp'
        expect(sendable('/home/sam/my-fitness/plan.pdf', dir)).toBeNull()
        expect(sendable(`${dir}/wa.sqlite`, dir)).toContain('refusing')
        expect(sendable(`${dir}/inbox/../wa.sqlite`, dir)).toContain('refusing')
        expect(sendable(`${dir}/inbox/1-a.jpg`, dir)).toBeNull()
        expect(sendable('plan.pdf', dir)).toContain('absolute')
    })
    test('inbox names never come from the sender', () => {
        expect(inboxName('../../etc/passwd', '.ogg')).toMatch(/^\d+-etcpasswd\.ogg$/)
    })
    test('recent ids stay bounded', () => {
        const r = new Recent(2)
        r.set('a', true); r.set('b', true); r.set('c', true)
        expect([r.has('a'), r.has('b'), r.has('c')]).toEqual([false, true, true])
    })
})
