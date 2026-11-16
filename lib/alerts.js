import * as push from './push.js';
import { io, persist, rooms } from './state.js';



// ---------- Push: only when none of the player's open pages is visible ----------
// when the player's page last said "I'm on screen" (0 = no page in view). A page counts only while it
// keeps saying so (every 10 s): iPhones freeze a page when locked before it can say goodbye.
function lastSeen(code, playerId) {
  let t = 0;
  for (const id of io?.sockets.adapter.rooms.get(`${code}:p:${playerId}`) || []) {
    const x = io.sockets.sockets.get(id);
    if (x?.botcVisible && Date.now() - (x.botcSeen || 0) < 20000) t = Math.max(t, x.botcSeen);
  }
  return t;
}
// send now; a subscription the push service no longer knows is forgotten and the phone is asked for a new one
export function deliver(room, playerId, payload, tag = `botc-${room.code}`) {
  const m = room.members[playerId];
  if (!m?.push?.length) return Promise.resolve({ ok: false, error: 'no alerts on' });
  const words = m.lang === 'nl' && payload.nl ? payload.nl : payload;
  let error = null;
  return push
    .send(m.push, { title: words.title, body: words.body, tag, url: `./?code=${room.code}` }, (err) => (error = `${err.statusCode || ''} ${err.body || err.message}`.trim().slice(0, 200)))
    .then((gone) => {
      if (gone.length && rooms.get(room.code) === room) {
        m.push = (m.push || []).filter((x) => !gone.includes(x.endpoint));
        persist(room);
        io?.to(`${room.code}:p:${playerId}`).emit('push:lost', { endpoints: gone });
      }
      return { ok: !error, error };
    });
}
export function notify(room, playerId, payload) {
  if (!room.members[playerId]?.push?.length) return;
  const seen = lastSeen(room.code, playerId);
  if (!seen) return void deliver(room, playerId, payload);
  // the page was in view a moment ago: it shows the alert itself. Unless the phone was locked right
  // after: then its next "I'm on screen" never comes, and the push goes out after all.
  setTimeout(() => rooms.get(room.code) === room && lastSeen(room.code, playerId) <= seen && deliver(room, playerId, payload), Math.max(0, seen + 13000 - Date.now()));
}
const notifySeated = (room, payload) => room.g.seats.forEach((s) => s.playerId && notify(room, s.playerId, payload));
// the same words for a real prompt and a decoy
export const CARD = { title: '🃏 From the storyteller', body: 'Open the game to see it.', nl: { title: '🃏 Van de verteller', body: 'Open het spel om het te zien.' } };
export const TURN = { title: '🌙 Your turn', body: 'Open the game: the storyteller needs you.', nl: { title: '🌙 Jouw beurt', body: 'Open het spel: de verteller heeft je nodig.' } };
// day timer: 30 seconds left and time's up, also to locked phones
const timerPush = new Map(); // room code -> [timeouts]
export function scheduleTimerPush(room) {
  for (const t of timerPush.get(room.code) || []) clearTimeout(t);
  timerPush.delete(room.code);
  const t = room.g.timer;
  if (!t.running) return;
  const left = t.endsAt - Date.now();
  const list = [];
  if (left > 31000) list.push(setTimeout(() => rooms.get(room.code) === room && notifySeated(room, { title: '⏳ 30 seconds left', body: 'Start wrapping up your conversation.', nl: { title: '⏳ Nog 30 seconden', body: 'Rond je gesprek af.' } }), left - 30000));
  if (left > 0) list.push(setTimeout(() => rooms.get(room.code) === room && notifySeated(room, { title: "🔔 Time's up", body: 'Return to the town square.', nl: { title: '🔔 De tijd is om', body: 'Terug naar het dorpsplein.' } }), left));
  timerPush.set(room.code, list);
}
