import crypto from 'node:crypto';
import { fail, tooMany } from '../game.js';
import { R, addLog, addMember, dropRequest, g, giveSeat, io, nameKey, newKey, newRoom, persist, requests, rooms, seatFor } from '../state.js';
import { broadcast, ch, chatsFor, playerView, publicView } from '../views.js';

export default function (ctx) {
  const { socket, ip, user, listen, on, pid, isST, ownPlayer, enter, views, findRoom } = ctx;

  // ----- Rooms -----
  listen('room:create', (_p, ack) => {
    if (tooMany(`create:${ip}`, 20, 3600000)) return ack?.({ ok: false, error: 'Too many new games, try again later' });
    const room = newRoom();
    if (!room) return ack?.({ ok: false, error: 'The server is full, try again later' });
    fail(`create:${ip}`);
    enter(room);
    const token = crypto.randomBytes(16).toString('hex');
    R.tokens.push(token);
    socket.data.st = true;
    socket.join(ch('st'));
    persist();
    ack?.({ ...views(), token });
  });
  // join as a player (name), or come back with your player id
  listen('room:join', ({ code, name, playerId, key } = {}, ack) => {
    if (tooMany(`code:${ip}`, 20, 60000)) return ack?.({ ok: false, error: 'Too many tries, wait a minute' });
    const room = findRoom(code);
    if (!room) {
      fail(`code:${ip}`);
      return ack?.({ ok: false, error: 'No game with that code' });
    }
    enter(room);
    if (user) name = user.username;
    const known = ownPlayer(playerId, key);
    if (!user && g.phase !== 'setup') {
      // the game is running: a name that is taken moves to this device only when the storyteller says so
      const same = name && Object.entries(R.members).find(([, m]) => nameKey(m.name) === nameKey(name));
      if (same && same[0] !== known) {
        if (tooMany(`ask:${ip}`, 10, 600000)) return ack?.({ ok: false, error: 'Too many tries, wait a few minutes' });
        fail(`ask:${ip}`);
        const list = requests.get(R.code) || new Map();
        const prev = list.get(same[0]);
        if (prev && prev.socketId !== socket.id) io.sockets.sockets.get(prev.socketId)?.emit('room:denied', { replaced: true });
        list.set(same[0], { socketId: socket.id, t: Date.now() });
        requests.set(R.code, list);
        socket.data.wants = same[0];
        broadcast();
        return ack?.({ ok: true, pending: true, code: R.code, name: R.members[same[0]].name, pub: publicView() });
      }
    }
    const res = known && !user && !name ? { ok: true, id: known } : addMember(name, false, playerId, user?.id);
    if (!res.ok) return ack?.(res);
    let newKeyForDevice = null;
    if (!user && res.id !== known) newKeyForDevice = giveSeat(R, res.id, socket);
    else {
      if (!user && !R.members[res.id].key) newKeyForDevice = R.members[res.id].key = newKey();
      socket.data.playerId = res.id;
      socket.join(ch(`p:${res.id}`));
    }
    // while the storyteller sets up, joining the room means joining the game
    if (g.phase === 'setup' && !g.seats.some((s) => s.playerId === res.id) && g.seats.length < 20) g.seats.push(seatFor(res.id));
    persist();
    broadcast();
    ack?.({ ...views(), playerId: res.id, name: R.members[res.id].name, key: newKeyForDevice || (user ? null : key) });
  });
  // a device that asked to take over a seat gives up waiting
  on('room:cancelJoin', (_p, ack) => {
    if (socket.data.wants && dropRequest(R.code, socket.data.wants, socket.id)) broadcast();
    socket.data.wants = null;
    ack?.({ ok: true });
  });
  // the storyteller allows (or not) a new device for a seat
  on('botc:approve', ({ playerId, allow } = {}, ack) => {
    if (!isST()) return ack?.({ ok: false, error: 'not_storyteller' });
    const q = typeof playerId === 'string' && requests.get(R.code)?.get(playerId);
    if (!q) return ack?.({ ok: false, error: 'That request is gone' });
    dropRequest(R.code, playerId);
    const asker = io.sockets.sockets.get(q.socketId);
    if (!asker || asker.data.code !== R.code || asker.data.wants !== playerId || !Object.hasOwn(R.members, playerId)) {
      broadcast();
      return ack?.({ ok: false, error: 'That device is no longer connected' });
    }
    asker.data.wants = null;
    if (!allow) {
      asker.emit('room:denied', {});
      broadcast();
      return ack?.({ ok: true });
    }
    const m = R.members[playerId];
    m.manual = false;
    const k = giveSeat(R, playerId, asker);
    addLog(`${m.name} moved to a new device`);
    persist();
    asker.emit('room:approved', { ok: true, code: R.code, st: null, stCode: null, me: playerView(playerId), pub: publicView(), chats: chatsFor(playerId), playerId, name: m.name, key: k });
    broadcast();
    ack?.({ ok: true });
  });
  // (built-in event, no client payload) a waiting device that goes away takes its request with it
  socket.on('disconnect', () => {
    try {
      if (socket.data.wants && socket.data.code && dropRequest(socket.data.code, socket.data.wants, socket.id)) {
        const room = rooms.get(socket.data.code);
        if (room) broadcast(room);
      }
    } catch (err) {
      console.error('disconnect:', err);
    }
  });
  // a table view (TV, laptop): public information only
  listen('room:watch', ({ code } = {}, ack) => {
    if (tooMany(`code:${ip}`, 20, 60000)) return ack?.({ ok: false, error: 'Too many tries, wait a minute' });
    const room = findRoom(code);
    if (!room) {
      fail(`code:${ip}`);
      return ack?.({ ok: false, error: 'No game with that code' });
    }
    enter(room);
    ack?.(views());
  });
  // the storyteller on a second device: room code + 6-digit storyteller code
  listen('room:st', ({ code, stCode } = {}, ack) => {
    const room = findRoom(code);
    if (!room || tooMany(`st:${ip}`, 8, 300000) || tooMany(`st-room:${room.code}`, 30, 600000)) return ack?.({ ok: false, error: room ? 'Too many tries, wait 5 minutes' : 'No game with that code' });
    if (String(stCode || '') !== room.stCode) {
      fail(`st:${ip}`);
      fail(`st-room:${room.code}`);
      return ack?.({ ok: false, error: 'Wrong storyteller code' });
    }
    enter(room);
    const token = crypto.randomBytes(16).toString('hex');
    R.tokens = [...R.tokens, token].slice(-10);
    socket.data.st = true;
    socket.join(ch('st'));
    persist();
    ack?.({ ...views(), token });
  });
  // test mode: the storyteller's device plays a name added by hand (no phone) in its own frame.
  // Needs the storyteller token, so only the storyteller can do this, and only for names without a phone.
  listen('room:dev', ({ code, token, playerId } = {}, ack) => {
    const room = findRoom(code);
    if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
    if (!token || !room.tokens.includes(token)) return ack?.({ ok: false, error: 'Test mode needs the storyteller' });
    if (typeof playerId !== 'string' || !Object.hasOwn(room.members, playerId) || !room.members[playerId].manual) return ack?.({ ok: false, error: 'Only names added by hand can be test players' });
    enter(room);
    socket.data.playerId = playerId;
    socket.join(ch(`p:${playerId}`));
    ack?.({ ...views(), playerId, name: R.members[playerId].name });
  });
  // coming back (page reload, new connection)
  listen('room:hello', ({ code, token, playerId, key } = {}, ack) => {
    const room = findRoom(code);
    if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
    enter(room);
    if (token && R.tokens.includes(token)) {
      socket.data.st = true;
      socket.join(ch('st'));
    } else if (playerId && ownPlayer(playerId, key)) {
      const id = ownPlayer(playerId, key);
      socket.data.playerId = id;
      socket.join(ch(`p:${id}`));
      // a device from before player keys: it gets one now
      if (!user && !R.members[id].key) {
        R.members[id].key = newKey();
        persist();
        return ack?.({ ...views(), key: R.members[id].key });
      }
    } else if (playerId && !user) return ack?.({ ...views(), lost: true }); // this seat moved to another device
    ack?.(views());
  });
  on('room:leave', ({ token }, ack) => {
    if (isST()) R.tokens = R.tokens.filter((t) => t !== token);
    else if (pid()) {
      if (g.phase === 'setup') g.seats = g.seats.filter((s) => s.playerId !== pid());
      delete R.members[pid()];
    }
    const room = R;
    for (const r of socket.rooms) if (r !== socket.id) socket.leave(r);
    socket.data = {};
    broadcast(room);
    ack?.({ ok: true });
  });

}
