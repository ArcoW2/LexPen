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

const SLIDER_DELAY = 200;   // ms a slider rests before the app gets its value
let settings = null;   // { values, defaults, user, problems, defs, layout }
// A row of "this window" (def.layer): its value is in the main window's layout, not in settings.json
// (docs/plans/executed/PLAN-settings-layers.md); a change goes to that window.
const ofWindow = name => Object.hasOwn(settings.defaults.defaultLayout ?? {}, name);
const valueOf = name => ofWindow(name)
  ? settings.layout?.[name] ?? settings.values.defaultLayout?.[name] ?? settings.defaults.defaultLayout?.[name] : settings.values[name];
const defaultOf = def => def.layer === 'window' ? settings.defaults.defaultLayout?.[def.name] : def.default ?? settings.defaults[def.name];
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
  // A project (viewProject, compareProject): its id; 0 the project named "View" (def.none: what 0 is); def.more: other
  // choices before the projects. The list comes from the host when shown or focused.
  if (def.kind === 'project') {
    const select = document.createElement('select');
    let value = 0;
    const fill = async () => {
      const list = await host('projects').catch(() => []);
      select.replaceChildren();
      for (const [id, name] of [[0, def.none ?? 'The project named "View" (made on the first view)'], ...def.more ?? [], ...list.map(p => [p.id, p.name])]) {
        const o = document.createElement('option');
        o.value = JSON.stringify(id);
        o.textContent = name;
        select.append(o);
      }
      select.value = JSON.stringify(value);
    };
    select.addEventListener('focus', fill);
    select.addEventListener('change', () => set(def.name, JSON.parse(select.value)));
    box.append(select);
    fill();
    return { box, focus: select, show: v => { value = v; select.value = JSON.stringify(v); } };
  }
  if (def.kind === 'keys' || def.kind === 'buttons') {
    const buttons = def.kind === 'buttons' ? def.buttons ?? []
      : [['Show keys and commands (F1)', 'showCommands'], ['Open my keys.json', 'openFile', { file: 'keys' }]];
    for (const [label, op, args] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => op === 'fileTypes' ? openFileTypes() : host(op, args));   // a dialog here, or the host
      box.append(b);
    }
    return { box, show: () => {}, focus: box.firstChild };
  }
  // A colour: a colour of the theme (its name; it follows the theme) or one picked with the colour dialog (#rrggbb).
  // A swatch shows it.
  if (def.kind === 'colour') {
    const select = document.createElement('select'), swatch = document.createElement('span'), picker = document.createElement('input');
    swatch.className = 'st-swatch';
    picker.type = 'color';
    picker.className = 'st-picker';
    const add = (value, label) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      select.append(o);
      return o;
    };
    for (const [value, label] of def.options ?? []) add(value, label);
    const picked = add('#', 'A colour you picked');
    add('other', 'Other colour...');
    let current = '';
    const show = v => {
      current = typeof v === 'string' ? v : '';
      const hex = /^#[0-9a-f]{6}$/i.test(current);
      picked.hidden = !hex;
      if (hex) picked.textContent = `A colour you picked (${current})`;
      select.value = hex ? '#' : current;
      swatch.style.background = hex ? current : `var(--${current})`;
      if (hex) picker.value = current;
    };
    select.addEventListener('change', () => {
      if (select.value === 'other') {
        show(current);   // the list keeps showing the colour in use until one is picked
        picker.click();
        return;
      }
      if (select.value === '#') return;
      set(def.name, select.value);
      show(select.value);
    });
    picker.addEventListener('change', () => { set(def.name, picker.value); show(picker.value); });
    box.append(swatch, select, picker);
    return { box, focus: select, show };
  }
  // A slider (range: min, max, step) with its value: the value shows while dragging, the app gets it once the slider
  // rests SLIDER_DELAY ms (each step would redraw every window), and at once on release.
  if (def.kind === 'range') {
    const [min, max, step] = def.range ?? [0, 100, 1];
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step });
    const value = document.createElement('span');
    value.className = 'st-range-value';
    let timer = 0;
    const apply = () => { clearTimeout(timer); timer = 0; set(def.name, +input.value); };
    input.addEventListener('input', () => {
      value.textContent = input.value + def.unit;
      clearTimeout(timer);
      timer = setTimeout(apply, SLIDER_DELAY);
    });
    input.addEventListener('change', () => { if (timer) apply(); });
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
  // The chosen text as a tooltip: a list narrower than its text cuts it off.
  const tip = () => select.title = select.selectedOptions[0]?.textContent ?? '';
  select.addEventListener('change', () => { tip(); set(def.name, JSON.parse(select.value)); if (def.hints) show(); });
  box.append(...(sample ? [sample, select] : [select]));
  return {
    box, focus: select,
    show: v => {
      const value = JSON.stringify(v);
      // A value that is not in the list (typed into settings.json by hand) is shown as it is; the old id of a
      // renamed theme as the theme it is now.
      if (![...select.options].some(o => o.value === value)) {
        const now = typeof v === 'string' && settings.look?.renamed?.[v];
        const o = document.createElement('option');
        o.value = value;
        o.textContent = [...select.options].find(x => now && x.value === JSON.stringify(now))?.textContent ?? String(v);
        select.append(o);
      }
      select.value = value;
      tip();
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
  if (showWanted) showSetting(showWanted);
}

// One setting asked for (the Sort panel's slow preview): its tab, the search emptied, the row in view with the
// focus, flashing a few times. Before the rows exist: once they do.
let showWanted = null, settingShown = false;   // settingShown: the start leaves the focus on it, not on the search
function showSetting(name) {
  const def = settings?.defs?.find(d => d.name === name);
  showWanted = def && rows.length ? null : name;
  if (showWanted) return;
  ui.search.value = '';
  try { localStorage.settingsSearch = ''; } catch { /* per window only */ }
  layerShown = null;
  showTab(def.group);
  const r = rows.find(x => x.def.name === name);
  if (!r) return;
  r.el.scrollIntoView({ block: 'center' });
  r.control.focus?.focus();
  settingShown = true;
  r.el.classList.remove('st-flash');
  void r.el.offsetWidth;
  r.el.classList.add('st-flash');
  setTimeout(() => r.el.classList.remove('st-flash'), 1300);
}
events.showSetting = ({ name }) => showSetting(name);

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
    el.innerHTML = '<span class="st-layer"></span><div class="st-text"><div class="st-title"></div><div class="st-hint"></div></div>';
    const mark = el.querySelector('.st-layer');
    mark.dataset.layer = def.layer ?? 'global';
    mark.title = layerTip(mark.dataset.layer);
    el.querySelector('.st-title').textContent = def.title;
    el.querySelector('.st-hint').textContent = def.hint;
    const c = control(def);
    el.append(c.box);
    // The base for every screen; this screen's own zoom on a line of its own, with Reset (docs/plans/executed/PLAN-settings-layers.md).
    if (def.name === 'editorSize' || def.name === 'zoom') {
      const line = document.createElement('div');
      line.className = 'st-screen';
      line.innerHTML = '<span class="st-layer" data-layer="screen"></span><span class="st-screen-text"></span><button>Reset</button>';
      line.querySelector('.st-layer').title = layerTip('screen');
      line.querySelector('button').addEventListener('click', () => host('screenZoomReset', def.name === 'zoom' ? { preview: true } : { editor: true }));
      el.querySelector('.st-text').append(line);
    }
    if (def.kind !== 'keys' && def.kind !== 'buttons') {
      const reset = document.createElement('button');
      reset.className = 'st-reset';
      reset.textContent = 'Reset';
      reset.title = 'Back to the default';
      reset.addEventListener('click', () => set(def.name, defaultOf(def)));
      el.append(reset);
    }
    box.append(el);
    rows.push({ def, el, control: c });
  }
  const order = groupsOf(), after = [...ui.list.children].find(s => order.indexOf(s.dataset.group) > order.indexOf(group));
  ui.list.insertBefore(section, after ?? null);
  show();
}

