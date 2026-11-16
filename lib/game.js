// Blood on the Clocktower helper, played in person around a table: each
// player's phone is their token, chats, notes and town square; the storyteller
// keeps the grimoire on a phone, tablet or laptop. Many tables (rooms) can play
// at the same time; each room has a short code.
//
// The state of the room being handled lives in the module variables R (room)
// and g (its game state) in state.js. Every entry point (socket handler, broadcast)
// first calls use(room); handlers are synchronous, so rooms never mix.
//
// Character data, night order, jinxes and icons are The Pandemonium
// Institute's toolmaker resources (github.com/ThePandemoniumInstitute/
// botc-release, resources/), used under their Community Created Content Policy.
//
// lib/  data.js (characters) · scripts.js · state.js (rooms, members) · deal.js (setup)
//       night.js (night order, phone prompts) · views.js (what each device sees) · alerts.js (push)
//       game.js (connections) · handlers/*.js (socket events per subject)
import crypto from 'node:crypto';
import { scheduleTimerPush } from './alerts.js';
import { R, blank, g, persist, rooms, sameKey, setIo, use } from './state.js';
import { broadcast, ch, chatsFor, playerView, publicView, stView } from './views.js';
import roomHandlers from './handlers/rooms.js';
import chatHandlers from './handlers/chat.js';
import storytellerHandlers from './handlers/storyteller.js';
import pushHandlers from './handlers/push.js';
import nightHandlers from './handlers/night.js';
import phaseHandlers from './handlers/phases.js';

export function attach(server) {
  setIo(server);
  // a restart (deploy) in the middle of a day: the "30 seconds" and "time's up" alerts still go out
  for (const room of rooms.values()) if (room.g.timer?.running) scheduleTimerPush(room);
}
export const stats = () => ({ rooms: rooms.size });

// A "house room": a fixed game room for a venue (e.g. the Wexer bar screen), never cleaned up.
// The host sets its code and storyteller code over the host API (see server.js).
export function house(code, stCode) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code.length < 4) return { ok: false, error: 'House code needs 4–8 letters or digits' };
  let room = rooms.get(code);
  if (!room) {
    room = { code, created: Date.now(), touched: Date.now(), g: blank(), members: {}, tokens: [], stCode: '', scripts: [] };
    rooms.set(code, room);
  }
  room.house = true;
  const clean = String(stCode || '').replace(/\D/g, '').slice(0, 8);
  if (clean.length >= 4 && clean !== room.stCode) {
    room.stCode = clean;
    room.tokens = []; // a new storyteller code logs out the old storyteller devices
  }
  if (!room.stCode) room.stCode = String(crypto.randomInt(100000, 1000000));
  persist(room);
  const g0 = room.g;
  return { ok: true, code, phase: g0.phase, players: g0.seats.length, alive: g0.seats.filter((x) => !x.dead).length };
}

// brakes on guessing: wrong room codes per address, wrong storyteller codes per room
const tries = new Map(); // key -> [times]
export function tooMany(key, max, ms) {
  const now = Date.now();
  const list = (tries.get(key) || []).filter((t) => now - t < ms);
  tries.set(key, list);
  return list.length >= max;
}
export const fail = (key) => tries.get(key)?.push(Date.now()) ?? tries.set(key, [Date.now()]);
setInterval(() => tries.clear(), 3600000).unref();

// user: the Boardpass account behind this socket ({ id, username }), or null when sign-in is off
export function register(socket, ip, user = null) {
  // a player id this socket may use: with sign-in only your own
  // without sign-in: the player id and this device's key (members from before keys existed: the id alone)
  const ownPlayer = (playerId, key) => {
    if (!user) {
      const m = typeof playerId === 'string' && Object.hasOwn(R.members, playerId) ? R.members[playerId] : null;
      return m && !m.manual && (!m.key || sameKey(m.key, key)) ? playerId : null;
    }
    return Object.entries(R.members).find(([, m]) => m.userId === user.id)?.[0] || null;
  };
  // every handler gets an object and a real callback (or none), whatever a client sends,
  // and a bug in one handler never takes the server down for every table
  const listen = (ev, fn) =>
    socket.on(ev, (p, ack) => {
      if (typeof p === 'function') [p, ack] = [undefined, p];
      if (typeof ack !== 'function') ack = undefined;
      if (p === null || typeof p !== 'object' || Array.isArray(p)) p = {};
      try {
        fn(p, ack);
      } catch (err) {
        console.error(`${ev}:`, err);
        ack?.({ ok: false, error: 'Something went wrong' });
      }
    });
  const pid = () => socket.data.playerId;
  const isST = () => Boolean(socket.data.st);
  const seatOf = (id) => g.seats.find((s) => s.id === id);
  // every handler works on the socket's own room
  const on = (ev, fn) =>
    listen(ev, (p, ack) => {
      const room = rooms.get(socket.data.code);
      if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
      use(room);
      fn(p, ack);
    });
  const st = (fn) => (p = {}, ack) => {
    if (!isST()) return ack?.({ ok: false, error: 'not_storyteller' });
    const res = fn(p || {});
    broadcast();
    ack?.(res || { ok: true });
  };
  function enter(room) {
    for (const r of socket.rooms) if (r !== socket.id) socket.leave(r);
    socket.data = { code: room.code };
    use(room);
    socket.join(ch('pub'));
  }
  const views = () => ({
    ok: true,
    code: R.code,
    st: isST() ? stView() : null,
    stCode: isST() ? R.stCode : null,
    me: pid() ? playerView(pid()) : null,
    pub: publicView(),
    chats: pid() ? chatsFor(pid()) : isST() ? chatsFor('st') : {},
  });
  const findRoom = (code) => rooms.get(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

  const ctx = { socket, ip, user, listen, on, st, pid, isST, seatOf, ownPlayer, enter, views, findRoom };
  for (const handlers of [roomHandlers, chatHandlers, storytellerHandlers, pushHandlers, nightHandlers, phaseHandlers]) handlers(ctx);
}
