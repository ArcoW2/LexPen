'use strict';
// Macros in LexPen (docs/plans/executed/PLAN-macros.md): a macro (macrolang.js) run against the active editor. The
// environment does each step on the active pane's editor: actions, typing, moving the cursor, finding and replacing
// (from the cursor, never round past the end), the documents and panes; it gives the system variables ($$...). A play
// is one undo step per document it changed; the screen follows every step (on), only at the end (off), or every few
// seconds; Esc stops a macro. Loaded after macrolang.js.

const macroPlay = { running: false, stop: false, docs: new Map(), cms: new Set(), mode: 'on', every: 0, lastPaint: 0 };

// What the check knows of LexPen: its actions (with how many values each takes) and its system variables.
const MACRO_SYSTEM = ['found', 'error', 'errortext', 'bof', 'eof', 'line', 'column', 'linetext', 'word', 'selection',
  'document', 'path', 'lines', 'language', 'part', 'pane'];
// The switches readable as $$name: every toggle action without variants (wrap, outline, preview, ...).
const macroToggles = () => [...appActions.keys()].filter(n => n.endsWith('.toggle') && appActions.get(n).checked && !appActions.get(n).variants).map(n => n.slice(0, -7));
function macroContext(macros) {
  return {
    isAction: name => isAction(name),
    // How many values an action takes, from its variants (none listed: not checked); a move may end in `extend`.
    arities: name => {
      const v = appActions.get(name)?.variants;
      if (!v?.length) return null;
      const counts = [...new Set(v.map(p => p.length))];
      return isMove(name) ? [...new Set([...counts, ...counts.map(c => c + 1)])] : counts;
    },
    systemVars: new Set([...MACRO_SYSTEM, ...macroToggles().map(n => n.toLowerCase())]),
    macros: macros ?? null,
  };
}

// The editor a step works on: the active pane's, with its tab in the editor (a preview only tab: switched to split).
function macroEditor() {
  const pane = panes[state.activePane];
  if (!pane?.active) throw new MacroError('no document is open');
  if (!pane.cm || pane.active.mode === 'preview') throw new MacroError('the document is shown as preview only: the macro needs its editor');
  macroTouch(pane.cm);
  return pane;
}

// A document's history at its first change in this play, so the play is one undo step there (macroUndoStep).
function macroTouch(cm) {
  const doc = cm.getDoc().linkedDocRoot?.() ?? cm.getDoc(), hist = cm.getDoc().history;
  if (!macroPlay.docs.has(hist)) macroPlay.docs.set(hist, hist.done.length);
  if (macroPlay.mode !== 'on' && !macroPlay.cms.has(cm)) { cm.startOperation(); macroPlay.cms.add(cm); }
}

// The changes of a play in one undo step per document: its change events since the play began as one, with the
// selection before the first and after the last.
function macroUndoStep() {
  for (const [hist, from] of macroPlay.docs) {
    const added = hist.done.slice(from), changes = added.filter(e => e.changes);
    if (changes.length < 2) continue;
    const firstAt = added.findIndex(e => e.changes), before = added.slice(0, firstAt).filter(e => !e.changes).at(-1);
    const after = added.slice(added.lastIndexOf(changes.at(-1)) + 1).filter(e => !e.changes).at(-1);
    const merged = { changes: changes.flatMap(e => e.changes), generation: changes.at(-1).generation };
    hist.done.splice(from, added.length, ...[before, merged, after].filter(Boolean));
  }
  macroPlay.docs.clear();
}

// Finds `text` from the cursor (forward, or `back`), with Find's codes and switches (case, word, regex); never round.
function macroFind(cm, text, flags) {
  const f = { case: flags.includes('case'), word: flags.includes('word'), regex: flags.includes('regex') };
  let re;
  try { re = new RegExp(searchPattern(text, f), f.case ? 'g' : 'gi'); }   // app.js
  catch { throw new MacroError(`"${text}" is not a valid regular expression`); }
  const all = cm.getValue(), from = cm.indexFromPos(cm.getCursor('to')), to = cm.indexFromPos(cm.getCursor('from'));
  let hit = null;
  if (flags.includes('back')) { for (const m of all.matchAll(re)) { if (m.index + m[0].length > to) break; if (m[0].length) hit = m; } }
  else { re.lastIndex = from; for (let m = re.exec(all); m; m = re.exec(all)) { if (m[0].length) { hit = m; break; } re.lastIndex = m.index + 1; } }
  return hit ? { from: hit.index, to: hit.index + hit[0].length, regex: re, match: hit } : null;
}