// ---------- What a setting belongs to (docs/plans/executed/PLAN-settings-layers.md) ----------
// Global (settings.json, every window), this window (its layout, kept with its session), the theme set (the look;
// until theme sets exist the one set "Default", settings.json), this screen (the zoom per monitor). The legend shows
// the colours with their names; a click shows only that layer's rows, again all of them.
const LAYERS = [['global', 'Global'], ['window', 'This window'], ['set', 'Theme set'], ['screen', 'This screen']];
let layerShown = null;

function layerTip(layer) {
  if (layer === 'window') return 'This window: ' + (settings.window || 'the window this one belongs to');
  if (layer === 'set') return settings.themeSet ? `Theme set: ${settings.themeSet.name} (${SET_SOURCE[settings.themeSet.source]})` : 'Theme set: Default';
  if (layer === 'screen') return 'This screen: ' + (settings.screen?.name || 'the monitor the window is on');
  return 'Global: every window';
}

function buildLegend() {
  const legend = $('.st-legend');
  legend.replaceChildren();
  for (const [layer, name] of LAYERS) {
    const b = document.createElement('button');
    b.dataset.layer = layer;
    b.title = layerTip(layer) + ' (a click shows only these; again: all)';
    b.innerHTML = '<span class="st-layer"></span>';
    b.firstChild.dataset.layer = layer;
    b.append(name);
    b.addEventListener('click', () => {
      layerShown = layerShown === layer ? null : layer;
      for (const x of legend.children) x.classList.toggle('st-on', x.dataset.layer === layerShown);
      filter(true);   // as typing: the tab shown has none of them, the first tab that has one
    });
    legend.append(b);
  }
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
    if (def.kind === 'keys' || def.kind === 'buttons') continue;
    const value = valueOf(def.name);
    c.show(value);
    if (def.hintOff) el.querySelector('.st-hint').textContent = value ? def.hint : def.hintOff;
    if (def.hints) el.querySelector('.st-hint').textContent = def.hints[value] ?? def.hint;
    el.classList.toggle('st-changed', def.layer === 'window' ? JSON.stringify(value) !== JSON.stringify(defaultOf(def)) : settings.user.includes(def.name));
  }
  showScreenZoom();
  showSetBar();
  for (const r of rows) if (r.def.layer === 'set') r.el.querySelector('.st-layer').title = layerTip('set');
  const problems = [...(settings.problems ?? []), ...(settings.look?.problems ?? []), ...(settings.languageProblems ?? [])];
  ui.problems.hidden = !problems.length;
  ui.problems.textContent = problems.join('\n');
}

