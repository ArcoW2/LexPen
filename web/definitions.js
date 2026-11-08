'use strict';
// Go to definition and find references (docs/plans/executed/PLAN-code-intelligence.md). A definition is an outline entry of a
// group (or pattern) its language pack marks `definition: true` (languages.js, definitionOf). F12 looks the name at the
// cursor up in the definitions of the open files and of the folder (the Folder pane's, else the file's own; its
// subfolders too), without the qualifier before it (an SQL owner, a C# namespace or class): a qualifier only orders
// the list. Shift+F12 searches the folder for the name, whole word. Loaded after app.js.

// ---------- Names ----------
// How a language writes its names (the pack's `names`): the separator between a qualifier and a name, the quotes
// around a part (one character: the same at both ends; two: the opening and the closing one), more characters a name
// may hold, and whether case counts. A pack without it: plain words, compared as written.
function nameRules(language) {
  const n = packs[language ?? 'markdown']?.names ?? {};
  const quotes = Array.isArray(n.quotes) ? n.quotes.filter(q => typeof q === 'string' && (q.length === 1 || q.length === 2)) : [];
  return {
    separator: typeof n.separator === 'string' && n.separator ? n.separator : null,
    quotes, chars: typeof n.chars === 'string' ? n.chars : '', ignoreCase: n.case === false,
  };
}

// A name as written ("dba"."proc_name", dba.proc_name) in its qualifier and its name, the quotes off.
function splitName(text, rules) {
  let plain = text;
  for (const q of rules.quotes) for (const c of q) plain = plain.split(c).join('');
  const parts = rules.separator ? plain.split(rules.separator).filter(Boolean) : [plain];
  return { name: parts.at(-1) ?? '', qualifier: parts.slice(0, -1).join(rules.separator ?? '') };
}
const nameKey = (text, rules) => rules.ignoreCase ? text.toLowerCase() : text;

// The name at the cursor: the word there (or just before it), taken on over the separator and the quotes, so the
// cursor anywhere in "dba"."proc_name" reads all of it. Only here: the editor's own words stay as they are.
function nameAtCursor(cm, rules) {
  const pos = cm.getCursor(), line = cm.getLine(pos.line);
  const extra = rules.chars + (rules.separator ?? '') + rules.quotes.join('');
  const inName = c => !!c && (/[\p{L}\p{N}_$]/u.test(c) || extra.includes(c));
  const word = c => !!c && (/[\p{L}\p{N}_$]/u.test(c) || rules.chars.includes(c));
  let at = pos.ch;
  if (!word(line[at]) && word(line[at - 1])) at--;
  if (!word(line[at])) return null;
  let from = at, to = at + 1;
  while (from > 0 && inName(line[from - 1])) from--;
  while (to < line.length && inName(line[to])) to++;
  let text = line.slice(from, to);
  const sep = rules.separator;
  while (sep && text.startsWith(sep)) text = text.slice(sep.length);   // a dot before or after it (obj..x, x.)
  while (sep && text.endsWith(sep)) text = text.slice(0, -sep.length);
  const split = splitName(text, rules);
  return split.name ? split : null;
}

// ---------- Which files have definitions ----------
const outlineMarks = name => Array.isArray(packs[name]?.outline) && packs[name].outline.some(g => g?.definition === true || (Array.isArray(g?.patterns) && g.patterns.some(p => p?.definition === true)));
const definitionExtensions = () => Object.entries(packExtensions).filter(([, name]) => outlineMarks(name)).map(([ext]) => ext);

// A document's definitions: { name, qualifier, line, ch, text } (text: the outline entry, for the list).
function definitionsIn(doc) {
  const rules = nameRules(doc.language);
  return (outlineOf(doc) ?? []).filter(e => e.definition).map(e => ({ ...splitName(e.definition, rules), line: e.line, ch: e.ch, text: e.text }));
}

// ---------- The index of the folder ----------
// Per file of the folder: its time (as the host lists it) and its definitions; built file by file in the background,
// a file read again only when its time changed. The open files are not taken from it: their text in the editor counts.
const defIndex = { root: null, files: new Map(), run: null, again: false };

