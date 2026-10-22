'use strict';
// The settings window (Options > Settings; SettingsForm.cs hosts it). A tab per group (Ctrl+Tab, Ctrl+PgDn / PgUp),
// built from the rows a main window describes (SETTING_ROWS in actions.js). A change goes to the host at once
// (settingSet); the host writes your settings.json and sends the new set to every window, this one included.
// Keys: type to search; Up / Down between rows; Space toggles; Enter opens a list; Esc empties the search,
// a second Esc closes the window.

const $ = s => document.querySelector(s);
const ui = { search: $('.st-search'), count: $('.st-count'), problems: $('.st-problems'), tabs: $('.st-tabs'), list: $('.st-list') };

// ---------- Host bridge (as in app.js) ----------
const pending = new Map(), events = {};
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return events[e.data.event]?.(e.data);
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

let settings = null;   // { values, defaults, user, problems, defs }
const rows = [];       // { def, el, control }

// ---------- Look: the app's theme (from the host) and the app font, as the main windows (applyFonts in app.js) ----------
let themeVars = [];
function applyLook() {
  const v = settings.values, look = settings.look;
  if (look) {
    document.documentElement.dataset.theme = look.mode;
    for (const name of themeVars) document.documentElement.style.removeProperty(name);
    for (const [name, value] of Object.entries(look.app.vars)) document.documentElement.style.setProperty(name, value);
    themeVars = Object.keys(look.app.vars);
  }
  const root = document.documentElement.style;
  root.setProperty('--app-font', v.appFont ? `"${v.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.setProperty('--ui-scale', v.appSize ? v.appSize * 96 / 72 / 13 : 1);
}

// ---------- The rows ----------
const quote = name => `"${name.replace(/["\\]/g, '')}"`;

function control(def) {
  const box = document.createElement('div');
  box.className = 'st-control';
  if (def.kind === 'toggle') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      set(def.name, input.checked);
      show();   // a hint per state (hintOff) follows at once
    });
    box.append(input);
    return { box, show: v => input.checked = !!v, focus: input };
  }
  if (def.kind === 'keys') {
    for (const [label, op, args] of [['Show keys and commands (F1)', 'showCommands'], ['Open my keys.json', 'openFile', { file: 'keys' }]]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => host(op, args));
      box.append(b);
    }
    return { box, show: () => {}, focus: box.firstChild };
  }
  // A slider (range: min, max, step) with its value; it applies while dragging.
  if (def.kind === 'range') {
    const [min, max, step] = def.range ?? [0, 100, 1];
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
    const value = document.createElement('span');
    value.className = 'st-range-value';
    input.addEventListener('input', () => { value.textContent = input.value + def.unit; set(def.name, +input.value); });
    box.append(input, value);
    return { box, focus: input, show: v => { input.value = v; value.textContent = input.value + def.unit; } };
  }
  // Names to languages (languageNames): pairs in one line, "bash=tcc, cmd=batch"; kept as { bash: "tcc", ... }.
  if (def.kind === 'names') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'st-names';
    input.spellcheck = false;
    input.placeholder = 'bash=tcc, cmd=batch';
    input.addEventListener('change', () => {
      const map = {};
      for (const pair of input.value.split(',')) {
        const [name, language] = pair.split('=').map(x => x?.trim());
        if (name && language) map[name.toLowerCase()] = language;
      }
      set(def.name, map);
    });
    box.append(input);
    return { box, focus: input,
      show: v => input.value = Object.entries(v && typeof v === 'object' ? v : {}).map(([k, x]) => `${k}=${x}`).join(', ') };
  }
  // A list: choices and sizes from the row, fonts from the host. Values keep their kind (text or number).
  const select = document.createElement('select');
  let sample = null;
  if (def.kind === 'font') {
    const fonts = installedFonts ?? [];
    const add = (parent, value, label) => {
      const o = document.createElement('option');
      o.value = JSON.stringify(value);
      o.textContent = label;
      parent.append(o);
    };
    add(select, '', def.monoFirst ? 'Default (Consolas)' : 'Default (Segoe UI)');
    for (const mono of def.monoFirst ? [true, false] : [false, true]) {
      const group = document.createElement('optgroup');
      group.label = mono ? 'Monospaced' : 'Not monospaced';
      for (const f of fonts.filter(f => f.mono === mono)) add(group, f.name, f.name);
      select.append(group);
    }
    sample = document.createElement('span');
    sample.className = 'st-sample';
    sample.textContent = 'AaBb 0O 1lI';
  } else {
    for (const [value, label] of def.options ?? []) {
      const o = document.createElement('option');
      o.value = JSON.stringify(value);
      o.textContent = label;
      select.append(o);
    }
  }
  select.addEventListener('change', () => set(def.name, JSON.parse(select.value)));
  box.append(...(sample ? [sample, select] : [select]));
  return {
    box, focus: select,
    show: v => {
      const value = JSON.stringify(v);
      // A value that is not in the list (typed into settings.json by hand) is shown as it is.
      if (![...select.options].some(o => o.value === value)) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = String(v);
        select.append(o);
      }
      select.value = value;
      if (sample) sample.style.fontFamily = v ? `${quote(v)}, monospace` : '';
    },
  };
}