// This screen's zoom under the base rows: the editor's step, the preview's factor; Reset only when it has its own.
function showScreenZoom() {
  const s = settings.screen ?? {};
  for (const { def, el } of rows) {
    const line = el.querySelector('.st-screen');
    if (!line) continue;
    let own = '';
    if (def.name === 'editorSize' && s.editorStep) {
      const pt = (valueOf('editorSize') || 10.5) + s.editorStep;   // 10.5 pt: the editor's default size (app.js)
      own = `${s.editorStep > 0 ? '+' : ''}${s.editorStep} pt, so ${pt} pt`;
    }
    if (def.name === 'zoom' && s.previewFactor && s.previewFactor !== 1)
      own = `${Math.round((valueOf('zoom') || 1) * s.previewFactor * 100)}%`;
    line.querySelector('.st-screen-text').textContent = 'On this screen: ' + (own || 'as on every screen');
    line.querySelector('button').hidden = !own;
    line.querySelector('.st-layer').title = layerTip('screen');
  }
}

// The zoom of the main window's monitor changed (a zoom there, the window moved to another monitor).
events.screen = s => {
  settings.screen = s;
  show();
};

// As setSetting in app.js: a value set here and not yet confirmed wins over a set the host sent meanwhile.
const unconfirmed = new Map();