function indexRoot() { return searchFolder(); }   // the Folder pane's folder, else the active file's (app.js)

// Brings the index up to date with the folder (another folder: a new one). Returns when it is done.
function refreshDefinitions() {
  const root = indexRoot();
  if (!root) return Promise.resolve();
  if (defIndex.root !== root) { defIndex.root = root; defIndex.files = new Map(); }
  if (defIndex.run) { defIndex.again = true; return defIndex.run; }
  defIndex.run = (async () => {
    try {
      do {
        defIndex.again = false;
        const list = await host('listFiles', { root, extensions: definitionExtensions() }).catch(() => []);
        if (defIndex.root !== root) return;
        const seen = new Set();
        let yielded = performance.now(), done = 0;
        for (const { path, time } of list) {
          const key = path.toLowerCase();
          seen.add(key);
          done++;
          if (defIndex.files.get(key)?.time === time) continue;   // unchanged: nothing to read (nor to show)
          defStatus(done, list.length);
          const got = await host('read', { path }).catch(() => null);
          if (defIndex.root !== root) return;
          if (!got || got.kind || typeof got.text !== 'string') { defIndex.files.delete(key); continue; }
          const language = got.language ?? codeLang(path, got.text);
          const defs = outlineMarks(language) ? definitionsIn({ language, text: got.text.replace(/\r\n?/g, '\n'), version: 1 }) : [];
          defIndex.files.set(key, { path, time, language, defs });
          if (performance.now() - yielded > 30) { await new Promise(r => setTimeout(r)); yielded = performance.now(); }
        }
        for (const key of [...defIndex.files.keys()]) if (!seen.has(key)) defIndex.files.delete(key);
      } while (defIndex.again && defIndex.root === root);
    } finally { defIndex.run = null; defStatus(); }
  })();
  return defIndex.run;
}

// In the bottom bar while the folder is being read (files done of all); hidden when it is done.
function defStatus(done, total) {
  const el = $('.mm-st-defs');
  el.hidden = total == null || !total;
  if (!el.hidden) el.textContent = `Reading definitions: ${done} of ${total} files`;
}

// The folder changed (a file written, added, removed): the index follows, a moment later.
let defRefreshTimer = 0;
{
  const before = events.changed;
  events.changed = async m => {
    await before(m);
    if ((m.tree || m.git) && defIndex.root) { clearTimeout(defRefreshTimer); defRefreshTimer = setTimeout(refreshDefinitions, 1000); }
  };
}

// Every definition of a name: the open documents (their text as in the editor, saved or not) and the files of the
// index that are not open. Ordered: the same qualifier as `target`'s first, then those without one, then others.
function findDefinitions(target, rules) {
  const key = nameKey(target.name, rules), qual = nameKey(target.qualifier, rules);
  const open = new Set(), found = [];
  for (const doc of docs) {
    if (doc.pdf || !outlineMarks(doc.language ?? 'markdown')) continue;
    if (doc.path) open.add(doc.path.toLowerCase());
    for (const d of definitionsIn(doc)) if (nameKey(d.name, rules) === key) found.push({ ...d, path: doc.path, doc });
  }
  for (const [path, file] of defIndex.files) {
    if (open.has(path)) continue;
    for (const d of file.defs) if (nameKey(d.name, rules) === key) found.push({ ...d, path: file.path });
  }
  const rank = d => !d.qualifier ? 1 : qual && nameKey(d.qualifier, rules) === qual ? 0 : 2;
  return found.sort((a, b) => rank(a) - rank(b) || (a.path ?? '').localeCompare(b.path ?? '') || a.line - b.line);
}

