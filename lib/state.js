import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const ROOM_DIR = path.join(DATA_DIR, 'rooms');
fs.mkdirSync(ROOM_DIR, { recursive: true });
// ---------- Game state ----------
export const blank = () => ({
  scriptId: 'tb',
  phase: 'setup', // setup | night | day | ended
  night: 0,
  day: 0,
  seats: [], // { id, playerId, name, role, shown, align, dead, ghost, reminders: [{ role, label }] }
  bluffs: [],
  timer: { minutes: 8, endsAt: 0, left: 8 * 60000, running: false },
  rules: { lockStChat: false },
  history: [], // what happened at night on the phones: { night, step, who, kind, text, answer, roles, seats, number }
  layout: 'circle', // town square: circle, or table (a long table, like the real one)
  log: [],
  stNotes: '',
  winner: null,
  reveal: false,
  chats: {}, // 'a|b' -> [{ from, text, t }]; groups: 'g:<id>'
  groups: {}, // id -> { id, name, members: [playerId], by } (only members know a group exists)
  notes: {}, // playerId -> text
  guesses: {}, // playerId -> { seatId: { role, note } }
  prompts: [], // night on phones: { id, night, step, seatId, playerId, kind, text, count, target, roles, seats, number, grim, fake, answer }
});

// ---------- Rooms ----------
// room: { code, created, touched, g, members: { playerId: { name, manual } }, tokens: [], stCode, scripts: [] }
export const rooms = new Map();
export let R = null; // the room being handled
export let g = null; // its game state
export let io = null; // the Socket.IO server
export const setIo = (server) => (io = server);
// a new game in the same room (keeps members and seats)
export const setGame = (game) => (R.g = g = game);
export function use(room) {
  R = room;
  g = room.g;
  room.touched = Date.now();
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const ROOM_TTL = Number(process.env.ROOM_TTL_HOURS || 48) * 3600000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 1000);
const MAX_MEMBERS = 30;
const roomFile = (code) => path.join(ROOM_DIR, `${code}.json`);
const saveTimers = new Map();
export function persist(room = R) {
  clearTimeout(saveTimers.get(room.code));
  saveTimers.set(
    room.code,
    setTimeout(() => {
      saveTimers.delete(room.code);
      try {
        fs.writeFileSync(`${roomFile(room.code)}.tmp`, JSON.stringify(room));
        fs.renameSync(`${roomFile(room.code)}.tmp`, roomFile(room.code));
      } catch (err) {
        console.warn('Could not save room', room.code, err.message);
      }
    }, 500)
  );
}
// rooms survive a restart
for (const f of fs.readdirSync(ROOM_DIR).filter((x) => /^[A-Z0-9]+\.json$/.test(x))) {
  try {
    const room = JSON.parse(fs.readFileSync(path.join(ROOM_DIR, f), 'utf8'));
    if (room.house || Date.now() - room.touched < ROOM_TTL) rooms.set(room.code, { scripts: [], members: {}, tokens: [], ...room, g: { ...blank(), ...room.g } });
    else fs.rmSync(path.join(ROOM_DIR, f), { force: true });
  } catch {}
}
// rooms nobody used for a while are cleaned up
setInterval(() => {
  for (const [code, room] of rooms)
    if (!room.house && Date.now() - room.touched > ROOM_TTL) {
      rooms.delete(code);
      fs.rmSync(roomFile(code), { force: true });
    }
}, 3600000).unref();
export function newRoom() {
  if (rooms.size >= MAX_ROOMS) return null;
  let code;
  do code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  while (rooms.has(code));
  const room = { code, created: Date.now(), touched: Date.now(), g: blank(), members: {}, tokens: [], stCode: String(crypto.randomInt(100000, 1000000)), scripts: [] };
  rooms.set(code, room);
  return room;
}
export const memberList = () =>
  Object.entries(R.members).map(([id, m]) => ({ id, name: m.name, manual: Boolean(m.manual), online: (io?.sockets.adapter.rooms.get(`${R.code}:p:${id}`)?.size || 0) > 0 }));
export const nameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
export function addMember(name, manual, wantId, userId) {
  // signed in with Boardpass: you are your account, whatever the device sends
  if (userId !== undefined) {
    const mine = Object.entries(R.members).find(([, m]) => m.userId === userId);
    if (mine) {
      mine[1].name = String(name).slice(0, 24);
      return { ok: true, id: mine[0] };
    }
    wantId = null;
  }
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) return { ok: false, error: 'Fill in your name' };
  const same = Object.entries(R.members).find(([, m]) => nameKey(m.name) === nameKey(clean));
  if (same) {
    if (manual) return { ok: false, error: 'That name is already in this room' };
    if (same[1].userId !== undefined && same[1].userId !== userId) return { ok: false, error: 'That name is already in this room' };
    same[1].name = clean;
    if (userId !== undefined) same[1].userId = userId;
    same[1].manual = false; // someone added by hand now joins with a phone
    return { ok: true, id: same[0] };
  }
  if (Object.keys(R.members).length >= MAX_MEMBERS) return { ok: false, error: 'This room is full' };
  const id = wantId && !R.members[wantId] && /^[a-f0-9-]{8,40}$/.test(wantId) ? wantId : crypto.randomUUID();
  R.members[id] = { name: clean, manual: Boolean(manual), ...(userId !== undefined && { userId }) };
  return { ok: true, id };
}
// Player keys (sign-in off): each device that joins gets a secret for its seat; the player id alone
// is not enough. Once the game has started, a new device for a taken name needs the storyteller.
export const newKey = () => crypto.randomBytes(16).toString('hex');
export const sameKey = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const requests = new Map(); // room code -> Map(playerId -> { socketId, t }): new devices waiting for the storyteller
export const requestList = (room = R) =>
  [...(requests.get(room.code) || new Map())].filter(([id]) => Object.hasOwn(room.members, id)).map(([id, q]) => ({ playerId: id, name: room.members[id].name, t: q.t }));
export function dropRequest(code, playerId, socketId) {
  const list = requests.get(code);
  if (!list?.has(playerId) || (socketId && list.get(playerId).socketId !== socketId)) return false;
  list.delete(playerId);
  if (!list.size) requests.delete(code);
  return true;
}
// a seat moves to one device: a new key, every other device of that seat is logged out
export function giveSeat(room, playerId, sock) {
  room.members[playerId].key = newKey();
  for (const sid of [...(io?.sockets.adapter.rooms.get(`${room.code}:p:${playerId}`) || [])]) {
    const other = io.sockets.sockets.get(sid);
    if (!other || other === sock) continue;
    other.leave(`${room.code}:p:${playerId}`);
    other.data.playerId = null;
    other.emit('room:moved');
  }
  sock.data.playerId = playerId;
  sock.join(`${room.code}:p:${playerId}`);
  return room.members[playerId].key;
}
export const seatFor = (id) => ({ id: crypto.randomBytes(4).toString('hex'), playerId: id, name: R.members[id].name, role: null, shown: null, align: 'good', dead: false, ghost: true, reminders: [] });

export function addLog(text) {
  g.log.push({ t: Date.now(), phase: g.phase === 'day' ? `Day ${g.day}` : g.phase === 'night' ? `Night ${g.night}` : g.phase, text });
  if (g.log.length > 400) g.log.shift();
}