function set(name, value, quiet) {
  // A setting of the theme set: stored in the set the main window shows; the bar says where, with Undo.
  if (rows.find(r => r.def.name === name)?.def.layer === 'set' && !quiet) {
    const before = settings.values[name];
    settings.values[name] = value;
    host('settingSet', { name, value }).then(info => {
      if (info) setMessage(`Stored in theme set "${info.set}"` + (info.also ? ` (also used by ${info.also})` : ''), () => { set(name, before, true); show(); });
    }).catch(e => { ui.problems.hidden = false; ui.problems.textContent = e.message; });
    return;
  }
  if (ofWindow(name)) {
    settings.layout = { ...settings.layout, [name]: value };
    host('layoutSet', { name, value });
    return;
  }
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
  settings = { ...s, defs: settings.defs, look: settings.look, languageProblems: settings.languageProblems, layout: settings.layout,
    window: settings.window, screen: settings.screen };
  Object.assign(settings.values, mine);
  show();
};

// ---------- The theme set (docs/plans/executed/PLAN-theme-sets.md) ----------
const SET_SOURCE = { project: "this project's own", desktop: "this desktop's default", app: "the app's default" };
const setBar = $('.st-set'), setSelect = $('.st-set-select');

function showSetBar() {
  const s = settings.themeSet;
  setBar.hidden = !s;
  if (!s) return;
  setSelect.replaceChildren(...[['', "None (the desktop's or the app's default)"], ...s.sets.map(n => [n, n])]
    .map(([value, text]) => Object.assign(document.createElement('option'), { value, textContent: text })));
  setSelect.value = s.own ?? '';
  $('.st-set-source').textContent = s.own ? '' : `shows ${s.name}, ${SET_SOURCE[s.source]}`;
  setBar.querySelector('.st-layer').title = layerTip('set');
}

// For a few moments after a change: where it was stored (and what else uses that set), with Undo.
function setMessage(text, undo) {
  const message = $('.st-set-message'), button = $('.st-set-undo');
  const normal = [setSelect, $('.st-set-text'), $('.st-set-source')];
  message.textContent = text;
  message.hidden = button.hidden = false;
  for (const el of normal) el.hidden = true;
  button.onclick = () => { undo(); end(); };
  const end = () => {
    message.hidden = button.hidden = true;
    for (const el of normal) el.hidden = false;
  };
  clearTimeout(setMessage.timer);
  setMessage.timer = setTimeout(end, 8000);
}

setSelect.addEventListener('change', () => host('themeSet', { set: setSelect.value || null }));
$('.st-set-manage').addEventListener('click', () => host('openThemeSets'));
events.themeSet = ({ themeSet }) => {
  settings.themeSet = themeSet;
  show();
};

