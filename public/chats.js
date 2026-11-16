// part of the client (app.js is the entry): see the comment at the top of app.js
import { $, esc, osk } from './core.js';
import { chats, markRead, meChatId, mode, myId, nameOf, offset, setThread, thread, unread, view } from './app.js';

// ---------- Chats ----------
function chatPartners() {
  const v = view();
  const others = (v.seats || []).filter((s) => s.playerId && s.playerId !== myId).map((s) => ({ id: s.playerId, name: s.name, dead: s.dead }));
  const groups = mode === 'st' ? [] : (v.groups || []).map((x) => ({ id: x.id, name: x.name, group: true, members: x.members }));
  const list = mode === 'st' ? others : [{ id: 'st', name: 'Storyteller', st: true }, ...groups, ...others];
  // whoever wrote last on top; chats without messages keep the table order below
  const lastT = (id) => (chats[id] || []).at(-1)?.t || 0;
  return list.map((p, i) => ({ p, i, t: lastT(p.id) })).sort((a, b) => b.t - a.t || a.i - b.i).map((x) => x.p);
}
export function locked(partner) {
  const v = view();
  if (mode === 'st') return false;
  if (partner === 'st') return v.stChatLocked;
  return v.chatLocked; // players and groups
}
export function chatsBody() {
  if (thread) {
    const lock = locked(thread);
    const gr = thread.startsWith('g:') ? (view().groups || []).find((x) => x.id === thread) : null;
    if (thread.startsWith('g:') && !gr) setThread(null);
    else
    return `<div class="thread-head"><button class="btn small" data-act="thread-back">← Back</button><b>${gr ? '👥 ' : ''}${esc(nameOf(thread))}</b>${gr ? `<button class="btn small thread-leave" data-act="group-leave">Leave</button>` : ''}</div>
      ${gr ? `<p class="hint group-members">${gr.members.map((m) => esc(m.id === myId ? 'you' : m.name)).join(' · ')}</p>` : ''}
      <div class="msgs" id="msgs"></div>
      <form class="send" id="send-form">
        ${lock ? `<p class="locked">🌙 Chats are locked at night</p>` : `<input id="send-text" autocomplete="off" maxlength="1000" placeholder="Message ${esc(nameOf(thread))}"${osk}><button class="btn primary" type="submit">Send</button>`}
      </form>`;
  }
  const v = view();
  const lockNote = mode !== 'st' && v.chatLocked ? `<p class="locked">🌙 Night: chats are locked${v.stChatLocked ? '' : ' (the storyteller can still be reached)'}</p>` : '';
  const canGroup = mode === 'player' && (v.seats || []).some((x) => x.playerId === myId);
  return `${lockNote}<p class="hint">${mode === 'st' ? 'Private chats with each player.' : 'Private: only you and the other person can read a chat.'}</p>
    ${canGroup ? `<button class="btn wide" data-act="group-new">👥 New group</button>` : ''}
    <div class="chat-list">${chatPartners()
      .map((p) => {
        const list = chats[p.id] || [];
        const last = list[list.length - 1];
        const n = unread(p.id);
        return `<button class="chat-row ${p.st ? 'st' : ''}" data-act="thread" data-id="${esc(p.id)}">
          <span class="avatar ${p.group ? 'grp' : ''}">${p.st ? '🕯️' : p.group ? '👥' : esc(p.name[0] || '?')}</span>
          <span class="chat-mid"><b>${esc(p.name)}${p.dead ? ' ☠' : ''}</b><span class="muted small">${last ? esc((last.from === meChatId() ? 'You: ' : p.group ? `${nameOf(last.from)}: ` : '') + last.text) : p.group ? esc(p.members.filter((m) => m.id !== myId).map((m) => m.name).join(', ')) : 'No messages yet'}</span></span>
          ${n ? `<b class="badge">${n}</b>` : ''}
        </button>`;
      })
      .join('')}</div>`;
}
// Android: the keyboard shrinks the screen; keep the newest message in sight
window.visualViewport?.addEventListener('resize', () => {
  const box = $('#msgs');
  if (box) box.scrollTop = box.scrollHeight;
});
export function updateThread(scrollDown) {
  const box = $('#msgs');
  if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const mine = meChatId();
  box.innerHTML =
    (chats[thread] || [])
      .map((m) => `<div class="msg ${m.from === mine ? 'me' : ''}">${String(thread).startsWith('g:') && m.from !== mine ? `<b class="msg-from">${esc(nameOf(m.from))}</b>` : ''}<span>${esc(m.text)}</span><time>${new Date(m.t - offset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>`)
      .join('') || `<p class="muted center small">Say something…</p>`;
  if (scrollDown || atBottom) box.scrollTop = box.scrollHeight;
  markRead(thread);
}
