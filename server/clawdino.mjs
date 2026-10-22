// Clawdino manager: creates each user's own Telegram bot (Bot API managed bots) and hands its token
// to the user's computer once. Messages never pass through here. Node 20+, no dependencies.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.CLAWDINO_TOKEN;
if (!TOKEN) throw new Error('CLAWDINO_TOKEN is required');
const PORT = Number(process.env.PORT || 8787);
const AVATAR = process.env.CLAWDINO_AVATAR || fileURLToPath(new URL('../assets/clawdino-avatar.jpg', import.meta.url));
const EVENTS = process.env.CLAWDINO_EVENTS || 'events.jsonl';
const API = process.env.TELEGRAM_API || 'https://api.telegram.org';
// Behind a proxy that sets X-Real-IP itself; otherwise the header is the client's to forge.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
let warned = false;
const TTL = 10 * 60_000;
const CODE = /^[0-9a-f]{32}$/;

const TEXT = {
  pt: {
    intro: 'Oi! Eu crio seu coach pessoal no Telegram.\nComece pelo Claude Code no seu computador: peça "connect Telegram".',
    create: 'Toque no link para criar seu Clawdino:',
    ready: 'Pronto! Volte ao Claude e diga que terminou.',
    expired: 'Esse link expirou. Peça um novo ao Claude.',
    about: 'Seu gym bro com IA e base científica, no seu próprio Claude Code.',
    description: 'Seu coach pessoal de treino e dieta.\n\nEle roda no seu próprio Claude Code: seus dados ficam com você.',
  },
  en: {
    intro: 'Hi! I create your personal coach on Telegram.\nStart from Claude Code on your computer: ask "connect Telegram".',
    create: 'Tap the link to create your Clawdino:',
    ready: 'Done! Go back to Claude and say you are done.',
    expired: 'This link expired. Ask Claude for a new one.',
    about: 'Your science-based AI gym bro, in your own Claude Code.',
    description: 'Your personal training and diet coach.\n\nIt runs in your own Claude Code: your data stays with you.',
  },
};
const lang = (user) => (user?.language_code?.startsWith('pt') ? TEXT.pt : TEXT.en);

const hash = (id) => createHash('sha256').update(`${TOKEN}:${id}`).digest('hex').slice(0, 12);
const log = (event) => {
  try {
    appendFileSync(EVENTS, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
  } catch (e) {
    console.error('log failed:', e.message);
  }
};

async function api(method, params = {}, token = TOKEN) {
  const body = params instanceof FormData ? params : JSON.stringify(params);
  const headers = params instanceof FormData ? {} : { 'content-type': 'application/json' };
  const res = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(40_000) });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

// code -> { owner, expires, claim?, used? }, kept a week so old links still answer "expired".
const codes = new Map();
const KEEP = 7 * 24 * 60 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (now > entry.expires) delete entry.claim; // an unclaimed token never outlives its code
    if (now > entry.expires + KEEP) codes.delete(code);
  }
}, 60_000).unref();

async function onStart(msg, me) {
  const t = lang(msg.from);
  const code = msg.text.split(' ')[1] ?? '';
  const entry = codes.get(code);
  // A code belongs to whoever starts it first; anyone else just gets the intro.
  if (!CODE.test(code) || (entry && entry.owner !== msg.from.id)) return api('sendMessage', { chat_id: msg.chat.id, text: t.intro });
  if (entry?.claim || entry?.used) return api('sendMessage', { chat_id: msg.chat.id, text: t.ready });
  if (entry && Date.now() > entry.expires) return api('sendMessage', { chat_id: msg.chat.id, text: t.expired });
  if (!entry) {
    // One open code per person: a new start replaces the previous one, so the map can't be flooded.
    for (const [c, e] of codes) if (e.owner === msg.from.id && !e.claim && !e.used) codes.delete(c);
    codes.set(code, { owner: msg.from.id, expires: Date.now() + TTL });
    log({ t: 'start', uid: hash(msg.from.id) });
  }
  const suggested = `clawdino_${Math.floor(1000 + Math.random() * 9000)}_bot`;
  const link = `https://t.me/newbot/${me.username}/${suggested}?name=Clawdino`;
  await api('sendMessage', { chat_id: msg.chat.id, text: `${t.create}\n${link}` });
}

// Creation service message: says why nothing happens when no Claude Code session is waiting for this bot.
async function onCreated(msg) {
  const owner = msg.from.id;
  const entries = [...codes.values()].filter((e) => e.owner === owner);
  if (!entries.length) {
    log({ t: 'orphan', uid: hash(owner) });
    return api('sendMessage', { chat_id: msg.chat.id, text: lang(msg.from).intro });
  }
  if (entries.every((e) => !e.claim && !e.used && Date.now() > e.expires)) {
    return api('sendMessage', { chat_id: msg.chat.id, text: lang(msg.from).expired });
  }
}

