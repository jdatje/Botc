import crypto from 'node:crypto';
import { BUILT_IN, ROLES, decorate, norm } from './data.js';
import { R, g, persist } from './state.js';

export const scripts = () => [...BUILT_IN, ...R.scripts].map(({ id, name, author, logo, builtIn, ids }) => ({ id, name, author, logo, builtIn: Boolean(builtIn), count: ids.length }));
export const findScript = (id) => [...BUILT_IN, ...(R?.scripts || [])].find((s) => s.id === id);
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length < 500 ? u : null);

// Import a script JSON (official script tool format, also community scripts).
// Homebrew images are not downloaded: phones load them from their own (https) address.
export function importScript(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { ok: false, error: 'That is not valid JSON' };
  }
  if (!Array.isArray(data)) return { ok: false, error: 'A script is a JSON list of characters' };
  if (data.length > 300) return { ok: false, error: 'That script is too long' };
  if (R.scripts.length >= 20) return { ok: false, error: 'Delete an imported script first (max 20)' };
  const meta = data.find((x) => x && typeof x === 'object' && x.id === '_meta') || {};
  const ids = [];
  const custom = {};
  const unknown = [];
  const str = (v, n) => String(v || '').slice(0, n);
  for (const item of data) {
    const raw = typeof item === 'string' ? item : item?.id;
    if (!raw || raw === '_meta') continue;
    const id = norm(raw).slice(0, 40);
    if (!id) continue;
    if (ROLES.has(id) && (typeof item === 'string' || !item.ability)) {
      if (!ids.includes(id)) ids.push(id);
      continue;
    }
    if (typeof item === 'object' && item.name && ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric'].includes(item.team)) {
      const imgs = Array.isArray(item.image) ? item.image : [item.image];
      custom[id] = decorate({
        id,
        name: str(item.name, 40),
        team: item.team,
        ability: str(item.ability, 400),
        flavor: str(item.flavor, 300),
        setup: Boolean(item.setup),
        reminders: (Array.isArray(item.reminders) ? item.reminders : []).slice(0, 10).map((x) => str(x, 30)),
        remindersGlobal: (Array.isArray(item.remindersGlobal) ? item.remindersGlobal : []).slice(0, 10).map((x) => str(x, 30)),
        firstNightReminder: str(item.firstNightReminder, 400),
        otherNightReminder: str(item.otherNightReminder, 400),
        firstNight: Number(item.firstNight) || 0,
        otherNight: Number(item.otherNight) || 0,
        image: httpsUrl(imgs[0]),
        imageEvil: httpsUrl(imgs[1]) || httpsUrl(imgs[0]),
      });
      if (!ids.includes(id)) ids.push(id);
    } else unknown.push(str(raw, 40));
  }
  if (!ids.length) return { ok: false, error: 'No characters found in this script' };
  const script = {
    id: `s-${crypto.randomBytes(4).toString('hex')}`,
    name: str(meta.name || 'Imported script', 60),
    author: str(meta.author, 60),
    logo: httpsUrl(Array.isArray(meta.logo) ? meta.logo[0] : meta.logo) || 'img/custom.webp',
    ids,
    custom,
  };
  R.scripts.push(script);
  persist();
  return { ok: true, script: { id: script.id, name: script.name, count: ids.length }, unknown: unknown.slice(0, 20) };
}

export function deleteScript(id) {
  R.scripts = R.scripts.filter((s) => s.id !== id);
  persist();
  return { ok: true };
}

export const script = () => findScript(g.scriptId) || BUILT_IN[0];
export function role(id) {
  if (!id || typeof id !== 'string') return null;
  const custom = script().custom;
  return (custom && Object.hasOwn(custom, id) ? custom[id] : null) || ROLES.get(id) || null;
}
export const scriptRoles = () => script().ids.map(role).filter(Boolean);
export const travellersAndFabled = () => [...ROLES.values()].filter((r) => r.team === 'traveller' || r.team === 'fabled');

