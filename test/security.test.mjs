// Things a stranger with the link could do: crash the server, become storyteller, abuse push.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sleep, until, KEYS } from './helpers.mjs';

let s;
before(async () => (s = await startServer()));
after(() => s.stop());

test('a null payload does not crash the server', async () => {
  const c = await s.conn();
  c.emit('room:join', null);
  c.emit('botc:send', null);
  await sleep(300);
  assert.ok(await s.alive());
});

test('a callback that is not a function does not crash the server', async () => {
  const x = await s.room(5);
  x.ps[0].emit('botc:notes', { text: 'x' }, 'not-a-function', 5);
  await sleep(300);
  assert.ok(await s.alive());
});

test('"__proto__" as a player id gives no storyteller rights', async () => {
  const x = await s.room(5);
  const a = await s.conn();
  await a.call('room:hello', { code: x.code, playerId: '__proto__' });
  const g = await a.call('botc:guess', { seatId: 'st', role: 'imp' });
  assert.notEqual(g?.ok, true);
  const b = await s.conn();
  await b.call('room:watch', { code: x.code });
  const players = await b.call('botc:roomPlayers');
  assert.deepEqual(players, []);
  const again = await b.call('room:hello', { code: x.code });
  assert.ok(!again?.st, 'a watcher must never get the grimoire');
  assert.ok(await s.alive());
});

test('push addresses: only real push services', async () => {
  const x = await s.room(5);
  const tries = ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'http://fcm.googleapis.com/x', 'https://127.0.0.1:1/internal', 'https://exa mple.com/%'];
  const res = [];
  for (const endpoint of tries) res.push((await x.ps[0].call('push:subscribe', { sub: { endpoint, keys: KEYS } }))?.ok === true);
  assert.deepEqual(res, [true, true, true, false, false, false, false, false]);
  assert.ok(await s.alive());
});

test('guessing the storyteller code is braked', async () => {
  const x = await s.room(5);
  let blocked = 0;
  for (let i = 0; i < 40; i++) {
    const a = await s.conn();
    const r = await a.call('room:st', { code: x.code, stCode: String(100000 + i) });
    if (/Too many/.test(r?.error || '')) blocked++;
    a.close();
  }
  assert.ok(blocked > 0, `${blocked} of 40 blocked`);
});

test('players cannot run storyteller actions', async () => {
  const x = await s.room(5);
  const r = await x.ps[0].call('botc:randomRoles');
  assert.equal(r?.ok, false);
  await sleep(100);
  assert.ok(!x.ps[0].st, 'a player never receives the grimoire');
  await until(() => x.ps[0].me);
  assert.equal(x.ps[0].me.me?.role ?? null, null);
});

test('the page only runs its own scripts', async () => {
  const r = await fetch(`${s.url}/`);
  const csp = r.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /font-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const html = await r.text();
  assert.ok(!/fonts\.googleapis|<script>(?!<\/script>)/.test(html), 'no outside fonts, no inline scripts');
});
