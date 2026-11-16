import { NOT_DEALT, MULTI } from '../../public/setup.js';
import { ROLES, defaultAlign, norm } from '../data.js';
import { THINKS, autoShown, dealRoles, inPlay, players, randomBag, shuffle, teamOf } from '../deal.js';
import { scarletWoman } from '../night.js';
import { deleteScript, findScript, importScript, role } from '../scripts.js';
import { R, addLog, addMember, g, memberList, persist, seatFor } from '../state.js';
import { broadcast, ch } from '../views.js';

export default function (ctx) {
  const { socket, on, st, pid, isST, seatOf } = ctx;
  // ----- Storyteller -----
  on('botc:script', st(({ id }) => {
    if (g.phase !== 'setup' || !findScript(id)) return { ok: false };
    g.scriptId = id;
    g.bluffs = [];
    g.offBag = [];
    for (const s of g.seats) Object.assign(s, { role: null, shown: null, align: 'good', reminders: [] });
  }));
  on('botc:import', ({ text } = {}, ack) => {
    if (!isST()) return ack?.({ ok: false });
    const res = importScript(text);
    broadcast();
    ack?.(res);
  });
  on('botc:deleteScript', st(({ id }) => {
    if (g.scriptId === id) g.scriptId = 'tb';
    return deleteScript(id);
  }));

  // seats: the room's players (joined phones and names added by hand)
  on('botc:roomPlayers', (_p, ack) => ack?.(isST() ? memberList() : []));
  on('botc:seats', st(({ ids }) => {
    if (g.phase !== 'setup' || !Array.isArray(ids)) return { ok: false };
    g.seats = [...new Set(ids)].filter((id) => typeof id === 'string' && Object.hasOwn(R.members, id)).slice(0, 20).map((id) => g.seats.find((s) => s.playerId === id) || seatFor(id));
    for (const s of g.seats) s.name = R.members[s.playerId]?.name || s.name;
  }));
  // the town square like the real table: shape, and moving a seat at any time
  on('botc:layout', st(({ shape }) => {
    if (!['circle', 'table'].includes(shape)) return { ok: false };
    g.layout = shape;
  }));
  // one seat left or right (wraps round the table); the setup list and the grimoire both use this
  on('botc:moveSeat', st(({ seatId, dir }) => {
    const i = g.seats.findIndex((x) => x.id === seatId);
    if (i < 0 || g.seats.length < 2) return { ok: false };
    const j = (i + (dir < 0 ? -1 : 1) + g.seats.length) % g.seats.length;
    [g.seats[i], g.seats[j]] = [g.seats[j], g.seats[i]];
  }));
  // players join (or leave) the game themselves while the storyteller sets up
  on('botc:join', ({ on: want }, ack) => {
    const id = pid();
    if (!id) return ack?.({ ok: false });
    if (g.phase !== 'setup') return ack?.({ ok: false, error: 'The game has already started' });
    if (!R.members[id]) return ack?.({ ok: false });
    const seated = g.seats.some((s) => s.playerId === id);
    if (want !== false && !seated) {
      if (g.seats.length >= 20) return ack?.({ ok: false, error: 'The table is full' });
      g.seats.push(seatFor(id));
    }
    if (want === false) g.seats = g.seats.filter((s) => s.playerId !== id);
    broadcast();
    ack?.({ ok: true });
  });
  on('botc:addName', (p, ack) => {
    if (!isST()) return ack?.({ ok: false });
    const res = addMember(p.name, true);
    persist();
    ack?.(res);
  });
  on('botc:shuffleSeats', st(() => {
    if (g.phase !== 'setup') return { ok: false };
    shuffle(g.seats);
  }));
  on('botc:randomRoles', st(() => {
    if (players().length < 5) return { ok: false, error: 'At least 5 players' };
    const bag = randomBag();
    if (!bag) return { ok: false, error: 'This script has too few characters for that many players' };
    dealRoles(bag);
    g.bluffs = [];
  }));
  on('botc:dealRoles', st(({ ids }) => {
    const n = players().length;
    if (!Array.isArray(ids) || ids.length > 40) return { ok: false };
    const list = ids.map(norm).filter((id) => role(id) || ROLES.get(id));
    if (list.length !== ids.length) return { ok: false, error: 'Unknown character in the list' };
    if (list.filter((id) => !NOT_DEALT[id]).length !== n) return { ok: false, error: `Pick exactly ${n} characters` };
    if (list.some((id, i) => !MULTI[id] && list.indexOf(id) !== i)) return { ok: false, error: 'A character is picked twice' };
    dealRoles(list);
    g.bluffs = [];
  }));
  on('botc:seat', st(({ seatId, patch = {} }) => {
    const s = seatOf(seatId);
    if (!s) return { ok: false };
    if ('role' in patch) {
      const r = role(patch.role) || ROLES.get(patch.role);
      const before = role(s.role)?.name;
      s.role = r ? r.id : null;
      s.align = defaultAlign(r?.team);
      if (!THINKS[s.role]) s.shown = null;
      else if (!s.shown) s.shown = autoShown(s, inPlay());
      if (g.phase !== 'setup') addLog(`${s.name}: ${before || '—'} → ${r?.name || '—'}`);
    }
    if ('shown' in patch) {
      const r = role(patch.shown);
      s.shown = r ? r.id : null;
      if (g.phase !== 'setup') addLog(`${s.name} now sees: ${r?.name || 'their real character'}`);
    }
    if ('align' in patch && ['good', 'evil'].includes(patch.align)) {
      s.align = patch.align;
      if (g.phase !== 'setup') addLog(`${s.name} is now ${patch.align}`);
    }
    if ('dead' in patch) {
      s.dead = Boolean(patch.dead);
      if (!s.dead) s.ghost = true;
      s.diedAt = s.dead ? (g.phase === 'night' ? `n${g.night}` : `d${g.day}`) : null;
      addLog(`${s.name} ${s.dead ? 'died' : 'is alive again'}`);
      if (s.dead) scarletWoman(s);
      else {
        // a mis-tap undone: no "Died Today", and a Scarlet Woman who wasn't told yet is herself again
        s.reminders = s.reminders.filter((r) => !(r.role === 'undertaker' && r.label === 'Died Today'));
        const sw = teamOf(s.role) === 'demon' && g.seats.find((x) => x !== s && x.shown === 'scarletwoman' && x.role === s.role && x.reminders.some((r) => r.label === 'Is the Demon'));
        if (sw) {
          sw.role = 'scarletwoman';
          sw.shown = null;
          sw.reminders = sw.reminders.filter((r) => r.label !== 'Is the Demon');
          addLog(`${sw.name} is the Scarlet Woman again`);
        }
      }
      if (s.dead && g.phase === 'day' && g.seats.some((x) => x.role === 'undertaker' || x.shown === 'undertaker')) {
        for (const x of g.seats) x.reminders = x.reminders.filter((r) => !(r.role === 'undertaker' && r.label === 'Died Today'));
        s.reminders.push({ role: 'undertaker', label: 'Died Today' });
      }
    }
    if ('ghost' in patch) {
      s.ghost = Boolean(patch.ghost);
      if (!s.ghost) addLog(`${s.name} used their ghost vote`);
    }
  }));
  on('botc:reminder', st(({ seatId, add, remove }) => {
    const s = seatOf(seatId);
    if (!s) return { ok: false };
    if (add && s.reminders.length < 12) s.reminders.push({ role: norm(add.role) || null, label: String(add.label || '').slice(0, 30) });
    if (Number.isInteger(remove)) s.reminders.splice(remove, 1);
  }));
  on('botc:bluffs', st(({ ids }) => {
    g.bluffs = (Array.isArray(ids) ? ids : []).map(norm).filter((id) => role(id)).slice(0, 3);
  }));
  on('botc:rules', st((p) => {
    if (typeof p.lockStChat === 'boolean') g.rules.lockStChat = p.lockStChat;
  }));
  on('botc:notesST', (p = {}, ack) => {
    if (!isST()) return ack?.({ ok: false });
    g.stNotes = String(p.text || '').slice(0, 50000);
    persist();
    socket.to(ch('st')).emit('botc:stNotes', g.stNotes);
    ack?.({ ok: true });
  });
  on('botc:log', st(({ text }) => {
    if (String(text || '').trim()) addLog(String(text).trim().slice(0, 300));
  }));

}
