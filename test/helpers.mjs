// Test helpers: a fresh server per test file (own port and data folder) and small socket clients.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

// wait until fn() is truthy (state arrives over the socket a moment after an ack)
export async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v || Date.now() > end) return v;
    await sleep(20);
  }
}

// a self-signed certificate for a fake push service on localhost
function cert(dir) {
  const key = path.join(dir, 'k.pem');
  const crt = path.join(dir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  return { key, crt };
}

// fake push service: answers by path (/gone… 410, /bad… 500, else 201) and remembers every hit
export async function pushService(dir) {
  const { key, crt } = cert(dir);
  const hits = [];
  const srv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
    const code = req.url.startsWith('/gone') ? 410 : req.url.startsWith('/bad') ? 500 : 201;
    hits.push({ path: req.url, code, t: Date.now() });
    req.resume();
    res.writeHead(code).end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, crt, hits, count: (p) => hits.filter((h) => h.path === p).length, close: () => srv.close() };
}

export async function startServer({ env = {}, push = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-test-'));
  const fake = push ? await pushService(dir) : null;
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dir, 'data'), BOARDPASS_SECRET: '', HOST_SECRET: '', ...(fake && { PUSH_EXTRA_HOSTS: 'localhost', NODE_EXTRA_CA_CERTS: fake.crt }), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  const clients = [];
  const s = {
    url,
    push: fake,
    log: () => log,
    alive: async () => {
      try {
        return (await fetch(`${url}/health`)).ok;
      } catch {
        return false;
      }
    },
    // a socket with .call(event, data) → ack, and the latest views in .st / .me / .pub
    async conn() {
      const c = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
      clients.push(c);
      await new Promise((r, j) => {
        c.on('connect', r);
        c.on('connect_error', j);
      });
      c.call = (ev, data) =>
        new Promise((r) => {
          const t = setTimeout(() => r('TIMEOUT'), 4000);
          c.emit(ev, data, (x) => {
            clearTimeout(t);
            r(x);
          });
        });
      c.on('botc:st', (v) => (c.st = v));
      c.on('botc:me', (v) => (c.me = v));
      c.on('botc:pub', (v) => (c.pub = v));
      return c;
    },
    // a room with a storyteller and n seated players
    async room(n = 7, names) {
      const st = await s.conn();
      const r = await st.call('room:create');
      const ps = [];
      for (let i = 0; i < n; i++) {
        const p = await s.conn();
        const name = names?.[i] || `P${i + 1}`;
        const j = await p.call('room:join', { code: r.code, name });
        Object.assign(p, { id: j.playerId, key: j.key, name });
        ps.push(p);
      }
      await until(() => st.st?.seats?.length === n);
      const x = {
        code: r.code,
        stCode: r.stCode,
        st,
        ps,
        v: () => st.st,
        seat: (id) => st.st.seats.find((z) => z.role?.id === id),
        phone: (id) => ps.find((p) => p.id === x.seat(id)?.playerId),
        async deal(script, roles) {
          if (script && script !== 'tb') await st.call('botc:script', { id: script });
          const d = await st.call('botc:dealRoles', { ids: roles });
          if (!d?.ok) throw new Error(`deal: ${JSON.stringify(d)}`);
          await until(() => roles.every((id) => st.st.seats.some((z) => z.role?.id === id)));
          return x;
        },
      };
      return x;
    },
    async stop() {
      for (const c of clients) c.close();
      child.kill();
      fake?.close();
      await sleep(50);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return s;
}
