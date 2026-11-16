import crypto from 'node:crypto';
import { setupRules, baseCounts, legionCount, NOT_DEALT, REQUIRES } from '../public/setup.js';
import { defaultAlign } from './data.js';
import { role, scriptRoles } from './scripts.js';
import { g } from './state.js';

// player counts per team: official table (public/setup.js), Travellers don't count
export const counts = baseCounts;
export const isTraveller = (s) => role(s.role)?.team === 'traveller';
export const players = () => g.seats.filter((s) => !isTraveller(s));
export const setupNote = (r) => (/\[([^\]]*)\]/.exec(r?.ability || '') || [])[1] || '';

export const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickN = (list, n) => shuffle([...list]).slice(0, Math.max(0, n));
export const any = (list) => list[crypto.randomInt(list.length)];
export const teamOf = (id) => role(id)?.team;
const onScript = (id) => scriptRoles().some((r) => r.id === id);
const rulesFor = (picks) => setupRules(players().length, picks, teamOf, onScript);

// random bag for the players, following the official table and every [setup] change
// (Baron, Godfather, Lil' Monsta, Legion, Huntsman…). Built, then repaired, then checked.
export function randomBag() {
  const n = players().length;
  const by = (t) => scriptRoles().filter((r) => r.team === t).map((r) => r.id);
  const T = { townsfolk: by('townsfolk'), outsider: by('outsider'), minion: by('minion'), demon: by('demon') };
  if (!T.demon.length && !T.minion.includes('summoner')) return null;
  const base = counts(n).outsider;
  // a value the storyteller may choose: stay near the normal number when anything goes
  const choose = (vals) => any(vals.filter((v) => Math.abs(v - base) <= 1).length ? vals.filter((v) => Math.abs(v - base) <= 1) : vals);
  const count = (picks, t) => picks.filter((id) => !NOT_DEALT[id] && teamOf(id) === t).length;
  const unused = (picks, t) => T[t].filter((id) => !picks.includes(id));
  const removeOne = (picks, t, keep) => {
    const opts = picks.map((id, i) => [id, i]).filter(([id]) => teamOf(id) === t && !keep.has(id));
    if (!opts.length) return false;
    picks.splice(any(opts)[1], 1);
    return true;
  };

  for (let attempt = 0; attempt < 400; attempt++) {
    const picks = T.demon.length ? [any(T.demon)] : [];
    // Marionette jinx: with the Kazali, Lil' Monsta or Summoner it enters play later, so not in the bag
    const later = ['kazali', 'lilmonsta'].includes(picks[0]);
    picks.push(...pickN(T.minion.filter((id) => !(later && id === 'marionette')), rulesFor(picks).need.minion[0]));
    if (picks.includes('summoner') && picks.includes('marionette')) continue;
    let r = rulesFor(picks);
    if (!r.need.demon.includes(count(picks, 'demon'))) {
      const d = Math.min(...r.need.demon);
      if (d === 0) picks.splice(picks.findIndex((id) => teamOf(id) === 'demon' && !NOT_DEALT[id]), 1); // Summoner
      else while (count(picks, 'demon') < Math.max(d, Math.min(legionCount(n), Math.max(...r.need.demon)))) picks.push(picks.find((id) => teamOf(id) === 'demon')); // Legion
    }
    r = rulesFor(picks);
    picks.push(...pickN(T.outsider, choose(r.need.outsider)));
    picks.push(...pickN(unused(picks, 'townsfolk'), n - picks.filter((id) => !NOT_DEALT[id]).length));

    // Atheist: no evil at all
    if (picks.includes('atheist')) {
      for (let i = picks.length - 1; i >= 0; i--) if (['minion', 'demon'].includes(teamOf(picks[i]))) picks.splice(i, 1);
      picks.push(...pickN(unused(picks, 'townsfolk'), n - picks.length));
    }
    // repair: outsider count after the Townsfolk that change it, and required characters
    for (let pass = 0; pass < 6; pass++) {
      r = rulesFor(picks);
      const keep = new Set(r.missing.map((m) => m.id).concat(Object.values(REQUIRES).filter((q) => picks.includes(q))));
      for (const m of r.missing) {
        if (!m.req || picks.includes(m.req)) continue;
        const t = teamOf(m.req);
        if (removeOne(picks, t, new Set([...keep, m.id]))) picks.push(m.req);
      }
      r = rulesFor(picks);
      if (!r.need.outsider.includes(count(picks, 'outsider'))) {
        const want = choose(r.need.outsider);
        while (count(picks, 'outsider') < want && unused(picks, 'outsider').length && removeOne(picks, 'townsfolk', keep)) picks.push(any(unused(picks, 'outsider')));
        while (count(picks, 'outsider') > want && unused(picks, 'townsfolk').length && removeOne(picks, 'outsider', keep)) picks.push(any(unused(picks, 'townsfolk')));
      }
      if (rulesFor(picks).ok) break;
    }
    // Village Idiot: +0 to +2 extra copies, in place of other Townsfolk
    if (picks.includes('villageidiot')) {
      const keep = new Set(['villageidiot', ...picks.filter((id) => REQUIRES[id] || Object.values(REQUIRES).includes(id) || id === 'atheist' || id === 'balloonist')]);
      for (let k = crypto.randomInt(3); k > 0; k--) if (removeOne(picks, 'townsfolk', keep)) picks.push('villageidiot');
    }
    const bhAlone = picks.includes('bountyhunter') && !picks.some((id) => id !== 'bountyhunter' && teamOf(id) === 'townsfolk');
    if (rulesFor(picks).ok && !bhAlone) return picks;
  }
  return null;
}