const macroEnv = {
  action(name, args) {
    if (!isAction(name)) throw new MacroError(`there is no action "${name}"`);
    if (appActions.get(name)?.editor || appActions.get(name)?.preview || !appActions.has(name)) macroEditor();
    const extend = args.at(-1) === 'extend' && isMove(name);   // a recorded move with Shift: it selects
    if (extend) args = args.slice(0, -1);
    const r = runAction(name, args.map(a => /^-?\d+$/.test(a) ? Number(a) : a), { from: 'macro', extend });
    return r?.then ? r : undefined;
  },
  type(text) { const { cm } = macroEditor(); cm.replaceSelection(text, 'end', '+input'); },
  moveto({ where, line, col }) {
    const { cm } = macroEditor(), cur = cm.getCursor(), last = cm.lastLine();
    if (where === 'start') return cm.setCursor({ line: 0, ch: 0 });
    if (where === 'end') return cm.setCursor({ line: last, ch: cm.getLine(last).length });
    let l = cur.line;
    if (line) l = line.relative ? cur.line + line.relative * line.n : line.n - 1;
    l = Math.max(0, Math.min(last, l));
    const len = cm.getLine(l).length;
    let c = cur.ch;
    if (col?.end) c = len; else if (col) c = col.relative ? cur.ch + col.relative * col.n : col.n - 1;
    cm.setCursor({ line: l, ch: Math.max(0, Math.min(len, c)) });
  },
  find(text, flags) {
    const { cm } = macroEditor(), hit = macroFind(cm, text, flags);
    if (hit) cm.setSelection(cm.posFromIndex(hit.from), cm.posFromIndex(hit.to));
    return !!hit;
  },
  replace(from, to, flags) {
    const { cm } = macroEditor();
    if (cm.getOption('readOnly')) throw new MacroError('this tab is read-only');
    const f = { case: flags.includes('case'), word: flags.includes('word'), regex: flags.includes('regex') };
    const rep = m => f.regex ? m[0].replace(new RegExp(searchPattern(from, f), f.case ? '' : 'i'), replacementText(to, true)) : replacementText(to, false);
    if (flags.includes('all')) {
      const re = new RegExp(searchPattern(from, f), f.case ? 'g' : 'gi'), text = cm.getValue(), hits = [...text.matchAll(re)].filter(m => m[0].length);
      for (const m of hits.reverse()) cm.replaceRange(rep(m), cm.posFromIndex(m.index), cm.posFromIndex(m.index + m[0].length));
      return hits.length;
    }
    // The match selected (after a find) is replaced; else the next one from the cursor.
    let hit = macroFind(cm, from, flags.filter(x => x !== 'back'));
    const selFrom = cm.indexFromPos(cm.getCursor('from')), selTo = cm.indexFromPos(cm.getCursor('to'));
    if (selTo > selFrom) {
      const re = new RegExp('^(?:' + searchPattern(from, f) + ')$', f.case ? '' : 'i'), sel = cm.getRange(cm.getCursor('from'), cm.getCursor('to'));
      const m = re.exec(sel);
      if (m) hit = { from: selFrom, to: selTo, match: m };
    }
    if (!hit) return 0;
    cm.replaceRange(rep(hit.match), cm.posFromIndex(hit.from), cm.posFromIndex(hit.to));
    return 1;
  },
  selection() { return macroEditor().cm.getSelection(); },
  async newDoc(name) {
    if (allTabs().some(t => docName(t.doc).toLowerCase() === String(name).toLowerCase())) throw new MacroError(`a document "${name}" is open already`);
    await newFile();
    const doc = activeDoc();
    doc.draftName = name;
    host('draftName', { draft: doc.draft, name });
    refreshTabs();
  },
  async show(name) {
    const n = String(name).toLowerCase(), tab = allTabs().find(t => docName(t.doc).toLowerCase() === n || t.doc.path?.toLowerCase() === n);
    if (!tab) throw new MacroError(`no document "${name}" is open`);
    const pane = paneOf(tab);
    state.activePane = pane.index;
    await activate(pane, tab);
  },
  async showRecent() {
    const tab = allTabs().find(t => t.id === recentTabs[1]);
    if (!tab) throw new MacroError('there is no previous document');
    const pane = paneOf(tab);
    state.activePane = pane.index;
    await activate(pane, tab);
  },
  async open(path) {
    const doc = activeDoc(), full = /^[a-z]:\\|^\\\\/i.test(path) ? path : resolvePath(doc?.path ? dirOf(doc.path) : state.root || '', path);
    await openFile(full);
  },
  isOpen(name) { const n = String(name).toLowerCase(); return allTabs().some(t => docName(t.doc).toLowerCase() === n || t.doc.path?.toLowerCase() === n); },
  sys(name) {
    const pane = panes[state.activePane], tab = pane?.active, cm = pane?.cm, doc = tab?.doc;
    const toggle = macroToggles().find(t => t.toLowerCase() === name);
    if (toggle) return !!appActions.get(toggle + '.toggle').checked?.([], {});
    if (!MACRO_SYSTEM.includes(name)) return undefined;
    const editor = cm && tab && tab.mode !== 'preview', cur = editor ? cm.getCursor() : { line: 0, ch: 0 };
    switch (name) {
      case 'bof': return editor && cur.line === 0 && cur.ch === 0;
      case 'eof': return editor && cur.line === cm.lastLine() && cur.ch === cm.getLine(cur.line).length;
      case 'line': return cur.line + 1;
      case 'column': return cur.ch + 1;
      case 'linetext': return editor ? cm.getLine(cur.line) : '';
      case 'word': { if (!editor) return ''; const w = cm.findWordAt(cur); return cm.getRange(w.anchor, w.head).trim(); }
      case 'selection': return editor ? cm.getSelection() : '';
      case 'document': return doc ? docName(doc) : '';
      case 'path': return doc?.path ?? '';
      case 'lines': return editor ? cm.lineCount() : 0;
      case 'language': return doc ? languageOf(doc) : '';
      case 'part': return editor && typeof lineLanguage === 'function' ? lineLanguage(cm, cur.line) ?? languageOf(doc) : doc ? languageOf(doc) : '';
      case 'pane': return (pane?.index ?? 0) + 1;
    }
    return '';
  },
  loadMacro(name) { return host('macroRead', { name }).catch(() => null); },
  screen(mode, seconds) { macroScreen(mode, seconds); },
  // After a step: the screen as the mode says, and Esc. In the modes without updates the editors stay in one
  // operation; a short break now and then still lets Esc in.
  step() {
    if (macroPlay.stop) return true;
    const now = performance.now();
    // The guard (3.5): neither the text nor the cursor changed for a while: asks to stop it.
    const cm = panes[state.activePane]?.cm, mark = cm ? `${state.activePane}:${cm.changeGeneration()}:${cm.indexFromPos(cm.getCursor())}` : '';
    if (mark !== macroPlay.guardMark) Object.assign(macroPlay, { guardMark: mark, guardSince: now });
    else if (now - macroPlay.guardSince > MACRO_GUARD_MS) return askMacroGuard();
    const wait = macroPlay.mode === 'on' ? 30 : macroPlay.mode === 'every' ? macroPlay.every * 1000 : 200;
    if (now - macroPlay.lastPaint < wait) return false;
    macroPlay.lastPaint = now;
    const paint = macroPlay.mode !== 'off';
    if (paint) macroEndOperations();
    return new Promise(r => (paint ? requestAnimationFrame : f => setTimeout(f, 0))(() => r(macroPlay.stop)));
  },
};

const MACRO_GUARD_MS = 10000;   // how long a macro may run without the text or the cursor changing before it asks
async function askMacroGuard() {
  macroEndOperations();
  const seconds = Math.round((performance.now() - macroPlay.guardSince) / 1000);
  const stop = await confirmBox(`The macro has run for ${seconds} seconds without the text or the cursor changing (a loop that does not end?). Stop it? (Cancel: it goes on.)`);   // highlights.js
  macroPlay.guardSince = performance.now();
  if (stop) macroPlay.stop = true;
  return macroPlay.stop;
}

function macroScreen(mode, seconds) {
  if (mode === 'on') macroEndOperations();
  macroPlay.mode = mode;
  macroPlay.every = seconds ?? 0;
}
function macroEndOperations() {
  for (const cm of macroPlay.cms) cm.endOperation();
  macroPlay.cms.clear();
}

// Plays a macro's text: `times` times (0: to the end of the file, while the cursor moves on). Options: notfound,
// onerror, screen ('on', 'off', 'every'), every (seconds), pause (step by step: runMacro's). Resolves to the result
// of the last run.
async function playMacro(text, { times = 1, notfound, onerror, screen = 'on', every = 2, name = 'The macro', pause } = {}) {
  if (pause) screen = 'on';   // each step must be seen (3.5)
  if (macroPlay.running) return toast('A macro is running already (Esc stops it).', true);
  const program = macroProgram(text, macroContext());
  const error = program.problems.find(p => p.severity === 'error');
  if (error) { toast(`${name} has an error, line ${error.line}: ${error.message}`); return { ok: false, reason: 'invalid', error }; }
  Object.assign(macroPlay, { running: true, stop: false, mode: screen, every, lastPaint: performance.now(), guardMark: null });
  document.body.toggleAttribute('data-macro-running', true);
  toast(`${name} runs; Esc stops it.`, true);
  let result, runs = 0;
  try {
    for (;;) {
      const pane = panes[state.activePane], before = pane?.cm ? pane.cm.indexFromPos(pane.cm.getCursor()) : 0;
      result = await runMacro(program, macroEnv, { notfound, onerror, everyStep: true, pause });
      runs++;
      if (!result.ok || result.reason === 'stopped' || macroPlay.stop || result.reason === 'stop' || result.reason === 'notfound') break;
      if (times && runs >= times) break;
      if (!times) {   // to the end of the file: while the cursor moves on and is not at the end
        const p = panes[state.activePane], at = p?.cm ? p.cm.indexFromPos(p.cm.getCursor()) : 0;
        if (!p?.cm || at <= before || macroEnv.sys('eof')) break;
      }
    }
  } finally {
    macroEndOperations();
    macroUndoStep();
    macroPlay.running = false;
    document.body.toggleAttribute('data-macro-running', false);
  }
  if (!result.ok) toast(`${name} stopped at line ${result.error.line ?? '?'}: ${result.error.message}`);
  else if (macroPlay.stop) toast(`${name} was stopped (Esc).`, true);
  else if (result.reason === 'notfound') toast(`${name} ended: not found: ${result.detail}`, true);
  else toast(runs > 1 ? `${name} ran ${runs} times.` : `${name} ran.`, true);
  updateStatus();
  return result;
}