// ---------- Tabs: a tab per group ----------
// A tab's rows are made the first time it is shown (the fonts of the Editor and App tabs, a row per language in
// Languages take a while); a search looks through every tab, so it makes them all.
let tab = null;              // the group shown
const built = new Set();     // the groups whose rows exist
const groupsOf = () => [...new Set(settings.defs.map(d => d.group))];

function build() {
  ui.list.replaceChildren();
  ui.tabs.replaceChildren();
  rows.length = 0;
  built.clear();
  if (!settings.defs) {
    ui.list.innerHTML = '<div class="st-none">The settings are not known yet: open this window again from a LexPen window.</div>';
    return;
  }
  const names = groupsOf();
  let stored = null;
  try { stored = localStorage.settingsTab; } catch { /* no storage: the first tab */ }
  tab = names.includes(tab) ? tab : names.includes(stored) ? stored : names[0];
  for (const group of names) {
    const b = document.createElement('button');
    b.className = 'st-tab';
    b.dataset.group = group;
    b.textContent = group;
    b.addEventListener('click', () => showTab(group));
    ui.tabs.append(b);
  }
  showTab(tab);
}

function showTab(group) {
  tab = group;
  try { localStorage.settingsTab = group; } catch { /* per window only */ }
  for (const b of ui.tabs.children) b.classList.toggle('st-on', b.dataset.group === group);
  buildGroup(group);
  filter();
  ui.list.scrollTop = 0;
}

// The rows of one group, in its own section (the sections in the order of the groups).
function buildGroup(group) {
  if (built.has(group)) return;
  built.add(group);
  const section = document.createElement('section');
  section.className = 'st-section';
  section.dataset.group = group;
  const h = document.createElement('div');
  h.className = 'st-group';
  h.dataset.group = group;
  h.textContent = group;
  section.append(h);
  let sub = null, box = section;
  for (const def of settings.defs.filter(d => d.group === group)) {
    // A part of a group, as Editor view > Gutter: its header and rows in a box of their own (a hover shows the box).
    if ((def.sub ?? null) !== sub) {
      sub = def.sub ?? null;
      box = section;
      if (sub) {
        box = document.createElement('div');
        box.className = 'st-subgroup';
        box.dataset.group = group;
        box.dataset.sub = sub;
        const s = document.createElement('div');
        s.className = 'st-sub';
        s.textContent = sub;
        box.append(s);
        section.append(box);
      }
    }
    const el = document.createElement('div');
    el.className = 'st-row';
    el.dataset.name = def.name;
    el.dataset.group = def.group;
    if (def.sub) el.classList.add('st-in-sub');
    el.innerHTML = '<div class="st-text"><div class="st-title"></div><div class="st-hint"></div></div>';
    el.querySelector('.st-title').textContent = def.title;
    el.querySelector('.st-hint').textContent = def.hint;
    const c = control(def);
    el.append(c.box);
    if (def.kind !== 'keys') {
      const reset = document.createElement('button');
      reset.className = 'st-reset';
      reset.textContent = 'Reset';
      reset.title = 'Back to the default';
      reset.addEventListener('click', () => set(def.name, def.default ?? settings.defaults[def.name]));
      el.append(reset);
    }
    box.append(el);
    rows.push({ def, el, control: c });
  }
  const order = groupsOf(), after = [...ui.list.children].find(s => order.indexOf(s.dataset.group) > order.indexOf(group));
  ui.list.insertBefore(section, after ?? null);
  show();
}

// Next / previous tab (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PgDn / PgUp).
function stepTab(dir) {
  const names = groupsOf(), i = names.indexOf(tab);
  showTab(names[(i + dir + names.length) % names.length]);
}

// The values as they are now: controls, the changed marks, problems in your file.
function show() {
  applyLook();
  for (const { def, el, control: c } of rows) {
    if (def.kind === 'keys') continue;
    c.show(settings.values[def.name]);
    if (def.hintOff) el.querySelector('.st-hint').textContent = settings.values[def.name] ? def.hint : def.hintOff;
    el.classList.toggle('st-changed', settings.user.includes(def.name));
  }
  const problems = [...(settings.problems ?? []), ...(settings.look?.problems ?? []), ...(settings.languageProblems ?? [])];
  ui.problems.hidden = !problems.length;
  ui.problems.textContent = problems.join('\n');
}

