// save.js — progress lives in this browser's localStorage. Version-stamped so later
// versions can read or migrate it. Fails quietly (private mode, storage off): play goes on.

const KEY = 'light.save';
const VERSION = 1;

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === VERSION ? s : null;
  } catch {
    return null;
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...data }));
  } catch { /* storage unavailable */ }
}
