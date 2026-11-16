// Setup rules: every random deal for every built-in script and table size follows the official counts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, until } from './helpers.mjs';
import { setupRules } from '../public/setup.js';

const ROLES = new Map(JSON.parse(fs.readFileSync(new URL('../data-seed/roles.json', import.meta.url))).map((r) => [r.id, r]));
const teamOf = (id) => ROLES.get(id)?.team;

let s;
before(async () => (s = await startServer()));
after(() => s.stop());

test('the rule check itself catches a wrong deal', () => {
  const onTb = (id) => ROLES.get(id)?.edition === 'tb';
  assert.equal(setupRules(7, ['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp'], teamOf, onTb).ok, true);
  assert.equal(setupRules(7, ['washerwoman', 'chef', 'empath', 'monk', 'butler', 'poisoner', 'imp'], teamOf, onTb).ok, false, '7 players: no Outsider without a Baron');
  assert.equal(setupRules(7, ['washerwoman', 'chef', 'empath', 'butler', 'drunk', 'baron', 'imp'], teamOf, onTb).ok, true, 'Baron: two Outsiders');
});

for (const script of ['tb', 'bmr', 'snv']) {
  test(`random deals follow the rules: ${script}, 5 to 15 players`, async () => {
    const st = await s.conn();
    const r = await st.call('room:create');
    assert.ok(r.ok);
    await st.call('botc:script', { id: script });
    const onScript = (id) => ROLES.get(id)?.edition === script;
    const ids = [];
    for (let n = 1; n <= 15; n++) {
      const a = await st.call('botc:addName', { name: `T${n}` });
      ids.push(a.id);
      if (n < 5) continue;
      await st.call('botc:seats', { ids });
      for (let k = 0; k < 4; k++) {
        const d = await st.call('botc:randomRoles');
        assert.equal(d?.ok, true, `${n} players: ${d?.error}`);
        await until(() => st.st?.seats.length === n && st.st.seats.every((x) => x.role));
        const picks = [...st.st.seats.map((x) => x.role.id), ...(st.st.offBag || []).map((x) => x.id || x)];
        const res = setupRules(n, picks, teamOf, onScript);
        assert.ok(res.ok, `${script} ${n} players: ${picks.join(', ')} → ${JSON.stringify({ need: res.need, have: res.have, missing: res.missing })}`);
        assert.ok(st.st.seats.every((x) => onScript(x.role.id)), 'only characters from the script');
      }
    }
  });
}
