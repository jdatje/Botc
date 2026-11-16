import crypto from 'node:crypto';
import { CARD, TURN, notify } from '../alerts.js';
import { ROLES } from '../data.js';
import { AUTO_MARK, PAIR_MARK, pairMarks, prompts, record, scheduleDecoys, withRole } from '../night.js';
import { role } from '../scripts.js';
import { R, g } from '../state.js';
import { broadcast } from '../views.js';

export default function (ctx) {
  const { on, st, pid, seatOf } = ctx;
  // ----- Night on phones: wake a player, they answer on their phone -----
  const ids = (list, ok, max) => (Array.isArray(list) ? list : []).map(String).filter(ok).slice(0, max);
  on('botc:prompt', st(({ seatIds, step, kind, text, count, target, roles, seats, number, grim, seatsLabel, rolesLabel, notSelf, off }) => {
    if (!['night', 'day'].includes(g.phase)) return { ok: false, error: 'Only during the game' };
    if (kind === 'choose' && g.phase !== 'night') return { ok: false, error: 'Players only choose at night' };
    if (!['choose', 'info'].includes(kind)) return { ok: false };
    const to = ids(seatIds, (id) => seatOf(id)?.playerId, 20);
    if (!to.length) return { ok: false, error: 'Nobody to wake' };
    const first = !prompts().some((p) => p.night === g.night && !p.fake);
    for (const seatId of to) {
      const s = seatOf(seatId);
      // a new prompt replaces an unanswered one for the same step
      g.prompts = prompts().filter((p) => !(p.seatId === seatId && p.step === step && !p.answer && !p.fake));
      prompts().push({
        id: crypto.randomBytes(5).toString('hex'),
        night: g.night,
        step: String(step || '').slice(0, 40),
        seatId,
        playerId: s.playerId,
        kind,
        text: String(text || '').slice(0, 300),
        count: Math.min(5, Math.max(1, Number(count) || 1)),
        target: ['player', 'character', 'yesno'].includes(target) ? target : 'player',
        roles: ids(roles, (id) => role(id) || ROLES.get(id), 12),
        seats: ids(seats, (id) => seatOf(id), 20),
        number: Number.isFinite(Number(number)) && number !== null && number !== '' ? Math.round(Number(number)) : null,
        grim: Boolean(grim),
        seatsLabel: String(seatsLabel || '').slice(0, 80),
        rolesLabel: String(rolesLabel || '').slice(0, 80),
        notSelf: Boolean(notSelf),
        fake: false,
        answer: null,
      });
    }
    if (first && g.phase === 'night') scheduleDecoys(R);
    for (const seatId of to) notify(R, seatOf(seatId).playerId, g.phase === 'night' ? TURN : CARD);
    if (kind === 'info' && PAIR_MARK[step]) pairMarks(step, ids(seats, (id) => seatOf(id), 2), ids(roles, (id) => role(id), 1)[0]);
    if (kind === 'info') {
      const p = prompts().at(-1);
      for (const seatId of to)
        record({ night: g.night, step: p.step, seatId, kind: 'info', text: p.text, roles: p.roles, seats: p.seats, number: p.number, grim: p.grim, off: String(off || '').slice(0, 20) });
    }
  }));
  on('botc:cancelPrompt', st(({ id }) => {
    g.prompts = prompts().filter((p) => p.id !== id);
  }));
  on('botc:answer', ({ id, seats, roles, yes } = {}, ack) => {
    const p = prompts().find((x) => x.id === id && x.playerId === pid() && !x.answer);
    if (!p || (p.kind === 'choose' && g.phase !== 'night')) return ack?.({ ok: false });
    if (p.notSelf && (Array.isArray(seats) ? seats : []).includes(p.seatId)) return ack?.({ ok: false, error: 'You can\u2019t choose yourself' });
    p.answer = {
      seats: ids(seats, (sid) => seatOf(sid), p.count),
      roles: ids(roles, (rid) => role(rid), p.count),
      yes: typeof yes === 'boolean' ? yes : null,
      ack: p.kind === 'info',
      t: Date.now(),
    };
    // Scarlet Woman told on her phone: from now on she sees her new character
    if (!p.fake && p.step === 'scarletwoman' && p.kind === 'info') {
      const sw = seatOf(p.seatId);
      if (sw?.shown === 'scarletwoman' && role(sw.role)?.team === 'demon') sw.shown = null;
    }
    // Poisoner, Monk, Butler: their marker goes on the grimoire at once (it changes the info that follows),
    // moved from last night's player. Not when they're drunk or poisoned themselves.
    const label = AUTO_MARK[p.step];
    const actor = seatOf(p.seatId);
    const off = actor && (actor.role === 'drunk' || actor.reminders.some((r) => /poison|drunk/i.test(r.label)));
    if (!p.fake && label && p.answer.seats[0] && !off) {
      for (const x of g.seats) x.reminders = x.reminders.filter((r) => !(r.role === p.step && r.label === label));
      seatOf(p.answer.seats[0]).reminders.push({ role: p.step, label });
    }
    if (!p.fake && p.kind === 'choose') record({ night: p.night, step: p.step, seatId: p.seatId, kind: 'choose', text: p.text, chose: [...p.answer.seats.map(withRole), ...p.answer.roles.map((r) => role(r)?.name), p.answer.yes === null ? null : p.answer.yes ? 'Yes' : 'No'].filter(Boolean) });
    broadcast();
    ack?.({ ok: true });
  });

}