// Esc stops a running macro (before anything else gets the key).
addEventListener('keydown', e => {
  if (!macroPlay.running || e.key !== 'Escape' || document.querySelector('dialog[open]')) return;   // a dialog's Esc is its own
  macroPlay.stop = true;
  macroDebug.resume?.('stop');   // paused step by step
  e.preventDefault();
  e.stopPropagation();
}, true);

// ---------- Stored macros (3.7, 3.8) ----------
// The macros in macros\ of the data folder (MacroStore.cs), by name; ~last is the last recording. Play plays the
// macro played last (else the last recording). A macro open in a tab plays as the tab shows it, unsaved changes too.
const MACRO_LAST = '~last';
const macroStore = { names: [], current: null, nextRecording: null };   // nextRecording: { name, how: 'append' | 'insert' }
const macroTitle = name => name === MACRO_LAST ? 'The last recording' : `Macro ${name}`;

async function loadMacroNames() {
  macroStore.names = await host('macroList').catch(() => []);
  const def = appActions.get('macroRun');
  def.variants = macroStore.names.map(n => [n]);   // F1 lists each one
  def.variantTitles = Object.fromEntries(macroStore.names.map(n => [n, 'Play macro ' + n]));
  return macroStore.names;
}

async function macroFile(name, create = false) { return host('macroPath', { name, create }).catch(() => null); }

async function macroText(name) {
  const path = await macroFile(name), tab = path && allTabs().find(t => samePath(t.doc.path, path));
  return tab ? docText(tab.doc) : host('macroRead', { name }).catch(() => null);
}

// A macro played from its own tab works on the document in the other pane.
function macroTarget() {
  const pane = panes[state.activePane];
  if (!pane?.active || languageOf(pane.active.doc) !== 'macro') return;
  const other = panes.find(p => p !== pane && p.active && !p.el.hidden && languageOf(p.active.doc) !== 'macro');
  if (other) { state.activePane = other.index; other.cm?.focus(); }
}

async function playStoredMacro(name, opts = {}) {
  name ??= macroStore.current ?? MACRO_LAST;
  const text = await macroText(name);
  if (text == null) return toast(name === MACRO_LAST ? 'There is no recording yet (View > Macros > Record).' : `There is no macro "${name}".`);
  macroStore.current = name;
  macroTarget();
  return playMacro(text, { name: macroTitle(name), ...opts });
}

async function playMacroTimes(name) {
  const count = await askName('Play how many times?', '2', '', [0, 1]);
  if (count === null) return;
  if (!/^\d+$/.test(count.trim()) || +count < 1) return toast('A number of times: 1 or more.', true);
  return playStoredMacro(name, { times: +count });
}

async function openMacro(name) {
  const path = await macroFile(name, true);
  if (!path) return toast(`"${name}" cannot be the name of a macro.`);
  await openFile(path);
}

async function newMacro() {
  const name = await askName('Name of the new macro', '', '');
  if (!name) return;
  const why = await host('macroNameRefusal', { name });
  if (why) return toast(`${why[0].toUpperCase()}${why.slice(1)}.`, true);
  if ((await loadMacroNames()).some(n => n.toLowerCase() === name.toLowerCase())) return toast(`A macro "${name}" exists already.`, true);
  await host('macroWrite', { name, text: '# ' + name + '\n' });
  await loadMacroNames();
  await openMacro(name);
}

async function renameMacro(name) {
  const to = await askName(`New name of ${name === MACRO_LAST ? 'the last recording' : 'macro ' + name}`, name === MACRO_LAST ? '' : name, '');
  if (!to || to === name) return false;
  const why = await host('macroNameRefusal', { name: to });
  if (why) { toast(`${why[0].toUpperCase()}${why.slice(1)}.`, true); return false; }
  // As a file rename (app.js): a tab showing it follows.
  try { await host('rename', { path: await macroFile(name), name: to + '.lpm' }); }
  catch (e) { toast(e.message); return false; }
  if (macroStore.current === name) macroStore.current = to;
  await loadMacroNames();
  return true;
}

async function deleteMacro(name) {
  if (!await host('confirm', { text: `Delete ${name === MACRO_LAST ? 'the last recording' : 'the macro ' + name}? Its file goes.` })) return false;
  await host('macroDelete', { name });
  if (macroStore.current === name) macroStore.current = null;
  await loadMacroNames();
  return true;
}

async function macroKey(name) {
  const key = await askName(`A key for macro ${name} (as Ctrl+Alt+1, or Ctrl+K, M)`, '', '');
  if (!key) return;
  const r = await host('macroKey', { key, name });
  if (r?.error) return toast(r.error, true);
  setKeys(await host('keys'));   // keys.js
  toast(`${r.key} plays macro ${name} (in your keys.json).`, true);
}

// View > Macros (filled when it opens).
async function macroMenuItems() {
  const names = await loadMacroNames(), last = await host('macroRead', { name: MACRO_LAST }).catch(() => null);
  const items = names.map(n => ({ label: n.replace(/&/g, '&&'), action: 'macroRun', params: [n], key: keyText('macroRun', n) }));
  if (last != null) items.push({ label: 'Last recording', action: 'macroRun', params: [MACRO_LAST] });
  if (!items.length) items.push({ label: '(no macros yet)', enabled: false });
  const recording = typeof macroRecording !== 'undefined' && macroRecording.on;
  return [...items, '-',
    { label: recording ? '&Stop recording' : '&Record', action: 'macro.record', params: [], key: keyText('macro.record') },
    { label: '&Play', action: 'macro.play', params: [], key: keyText('macro.play') },
    { label: 'Play &X times...', action: 'macro.playTimes', params: [], key: keyText('macro.playTimes') },
    { label: 'Play to the &end of the file', action: 'macro.playToEnd', params: [], key: keyText('macro.playToEnd') },
    { label: 'Step &by step', action: 'macro.stepThis', params: [], key: keyText('macro.stepThis'), enabled: !!macroPaneOf() || !!macroDebug.resume },
    '-',{ label: '&Manage...', action: 'macro.manage', params: [], key: keyText('macro.manage') }];
}

appAction('macroRun', { title: 'Play macro', hint: 'A stored macro by its name (keys.json: ["macroRun", "name"])', group: 'macros', variants: [],
  run: ([name]) => playStoredMacro(name) });
appAction('macro.play', { title: 'Play', hint: 'The macro played last, else the last recording', group: 'macros', run: () => playStoredMacro() });
appAction('macro.playTimes', { title: 'Play X times...', hint: 'The macro played last (else the last recording), so many times', group: 'macros', run: () => playMacroTimes() });
appAction('macro.playToEnd', { title: 'Play to the end of the file', hint: 'Again and again while the cursor moves on, up to the end of the file', group: 'macros',
  run: () => playStoredMacro(undefined, { times: 0 }) });
appAction('macro.manage', { title: 'Manage macros...', hint: 'The stored macros: play, open, rename, delete, a key; a new macro or recording', group: 'macros', run: () => manageMacros() });

