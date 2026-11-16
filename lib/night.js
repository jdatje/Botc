import crypto from 'node:crypto';
import { TURN, notify } from './alerts.js';
import { NIGHT, ROLES } from './data.js';
import { any, players } from './deal.js';
import { role, scriptRoles } from './scripts.js';
import { R, addLog, g, io, rooms, use } from './state.js';
import { broadcast, pub } from './views.js';


// Scarlet Woman: if 5 or more players are alive (Travellers don't count) and the Demon dies,
// she becomes the Demon. The grimoire changes at once; she keeps seeing the Scarlet Woman until
// the storyteller tells her (her night step, or "Show" in person).
export function scarletWoman(dead) {
  if (role(dead.role)?.team !== 'demon') return;
  const alive = g.seats.filter((x) => role(x.role)?.team !== 'traveller' && (!x.dead || x === dead)).length;
  if (alive < 5) return;
  const sw = g.seats.find((x) => x.role === 'scarletwoman' && !x.dead && !x.reminders.some((r) => /poison|drunk/i.test(r.label)));
  if (!sw) return;
  sw.role = dead.role;
  sw.shown = 'scarletwoman';
  sw.align = 'evil';
  sw.reminders = sw.reminders.filter((r) => r.role !== 'scarletwoman');
  sw.reminders.push({ role: 'scarletwoman', label: 'Is the Demon' });
  addLog(`${sw.name} (Scarlet Woman) is now the ${role(dead.role)?.name}`);
}

// the 1-of-2 info characters: the right player gets the team reminder, the other "Wrong"
export const PAIR_MARK = { washerwoman: 'Townsfolk', librarian: 'Outsider', investigator: 'Minion' };
export function pairMarks(step, seatIds, shownRole) {
  if (seatIds.length !== 2) return;
  for (const x of g.seats) x.reminders = x.reminders.filter((r) => r.role !== step);
  const hit = seatIds.findIndex((id) => g.seats.find((x) => x.id === id)?.role === shownRole);
  const right = hit === -1 ? 0 : hit; // false info: the first one shown gets the team reminder
  seatIds.forEach((id, i) => g.seats.find((x) => x.id === id)?.reminders.push({ role: step, label: i === right ? PAIR_MARK[step] : 'Wrong' }));
}

// the game record: what each player chose and was shown at night (storyteller; everyone at the end)
export const withRole = (seatId) => {
  const x = g.seats.find((y) => y.id === seatId);
  return x ? `${x.name}${role(x.role) ? ` (${role(x.role).name})` : ''}` : '?';
};
export function record(e) {
  const seat = g.seats.find((x) => x.id === e.seatId);
  (g.history ||= []).push({
    t: Date.now(),
    night: e.night,
    phase: g.phase === 'day' ? `Day ${g.day}` : `Night ${g.night}`,
    step: role(e.step)?.name || { minioninfo: 'Minion info', demoninfo: 'Demon info', card: 'Card from you' }[e.step] || e.step,
    stepId: e.step,
    icon: role(e.step)?.icon || null,
    who: seat?.name || '?',
    really: seat && role(e.step) && seat.role !== e.step && role(seat.role) ? role(seat.role).name : null,
    kind: e.kind,
    text: e.text,
    chose: e.chose || [],
    roles: (e.roles || []).map((r) => role(r)?.name || ROLES.get(r)?.name || r),
    seats: (e.seats || []).map(withRole),
    tagged: true,
    number: e.number ?? null,
    grim: Boolean(e.grim),
    off: e.off || '',
  });
  if (g.history.length > 600) g.history.shift();
}