// characters who don't know their real character: what does their phone show?
export const THINKS = { drunk: 'townsfolk', lunatic: 'demon', marionette: null };
export function autoShown(seat, used) {
  const want = THINKS[seat.role];
  if (!want) return null;
  const options = scriptRoles().filter((r) => r.team === want && !used.has(r.id));
  return options.length ? options[crypto.randomInt(options.length)].id : null;
}
export const inPlay = () => new Set([...g.seats.flatMap((s) => [s.role, s.shown]), ...(g.offBag || [])].filter(Boolean));

export function dealRoles(list) {
  const seats = players();
  g.offBag = list.filter((id) => NOT_DEALT[id]);
  const bag = shuffle(list.filter((id) => !NOT_DEALT[id]));
  const m = seats.length;
  const at = (i) => ((i % m) + m) % m;
  const evil = (id) => ['minion', 'demon'].includes(teamOf(id));
  // Lord of Typhon: all evil in one line, the Lord of Typhon in the middle
  if (bag.includes('lordoftyphon') && m) {
    // closest to the Lord of Typhon first (the Marionette must neighbor the Demon), then alternate sides
    const minions = shuffle(bag.filter((id) => evil(id) && id !== 'lordoftyphon')).sort((x, y) => (y === 'marionette') - (x === 'marionette'));
    const line = ['lordoftyphon'];
    minions.forEach((id, i) => (i % 2 ? line.push(id) : line.unshift(id)));
    const good = shuffle(bag.filter((id) => !evil(id)));
    const start = crypto.randomInt(m);
    bag.length = 0;
    for (let i = 0; i < m; i++) bag[at(start + i)] = i < line.length ? line[i] : good[i - line.length];
  }
  // Marionette: next to the Demon
  const dIdx = bag.findIndex((id) => teamOf(id) === 'demon');
  const mIdx = bag.indexOf('marionette');
  if (dIdx > -1 && mIdx > -1 && m > 2 && at(mIdx - dIdx) !== 1 && at(dIdx - mIdx) !== 1) {
    const n = at(dIdx + (crypto.randomInt(2) ? 1 : -1));
    [bag[n], bag[mIdx]] = [bag[mIdx], bag[n]];
  }
  seats.forEach((s, i) => {
    s.role = bag[i] || null;
    s.shown = null;
    s.align = defaultAlign(role(s.role)?.team);
    s.reminders = [];
  });
  const used = inPlay();
  for (const s of seats) {
    s.shown = autoShown(s, used);
    if (s.shown) used.add(s.shown);
  }
  // Bounty Hunter: 1 Townsfolk is evil
  if (bag.includes('bountyhunter')) {
    const tf = seats.filter((s) => teamOf(s.role) === 'townsfolk' && s.role !== 'bountyhunter');
    if (tf.length) {
      const s = any(tf);
      s.align = 'evil';
      s.reminders.push({ role: 'bountyhunter', label: 'Evil Townsfolk' });
    }
  }
  // Village Idiot: with extras, 1 of the extras is drunk
  const vi = seats.filter((s) => s.role === 'villageidiot');
  if (vi.length > 1) any(vi).reminders.push({ role: 'villageidiot', label: 'Drunk' });
}