// ---------- Manage ----------
async function manageMacros() {
  const dialog = $('.mm-macros-dialog'), list = dialog.querySelector('.mm-macros-list'), note = dialog.querySelector('.mm-macros-note');
  const fill = async keep => {
    const names = await loadMacroNames(), last = await host('macroRead', { name: MACRO_LAST }).catch(() => null);
    list.replaceChildren(...[...(last != null ? [[MACRO_LAST, 'Last recording']] : []), ...names.map(n => [n, n])].map(([value, text]) => {
      const keys = value === MACRO_LAST ? [] : keysOf('macroRun', value);
      return Object.assign(document.createElement('option'), { value, textContent: text + (keys.length ? `   (${keys.join(', ')})` : '') });
    }));
    list.value = keep ?? list.options[0]?.value ?? '';
    if (!list.value && list.options.length) list.selectedIndex = 0;
    const next = macroStore.nextRecording;
    note.textContent = next ? `The next recording is ${next.how === 'append' ? 'added to the end of' : 'inserted at the cursor in'} ${next.name}.` : '';
  };
  if (!dialog.wired) {
    dialog.wired = true;
    const chosen = () => list.value || null;
    dialog.addEventListener('click', async e => {
      const what = e.target.closest('[data-macro]')?.dataset.macro, name = chosen();
      if (!what) return;
      if (what === 'close') return dialog.close();
      if (what === 'new') { dialog.close(); return newMacro(); }
      if (what === 'record') { dialog.close(); macroStore.nextRecording = null; return runAction('macro.record', [], { from: 'menu' }); }
      if (!name) return toast('Choose a macro first.', true);
      if (what === 'play') { dialog.close(); return playStoredMacro(name); }
      if (what === 'open') { dialog.close(); return openMacro(name); }
      if (what === 'rename') { if (await renameMacro(name)) await fill(); return; }
      if (what === 'delete') { if (await deleteMacro(name)) await fill(); return; }
      if (what === 'key') { if (name === MACRO_LAST) return toast('Save the last recording under a name first (Rename).', true); await macroKey(name); return fill(name); }
      if (what === 'append' || what === 'insert') {
        if (what === 'insert') {
          const path = await macroFile(name);
          if (!allTabs().some(t => samePath(t.doc.path, path))) return toast('Insert goes at the cursor in the macro\'s open tab: Open it first.', true);
        }
        macroStore.nextRecording = { name, how: what };
        return fill(name);
      }
    });
    list.addEventListener('dblclick', () => { if (list.value) { dialog.close(); playStoredMacro(list.value); } });
  }
  await fill(macroStore.current);
  dialog.showModal();
  list.focus();
}

loadMacroNames();

// ---------- Recording (3.1) ----------
// What you do becomes the steps of a macro: the actions you run (keys, menus, bars) with their values; typed text, a
// run of it one `type`; the editor's own keys (arrows, Home, Backspace, Enter, ...) as `editorKey "Down"`; a click
// that moves the cursor as `moveto line, column` (on the cursor's line only the column); a find or replace of the
// find bar with its switches; a switch to another document or pane as `show "name"`. While it records, a Stop
// recording button shows right of the menus. The result is the last recording (~last), unless Manage chose to add
// it to a macro (at its end, or at the cursor in its open tab).
const macroRecording = { on: false, steps: [], typed: '', lastTab: null, mouse: null };
const macroQuote = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
const recordingNow = () => macroRecording.on && !macroPlay.running;

function flushTyped() {
  if (!macroRecording.typed) return;
  macroRecording.steps.push('type ' + macroQuote(macroRecording.typed));
  macroRecording.typed = '';
}
function recordStep(step) {
  if (!recordingNow()) return;
  flushTyped();
  macroRecording.steps.push(step);
}

// An action run by you (actions.js runAction): its name and values; a move with Shift ends in `extend`.
const MACRO_NOT_RECORDED = new Set(['find', 'replace', 'findNext', 'findPrevious', 'replaceAll', 'macroRun', 'editorKey', 'occurrences.field']);
function recordAction(name, params, ctx) {
  if (!recordingNow() || ctx.from === 'macro' || name.startsWith('macro') || MACRO_NOT_RECORDED.has(name)) return;
  const values = params.map(p => typeof p === 'number' || /^-?\d+$/.test(String(p)) ? String(p) : macroQuote(p));
  recordStep([name, ...values, ...(ctx.extend ? ['extend'] : [])].join(' '));
}

// The find bar (find.js): a search done, a replace.
function recordMacroFind(query, f, back) {
  if (!query) return;
  recordStep(['find', macroQuote(query), ...['case', 'word', 'regex'].filter(k => f[k]), ...(back ? ['back'] : [])].join(' '));
}
function recordMacroReplace(query, replacement, f, all) {
  if (!query) return;
  recordStep(['replace', macroQuote(query), macroQuote(replacement), ...['case', 'word', 'regex'].filter(k => f[k]), ...(all ? ['all'] : [])].join(' '));
}

// Another document shown (app.js noteActive): `show "name"`.
function recordActive(tab) {
  if (!recordingNow() || !tab || tab === macroRecording.lastTab) return;
  macroRecording.lastTab = tab;
  recordStep('show ' + macroQuote(docName(tab.doc)));
}

// The editor (app.js ensureEditor): typing, the editor's own keys, clicks.
function setupMacroRecording(pane) {
  const cm = pane.cm;
  cm.on('inputRead', (_, change) => {
    if (!recordingNow()) return;
    macroRecording.typed += change.text.join('\n');
  });
  cm.on('keyHandled', (_, name) => {
    if (!recordingNow()) return;
    const ch = /^'(.)'$/.exec(name);   // a character an editor helper typed (a closing bracket): typed text
    if (ch) { macroRecording.typed += ch[1]; return; }
    recordStep('editorKey ' + macroQuote(name));
  });
  cm.on('mousedown', (_, e) => { if (recordingNow() && e.button === 0) macroRecording.mouse = { cm, line: cm.getCursor().line }; });
}
addEventListener('mouseup', () => {
  const m = macroRecording.mouse;
  macroRecording.mouse = null;
  if (!m || !recordingNow()) return;
  setTimeout(() => {   // after the editor placed the cursor
    const { cm } = m;
    if (cm.somethingSelected()) return;   // a drag: no click
    const at = cm.getCursor();
    recordStep(at.line === m.line ? `moveto column ${at.ch + 1}` : `moveto ${at.line + 1}, ${at.ch + 1}`);
  });
}, true);

// The editor's own key, again (editorKey "Shift-Down"): as if it were pressed in the editor.
const EDITOR_KEY_CODES = { Backspace: 8, Tab: 9, Enter: 13, Esc: 27, Space: 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  Left: 37, Up: 38, Right: 39, Down: 40, Insert: 45, Delete: 46 };
function pressEditorKey(cm, name) {
  const parts = String(name).split('-'), base = parts.pop() || '-', mods = new Set(parts);
  const keyCode = EDITOR_KEY_CODES[base] ?? (/^F(\d{1,2})$/.test(base) ? 111 + +base.slice(1) : /^[A-Z0-9]$/i.test(base) ? base.toUpperCase().charCodeAt(0) : null);
  if (keyCode == null) throw new MacroError(`"${name}" is not an editor key`);
  const e = { type: 'keydown', keyCode, which: keyCode, shiftKey: mods.has('Shift'), ctrlKey: mods.has('Ctrl'), altKey: mods.has('Alt'), metaKey: mods.has('Cmd'),
    preventDefault() {}, stopPropagation() {} };
  cm.triggerOnKeyDown(e);
}
appAction('editorKey', { title: 'Editor key', hint: 'A key of the editor itself (an arrow, Home, Backspace, ...), as a recorded macro has it: editorKey "Shift-Down"', group: 'macros',
  editor: true, variants: [], run: ([name], { pane }) => pressEditorKey(pane.cm, name) });

