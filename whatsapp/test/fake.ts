// A paired bot and its owner on Zapo's fake WhatsApp server, with real encryption and nothing leaving this computer.
// Used by the channel tests and by test/e2e.ts.
import { FakeWaServer, type FakePeer } from '@zapo-js/fake-server'
import { createNoopLogger, createStore, type WaClient, WaClient as Client } from 'zapo-js'

// Under Bun, ws hands the fake server a close reason that is already a string, which it then decodes again.
const decode = TextDecoder.prototype.decode
TextDecoder.prototype.decode = function (input?: unknown, options?: Parameters<typeof decode>[1]) {
    return typeof input === 'string' ? input : decode.call(this, input as Parameters<typeof decode>[0], options)
}

export const BOT = '5511900000000'
export const OWNER = '5561999990000'
export const STRANGER = '5511888880000'

export interface FakeWorld {
    readonly server: FakeWaServer
    readonly client: WaClient
    peer(number: string): Promise<FakePeer>
    stop(): Promise<void>
}

// The client the bot would build, pointed at the fake server, and linked as BOT's device 1.
export async function fakeWorld(): Promise<FakeWorld> {
    const server = await FakeWaServer.start()
    const client = new Client({
        store: createStore({}),
        sessionId: 'fake',
        chatSocketUrls: [server.url],
        markOnlineOnConnect: false,
        history: { enabled: false },
        proxy: { mediaUpload: server.mediaProxyAgent, mediaDownload: server.mediaProxyAgent },
        testHooks: { noiseRootCa: server.noiseRootCa }
    }, createNoopLogger('error'))
    const material = new Promise<{ advSecretKey: Uint8Array; identityPublicKey: Uint8Array }>((resolve) =>
        client.once('auth_qr', (e) => {
            const parts = e.qr.split(',')
            const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
            resolve({ advSecretKey: b64(parts[parts.length - 2]), identityPublicKey: b64(parts[parts.length - 3]) })
        }))
    const paired = new Promise((r) => client.once('auth_paired', r))
    await client.connect()
    const first = await server.waitForAuthenticatedPipeline()
    const next = server.waitForNextAuthenticatedPipeline()
    await server.runPairing(first, { deviceJid: `${BOT}:1@s.whatsapp.net` }, () => material)
    await paired
    const pipeline = await next
    await server.triggerPreKeyUpload(pipeline)
    await client.disconnect()
    const peers = new Map<string, FakePeer>()
    return {
        server,
        client,
        async peer(number) {
            let p = peers.get(number)
            if (!p) {
                const pipe = await server.waitForAuthenticatedPipeline()
                p = await server.createFakePeer({ jid: `${number}@s.whatsapp.net` }, pipe)
                await server.triggerPreKeyUpload(pipe)
                peers.set(number, p)
            }
            return p
        },
        async stop() {
            await client.disconnect().catch(() => undefined)
            await server.stop()
        }
    }
}

// A media file the fake server hosts, as a peer's message points to it.
export async function media(server: FakeWaServer, mediaType: 'ptt' | 'image' | 'document', bytes: Uint8Array) {
    const blob = await server.publishMediaBlob({ mediaType, plaintext: bytes })
    return {
        directPath: server.mediaUrl(blob.path), mediaKey: blob.mediaKey, fileSha256: blob.fileSha256,
        fileEncSha256: blob.fileEncSha256, fileLength: blob.fileLength
    }
}
