// Night on phones: what to ask or show each character, with suggested info.
// The storyteller always sees and can change the suggestion before it's sent.
// Trouble Brewing is fully prepared; other characters get a guess from their night reminder text.

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const evil = (s) => s.align === 'evil';
const isDemon = (s) => s.role?.team === 'demon';

// is this seat's info false? (Drunk, or a Poisoned/Drunk reminder)
export function offReason(seat) {
  if (!seat) return '';
  if (seat.role?.id === 'drunk') return 'Drunk';
  if (seat.reminders?.some((r) => /poison/i.test(r.label))) return 'poisoned';
  if (seat.reminders?.some((r) => /drunk/i.test(r.label))) return 'drunk';
  return '';
}

// nearest alive neighbours, one each side (the Empath skips dead players)
function aliveNeighbours(seats, seat) {
  const i = seats.indexOf(seat);
  const n = seats.length;
  const out = [];
  for (const dir of [1, -1]) {
    for (let k = 1; k < n; k++) {
      const s = seats[(((i + dir * k) % n) + n) % n];
      if (s === seat) break;
      if (!s.dead) {
        out.push(s);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// the "one of these two is the X" characters
function pairInfo(team, label, ctx, actor, off) {
  const others = ctx.seats.filter((s) => s !== actor);
  const real = others.filter((s) => s.role?.team === team);
  if (!off && !real.length) return { kind: 'info', text: `There are no ${label}s in play`, number: 0 };
  let target, r;
  if (off) {
    r = pick(ctx.script.filter((x) => x.team === team));
    target = pick(others);
  } else {
    target = pick(real);
    r = target.role;
  }
  const wrong = pick(others.filter((s) => s !== target)) || target;
  return { kind: 'info', text: `One of these players is the ${r?.name || label}`, roles: r ? [r.id] : [], seats: shuffle([target.id, wrong.id]) };
}

const differentNumber = (n, max) => pick([...Array(max + 1).keys()].filter((x) => x !== n));

// Trouble Brewing (and anything else we know): what to send when the storyteller taps "Wake"
const KNOWN = {
  washerwoman: (ctx, a, off) => pairInfo('townsfolk', 'Townsfolk', ctx, a, off),
  librarian: (ctx, a, off) => pairInfo('outsider', 'Outsider', ctx, a, off),
  investigator: (ctx, a, off) => pairInfo('minion', 'Minion', ctx, a, off),
  chef(ctx, a, off) {
    const s = ctx.seats;
    let pairs = 0;
    s.forEach((x, i) => evil(x) && evil(s[(i + 1) % s.length]) && s.length > 1 && (pairs += 1));
    return { kind: 'info', text: 'Pairs of evil players sitting next to each other', number: off ? differentNumber(pairs, 3) : pairs };
  },
  empath(ctx, a, off) {
    const n = aliveNeighbours(ctx.seats, a).filter(evil).length;
    return { kind: 'info', text: 'Your alive neighbours that are evil', number: off ? differentNumber(n, 2) : n };
  },
  fortuneteller: () => ({ kind: 'choose', text: 'Choose 2 players: is one of them the Demon?', count: 2, target: 'player' }),
  undertaker(ctx, a, off) {
    const ex = ctx.seats.find((s) => s.dead && s.diedAt === `d${ctx.night - 1}` && s.reminders?.some((r) => /execut/i.test(r.label))) || ctx.seats.find((s) => s.dead && s.diedAt === `d${ctx.night - 1}`);
    if (!ex) return { kind: 'info', text: 'Nobody was executed today', note: 'Nobody executed today: the Undertaker doesn’t wake.' };
    const r = off ? pick(ctx.script.filter((x) => x.id !== ex.role?.id)) : ex.role;
    return { kind: 'info', text: `The character of ${ex.name}, executed today`, roles: r ? [r.id] : [] };
  },
  monk: () => ({ kind: 'choose', text: 'Choose a player to protect from the Demon tonight (not yourself)', count: 1, target: 'player' }),
  ravenkeeper: (ctx, a) => ({ kind: 'choose', text: 'You died tonight. Choose a player to learn their character', count: 1, target: 'player', note: a?.diedAt === `n${ctx.night}` ? '' : 'Only if the Ravenkeeper died tonight.' }),
  butler: () => ({ kind: 'choose', text: 'Choose your Master (not yourself). Tomorrow you may only vote if they vote too', count: 1, target: 'player' }),
  poisoner: () => ({ kind: 'choose', text: 'Choose a player to poison', count: 1, target: 'player' }),
  spy: () => ({ kind: 'info', text: 'The Grimoire', grim: true }),
  imp: () => ({ kind: 'choose', text: 'Choose a player to kill', count: 1, target: 'player' }),
  scarletwoman: (ctx) => {
    const d = ctx.seats.find(isDemon);
    return { kind: 'info', text: 'You are now the Demon', roles: d?.role ? [d.role.id] : [] };
  },
};

// guess from the reminder text for characters we don't know
function fromText(text) {
  const t = (text || '').toLowerCase();
  const n = /chooses? (2|two) players/.test(t) ? 2 : /chooses? (3|three) players/.test(t) ? 3 : 1;
  if (/chooses? a character/.test(t)) return { kind: 'choose', text: 'Choose a character', count: 1, target: 'character' };
  if (/chooses?|points? to/.test(t)) return { kind: 'choose', text: n > 1 ? `Choose ${n} players` : 'Choose a player', count: n, target: 'player' };
  if (/finger signal|number/.test(t)) return { kind: 'info', text: 'Your number', number: 0 };
  if (/nod|shake/.test(t)) return { kind: 'info', text: 'Yes' };
  if (/show .*token|learn/.test(t)) return { kind: 'info', text: 'You learn' };
  return { kind: 'info', text: '' };
}

const DEFAULTS = { roles: [], seats: [], number: null, count: 1, target: 'player', grim: false, off: '', falseInfo: false, note: '', text: '', seatsLabel: '', rolesLabel: '' };
const AUTO_MARK = { poisoner: 'Poisoned', monk: 'Safe', butler: 'Master' }; // the server adds these itself
// one suggestion per acting seat (Minion info: one for all Minions)
export function suggest(step, ctx) {
  return raw(step, ctx).map((x) => ({ ...DEFAULTS, ...x }));
}
function raw(step, ctx) {
  if (step.id === 'minioninfo') {
    const demon = ctx.seats.find(isDemon);
    const minions = ctx.seats.filter((s) => s.role?.team === 'minion');
    const lines = minions.length > 1 ? ` Your fellow Minions: ${minions.map((m) => m.name).join(', ')}.` : '';
    return [{ to: minions.map((m) => m.id), kind: 'info', text: `You are a Minion.${lines}`, seats: demon ? [demon.id] : [], seatsLabel: 'Your Demon' }];
  }
  if (step.id === 'demoninfo') {
    const demon = ctx.seats.find(isDemon);
    const minions = ctx.seats.filter((s) => s.role?.team === 'minion');
    return [{ to: demon ? [demon.id] : [], kind: 'info', text: 'You are the Demon', seats: minions.map((m) => m.id), seatsLabel: minions.length === 1 ? 'Your Minion' : 'Your Minions', roles: ctx.bluffs.map((r) => r.id), rolesLabel: 'Not in play: you can bluff as these' }];
  }
  if (step.special) return [];
  return step.seats.map((ss) => {
    const actor = ctx.seats.find((s) => s.id === ss.id);
    const off = offReason(actor);
    const known = KNOWN[step.id];
    const base = known ? known(ctx, actor, off) : fromText(step.text);
    const falseInfo = Boolean(off && base.kind === 'info' && known);
    return { roles: [], seats: [], number: null, count: 1, target: 'player', grim: false, ...base, to: [ss.id], off, falseInfo };
  });
}

// after an answer: one-tap follow-ups for the storyteller
export function followUps(p, ctx) {
  const out = [];
  if (!p.answer || p.kind !== 'choose') return out;
  const chosen = p.answer.seats.map((a) => ctx.seats.find((s) => s.id === a.id)).filter(Boolean);
  const actor = ctx.seats.find((s) => s.id === p.seatId);
  const off = offReason(actor);
  const r = ctx.roleOf(p.step);
  if (p.step === 'fortuneteller' && chosen.length) {
    const yes = chosen.some((s) => isDemon(s) || s.reminders?.some((x) => /red herring/i.test(x.label)));
    const say = off ? !yes : yes;
    out.push({ label: `📱 Send "${say ? 'Yes' : 'No'}"${off ? ` (${off}: false)` : ''}`, compose: { kind: 'info', text: say ? 'Yes: one of them is the Demon' : 'No: neither is the Demon', to: [p.seatId], off, falseInfo: Boolean(off) } });
  }
  if (p.step === 'ravenkeeper' && chosen[0]) {
    const c = off ? pick(ctx.script.filter((x) => x.id !== chosen[0].role?.id)) : chosen[0].role;
    out.push({ label: `📱 Show ${chosen[0].name}'s character${off ? ` (${off}: false)` : ''}`, compose: { kind: 'info', text: `${chosen[0].name} is the`, roles: c ? [c.id] : [], to: [p.seatId], off, falseInfo: Boolean(off) } });
  }
  if (r?.team === 'demon' && chosen[0] && !off) out.push({ label: `☠ ${chosen[0].name} dies`, dead: chosen[0].id });
  if (r?.team === 'demon' && chosen[0] && off) out.push({ label: `The Demon is ${off}: nobody dies`, note: true });
  if (r?.team === 'demon' && chosen[0] && chosen[0].id === p.seatId) out.push({ label: 'The Demon chose themselves: pass it on', note: true });
  const rem = r?.reminders?.find((x) => !/dead|died/i.test(x)) || (r?.team === 'demon' ? null : r?.reminders?.[0]);
  if (rem && p.step !== 'fortuneteller' && p.step !== 'ravenkeeper')
    for (const c of chosen) {
      if (c.reminders?.some((x) => x.label === rem)) out.push({ label: `✓ ${rem} on ${c.name} in the Grimoire`, note: true });
      else if (AUTO_MARK[p.step] && off) out.push({ label: `${r.name} is ${off}: no ${rem}`, note: true });
      else out.push({ label: `◉ ${rem} → ${c.name}`, reminder: { seatId: c.id, role: r.id, label: rem } });
    }
  return out;
}