function startRecording() {
  Object.assign(macroRecording, { on: true, steps: [], typed: '', lastTab: activeTab(), mouse: null });
  document.body.toggleAttribute('data-recording', true);
  const next = macroStore.nextRecording;
  toast(next ? `Recording, to be ${next.how === 'append' ? 'added to' : 'inserted in'} ${next.name}; ${keyText('macro.record') || 'Stop recording'} stops it.`
    : `Recording a macro; ${keyText('macro.record') || 'Stop recording'} stops it.`, true);
}

async function stopRecording() {
  flushTyped();
  macroRecording.on = false;
  document.body.toggleAttribute('data-recording', false);
  const text = macroRecording.steps.join('\n') + (macroRecording.steps.length ? '\n' : '');
  const next = macroStore.nextRecording;
  macroStore.nextRecording = null;
  if (!macroRecording.steps.length) return toast('Nothing was recorded.', true);
  if (next?.how === 'insert') {
    const path = await macroFile(next.name), tab = allTabs().find(t => samePath(t.doc.path, path));
    const cmDoc = tab && tabDoc(tab);
    if (cmDoc) { cmDoc.replaceSelection(text); return toast(`The recording is inserted in ${next.name}.`, true); }
  }
  if (next?.how === 'append' || next?.how === 'insert') {
    const had = await macroText(next.name) ?? '';
    await host('macroWrite', { name: next.name, text: had + (had && !had.endsWith('\n') ? '\n' : '') + text });
    return toast(`The recording is added to the end of ${next.name}.`, true);
  }
  await host('macroWrite', { name: MACRO_LAST, text });
  macroStore.current = MACRO_LAST;
  toast(`Recorded ${macroRecording.steps.length} step${macroRecording.steps.length === 1 ? '' : 's'}: Play (${keyText('macro.play') || 'View > Macros'}) plays it; Manage saves it under a name.`, true);
}

appAction('macro.record', { title: 'Record / stop recording', hint: 'What you do becomes a macro (the last recording): actions, typing, the editor\'s keys, clicks, finds, documents',
  group: 'macros', checked: () => macroRecording.on, run: () => macroRecording.on ? stopRecording() : startRecording() });

// ---------- Help in the macro editor (3.9) and checking (3.10) ----------
// A macro's tab (language macro) has the macro bar: Action..., Statement..., Variable... insert one at the cursor;
// Check lists the mistakes; Run plays this macro on the document in the other pane; ? opens the reference (F1 on a
// word there: its entry). While you type the macro is checked: mistakes underlined, their line numbers marked, the
// message as a tooltip. Completion (Ctrl+Space) knows the actions and the system variables.
const MACRO_SYSTEM_HINTS = {
  found: 'the last find or replace found something', error: 'the last step failed (with onerror continue)',
  errortext: 'why the last step failed', bof: 'the cursor is at the start of the file', eof: 'the cursor is at the end of the file',
  line: 'the cursor\'s line (from 1)', column: 'the cursor\'s column (from 1)', linetext: 'the text of the cursor\'s line',
  word: 'the word at the cursor', selection: 'the selected text', document: 'the tab\'s name', path: 'the tab\'s file',
  lines: 'the document\'s line count', language: 'the document\'s language', part: 'the language of the part the cursor is in',
  pane: 'the pane: 1 or 2',
};
const MACRO_SYSTEM_NAMES = { errortext: 'errorText', linetext: 'lineText' };
const MACRO_STATEMENT_HINTS = {
  set: 'set $name = <value>', inc: 'inc $n: one more', dec: 'dec $n: one less', append: 'append $list $item (", " between)',
  copy: 'copy $name: the selection into a variable', paste: 'paste $name: at the cursor', type: 'type <value>: at the cursor',
  moveto: 'moveto line, column / column n / start / end (a sign: relative)', find: 'find "text" case word regex back',
  replace: 'replace "a" "b" (all)', new: 'new "name": a new document', show: 'show "name" / show recent', open: 'open "path"',
  notfound: 'notfound stop / continue', onerror: 'onerror stop / continue', screen: 'screen on / off / every <seconds>',
  stop: 'ends the macro', goto: 'goto :label', gosub: 'gosub :label ... return', return: 'back after a gosub; a function\'s value',
  if: 'if <condition> then <step>, or a block up to endif', switch: 'switch <value> case ... endswitch',
  procedure: 'procedure name($a, ref $b) ... endprocedure', function: 'function name($a) ... return <value> ... endfunction',
  global: 'global $name: the macro\'s variable inside a procedure', use: 'use "macro": its procedures and functions',
};
// The statements Statement... inserts: a block with $0 where the cursor goes, indented as the cursor's line.
const MACRO_SNIPPETS = [
  ['if .. then .. endif', 'if $0 then\n  \nendif'],
  ['if .. then .. else .. endif', 'if $0 then\n  \nelse\n  \nendif'],
  ['if .. elseif .. else .. endif', 'if $0 then\n  \nelseif  then\n  \nelse\n  \nendif'],
  ['if on one line', 'if $0 then '],
  ['switch .. case .. else .. endswitch', 'switch $0\n  case ""\n    \n  else\n    \nendswitch'],
  ['A label, and goto', ':$0\n  \ngoto :'],
  ['gosub .. return', 'gosub :$0\nstop\n:\n  \n  return'],
  ['A loop with a counter', 'set $i = 0\n:loop\n  inc $i\n  $0\n  if $i < 10 then goto :loop'],
  ['A find loop (until nothing is found)', 'notfound continue\n:next\n  find "$0"\n  if not $$found then goto :done\n  \n  goto :next\n:done'],
  ['procedure .. endprocedure', 'procedure $0()\n  \nendprocedure'],
  ['function .. return .. endfunction', 'function $0()\n  \n  return \nendfunction'],
  ['set', 'set $$0 = '], ['type', 'type "$0"'], ['moveto', 'moveto $0'], ['find', 'find "$0"'], ['replace', 'replace "$0" ""'],
  ['copy', 'copy $$0'], ['paste', 'paste $$0'], ['append', 'append $$0 '], ['inc', 'inc $$0'], ['dec', 'dec $$0'],
  ['new', 'new "$0"'], ['show', 'show "$0"'], ['show recent', 'show recent$0'], ['open', 'open "$0"'],
  ['notfound continue', 'notfound continue$0'], ['onerror continue', 'onerror continue$0'], ['screen off', 'screen off$0'],
  ['stop', 'stop$0'], ['global', 'global $$0'], ['use', 'use "$0"'],
];

const macroPaneOf = () => { const p = panes[state.activePane]; return p?.cm && p.active && languageOf(p.active.doc) === 'macro' ? p : null; };

// Inserts a snippet at the cursor: its lines indented as the cursor's line, the cursor at $0.
function insertMacroSnippet(cm, snippet) {
  const indent = /^\s*/.exec(cm.getLine(cm.getCursor().line))[0];
  const text = snippet.replace(/\n/g, '\n' + indent), at = text.indexOf('$0');
  const from = cm.getCursor('from');
  cm.replaceSelection(text.replace('$0', ''), 'start');
  const pos = cm.posFromIndex(cm.indexFromPos(from) + (at < 0 ? text.length : at));
  cm.setCursor(pos);
  cm.focus();
}