// The main window's layout changed (a menu, a key, a row here).
events.layout = ({ layout }) => {
  settings.layout = layout;
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
  if (words.length || layerShown) for (const group of groupsOf()) buildGroup(group);
  document.body.classList.toggle('st-searching', words.length > 0 || !!layerShown);
  const matches = r => {
    // A row that only counts with another setting's value (Alt opens: with the ribbon only), or one of its values.
    if (r.def.showWhen && ![].concat(r.def.showWhen.value).includes(valueOf(r.def.showWhen.name))) return false;
    // This screen: the rows with a line of this screen's zoom (the editor font size, the preview zoom).
    if (layerShown && (r.def.layer ?? 'global') !== layerShown && !(layerShown === 'screen' && r.el.querySelector('.st-screen'))) return false;
    const text = (r.def.title + ' ' + r.def.hint + ' ' + (r.def.hintOff ?? '') + ' ' + Object.values(r.def.hints ?? {}).join(' ') + ' ' + r.def.group + ' ' + (r.def.sub ?? '') + ' ' +
      (r.def.keywords ?? '')).toLowerCase();
    return words.every(w => text.includes(w));
  };
  const found = new Set(rows.filter(matches).map(r => r.def.group));
  if (typing && (words.length || layerShown) && !found.has(tab) && found.size) {
    tab = groupsOf().find(g => found.has(g));
    try { localStorage.settingsTab = tab; } catch { /* per window only */ }
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
  const narrowed = words.length > 0 || !!layerShown;
  for (const b of ui.tabs.children) b.classList.toggle('st-has', narrowed && found.has(b.dataset.group));
  const total = rows.filter(matches).length;
  ui.count.textContent = !narrowed ? '' : total === shown ? `${shown} found` : `${shown} here, ${total} in all tabs`;
}
ui.search.addEventListener('input', () => {
  try { localStorage.settingsSearch = ui.search.value; } catch { /* per window only */ }
  filter(true);
});

// Closed and opened again (its window or docked): the search, the tab (settingsTab) and the place in the list as they
// were. The place is kept a moment after scrolling, with its tab.
ui.list.addEventListener('scroll', () => {
  clearTimeout(ui.scrollTimer);
  ui.scrollTimer = setTimeout(() => { try { localStorage.settingsScroll = JSON.stringify({ tab, top: ui.list.scrollTop }); } catch { /* per window only */ } }, 200);
});
function restoreView() {
  try {
    const search = localStorage.settingsSearch ?? '';
    if (search) { ui.search.value = search; filter(); }
    const at = JSON.parse(localStorage.settingsScroll ?? 'null');
    if (at?.tab === tab && Number.isFinite(at.top)) ui.list.scrollTop = at.top;
  } catch { /* no storage, or not readable: the start */ }
}

// ---------- Keys ----------
const visibleRows = () => rows.filter(r => !r.el.hidden);

addEventListener('keydown', e => {
  if (ftDialog.open) return;   // the File types dialog has its own keys (Esc closes it, not the window)
  if (e.ctrlKey && !e.altKey && (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp') && settings?.defs) {
    e.preventDefault();
    return stepTab(e.key === 'PageUp' || e.key === 'Tab' && e.shiftKey ? -1 : 1);
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (ui.search.value) {
      ui.search.value = '';
      try { localStorage.settingsSearch = ''; } catch { /* per window only */ }
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

// ---------- File types (docs/plans/executed/PLAN-file-types.md) ----------
// Every extension of the language packs: checked when LexPen opens it, how (edit or view; choosing one checks the row),
// the app Windows starts now. The filter narrows the rows. Rows are selected apart from their checkbox (click, Ctrl+click,
// Shift+click, Ctrl+A for the rows shown); the line below the table puts each setting on Change into the selected rows
// shown. Assign on every row: it clears the filter and the host asks first. A debug build refuses Assign (the host says so).
const ftDialog = $('.st-ft'), ftFilter = $('.st-ft-filter'), ftBody = ftDialog.querySelector('tbody'), ftNote = $('.st-ft-note');
const ftFoot = ftDialog.querySelector('tfoot'), ftApply = ftDialog.querySelector('.st-ft-apply');
const ft = { rows: [], sort: 'extension', desc: false, drawn: [], selected: new Set(), anchor: null };

function ftShown() {
  const words = ftFilter.value.toLowerCase().split(/\s+/).filter(Boolean);
  return ft.rows.filter(r => words.every(w => (r.extension + ' ' + r.languageName).toLowerCase().includes(w)));
}

function ftDraw() {
  const key = r => String(ft.sort === 'opensWith' ? r.opensWith ?? '' : r[ft.sort] ?? '').toLowerCase();
  const rows = ftShown().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.extension < b.extension ? -1 : 1) * (ft.desc ? -1 : 1));
  for (const th of ftDialog.querySelectorAll('th[data-sort]')) {
    th.classList.toggle('st-on', th.dataset.sort === ft.sort);
    th.classList.toggle('st-desc', th.dataset.sort === ft.sort && ft.desc);
  }
  ft.drawn = rows;
  ftBody.replaceChildren(...rows.map(r => {
    const tr = document.createElement('tr');
    tr.classList.toggle('st-sel', ft.selected.has(r.extension));
    tr.addEventListener('click', e => { if (!e.target.closest('input, select')) ftSelect(r, e); });
    tr.innerHTML = '<td><input type="checkbox"></td><td></td><td></td><td><select><option value="edit">Edit</option><option value="view">View</option></select></td><td></td>' +
      '<td><input type="checkbox" class="st-ft-preview"></td><td></td>';
    const [check, ext, language, , now, previewCell, previewNow] = tr.children, box = check.firstChild, select = tr.querySelector('select');
    const preview = previewCell.firstChild;
    box.checked = r.checked;
    ext.textContent = r.extension;
    language.textContent = r.languageName;
    select.value = r.as;
    now.textContent = r.opensWith ?? '-';
    now.className = r.lexpen ? 'st-ft-lexpen' : r.opensWith ? '' : 'st-ft-dim';
    // Explorer's preview in LexPen (docs/plans/PLAN-preview-handler.md 3.8): apart from how the file opens.
    preview.checked = r.previewOn;
    previewNow.textContent = r.previewsWith ?? '-';
    previewNow.className = r.previewLexPen ? 'st-ft-lexpen' : r.previewsWith ? '' : 'st-ft-dim';
    preview.addEventListener('change', () => { r.previewOn = preview.checked; ftChanged(); });
    box.addEventListener('change', () => { r.checked = box.checked; ftChanged(); });
    select.addEventListener('change', () => { r.as = select.value; r.checked = box.checked = true; ftChanged(); });   // one click less
    return tr;
  }));
  ftChanged();
  ftMarkSelected();
}

// A click selects the row alone, Ctrl+click adds or removes it, Shift+click the rows from the last one clicked.
function ftSelect(r, e) {
  const at = ft.drawn.indexOf(r), from = ft.drawn.findIndex(x => x.extension === ft.anchor);
  if (e.shiftKey && from >= 0) {
    if (!e.ctrlKey) ft.selected.clear();
    for (const x of ft.drawn.slice(Math.min(at, from), Math.max(at, from) + 1)) ft.selected.add(x.extension);
  } else {
    if (!e.ctrlKey) ft.selected.clear();
    if (e.ctrlKey && ft.selected.has(r.extension)) ft.selected.delete(r.extension);
    else ft.selected.add(r.extension);
    ft.anchor = r.extension;
  }
  ftMarkSelected();
}

function ftMarkSelected() {
  ft.drawn.forEach((r, i) => ftBody.children[i].classList.toggle('st-sel', ft.selected.has(r.extension)));
  const count = ft.drawn.filter(r => ft.selected.has(r.extension)).length;
  ftApply.textContent = count ? `Apply to selected (${count})` : 'Apply to selected';
  ftApply.disabled = !count || !ftFoot.querySelector('.st-ft-change option[value="1"]:checked');
}

// The line below the table: a setting on Change can be set, on Keep each row keeps its own. Setting how it opens checks
// the rows too (as choosing it in one row does), unless "LexPen opens it" is on Change itself.
for (const change of ftFoot.querySelectorAll('.st-ft-change')) change.addEventListener('change', () => {
  ftFoot.querySelector(`[data-value="${change.dataset.for}"]`).disabled = !change.value;
  ftMarkSelected();
});
ftApply.addEventListener('click', () => {
  const on = name => ftFoot.querySelector(`.st-ft-change[data-for="${name}"]`).value;
  const value = name => { const v = ftFoot.querySelector(`[data-value="${name}"]`); return v.type === 'checkbox' ? v.checked : v.value; };
  for (const r of ft.drawn.filter(r => ft.selected.has(r.extension))) {
    if (on('as')) { r.as = value('as'); r.checked = true; }
    if (on('checked')) r.checked = value('checked');
    if (on('previewOn')) r.previewOn = value('previewOn');
  }
  ftDraw();
});
ftDialog.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && !e.target.closest('input[type=search]')) {
    e.preventDefault();
    for (const r of ft.drawn) ft.selected.add(r.extension);
    ftMarkSelected();
  }
});

// Nothing changed since the dialog opened: the last button is Close; else Cancel (closing it throws the changes away).
function ftChanged() {
  const changed = ft.rows.some(r => r.checked !== !!r.mode || r.checked && r.as !== (r.mode ?? 'edit') || r.previewOn !== !!r.preview);
  ftDialog.querySelector('[data-ft=cancel]').textContent = changed ? 'Cancel' : 'Close';
}

async function ftLoad() {
  const list = await host('fileTypes');
  ft.rows = list.map(r => ({ ...r, checked: !!r.mode, as: r.mode ?? 'edit', previewOn: !!r.preview }));
  ftDraw();
}

async function openFileTypes() {
  ftFilter.value = '';
  ftNote.textContent = '';
  ftNote.classList.remove('st-error');
  ft.selected.clear();
  ft.anchor = null;
  for (const change of ftFoot.querySelectorAll('.st-ft-change')) {
    change.value = '';
    ftFoot.querySelector(`[data-value="${change.dataset.for}"]`).disabled = true;
  }
  ftDialog.showModal();
  ftFilter.focus();
  await ftLoad();
}
events.fileTypes = () => openFileTypes();   // F1 > File types

ftFilter.addEventListener('input', ftDraw);
for (const th of ftDialog.querySelectorAll('th[data-sort]')) th.addEventListener('click', () => {
  ft.desc = ft.sort === th.dataset.sort ? !ft.desc : false;
  ft.sort = th.dataset.sort;
  ftDraw();
});
ftDialog.querySelector('.st-ft-buttons').addEventListener('click', async e => {
  const what = e.target.closest('[data-ft]')?.dataset.ft;
  if (!what) return;
  if (what === 'cancel') return ftDialog.close();
  if (what === 'assign') {
    ftFilter.value = '';   // Assign is for every row: all of them shown
    ftDraw();
    ftNote.classList.remove('st-error');
    try {
      const done = await host('assignFileTypes', { chosen: ft.rows.filter(r => r.checked).map(r => ({ extension: r.extension, mode: r.as })),
        previews: ft.rows.filter(r => r.previewOn).map(r => r.extension) });
      if (done.cancelled) return;
      ftDialog.close();   // assigned (what Windows keeps for another app the host has said already)
    } catch (error) {
      ftNote.textContent = error.message;
      ftNote.classList.add('st-error');
    }
    return;
  }
});

// ---------- This window's layout: Save as default, Reset to default ----------
// Save: the main window's layout becomes defaultLayout (the layout new projects start with), at once; the bar says so,
// with Undo (the default as it was). Reset: the main window takes the default layout again (its tabs and folder stay).
const layoutBar = $('.st-layout'), layoutText = layoutBar.querySelector('.st-layout-text');
function layoutMessage(text, undo) {
  layoutText.textContent = text;
  for (const b of layoutBar.querySelectorAll('[data-layout]')) b.hidden = !!undo;
  layoutBar.querySelector('.st-undo')?.remove();
  if (undo) {
    const b = document.createElement('button');
    b.className = 'st-undo';
    b.textContent = 'Undo';
    b.addEventListener('click', () => { undo(); layoutMessage("This window's layout:"); });
    layoutBar.append(b);
  }
  clearTimeout(layoutMessage.timer);
  if (undo) layoutMessage.timer = setTimeout(() => layoutMessage("This window's layout:"), 8000);
}
// With a theme set the host asks first what to save (docs/plans/executed/PLAN-theme-sets.md, 3.11).
layoutBar.querySelector('[data-layout="save"]').addEventListener('click', async () => {
  const answer = await host('saveAsDefault');
  if (!answer) return;
  const before = settings.user.includes('defaultLayout') ? settings.values.defaultLayout : settings.defaults.defaultLayout;
  const layout = Object.fromEntries(Object.keys(settings.defaults.defaultLayout ?? {}).map(n => [n, valueOf(n)]));
  if (answer.layout) set('defaultLayout', layout);
  const s = answer.set;
  const what = [answer.layout && "This window's layout", s && `the theme set "${s.name}"`].filter(Boolean).join(' and ');
  layoutMessage(`${what[0].toUpperCase() + what.slice(1)} ${answer.layout && s ? 'are' : 'is'} now the default for new projects` +
    (s?.for === 'desktop' ? ' on this desktop.' : '.'), () => {
    if (answer.layout) set('defaultLayout', before);
    if (s) host('themeSetCommand', { kind: 'use', for: s.for, desktop: s.desktop, name: s.before });
  });
});
layoutBar.querySelector('[data-layout="reset"]').addEventListener('click', () => host('runInWindow', { name: 'layoutResetDefault' }));

// ---------- Start ----------
(async () => {
  settings = await host('init');
  await usableFonts().catch(() => []);
  buildLegend();
  build();
  if (!settingShown) { restoreView(); ui.search.focus(); ui.search.select(); }   // typing replaces the last search
})();
