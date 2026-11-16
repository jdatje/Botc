// Game flow: start, night order, phone answers, timer, Scarlet Woman, what each phone is shown.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, until, sleep } from './helpers.mjs';

let s;
before(async () => (s = await startServer()));
after(() => s.stop());

const reminder = (seat, label) => seat.reminders.some((r) => r.label === label);

test('Trouble Brewing: start, timer, Scarlet Woman, night order, Monk', async () => {
  const x = await (await s.room(7)).deal('tb', ['fortuneteller', 'chef', 'empath', 'scarletwoman', 'imp', 'monk', 'ravenkeeper']);
  const { st } = x;
  await st.call('botc:start');
  await until(() => st.st.phase !== 'setup');
  const herring = st.st.seats.filter((z) => reminder(z, 'Red Herring'));
  assert.equal(herring.length, 1, 'one Red Herring');
  assert.equal(herring[0].align, 'good');
  assert.equal((await st.call('botc:start'))?.ok, false, 'no second start mid-game');

  await st.call('botc:phase', { to: 'day' });
  await st.call('botc:timer', { action: 'minutes', minutes: 1 });
  await st.call('botc:timer', { action: 'start' });
  await until(() => st.st.timer.running);
  const e1 = st.st.timer.endsAt;
  await st.call('botc:timer', { action: 'start' });
  await sleep(50);
  assert.equal(st.st.timer.endsAt, e1, 'a second Start does not restart the clock');
  await st.call('botc:timer', { action: 'add' });
  await until(() => st.st.timer.endsAt !== e1);
  assert.ok(Math.abs(st.st.timer.endsAt - e1 - 60000) < 50, '+1 adds a minute');

  // the Imp dies: the Scarlet Woman takes over; reviving undoes it
  await st.call('botc:seat', { seatId: x.seat('imp').id, patch: { dead: true } });
  await until(() => st.st.seats.find((z) => z.shown?.id === 'scarletwoman')?.role.id === 'imp');
  const deadImp = st.st.seats.find((z) => z.role.id === 'imp' && z.dead);
  await st.call('botc:seat', { seatId: deadImp.id, patch: { dead: false } });
  await until(() => st.st.seats.filter((z) => z.role.id === 'imp').length === 1);
  assert.ok(st.st.seats.some((z) => z.role.id === 'scarletwoman' && !z.shown));
  assert.ok(!st.st.seats.some((z) => reminder(z, 'Is the Demon') || reminder(z, 'Died Today')));

  // night 2: a dead Empath is skipped; the Ravenkeeper killed tonight stays
  await st.call('botc:seat', { seatId: x.seat('empath').id, patch: { dead: true } });
  await st.call('botc:phase', { to: 'night' });
  await until(() => st.st.phase === 'night');
  assert.equal(st.st.timer.running, false, 'timer stopped at night');
  assert.ok(!st.st.nightOrder.list.some((i) => i.id === 'empath'));
  assert.ok(st.st.nightOrder.skipped.includes('Empath'));
  await st.call('botc:seat', { seatId: x.seat('ravenkeeper').id, patch: { dead: true } });
  await until(() => st.st.nightOrder.list.some((i) => i.id === 'ravenkeeper'));

  // the Monk answers on his phone: not himself, Safe placed at once
  await st.call('botc:prompt', { seatIds: [x.seat('monk').id], step: 'monk', kind: 'choose', text: 't', count: 1, notSelf: true });
  const mp = x.phone('monk');
  await until(() => mp.me?.prompt);
  assert.equal((await mp.call('botc:answer', { id: mp.me.prompt.id, seats: [x.seat('monk').id] }))?.ok, false);
  assert.equal((await mp.call('botc:answer', { id: mp.me.prompt.id, seats: [x.seat('chef').id] }))?.ok, true);
  await until(() => reminder(x.seat('chef'), 'Safe'));

  await st.call('botc:phase', { to: 'day' });
  await until(() => st.st.phase === 'day');
  assert.equal(st.st.timer.left, 60000, 'day 2 starts with the full time');
  assert.equal(st.st.timer.running, false);
});

