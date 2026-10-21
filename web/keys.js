'use strict';
// Keys: which key runs which action (keys.json, merged with the user's own by the host, see KeysFile.cs),
// and the key presses: chords ("Ctrl+K, K"), and Shift on a move to select. The actions are in
// actions.js. Loaded before app.js; nothing here runs before app.js has started.

// KeyboardEvent.code -> the name keys.json uses. By the physical key, so a dead key (` on US-International)
// or another layout gives the same name.
const KEY_NAMES = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Period: '.', Comma: 'Comma', Slash: '/', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Space: 'Space',
  Backspace: 'Backspace', Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', NumpadAdd: 'NumPlus', NumpadSubtract: 'NumMinus',
};

// A key press as keys.json writes it ("Ctrl+Shift+S"); null for a key it has no name for.
function strokeOf(e, shift = e.shiftKey) {
  const c = e.code;
  const name = /^Key[A-Z]$/.test(c) ? c[3] : /^Digit\d$/.test(c) ? c[5] : /^Numpad\d$/.test(c) ? 'Num' + c[6]
    : /^F\d{1,2}$/.test(c) ? c : KEY_NAMES[c];
  if (!name) return null;
  return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (shift ? 'Shift+' : '') + name;
}

const keys = {
  bindings: new Map(),   // "Ctrl+S", "Ctrl+K, K" -> [action, ...parameters]
  prefixes: new Set(),   // the first keys of chords
  byAction: new Map(),   // "heading 2" -> ["Ctrl+H, 2"]: for menus, tooltips and F1
  user: new Set(),       // keys set in the user's own keys.json
  defaults: new Map(),   // like byAction, for the default set alone: F1 shows a default the user replaced
  userFile: '',
  pending: null,         // the first key of a chord, waiting for the second
};

const callId = call => call.join(' ');

// The merged set from the host: { keys, problems, user, userFile }.
function setKeys({ keys: map, order, problems, user, userFile, defaults }) {
  keys.bindings.clear();
  keys.prefixes.clear();
  keys.byAction.clear();
  keys.defaults.clear();
  keys.user = new Set(user || []);
  keys.userFile = userFile;
  for (const [key, value] of Object.entries(defaults || {})) {
    const id = callId(Array.isArray(value) ? value : [value]);
    if (!keys.defaults.has(id)) keys.defaults.set(id, []);
    keys.defaults.get(id).push(key);
  }
  for (const key of order) {
    const value = map[key], call = Array.isArray(value) ? value : [value];
    keys.bindings.set(key, call);
    if (key.includes(', ')) keys.prefixes.add(key.split(', ')[0]);
    const id = callId(call);
    if (!keys.byAction.has(id)) keys.byAction.set(id, []);
    keys.byAction.get(id).push(key);
  }
  const unknown = [...new Set([...keys.bindings.values()].map(c => c[0]))].filter(name => !isAction(name));
  if (unknown.length) problems = [...problems, 'unknown action ' + unknown.join(', ')];
  if (problems.length) toast('keys.json: ' + problems.join('; '));
}

// The keys of an action: all of them, or the first one for a menu item or a tooltip ('' without a key).
const keysOf = (name, ...params) => keys.byAction.get(callId([name, ...params])) ?? [];
const keyText = (name, ...params) => keysOf(name, ...params)[0] ?? '';
// A title with its key, for tooltips: "Bold (Ctrl+B)".
const withKey = (title, name, ...params) => keyText(name, ...params) ? `${title} (${keyText(name, ...params)})` : title;

function setPending(stroke) {
  keys.pending = stroke;
  showChord(stroke);   // the bottom bar, see app.js
}

document.addEventListener('keydown', e => {
  if (e.isComposing || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
  // A modal window (F1, About) or an open menu handles its own keys.
  if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
  const stroke = strokeOf(e);
  if (keys.pending) {
    const first = keys.pending;
    setPending(null);
    e.preventDefault();   // the second key of a chord never types
    e.stopPropagation();
    if (stroke && stroke !== 'Esc') runKey(`${first}, ${stroke}`, e, `${first}, ${strokeOf(e, false)}`);
    return;
  }
  if (!stroke) return;
  if (keys.prefixes.has(stroke)) {
    e.preventDefault();
    e.stopPropagation();
    return setPending(stroke);
  }
  runKey(stroke, e, e.shiftKey ? strokeOf(e, false) : null);
}, true);

// Runs the key's action. Without one, the key with Shift taken off: when that is a move, it selects.
function runKey(key, e, unshifted) {
  let call = keys.bindings.get(key), extend = false;
  if (!call && unshifted && unshifted !== key) {
    const plain = keys.bindings.get(unshifted);
    if (plain && isMove(plain[0])) {
      call = plain;
      extend = true;
    }
  }
  if (!call) {
    if (key.includes(', ')) toast(`${key} is not a key.`);
    return;
  }
  if (runAction(call[0], call.slice(1), { extend, from: 'key' }) === PASS) return;
  e.preventDefault();
  e.stopPropagation();
}