// A searchable list in a small window: type to narrow it, Enter or a double click takes the selected one.
function macroPicker(title, items, take) {
  let dialog = document.querySelector('.mm-macro-picker');
  if (!dialog) {
    dialog = Object.assign(document.createElement('dialog'), { className: 'mm-about mm-macro-picker' });
    dialog.innerHTML = '<h1></h1><input type="text" spellcheck="false" placeholder="Type to narrow the list"><select size="14"></select>' +
      '<p class="mm-macro-picker-hint"></p><div class="mm-name-buttons"><button type="button" data-pick="ok">Insert</button><button type="button" data-pick="close">Close</button></div>';
    document.body.append(dialog);
  }
  const input = dialog.querySelector('input'), list = dialog.querySelector('select'), hint = dialog.querySelector('.mm-macro-picker-hint');
  dialog.querySelector('h1').textContent = title;
  const fill = () => {
    const q = input.value.toLowerCase();
    list.replaceChildren(...items.filter(i => (i.label + ' ' + (i.hint ?? '')).toLowerCase().includes(q)).slice(0, 500)
      .map(i => Object.assign(document.createElement('option'), { value: items.indexOf(i), textContent: i.label + (i.key ? `   (${i.key})` : '') })));
    list.selectedIndex = list.options.length ? 0 : -1;
    showHint();
  };
  const showHint = () => { hint.textContent = items[list.value]?.hint ?? ''; };
  const done = () => { const i = items[list.value]; dialog.close(); if (i) take(i); };
  input.oninput = fill;
  list.onchange = showHint;
  list.ondblclick = done;
  input.onkeydown = list.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); done(); }
    else if (e.key === 'ArrowDown' && e.target === input) { e.preventDefault(); list.selectedIndex = Math.min(list.options.length - 1, list.selectedIndex + 1); showHint(); }
    else if (e.key === 'ArrowUp' && e.target === input) { e.preventDefault(); list.selectedIndex = Math.max(0, list.selectedIndex - 1); showHint(); }
  };
  dialog.onclick = e => { const what = e.target.closest('[data-pick]')?.dataset.pick; if (what === 'ok') done(); else if (what === 'close') dialog.close(); };
  input.value = '';
  fill();
  dialog.showModal();
  input.focus();
}

// The macro's own variables (from its text).
const macroOwnVariables = text => [...new Set([...text.matchAll(/(?<!\$)\$([A-Za-z_]\w*)/g)].map(m => m[1]))].sort();

function pickMacroAction() {
  const pane = macroPaneOf();
  if (!pane) return toast('Action... is for a macro\'s tab (a .lpm file).', true);
  const items = [...appActions.values()].filter(a => !a.name.startsWith('macro') && !a.name.endsWith('.toggle') || a.name === 'macroRun')
    .flatMap(a => (a.variants?.length ? a.variants : [[]]).map(params => ({
      label: actionTitle(a.name, params) + '  -  ' + [a.name, ...params.map(p => typeof p === 'number' ? p : macroQuote(p))].join(' '),
      hint: a.hint ?? '', key: keyText(a.name, ...params),
      insert: [a.name, ...params.map(p => typeof p === 'number' ? p : macroQuote(p))].join(' '),
    }))).sort((x, y) => x.label.localeCompare(y.label));
  macroPicker('Action', items, i => insertMacroSnippet(pane.cm, i.insert + '$0'));
}

function pickMacroStatement() {
  const pane = macroPaneOf();
  if (!pane) return toast('Statement... is for a macro\'s tab (a .lpm file).', true);
  macroPicker('Statement', MACRO_SNIPPETS.map(([label, snippet]) => ({ label, hint: MACRO_STATEMENT_HINTS[label.split(' ')[0]] ?? '', snippet })),
    i => insertMacroSnippet(pane.cm, i.snippet));
}

function pickMacroVariable() {
  const pane = macroPaneOf();
  if (!pane) return toast('Variable... is for a macro\'s tab (a .lpm file).', true);
  const own = macroOwnVariables(pane.cm.getValue()).map(n => ({ label: '$' + n, hint: 'a variable of this macro', insert: '$' + n }));
  const sys = [...MACRO_SYSTEM, ...macroToggles().map(t => t.toLowerCase())].map(n => {
    const name = MACRO_SYSTEM_NAMES[n] ?? macroToggles().find(t => t.toLowerCase() === n) ?? n;
    return { label: '$$' + name, hint: MACRO_SYSTEM_HINTS[n] ?? `the switch ${name}: true when it is on`, insert: '$$' + name };
  });
  macroPicker('Variable', [...own, ...sys], i => insertMacroSnippet(pane.cm, i.insert + '$0'));
}

// ---------- Checking while you type ----------
function checkMacroPane(pane) {
  const cm = pane.cm;
  for (const m of pane.macroMarks ?? []) m.clear();
  for (const h of pane.macroLines ?? []) { cm.removeLineClass(h, 'gutter', 'mm-macro-error-line'); cm.removeLineClass(h, 'gutter', 'mm-macro-warning-line'); }
  pane.macroMarks = [];
  pane.macroLines = [];
  pane.macroProblems = [];
  if (!pane.active || languageOf(pane.active.doc) !== 'macro') return [];
  macroWords();
  const program = macroProgram(cm.getValue(), macroContext(new Set(macroStore.names.map(n => n.toLowerCase()))));
  pane.macroProblems = program.problems;
  cm.operation(() => {
    for (const p of program.problems) {
      const line = Math.min(cm.lastLine(), Math.max(0, p.line - 1)), text = cm.getLine(line);
      const from = Math.min(p.col ?? 0, text.length), to = Math.max(from + 1, text.length);
      const cls = p.severity === 'error' ? 'mm-macro-error' : 'mm-macro-warning';
      pane.macroMarks.push(cm.markText({ line, ch: text.length ? from : 0 }, { line, ch: text.length ? to : 0 },
        { className: cls, attributes: { title: (p.severity === 'error' ? 'Error: ' : 'Warning: ') + p.message } }));
      pane.macroLines.push(cm.addLineClass(line, 'gutter', cls + '-line'));
    }
  });
  return program.problems;
}

function scheduleMacroCheck(pane) {
  clearTimeout(pane.macroCheckTimer);
  pane.macroCheckTimer = setTimeout(() => checkMacroPane(pane), 400);
}

// Check (the bar): the mistakes listed; a click goes to one.
function showMacroCheck() {
  const pane = macroPaneOf();
  if (!pane) return toast('Check is for a macro\'s tab (a .lpm file).', true);
  const problems = checkMacroPane(pane);
  if (!problems.length) return toast('No mistakes found.', true);
  const at = pane.cm.cursorCoords(null, 'window');
  openPopupMenu(problems.map(p => ({ label: `Line ${p.line}: ${p.message}`, key: p.severity === 'error' ? 'error' : 'warning', plain: true,
    run: () => { pane.cm.setCursor({ line: p.line - 1, ch: p.col ?? 0 }); revealFound(pane.cm, pane.cm.getCursor()); pane.cm.focus(); } })), at.left, at.bottom);
}

