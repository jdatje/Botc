import crypto from 'node:crypto';
import { notify } from '../alerts.js';
import { norm } from '../data.js';
import { R, g, io, persist } from '../state.js';
import { broadcast, ch, chatKey, chatLocked } from '../views.js';

export default function (ctx) {
  const { on, pid, isST, seatOf } = ctx;
  // ----- Player data (private) -----
  on('botc:notes', ({ text } = {}, ack) => {
    if (!pid()) return ack?.({ ok: false });
    g.notes[pid()] = String(text || '').slice(0, 20000);
    persist();
    ack?.({ ok: true });
  });
  on('botc:guess', ({ seatId, role: r, note, align } = {}, ack) => {
    if (!pid()) return ack?.({ ok: false });
    if (!seatOf(seatId)) return ack?.({ ok: false });
    const mine = (g.guesses[pid()] ||= {});
    const al = align === 'good' || align === 'evil' ? align : null;
    if (!r && !note && !al) delete mine[seatId];
    else mine[seatId] = { role: r ? norm(r) : null, note: String(note || '').slice(0, 200), align: al };
    persist();
    ack?.({ ok: true, guesses: mine });
  });

  // ----- Group chats: started by a player; only members see them (not the storyteller either) -----
  const seatedId = (id) => g.seats.some((x) => x.playerId === id);
  const groupOf = (id) => (g.groups && Object.hasOwn(g.groups, id) ? g.groups[id] : null);
  on('botc:groupCreate', ({ name, members } = {}, ack) => {
    const me = pid();
    if (!me || !seatedId(me)) return ack?.({ ok: false, error: 'You are not in this game' });
    const list = [...new Set([me, ...(Array.isArray(members) ? members : []).map(String).filter(seatedId)])];
    if (list.length < 3) return ack?.({ ok: false, error: 'Pick at least 2 other players' });
    g.groups ||= {};
    if (Object.keys(g.groups).length >= 40) return ack?.({ ok: false, error: 'Too many groups in this game' });
    const id = crypto.randomBytes(4).toString('hex');
    g.groups[id] = { id, name: String(name || '').trim().slice(0, 30) || list.map((m) => R.members[m]?.name).join(', ').slice(0, 30), members: list, by: me };
    broadcast();
    ack?.({ ok: true, id: `g:${id}` });
  });
  on('botc:groupLeave', ({ id } = {}, ack) => {
    const gr = groupOf(String(id || '').replace(/^g:/, ''));
    if (!gr || !gr.members.includes(pid())) return ack?.({ ok: false });
    gr.members = gr.members.filter((m) => m !== pid());
    if (gr.members.length < 2) {
      delete g.groups[gr.id];
      delete g.chats[`g:${gr.id}`];
    }
    broadcast();
    ack?.({ ok: true });
  });

  // ----- Chats: truly private between two players; the storyteller is 'st' -----
  on('botc:send', ({ to, text } = {}, ack) => {
    const me = isST() ? 'st' : pid();
    if (!me) return ack?.({ ok: false });
    const clean = String(text || '').trim().slice(0, 1000);
    if (!clean) return ack?.({ ok: false });
    // a group chat
    if (typeof to === 'string' && to.startsWith('g:')) {
      const gr = groupOf(to.slice(2));
      if (me === 'st' || !gr || !gr.members.includes(me)) return ack?.({ ok: false });
      if (chatLocked()) return ack?.({ ok: false, error: 'Chats are locked at night' });
      const msg = { from: me, to, text: clean, t: Date.now() };
      (g.chats[to] ||= []).push(msg);
      if (g.chats[to].length > 300) g.chats[to].shift();
      persist();
      for (const m of gr.members) {
        io.to(ch(`p:${m}`)).emit('botc:msg', msg);
        if (m !== me) notify(R, m, { title: `💬 ${gr.name}`, body: `${R.members[me]?.name || '?'}: new message`, nl: { title: `💬 ${gr.name}`, body: `${R.members[me]?.name || '?'}: nieuw bericht` } });
      }
      return ack?.({ ok: true });
    }
    const seated = (id) => g.seats.some((s) => s.playerId === id);
    if (me !== 'st') {
      if (!seated(me)) return ack?.({ ok: false, error: 'You are not in this game' });
      if (to !== 'st' && !seated(to)) return ack?.({ ok: false });
      if (to === me) return ack?.({ ok: false });
      if (chatLocked() && (to !== 'st' || g.rules.lockStChat)) return ack?.({ ok: false, error: 'Chats are locked at night' });
    } else if (!seated(to)) return ack?.({ ok: false });
    const key = chatKey(me, to);
    const msg = { from: me, to, text: clean, t: Date.now() };
    (g.chats[key] ||= []).push(msg);
    if (g.chats[key].length > 300) g.chats[key].shift();
    persist();
    const target = (id) => ch(id === 'st' ? 'st' : `p:${id}`);
    io.to(target(me)).to(target(to)).emit('botc:msg', msg);
    if (to !== 'st') {
      const from = me === 'st' ? null : R.members[me]?.name || '?';
      notify(R, to, { title: '💬 New message', body: from ? `From ${from}` : 'From the storyteller', nl: { title: '💬 Nieuw bericht', body: from ? `Van ${from}` : 'Van de verteller' } });
    }
    ack?.({ ok: true });
  });

}
