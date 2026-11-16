// Alerts: when they go out, a phone locked just after, dropped addresses, the storyteller's test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sleep, until, KEYS } from './helpers.mjs';

let s;
before(async () => (s = await startServer({ push: true })));
after(() => s.stop());

test('alerts reach hidden and locked phones, not one in view; dropped addresses heal', async () => {
  const names = ['hid', 'watch', 'lock', 'gone', 'bad'];
  const x = await s.room(5, names);
  const P = Object.fromEntries(x.ps.map((p) => [p.name, p]));
  for (const p of x.ps) assert.equal((await p.call('push:subscribe', { sub: { endpoint: `https://localhost:${s.push.port}/${p.name}`, keys: KEYS } }))?.ok, true);
  let lost = null;
  P.gone.on('push:lost', (d) => (lost = d));
  for (const n of ['hid', 'gone', 'bad']) P[n].emit('push:visible', { visible: false });
  P.lock.emit('push:visible', { visible: true }); // then silence: locked
  const beat = setInterval(() => P.watch.emit('push:visible', { visible: true }), 5000);
  P.watch.emit('push:visible', { visible: true });
  await sleep(100);
  for (const n of ['hid', 'watch', 'lock']) assert.equal((await x.st.call('botc:send', { to: P[n].id, text: 'hi' }))?.ok, true);
  await until(() => s.push.count('/hid') === 1);
  assert.equal(s.push.count('/hid'), 1, 'hidden page: at once');
  assert.equal(s.push.count('/lock'), 0, 'just looked: not yet');
  await until(() => s.push.count('/lock') === 1, 16000);
  assert.equal(s.push.count('/lock'), 1, 'locked just after: sent after all');
  assert.equal(s.push.count('/watch'), 0, 'in view: nothing');
  clearInterval(beat);

  const t = await x.st.call('push:testSt', {});
  assert.deepEqual([...t.sent].sort(), ['hid', 'lock', 'watch']);
  assert.deepEqual([...t.failed].sort(), ['bad', 'gone']);
  await until(() => lost);
  assert.ok(lost?.endpoints?.[0]?.endsWith('/gone'), 'the phone is told to make a new address');
  const t2 = await x.st.call('push:testSt', {});
  assert.ok(t2.off.includes('gone'), 'a dropped address is forgotten');
});