// Run (the bar): this macro, as its tab shows it, on the document in the other pane.
async function runThisMacro() {
  const pane = macroPaneOf();
  if (!pane) return toast('Run is for a macro\'s tab (a .lpm file).', true);
  const text = pane.cm.getValue(), name = docName(pane.active.doc).replace(/\.lpm$/i, '');
  const other = panes.find(p => p !== pane && p.active && !p.el.hidden && languageOf(p.active.doc) !== 'macro');
  if (!other) return toast('Run works on the document in the other pane: open one there (the macro in one pane, the document in the other).', true);
  if (macroBreakLines(pane.active).size) return stepThisMacro('continue');   // it stops at its breakpoints
  state.activePane = other.index;
  other.cm?.focus();
  return playMacro(text, { name: 'Macro ' + name });
}

// The reference (?), at a word's entry (F1 on it in a macro's tab).
async function openMacroReference(anchor) {
  const path = await host('macroReference');
  await openFile(path, { mode: 'preview', anchor });
}

// The word at the cursor in a macro's tab, as an entry of the reference; null when it is none.
function macroReferenceAnchor(cm) {
  const cur = cm.getCursor(), line = cm.getLine(cur.line);
  let a = cur.ch, b = cur.ch;
  while (a > 0 && /[\w$]/.test(line[a - 1])) a--;
  while (b < line.length && /[\w$]/.test(line[b])) b++;
  const word = line.slice(a, b).toLowerCase();
  if (!word) return null;
  if (word.startsWith('$$')) return 'system-variables';
  if (word.startsWith('$')) return 'variables';
  if (['elseif', 'else', 'endif', 'then'].includes(word)) return 'if';
  if (['case', 'endswitch'].includes(word)) return 'switch';
  if (['endprocedure'].includes(word)) return 'procedure';
  if (['endfunction'].includes(word)) return 'function';
  if (word === 'return') return 'gosub';
  if (word === 'dec') return 'inc';
  if (MACRO_STATEMENTS.has(word)) return word;
  if (MACRO_BUILTINS[word]) return 'built-in-functions';
  if (isAction(line.slice(a, b))) return 'actions';
  return null;
}

// The hint of an action, a statement or a $$ variable under the mouse, as a tooltip.
function macroHintAt(cm, e) {
  const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window'), line = cm.getLine(pos.line) ?? '';
  let a = pos.ch, b = pos.ch;
  while (a > 0 && /[\w$.]/.test(line[a - 1])) a--;
  while (b < line.length && /[\w$.]/.test(line[b])) b++;
  const word = line.slice(a, b);
  if (!word) return '';
  if (word.startsWith('$$')) { const n = word.slice(2).toLowerCase(); return MACRO_SYSTEM_HINTS[n] ? `$$${MACRO_SYSTEM_NAMES[n] ?? n}: ${MACRO_SYSTEM_HINTS[n]}` : ''; }
  const w = word.toLowerCase();
  if (MACRO_STATEMENT_HINTS[w]) return MACRO_STATEMENT_HINTS[w];
  if (appActions.has(word)) { const d = appActions.get(word); return `${d.title}${d.hint ? ': ' + d.hint : ''}`; }
  return '';
}

// The macro pack knows the actions and system variables for completion (complete.js reads a pack's word lists).
function macroWords() {
  const pack = packs.macro;
  if (!pack || pack.mmMacroWords) return;
  pack.mmMacroWords = true;
  pack.words = { ...(pack.words ?? {}), variable: [...MACRO_SYSTEM.map(n => '$$' + (MACRO_SYSTEM_NAMES[n] ?? n)), ...macroToggles().map(t => '$$' + t)],
    def: [...appActions.keys()].filter(n => !n.endsWith('.toggle')) };
  if (pack.wordOrder) pack.wordOrder = [...new Set([...pack.wordOrder, 'variable', 'def'])];
  packWords.delete(pack);   // complete.js: read again with these
}

// A macro's tab: checked as you type, hints under the mouse (app.js ensureEditor, via setupMacroRecording's caller).
function setupMacroEditor(pane) {
  const cm = pane.cm;
  setupMacroBreaks(pane);
  cm.on('changes', () => { if (pane.active && languageOf(pane.active.doc) === 'macro') scheduleMacroCheck(pane); });
  cm.on('swapDoc', () => checkMacroPane(pane));
  cm.getWrapperElement().addEventListener('mousemove', e => {
    if (!pane.active || languageOf(pane.active.doc) !== 'macro' || e.target.closest('.mm-macro-error, .mm-macro-warning')) return;
    const hint = macroHintAt(cm, e);
    if (cm.getWrapperElement().title !== hint) cm.getWrapperElement().title = hint;
  });
}

appAction('macro.pickAction', { title: 'Insert an action', hint: 'In a macro: a list of every action, with its values', group: 'macros', run: () => pickMacroAction() });
appAction('macro.pickStatement', { title: 'Insert a statement', hint: 'In a macro: if, switch, a loop, a procedure, ... as a whole block', group: 'macros', run: () => pickMacroStatement() });
appAction('macro.pickVariable', { title: 'Insert a variable', hint: 'In a macro: its own variables and the system variables ($$...)', group: 'macros', run: () => pickMacroVariable() });
appAction('macro.check', { title: 'Check the macro', hint: 'Its mistakes listed (they are also marked as you type); a click goes to one', group: 'macros', run: () => showMacroCheck() });
appAction('macro.runThis', { title: 'Run this macro', hint: 'The macro of this tab, on the document in the other pane', group: 'macros', run: () => runThisMacro() });
appAction('macro.reference', { title: 'The macro language', hint: 'Every statement, the system variables, the rules of text and numbers', group: 'macros',
  run: () => { const p = macroPaneOf(); return openMacroReference(p ? macroReferenceAnchor(p.cm) : null); } });

// F1 in a macro's tab on a word of the language: its entry in the reference; elsewhere F1 as always.
{
  const f1 = appActions.get('commands'), run = f1?.run;
  if (f1) f1.run = (params, ctx) => {
    const p = macroPaneOf(), anchor = p && p.cm.hasFocus() ? macroReferenceAnchor(p.cm) : null;
    return anchor ? openMacroReference(anchor) : run(params, ctx);
  };
}

// ---------- Step by step (3.6) ----------
// The macro in one pane, the document it works on in the other. Before each line: the line marked in the macro's
// tab, its variables in the panel under it. Step (F10): the next line, a gosub or a call as one step; Step into
// (F11): into it too; Continue (F5): on to a breakpoint (a click on a line number, F9) or the end; Stop (Shift+F5, Esc).
const macroDebug = { tab: null, pane: null, active: null, how: 'into', level: 0, resume: null, panel: null, line: null, before: null };

async function stepThisMacro(how = 'over') {
  if (macroDebug.resume) return macroDebug.resume(how);
  if (macroDebug.tab) return;   // on its way to the next stop
  const pane = macroPaneOf();
  if (!pane) return toast('Step by step is for a macro\'s tab (a .lpm file).', true);
  const other = panes.find(p => p !== pane && p.active && !p.el.hidden && languageOf(p.active.doc) !== 'macro');
  if (!other) return toast('Step by step works on the document in the other pane: open one there (the macro in one pane, the document in the other).', true);
  const tab = pane.active, name = docName(tab.doc).replace(/\.lpm$/i, '');
  Object.assign(macroDebug, { tab, pane, how: how === 'continue' ? 'continue' : 'into', level: 0, before: null });
  showMacroDebugPanel(pane);
  state.activePane = other.index;
  other.cm?.focus();
  try { return await playMacro(tab.cmDoc.getValue(), { name: 'Macro ' + name, pause: macroPause }); }
  finally { endMacroDebug(); }
}

