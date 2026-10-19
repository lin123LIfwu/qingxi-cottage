// Persistent game state (localStorage)
const KEY = 'qingxi-cottage-save-v1';

export function defaultState() {
  return {
    v: 1,
    day: 1, minutes: 7 * 60 + 30, weather: 'sunny', tomorrow: 'sunny',
    coins: 300,
    seeds: { bokchoy: 8, carrot: 5, strawberry: 3, tomato: 2, corn: 1, pumpkin: 1 },
    items: {},
    water: 30, waterMax: 30, canLevel: 1, rodLevel: 1,
    tiles: null,
    fishLog: {},
    cropLog: {},
    player: null,
    tool: 0,
    stats: { harvested: 0, fishCaught: 0, earned: 0, tilled: 0, daysPlayed: 1 },
    settings: { quality: 'auto', music: 0.45, sfx: 0.75, speed: 1, showHints: true },
    dayEarned: 0,
    started: false,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    const d = defaultState();
    for (const k in d) if (s[k] === undefined) s[k] = d[k];
    s.settings = Object.assign(d.settings, s.settings || {});
    s.stats = Object.assign(d.stats, s.stats || {});
    s.seeds = Object.assign({}, d.seeds, s.seeds || {});
    return s;
  } catch (e) { return null; }
}

export function saveState(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
}
export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
