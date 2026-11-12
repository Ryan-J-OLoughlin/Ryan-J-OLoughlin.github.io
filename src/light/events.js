// events.js — a tiny announcer. The game says what happened; anything can listen.
// Version 1 listeners: the UI and saving. Sound and the hero board can subscribe here later
// without touching the game rules.
//
// Events: 'place' {x,y,t}, 'rotate' {x,y,t,r}, 'pickup' {x,y,t}, 'area' {x,y,points},
//         'robust' {x,y,points}, 'landmark' {x,y,kind,points}, 'cube' {t,from}, 'region' {n}

const listeners = {};
export const on = (name, fn) => (listeners[name] ||= []).push(fn);
export const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));