// runMacro's pause: stops here when stepping, at a breakpoint, or not at all; resolves to true to end the macro.
async function macroPause(info) {
  const d = macroDebug;
  if (macroPlay.stop) return true;
  if (!(d.how === 'into' || (d.how === 'over' && info.level <= d.level) || macroBreakLines(d.tab).has(info.line))) return false;
  d.active = state.activePane;   // the document it works on, whatever gets a click meanwhile
  macroEndOperations();
  markMacroLine(info.line);
  await fillMacroDebugPanel(info);
  const how = await new Promise(r => { d.resume = r; });
  d.resume = null;
  d.panel?.toggleAttribute('data-running', true);
  if (how === 'stop') { macroPlay.stop = true; return true; }
  Object.assign(d, { how, level: info.level });
  state.activePane = d.active;
  macroPlay.guardSince = performance.now();   // the time paused is not the macro's
  return false;
}

function markMacroLine(line) {
  const d = macroDebug, doc = d.tab.cmDoc;
  if (d.line) doc.removeLineClass(d.line, 'background', 'mm-macro-current');
  d.line = doc.addLineClass(Math.min(line - 1, doc.lastLine()), 'background', 'mm-macro-current');
  if (d.pane.active === d.tab) d.pane.cm.scrollIntoView({ line: line - 1, ch: 0 }, 60);
}

// Breakpoints: per tab, as line handles (they move with the text); a line that is gone has none.
function macroBreakLines(tab) {
  return new Set([...(tab?.macroBreaks ?? [])].map(h => h.lineNo()).filter(n => n != null).map(n => n + 1));
}
function toggleMacroBreak(pane, line) {
  const tab = pane.active, doc = tab.cmDoc, breaks = tab.macroBreaks ??= new Set(), h = doc.getLineHandle(line);
  for (const b of breaks) if (b.lineNo() == null) breaks.delete(b);
  if (breaks.has(h)) { breaks.delete(h); doc.removeLineClass(h, 'gutter', 'mm-macro-break'); }
  else { breaks.add(h); doc.addLineClass(h, 'gutter', 'mm-macro-break'); }
}

// The panel under the macro: the buttons, the macro's variables and the system ones apart.
function showMacroDebugPanel(pane) {
  macroDebug.panel?.remove();
  const el = document.createElement('div'), key = a => keyText(a) ? ` (${keyText(a)})` : '';
  el.className = 'mm-macro-debug';
  el.toggleAttribute('data-running', true);
  const bar = document.createElement('div');
  bar.className = 'mm-macro-debug-bar';
  const where = document.createElement('span');
  where.className = 'mm-macro-debug-where';
  bar.append(where);
  for (const [how, label, hint, action] of [
    ['over', 'Step', 'The next line; a gosub or a call runs as one step', 'macro.stepThis'],
    ['into', 'Step into', 'The next line, also into a gosub or a call', 'macro.stepInto'],
    ['continue', 'Continue', 'On to a breakpoint (a click on a line number) or the end', 'macro.continue'],
    ['stop', 'Stop', 'The macro ends here (also Esc)', 'macro.stopDebug']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = hint + key(action);
    b.onclick = () => macroDebug.resume?.(how);
    bar.append(b);
  }
  const vars = document.createElement('div');
  vars.className = 'mm-macro-debug-vars';
  el.append(bar, vars);
  el.addEventListener('mousedown', e => e.preventDefault());   // the focus stays where it is
  pane.editorEl.append(el);
  macroDebug.panel = el;
}

async function fillMacroDebugPanel(info) {
  const el = macroDebug.panel;
  if (!el) return;
  el.toggleAttribute('data-running', false);
  el.querySelector('.mm-macro-debug-where').textContent = `Line ${info.line}`;
  const own = info.vars().map(v => [`$${v.name}${v.type ? ':' + v.type : ''}${v.ref ? ' (ref)' : ''}${v.where === 'local' ? ' (local)' : ''}`, v.value]);
  const sys = [['$$found', info.found ? 'true' : 'false'], ['$$error', info.error ? 'true' : 'false'], ['$$errorText', info.errorText]];
  for (const n of MACRO_SYSTEM.filter(n => !['found', 'error', 'errortext'].includes(n))) {
    const v = await macroEnv.sys(n);
    sys.push(['$$' + (MACRO_SYSTEM_NAMES[n] ?? n), typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '')]);
  }
  const before = macroDebug.before ?? new Map(), now = new Map();
  const table = (title, rows) => {
    const t = document.createElement('table'), head = t.insertRow().insertCell();
    head.colSpan = 2;
    head.className = 'mm-macro-debug-head';
    head.textContent = title;
    if (!rows.length) { const c = t.insertRow().insertCell(); c.colSpan = 2; c.className = 'mm-macro-debug-none'; c.textContent = '(none yet)'; }
    for (const [name, value] of rows) {
      const r = t.insertRow(), n = r.insertCell(), v = r.insertCell();
      n.textContent = name;
      v.textContent = value === '' ? '""' : value;
      v.title = value;
      now.set(name, value);
      if (before.has(name) ? before.get(name) !== value : macroDebug.before) r.classList.add('mm-macro-changed');
    }
    return t;
  };
  el.querySelector('.mm-macro-debug-vars').replaceChildren(table('Variables', own), table('System variables', sys));
  macroDebug.before = now;
}

function endMacroDebug() {
  const d = macroDebug;
  if (d.line) d.tab.cmDoc.removeLineClass(d.line, 'background', 'mm-macro-current');
  d.panel?.remove();
  Object.assign(d, { tab: null, pane: null, panel: null, line: null, resume: null, before: null });
}

// A click on a line number of a macro's tab: a breakpoint there, or none.
function setupMacroBreaks(pane) {
  pane.cm.on('gutterClick', (cm, line, gutter) => {
    if (gutter === 'CodeMirror-linenumbers' && pane.active && languageOf(pane.active.doc) === 'macro') toggleMacroBreak(pane, line);
  });
}

appAction('macro.stepThis', { title: 'Step by step', hint: 'The macro of this tab a line at a time, on the document in the other pane, its variables shown; while it runs: the next line (a gosub or a call as one step)', group: 'macros',
  run: () => stepThisMacro('over') });
appAction('macro.stepInto', { title: 'Step into', hint: 'Step by step: the next line, also into a gosub or a call', group: 'macros',
  run: () => stepThisMacro('into') });
appAction('macro.continue', { title: 'Continue', hint: 'Step by step: on to a breakpoint or the end', group: 'macros',
  enabled: () => !!macroDebug.resume, run: () => macroDebug.resume?.('continue') });
appAction('macro.stopDebug', { title: 'Stop the macro', hint: 'Step by step: the macro ends here', group: 'macros',
  enabled: () => !!macroDebug.resume, run: () => macroDebug.resume?.('stop') });
appAction('macro.breakpoint', { title: 'Breakpoint', hint: 'In a macro\'s tab: Continue stops at this line (also a click on its line number)', group: 'macros',
  run: () => { const p = macroPaneOf(); if (!p) return toast('A breakpoint is for a macro\'s tab (a .lpm file).', true); toggleMacroBreak(p, p.cm.getCursor().line); } });