// As setSetting in app.js: a value set here and not yet confirmed wins over a set the host sent meanwhile.
const unconfirmed = new Map();

function set(name, value) {
  settings.values[name] = value;
  unconfirmed.set(name, (unconfirmed.get(name) ?? 0) + 1);
  host('settingSet', { name, value }).catch(e => {
    ui.problems.hidden = false;
    ui.problems.textContent = e.message;
  }).finally(() => {
    if (unconfirmed.get(name) > 1) unconfirmed.set(name, unconfirmed.get(name) - 1);
    else unconfirmed.delete(name);
  });
}

events.settings = ({ settings: s }) => {
  const mine = Object.fromEntries([...unconfirmed.keys()].map(n => [n, settings.values[n]]));
  settings = { ...s, defs: settings.defs, look: settings.look, languageProblems: settings.languageProblems };
  Object.assign(settings.values, mine);
  show();
};

events.languages = ({ languages }) => {
  settings.languageProblems = languages.problems;
  show();
};
events.look = ({ look }) => {
  settings.look = look;
  show();
};
// A main window described the rows again (another list of themes).
events.defs = ({ defs }) => {
  settings.defs = defs;
  const search = ui.search.value, focused = document.activeElement?.closest('.st-row')?.dataset.name;
  build();
  ui.search.value = search;
  filter();
  if (focused) rows.find(r => r.def.name === focused)?.control.focus?.focus();
};

// ---------- Search ----------
// The rows of the tab shown; with words only those that match. A search looks through every tab: the tabs with a
// match stand out (a click shows their matches), and while typing, when the tab shown has none, the first tab with one
// is shown.
function filter(typing = false) {
  const words = ui.search.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) for (const group of groupsOf()) buildGroup(group);
  document.body.classList.toggle('st-searching', words.length > 0);
  const matches = r => {
    const text = (r.def.title + ' ' + r.def.hint + ' ' + (r.def.hintOff ?? '') + ' ' + r.def.group + ' ' + (r.def.sub ?? '')).toLowerCase();
    return words.every(w => text.includes(w));
  };
  const found = new Set(rows.filter(matches).map(r => r.def.group));
  if (typing && words.length && !found.has(tab) && found.size) {
    tab = groupsOf().find(g => found.has(g));
    for (const b of ui.tabs.children) b.classList.toggle('st-on', b.dataset.group === tab);
  }
  let shown = 0;
  for (const r of rows) {
    r.el.hidden = r.def.group !== tab || !matches(r);
    if (!r.el.hidden) shown++;
  }
  for (const s of ui.list.querySelectorAll('.st-section'))
    s.hidden = !rows.some(r => r.def.group === s.dataset.group && !r.el.hidden);
  for (const b of ui.list.querySelectorAll('.st-subgroup'))
    b.hidden = !rows.some(r => r.def.group === b.dataset.group && r.def.sub === b.dataset.sub && !r.el.hidden);
  for (const b of ui.tabs.children) b.classList.toggle('st-has', words.length > 0 && found.has(b.dataset.group));
  const total = rows.filter(matches).length;
  ui.count.textContent = !words.length ? '' : total === shown ? `${shown} found` : `${shown} here, ${total} in all tabs`;
}
ui.search.addEventListener('input', () => filter(true));

// ---------- Keys ----------
const visibleRows = () => rows.filter(r => !r.el.hidden);

addEventListener('keydown', e => {
  if (e.ctrlKey && !e.altKey && (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp') && settings?.defs) {
    e.preventDefault();
    return stepTab(e.key === 'PageUp' || e.key === 'Tab' && e.shiftKey ? -1 : 1);
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (ui.search.value) {
      ui.search.value = '';
      filter();
      ui.search.focus();
    } else host('close');
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    // Between rows (a closed list would otherwise change its value).
    const list = visibleRows(), at = list.findIndex(r => r.el.contains(document.activeElement));
    const next = e.key === 'ArrowDown' ? (at < 0 ? 0 : at + 1) : at - 1;
    e.preventDefault();
    if (next < 0) return ui.search.focus();
    list[Math.min(next, list.length - 1)]?.control.focus?.focus();
    return;
  }
  if (e.key === 'Enter' && document.activeElement?.tagName === 'SELECT') {
    e.preventDefault();
    document.activeElement.showPicker?.();
  }
}, true);

$('.st-foot [data-open]').addEventListener('click', e => host('openFile', { file: e.target.dataset.open }));

// ---------- Start ----------
(async () => {
  settings = await host('init');
  await usableFonts().catch(() => []);
  build();
  ui.search.focus();
})();
