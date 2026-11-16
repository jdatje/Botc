// part of the client (app.js is the entry): see the comment at the top of app.js
import { $, call, esc, toast, token } from './core.js';
import { buzz, me, mode, myId } from './app.js';

// ---------- Night on phones: the player's side ----------
// At night every phone shows the same dark screen; it buzzes and asks when it's your turn.
let nightPrompt = null; // id of the prompt on screen
let nightPick = [];
let nightHidden = false; // "look at my token" until the next prompt
let nightKey = '';
export function updateNight() {
  const p = mode === 'player' && me?.me ? me.prompt || undefined : undefined;
  const on = mode === 'player' && me?.me && (me.phase === 'night' || p);
  let el = $('#nightscreen');
  if (!on) {
    el?.remove();
    $('#nightback')?.remove();
    nightPrompt = null;
    nightHidden = false;
    return;
  }
  if (p && p.id !== nightPrompt) {
    nightPrompt = p.id;
    nightPick = [];
    nightHidden = false;
    buzz([300, 120, 300]);
  }
  if (!p) nightPrompt = null;
  if (nightHidden && !p) {
    el?.remove();
    if (!$('#nightback')) {
      const b = document.createElement('button');
      b.id = 'nightback';
      b.className = 'nightback';
      b.textContent = '🌙 Back to the night screen';
      b.addEventListener('click', () => {
        nightHidden = false;
        nightKey = '';
        updateNight();
      });
      document.body.append(b);
    }
    return;
  }
  $('#nightback')?.remove();
  const key = `${me.night}|${p ? p.id : ''}|${nightPick.join(',')}`;
  if (el && key === nightKey) return;
  nightKey = key;
  if (!el) {
    el = document.createElement('div');
    el.id = 'nightscreen';
    el.className = 'nightscreen';
    document.body.append(el);
    el.addEventListener('click', onNightClick);
  }
  el.innerHTML = p ? nightPromptHtml(p) : `<div class="ns-sleep"><div class="ns-moon">🌙</div><h2 class="h">Night ${me.night}</h2><p>Eyes closed. Your phone buzzes when it's your turn.</p>
      <button class="btn small ns-peek" data-n="hide">Look at my token</button></div>`;
}
function nightPromptHtml(p) {
  const day = me.phase !== 'night';
  const head = `<p class="ns-wake">${day ? 'From the storyteller' : 'Your turn'}</p><h2 class="h ns-text">${esc(p.text || (p.kind === 'info' ? 'You learn' : 'Choose'))}</h2>`;
  if (p.kind === 'info') {
    return `<div class="ns-card">${head}
      ${p.number !== null ? `<div class="ns-number">${p.number}</div>` : ''}
      ${(() => {
        const roles = p.roles.length ? `${p.rolesLabel ? `<p class="ns-label">${esc(p.rolesLabel)}</p>` : ''}<div class="ns-tokens">${p.roles.map((r) => token(r, { size: p.roles.length > 2 ? 'lg' : 'huge' })).join('')}</div>` : '';
        const seats = p.seats.length ? `${p.seatsLabel ? `<p class="ns-label">${esc(p.seatsLabel)}</p>` : ''}<div class="ns-names ${p.seatsLabel ? 'big' : ''}">${p.seats.map((x) => `<span>${esc(x.name)}</span>`).join('')}</div>` : '';
        return p.seatsLabel ? seats + roles : roles + seats;
      })()}
      ${p.grim ? `<div class="ns-grim">${p.grim.map((x) => `<div class="${x.dead ? 'dead' : ''}">${token(x.role, { size: 'sm', align: x.align, label: false })}<span><b>${esc(x.name)}</b> ${esc(x.role?.name || '')}${x.shown ? ` (sees ${esc(x.shown.name)})` : ''}${x.align === 'evil' && !['minion', 'demon'].includes(x.role?.team) ? ' · evil' : ''}${x.reminders.length ? `<small>${x.reminders.map(esc).join(', ')}</small>` : ''}</span></div>`).join('')}</div>` : ''}
      <button class="btn primary big wide" data-n="ok">${day ? 'Got it' : 'Got it: back to sleep'}</button></div>`;
  }
  if (p.target === 'yesno')
    return `<div class="ns-card">${head}<div class="grid2"><button class="btn big" data-n="yes">Yes</button><button class="btn big" data-n="no">No</button></div></div>`;
  if (p.target === 'character')
    return `<div class="ns-card">${head}<div class="ns-chars">${(p.choices || []).map((r) => `<button class="ns-char ${nightPick.includes(r.id) ? 'on' : ''}" data-n="role" data-id="${esc(r.id)}">${token(r, { size: 'sm' })}</button>`).join('')}</div>
      <button class="btn primary big wide" data-n="send" ${nightPick.length ? '' : 'disabled'}>Confirm</button></div>`;
  const seats = me.seats;
  return `<div class="ns-card">${head}${p.count > 1 ? `<p class="muted">Pick ${p.count} · ${nightPick.length}/${p.count}</p>` : ''}
    <div class="ns-players">${seats.map((x) => `<button class="ns-player ${nightPick.includes(x.id) ? 'on' : ''} ${x.dead ? 'dead' : ''}" data-n="seat" data-id="${x.id}" ${p.notSelf && x.playerId === myId ? 'disabled' : ''}>${esc(x.name)}${x.playerId === myId ? ' (you)' : ''}${x.dead ? ' ☠' : ''}</button>`).join('')}</div>
    <button class="btn primary big wide" data-n="send" ${nightPick.length === p.count ? '' : 'disabled'}>Confirm</button></div>`;
}
async function onNightClick(e) {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  const p = me?.prompt;
  const n = b.dataset.n;
  if (n === 'hide') {
    nightHidden = true;
    return updateNight();
  }
  if (!p) return;
  const answer = (a) => {
    b.disabled = true;
    return call('botc:answer', { id: p.id, ...a }).then((res) => !res?.ok && toast('Could not send: try again'));
  };
  if (n === 'seat' || n === 'role') {
    const id = b.dataset.id;
    const max = n === 'role' ? 1 : p.count;
    nightPick = nightPick.includes(id) ? nightPick.filter((x) => x !== id) : [...nightPick, id].slice(-max);
    return updateNight();
  }
  if (n === 'send') return answer(p.target === 'character' ? { roles: nightPick } : { seats: nightPick });
  if (n === 'yes' || n === 'no') return answer({ yes: n === 'yes' });
  if (n === 'ok') return answer({});
}
