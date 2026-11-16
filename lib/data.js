import fs from 'node:fs';
import path from 'node:path';

const SEED = path.resolve('data-seed');
const ICON_DIR = path.resolve('public/icons');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- Official data ----------
const ICONS = new Set(fs.readdirSync(ICON_DIR));
export const NIGHT = readJson('nightsheet.json');
export const ROLES = new Map();
for (const r of readJson('roles.json')) ROLES.set(r.id, decorate({ ...r, official: true }));
export const JINXES = [];
for (const j of readJson('jinxes.json')) for (const x of j.jinx || []) JINXES.push({ a: j.id, b: x.id, reason: x.reason });

function iconsOf(id) {
  const pick = (f) => (ICONS.has(f) ? `icons/${f}` : null);
  const plain = pick(`${id}.webp`);
  return { good: pick(`${id}_g.webp`) || plain, evil: pick(`${id}_e.webp`) || plain };
}

export function decorate(r) {
  const icons = r.official ? iconsOf(r.id) : { good: r.image || null, evil: r.imageEvil || r.image || null };
  const generic = (side) => (ICONS.has(`${r.team}_${side}.webp`) ? `icons/${r.team}_${side}.webp` : ICONS.has(`${r.team}.webp`) ? `icons/${r.team}.webp` : `icons/custom_${side}.webp`);
  return {
    id: r.id,
    name: r.name,
    team: r.team,
    edition: r.edition || 'custom',
    ability: r.ability || '',
    flavor: r.flavor || '',
    setup: Boolean(r.setup),
    reminders: [...(r.reminders || []), ...(r.remindersGlobal || [])],
    firstNightReminder: r.firstNightReminder || '',
    otherNightReminder: r.otherNightReminder || '',
    firstNight: r.firstNight || 0,
    otherNight: r.otherNight || 0,
    official: Boolean(r.official),
    icon: { good: icons.good || generic('g'), evil: icons.evil || generic('e') },
  };
}

export const EVIL_TEAMS = ['minion', 'demon'];
export const defaultAlign = (team) => (EVIL_TEAMS.includes(team) ? 'evil' : 'good');

// ---------- Scripts ----------
const EDITION_NAMES = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', snv: 'Sects & Violets' };
export const BUILT_IN = Object.entries(EDITION_NAMES).map(([ed, name]) => ({
  id: ed,
  name,
  author: 'The Pandemonium Institute',
  logo: `img/${ed}.webp`,
  builtIn: true,
  ids: [...ROLES.values()].filter((r) => r.edition === ed && r.team !== 'traveller').map((r) => r.id),
  custom: {},
}));

// imported scripts belong to a room
