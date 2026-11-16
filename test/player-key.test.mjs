// Player keys (sign-in off): a seat belongs to a device; after the start the storyteller approves a new one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until } from './helpers.mjs';

let s;
before(async () => (s = await startServer()));
after(() => s.stop());

test('the player id alone does not open a seat; the key does', async () => {
  const x = await s.room(5);
  const p = x.ps[0];
  assert.match(p.key, /^[a-f0-9]{32}$/);
  const a = await s.conn();
  const bad = await a.call('room:hello', { code: x.code, playerId: p.id });
  assert.equal(bad.me, null);
  assert.equal(bad.lost, true);
  const b = await s.conn();
  const good = await b.call('room:hello', { code: x.code, playerId: p.id, key: p.key });
  assert.equal(good.me?.me?.name, p.name);
});

test('during setup a name moves to a new device at once; the old one is logged out', async () => {
  const x = await s.room(5);
  const old = x.ps[1];
  let moved = false;
  old.on('room:moved', () => (moved = true));
  const n = await s.conn();
  const r = await n.call('room:join', { code: x.code, name: old.name });
  assert.equal(r.playerId, old.id);
  assert.ok(r.key && r.key !== old.key);
  await until(() => moved);
  assert.ok(moved, 'old device told');
  const back = await (await s.conn()).call('room:hello', { code: x.code, playerId: old.id, key: old.key });
  assert.equal(back.lost, true, 'the old key no longer works');
});

test('after the start the storyteller decides; no means no, yes moves the seat', async () => {
  const x = await (await s.room(7)).deal('tb', ['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp']);
  await x.st.call('botc:start');
  const old = x.ps[2];
  await until(() => old.me?.me?.role);

  // a stranger types the name: waits, sees nothing
  const a = await s.conn();
  let denied = false;
  a.on('room:denied', () => (denied = true));
  const r1 = await a.call('room:join', { code: x.code, name: old.name });
  assert.equal(r1.pending, true);
  assert.equal(r1.me, undefined);
  await until(() => x.st.st.requests?.length === 1);
  assert.equal(x.st.st.requests[0].name, old.name);
  assert.equal((await a.call('botc:notes', { text: 'x' }))?.ok, false, 'no player rights while waiting');
  assert.equal((await x.ps[0].call('botc:approve', { playerId: old.id, allow: true }))?.ok, false, 'only the storyteller approves');
  await x.st.call('botc:approve', { playerId: old.id, allow: false });
  await until(() => denied);
  assert.ok(denied);
  assert.equal(x.st.st.requests.length, 0);

  // the real player on a new phone: allowed
  const b = await s.conn();
  let approved = null;
  let moved = false;
  b.on('room:approved', (v) => (approved = v));
  old.on('room:moved', () => (moved = true));
  await b.call('room:join', { code: x.code, name: old.name });
  await until(() => x.st.st.requests?.length === 1);
  await x.st.call('botc:approve', { playerId: old.id, allow: true });
  await until(() => approved && moved);
  assert.equal(approved.playerId, old.id);
  assert.equal(approved.me.me.role.id, old.me.me.role.id, 'the new device sees the character');
  assert.ok(moved, 'the old device is logged out');
  const again = await (await s.conn()).call('room:hello', { code: x.code, playerId: old.id, key: approved.key });
  assert.equal(again.me?.me?.name, old.name);
});

test('one open request per name; a device that leaves takes its request along', async () => {
  const x = await (await s.room(5)).deal('tb', ['washerwoman', 'chef', 'empath', 'poisoner', 'imp']);
  await x.st.call('botc:start');
  const name = x.ps[0].name;
  const a = await s.conn();
  let replaced = false;
  a.on('room:denied', (d) => (replaced = d?.replaced));
  await a.call('room:join', { code: x.code, name });
  const b = await s.conn();
  await b.call('room:join', { code: x.code, name });
  await until(() => replaced);
  assert.ok(replaced, 'the first one is told');
  assert.equal(x.st.st.requests.length, 1);
  b.close();
  await until(() => x.st.st.requests.length === 0);
  assert.equal(x.st.st.requests.length, 0);
});

test('members saved before keys existed still get in with their id, and get a key', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-old-'));
  fs.mkdirSync(path.join(dir, 'rooms'));
  const room = { code: 'ABCDE', created: Date.now(), touched: Date.now(), members: { 'aaaaaaaa-1111': { name: 'Old', manual: false } }, tokens: [], stCode: '123456', scripts: [], g: null };
  fs.writeFileSync(path.join(dir, 'rooms', 'ABCDE.json'), JSON.stringify(room));
  const old = await startServer({ env: { DATA_DIR: dir } });
  try {
    const c = await old.conn();
    const r = await c.call('room:hello', { code: 'ABCDE', playerId: 'aaaaaaaa-1111' });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.match(r.key || '', /^[a-f0-9]{32}$/);
    const without = await (await old.conn()).call('room:hello', { code: 'ABCDE', playerId: 'aaaaaaaa-1111' });
    assert.equal(without.lost, true, 'from then on the key is needed');
  } finally {
    await old.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
