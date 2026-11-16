import * as push from '../push.js';
import { deliver } from '../alerts.js';
import { R, g, io, persist, rooms } from '../state.js';


export default function (ctx) {
  const { socket, listen, on, pid, isST } = ctx;
  // ----- Push notifications -----
  socket.botcVisible = true;
  socket.botcSeen = Date.now();
  listen('push:visible', ({ visible } = {}) => {
    socket.botcVisible = Boolean(visible);
    socket.botcSeen = Date.now();
  });
  // storyteller: a test alert to one player or everyone, right away (also when their page is open)
  on('push:testSt', ({ seatId } = {}, ack) => {
    if (!isST()) return ack?.({ ok: false, error: 'not_storyteller' });
    const room = R;
    const seats = g.seats.filter((x) => x.playerId && (!seatId || x.id === seatId));
    const on = seats.filter((x) => R.members[x.playerId]?.push?.length);
    const TEST = { title: '🔔 Test', body: 'The storyteller is testing your alerts. It works!', nl: { title: '🔔 Test', body: 'De verteller test je meldingen. Werkt!' } };
    Promise.all(on.map((x) => deliver(room, x.playerId, TEST, `botc-${room.code}-test`))).then((res) =>
      ack?.({ ok: true, sent: on.filter((_x, i) => res[i].ok).map((x) => x.name), failed: on.filter((_x, i) => !res[i].ok).map((x) => x.name), off: seats.filter((x) => !on.includes(x)).map((x) => x.name) })
    );
  });
  // "send a test": in 5 seconds, also when the page is open, so you can lock the phone first
  on('push:test', (_d, ack) => {
    const room = R;
    const id = pid();
    if (!id || !R.members[id]?.push?.length) return ack?.({ ok: false, error: 'This phone has no alerts turned on for this game' });
    setTimeout(() => {
      if (rooms.get(room.code) !== room) return;
      deliver(room, id, { title: '🔔 Test', body: 'Alerts work on this phone.', nl: { title: '🔔 Test', body: 'Meldingen werken op deze telefoon.' } }, `botc-${room.code}-test`).then((r) => !r.ok && io.to(`${room.code}:p:${id}`).emit('push:testResult', r));
    }, 5000);
    ack?.({ ok: true });
  });
  on('push:subscribe', ({ sub, lang } = {}, ack) => {
    const m = pid() && R.members[pid()];
    const clean = push.cleanSub(sub);
    if (!m || !clean) return ack?.({ ok: false });
    m.push = [...(m.push || []).filter((x) => x.endpoint !== clean.endpoint), clean].slice(-3);
    m.lang = lang === 'nl' ? 'nl' : 'en';
    persist();
    ack?.({ ok: true });
  });
  on('push:unsubscribe', ({ endpoint } = {}, ack) => {
    const m = pid() && R.members[pid()];
    if (m?.push) m.push = m.push.filter((x) => x.endpoint !== endpoint);
    persist();
    ack?.({ ok: true });
  });

}