// ---------- Night on phones ----------
export const AUTO_MARK = { poisoner: 'Poisoned', monk: 'Safe', butler: 'Master' };
export const prompts = () => (g.prompts ||= []);
export const openPrompt = (pid) => ['night', 'day'].includes(g.phase) && prompts().find((p) => p.playerId === pid && !p.answer && (p.night === g.night || p.kind === 'info'));
const seatName = (id) => g.seats.find((s) => s.id === id)?.name || '?';
// what the player sees: never whether it's a decoy
export function promptForPlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    kind: p.kind,
    text: p.text,
    count: p.count,
    target: p.target,
    roles: p.roles.map((id) => pub(role(id) || ROLES.get(id))).filter(Boolean),
    seats: p.seats.map((id) => ({ id, name: seatName(id) })),
    number: p.number,
    seatsLabel: p.seatsLabel || '',
    rolesLabel: p.rolesLabel || '',
    notSelf: Boolean(p.notSelf),
    grim: p.grim ? g.seats.map((s) => ({ name: s.name, dead: s.dead, role: pub(role(s.role)), shown: pub(role(s.shown)), align: s.align, reminders: s.reminders.map((r) => r.label) })) : null,
    choices: p.kind === 'choose' && p.target === 'character' ? scriptRoles().map(pub) : null,
  };
}
export const promptForST = (p) => ({
  id: p.id,
  step: p.step,
  seatId: p.seatId,
  name: seatName(p.seatId),
  kind: p.kind,
  text: p.text,
  count: p.count,
  target: p.target,
  answer: p.answer && { seats: p.answer.seats.map((id) => ({ id, name: seatName(id) })), roles: p.answer.roles.map((id) => pub(role(id) || ROLES.get(id))).filter(Boolean), yes: p.answer.yes, ack: p.answer.ack },
});
// decoys: 1–2 sleeping players get a buzz too, so a buzz gives nothing away
const decoyTimers = new Map(); // room code -> [timeouts]
function clearDecoys(code) {
  for (const t of decoyTimers.get(code) || []) clearTimeout(t);
  decoyTimers.delete(code);
}
export function scheduleDecoys(room) {
  clearDecoys(room.code);
  const night = room.g.night;
  const list = [];
  for (let k = 1 + crypto.randomInt(2); k > 0; k--)
    list.push(
      setTimeout(() => {
        try {
          use(room);
          if (rooms.get(room.code) !== room || g.phase !== 'night' || g.night !== night) return;
          const busy = new Set(prompts().filter((p) => p.night === night && !p.answer).map((p) => p.playerId));
          // someone who can answer: a phone that's connected now or has alerts on
          const hasPhone = (id) => (io?.sockets.adapter.rooms.get(`${room.code}:p:${id}`)?.size || 0) > 0 || Boolean(room.members[id]?.push?.length);
          const free = g.seats.filter((s) => s.playerId && !busy.has(s.playerId) && hasPhone(s.playerId));
          if (!free.length) return;
          const s = any(free);
          notify(room, s.playerId, TURN);
          prompts().push({ id: crypto.randomBytes(5).toString('hex'), night, step: 'decoy', seatId: s.id, playerId: s.playerId, kind: 'choose', text: 'Nothing for you tonight. Tap any player to go back to sleep.', count: 1, target: 'player', roles: [], seats: [], number: null, grim: false, fake: true, answer: null });
          broadcast(room);
        } catch (err) {
          console.error('decoy:', err);
        }
      }, 8000 + crypto.randomInt(50000))
    );
  decoyTimers.set(room.code, list);
}
export function endNightPrompts() {
  g.prompts = [];
  clearDecoys(R.code);
}
// the night order for tonight: only characters in play (also what a Drunk thinks)
export function nightOrder() {
  const first = g.night <= 1;
  const key = first ? 'firstNight' : 'otherNight';
  const order = [...NIGHT[key]];
  // homebrew characters with their own night number
  for (const r of scriptRoles()) if (!r.official && r[key] > 0 && !order.includes(r.id)) order.splice(Math.min(order.length - 1, Math.round(r[key])), 0, r.id);
  const SPECIAL = {
    dusk: { name: 'Dusk', text: 'Check that all eyes are closed. Some Travellers & Fabled act now.' },
    minioninfo: { name: 'Minion info', text: 'If there are 7 or more players, wake all Minions: show the "This is the Demon" card and point to the Demon. Then put them to sleep.' },
    demoninfo: { name: 'Demon info', text: 'If there are 7 or more players, wake the Demon: show "These are your minions" and point to each Minion. Then show "These characters are not in play" with the 3 bluffs.' },
    dawn: { name: 'Dawn', text: 'Wait a few seconds. Call for eyes open.' },
  };
  const out = [];
  const skipped = [];
  for (const id of order) {
    if (SPECIAL[id]) {
      if ((id === 'minioninfo' || id === 'demoninfo') && (players().length < 7 || (g.offBag || []).includes('lilmonsta'))) continue;
      out.push({ id, special: true, name: SPECIAL[id].name, text: SPECIAL[id].text, seats: [] });
      continue;
    }
    const seats = g.seats.filter((s) => s.role === id || s.shown === id);
    if (!seats.length && !(g.offBag || []).includes(id)) continue;
    const r = role(id) || ROLES.get(id);
    const text = (first ? r?.firstNightReminder : r?.otherNightReminder) || '';
    if (!text) continue;
    // dead players don't wake. Kept: a step about that character's own death since dawn (Ravenkeeper,
    // Sage, Barber…), the Zombuul (acts while it looks dead) and anyone marked "Has Ability" (Vigormortis)
    if (seats.length && seats.every((s) => s.dead)) {
      const name = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ownDeath = new RegExp(`the ${name} (died|was killed)|killed the ${name}`, 'i').test(text);
      const sinceDawn = (s) => s.diedAt === `n${g.night}` || s.diedAt === `d${g.night - 1}`;
      const acts = seats.some((s) => s.role === 'zombuul' || s.reminders.some((x) => /has ability/i.test(x.label)) || (ownDeath && sinceDawn(s)));
      if (!acts) {
        skipped.push(r.name);
        continue;
      }
    }
    out.push({
      id,
      name: r.name,
      icon: r.icon,
      team: r.team,
      text,
      seats: seats.map((s) => ({ id: s.id, name: s.name, dead: s.dead, really: s.role !== id ? role(s.role)?.name : null })),
    });
  }
  return { first, list: out, skipped };
}