// ---------- Go to definition ----------
// `where`: 'other' (F12: the other pane), 'tab' (Alt+F12: this tab), 'newTab' (Ctrl+F12: a new tab beside this one).
async function goToDefinition(pane, where) {
  const tab = pane.active, cm = pane.cm;
  if (!tab || !cm) return;
  const rules = nameRules(tab.doc.language);
  const target = nameAtCursor(cm, rules);
  if (!target) return toast('No name at the cursor.', true);
  // The folder's index: read all of it the first time (said meanwhile); being brought up to date later, what it has
  // so far after a moment.
  const run = refreshDefinitions();
  if (!defIndex.files.size && defIndex.run) await run;   // the bottom bar says how far it is
  else await Promise.race([run, new Promise(r => setTimeout(r, 1500))]);
  const building = !!defIndex.run;
  const found = findDefinitions(target, rules);
  const shown = (target.qualifier ? target.qualifier + (rules.separator ?? '') : '') + target.name;
  if (!found.length) return toast(`No definition of ${shown} found${building ? ' (the folder is still being read)' : ''}.`, true);
  if (found.length === 1) return jumpToDefinition(pane, found[0], where);
  const at = cm.cursorCoords(null, 'window');
  openPopupMenu(found.map(d => ({
    label: `${d.path ? nameOf(d.path) : docName(d.doc) ?? 'Untitled'}:${d.line + 1}`, plain: true, key: d.text,
    title: d.path ?? '', run: () => jumpToDefinition(pane, d, where),
  })), at.left, at.bottom);
}

// To a definition: in this document a place to go back to (places.js). In another file: `where` 'other', in the other
// pane, this one staying as it is; 'tab', this tab follows it as a link does (a new tab beside it when this document
// has unsaved changes); 'newTab', a new tab beside this one. Back returns to the line it was asked on.
async function jumpToDefinition(pane, def, where) {
  const tab = pane.active, cm = pane.cm, here = cm.getCursor(), from = tab.doc, beside = where === 'other';
  let to;
  if (!beside && (def.doc ? def.doc === tab.doc : samePath(def.path, tab.doc.path))) to = tab;
  else if (beside) {
    const other = otherPane();
    to = def.doc && !def.path ? tabsOf(def.doc)[0] : await openFile(def.path, { pane: other });
    if (to && paneOf(to) !== other) await activate(paneOf(to), to);
  } else {
    if (tab.doc.path) remember(tab, tab.doc.path, true);
    const step = navHistory.back.at(-1);
    if (step?.tab === tab.id) step.cursor = { line: here.line, ch: here.ch };   // back: this line again (go, app.js)
    if (def.doc && !def.path) { to = tabsOf(def.doc)[0]; await activate(paneOf(to), to); }
    else if (where === 'newTab' || tab.doc.dirty) to = await openFile(def.path, { pane });
    else to = await navigate(tab, def.path) ? pane.active : null;   // this tab, or the one that has the file already
  }
  if (!to) return;
  const target = paneOf(to);
  if (to.mode !== 'edit') setPreviewLine(target, Math.max(0, def.line - 3));
  if (to.mode !== 'preview' && target.cm) {
    const pos = { line: def.line, ch: def.ch };
    // In this document a place to go back to (places.js); in another the way back is the step remembered above, not
    // where its cursor happened to be.
    asFound(target, () => target.cm.setCursor(pos), to.doc === from ? 'found' : 'quiet');
    revealFound(target.cm, pos);
  }
  focusPane(target);
}

// ---------- Find references (Shift+F12) ----------
// The name at the cursor (without its qualifier) searched for in the folder, whole word, in the Search panel; in the
// known file types only (no .bak copies and the like).
function findReferences(pane) {
  const cm = pane.cm, tab = pane.active;
  if (!cm || !tab) return;
  const rules = nameRules(tab.doc.language);
  const target = nameAtCursor(cm, rules);
  if (!target) return toast('No name at the cursor.', true);
  Object.assign(searchOptions, { word: true, regex: false, case: !rules.ignoreCase, known: true });
  toSearch({ kind: 'options', options: { ...searchOptions } });
  searchUi.input.value = target.name;
  searchUi.scope.value = 'folder';
  showDockPane('search');
  runSearch();
}

// The index started a moment after the window opened, so the first F12 does not wait for all of it.
setTimeout(() => { if (indexRoot()) refreshDefinitions(); }, 3000);