test('Bad Moon Rising: Lunatic phone says evil, Zombuul acts while shrouded', async () => {
  const x = await (await s.room(10)).deal('bmr', ['grandmother', 'sailor', 'chambermaid', 'exorcist', 'innkeeper', 'gambler', 'gossip', 'lunatic', 'godfather', 'zombuul']);
  const { st } = x;
  assert.equal(x.seat('lunatic').shown?.team, 'demon');
  await st.call('botc:start');
  const lp = x.phone('lunatic');
  await until(() => lp.me?.me?.role);
  assert.equal(lp.me.me.align, 'evil');
  assert.equal(lp.me.me.role.team, 'demon');
  assert.ok(!st.st.seats.some((z) => reminder(z, 'Red Herring')), 'no Red Herring without a Fortune Teller');
  await st.call('botc:phase', { to: 'day' });
  await st.call('botc:seat', { seatId: x.seat('zombuul').id, patch: { dead: true } });
  await st.call('botc:seat', { seatId: x.seat('sailor').id, patch: { dead: true } });
  await st.call('botc:phase', { to: 'night' });
  await until(() => st.st.phase === 'night');
  assert.ok(st.st.nightOrder.list.some((i) => i.id === 'zombuul'));
  assert.ok(!st.st.nightOrder.list.some((i) => i.id === 'sailor'));
});

test('Marionette phone shows the good character it thinks it is', async () => {
  const x = await s.room(7);
  const imp = await x.st.call('botc:import', { text: JSON.stringify([{ id: '_meta', name: 'M' }, 'washerwoman', 'chef', 'empath', 'monk', 'soldier', 'mayor', 'slayer', 'butler', 'recluse', 'marionette', 'poisoner', 'imp']) });
  await x.deal(imp.script.id, ['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'marionette', 'imp']);
  await x.st.call('botc:seat', { seatId: x.seat('marionette').id, patch: { shown: 'mayor' } });
  await x.st.call('botc:start');
  const mp = x.phone('marionette');
  await until(() => mp.me?.me?.role?.id === 'mayor');
  assert.equal(mp.me.me.align, 'good');
});

test('nobody sees another player\'s character', async () => {
  const x = await (await s.room(7)).deal('tb', ['washerwoman', 'chef', 'empath', 'drunk', 'poisoner', 'imp', 'monk']);
  await x.st.call('botc:start');
  const PUBLIC = ['dead', 'ghost', 'id', 'name', 'playerId'];
  for (const p of x.ps) {
    await until(() => p.me?.me?.role);
    for (const z of p.me.seats) assert.deepEqual(Object.keys(z).sort(), PUBLIC, `${p.name} sees more of ${z.name} than the town does`);
  }
  const watcher = await s.conn();
  const w = await watcher.call('room:watch', { code: x.code });
  for (const z of w.pub.seats) assert.deepEqual(Object.keys(z).sort(), PUBLIC, 'the town view shows no characters');
});

test('moving a seat: one step either way, wrapping round the table', async () => {
  const x = await s.room(5);
  const order = () => x.st.st.seats.map((z) => z.name).join();
  const first = x.st.st.seats[0].id;
  await x.st.call('botc:moveSeat', { seatId: first, dir: 1 });
  await until(() => order() === 'P2,P1,P3,P4,P5');
  await x.st.call('botc:moveSeat', { seatId: first, dir: -1 });
  await x.st.call('botc:moveSeat', { seatId: first, dir: -1 });
  await until(() => order() === 'P5,P2,P3,P4,P1');
  assert.equal(order(), 'P5,P2,P3,P4,P1');
  assert.equal((await x.ps[0].call('botc:moveSeat', { seatId: first, dir: 1 }))?.ok, false, 'players cannot move seats');
});