async function onManagedBot({ user, bot }) {
  // The newest open code of this user; token or owner changes of older bots find none.
  const entry = [...codes.values()]
    .filter((e) => e.owner === user.id && !e.claim && !e.used && Date.now() <= e.expires)
    .sort((a, b) => b.expires - a.expires)[0];
  if (!entry) return;
  let token;
  try {
    token = await api('getManagedBotToken', { user_id: bot.id });
  } catch (e) {
    console.error('token failed:', e.message);
    return api('sendMessage', { chat_id: user.id, text: lang(user).expired });
  }
  // The owner's name lets Claude Code check that the person who tapped the link is the one at the computer.
  const ownerName = [user.first_name, user.last_name].filter(Boolean).join(' ') + (user.username ? ` (@${user.username})` : '');
  entry.claim = { token, owner_id: user.id, owner_name: ownerName, username: bot.username };
  log({ t: 'created', uid: hash(user.id) });
  await api('sendMessage', { chat_id: user.id, text: lang(user).ready });
  await dress(bot.id, token);
}

// Only the owner can reach the new bot; photo and texts too. The name stays the one the user confirmed.
async function dress(botId, token) {
  await api('setManagedBotAccessSettings', { user_id: botId, is_access_restricted: true }).catch((e) =>
    console.error('access restriction failed:', e.message),
  );
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://p' }));
  form.append('p', new Blob([readFileSync(AVATAR)], { type: 'image/jpeg' }), 'avatar.jpg');
  const steps = [() => api('setMyProfilePhoto', form, token)];
  for (const [code, t] of [['', TEXT.en], ['pt', TEXT.pt]]) {
    steps.push(() => api('setMyShortDescription', { short_description: t.about, language_code: code }, token));
    steps.push(() => api('setMyDescription', { description: t.description, language_code: code }, token));
  }
  for (const step of steps) await step().catch((e) => console.error('dress failed:', e.message));
}

let me; // the manager bot, once getMe succeeds

async function poll() {
  let offset = 0;
  let wait = 1000;
  for (;;) {
    try {
      me ??= await api('getMe');
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'managed_bot'] });
      wait = 1000;
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          const msg = u.message?.chat?.type === 'private' ? u.message : null;
          if (msg && /^\/start( |$)/.test(msg.text ?? '')) await onStart(msg, me);
          else if (msg?.managed_bot_created) await onCreated(msg);
          else if (msg) await api('sendMessage', { chat_id: msg.chat.id, text: lang(msg.from).intro });
          if (u.managed_bot) await onManagedBot(u.managed_bot);
        } catch (e) {
          console.error('update failed:', e.message);
        }
      }
    } catch (e) {
      console.error(`polling failed, retrying in ${wait / 1000}s:`, e.message);
      await new Promise((r) => setTimeout(r, wait));
      // Short cap: someone may be waiting on a claim link while Telegram hiccups.
      wait = Math.min(wait * 2, 15_000);
    }
  }
}

// Per-IP rate limit: RATE requests a minute.
const RATE = 60;
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
const limited = (ip) => (hits.set(ip, (hits.get(ip) ?? 0) + 1), hits.get(ip) > RATE);

const PING = { id: /^[0-9a-f]{32}$/, day: /^\d{4}-\d{2}-\d{2}$/, channel: /^(telegram|whatsapp|terminal)$/, v: /^[0-9a-z.+-]{1,20}$/ };

http
  .createServer((req, res) => {
    const send = (status, body = '') => res.writeHead(status, { 'content-type': 'application/json' }).end(body);
    if (!TRUST_PROXY && req.headers['x-real-ip'] && !warned) {
      warned = true;
      console.error('X-Real-IP is set but TRUST_PROXY is not: every client shares one rate limit');
    }
    const ip = (TRUST_PROXY && req.headers['x-real-ip']) || req.socket.remoteAddress;
    if (limited(ip)) return send(429);
    const claim = req.method === 'GET' && req.url.match(/^\/claim\/([0-9a-f]{32})$/);
    if (claim) {
      const entry = codes.get(claim[1]);
      if (!entry) return send(404);
      if (entry.used || Date.now() > entry.expires) return send(410);
      if (!entry.claim) return send(404);
      const body = JSON.stringify(entry.claim);
      entry.used = true;
      delete entry.claim;
      log({ t: 'claimed', uid: hash(entry.owner) });
      return send(200, body);
    }
    if (req.method === 'POST' && req.url === '/ping') {
      let raw = '';
      req.on('data', (d) => {
        raw += d;
        if (raw.length > 512) req.destroy();
      });
      req.on('end', () => {
        try {
          const p = JSON.parse(raw);
          if (!Object.entries(PING).every(([k, re]) => re.test(String(p[k])))) return send(400);
          log({ t: 'ping', id: p.id, day: p.day, channel: p.channel, v: p.v });
          send(204);
        } catch {
          send(400);
        }
      });
      return;
    }
    // The plugin reads the manager's username here, which also tells it the server is up.
    if (req.method === 'GET' && req.url === '/health') return me ? send(200, JSON.stringify({ bot: me.username })) : send(503);
    send(404);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`clawdino on 127.0.0.1:${PORT}`));

poll();
