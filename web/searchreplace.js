'use strict';
// Replace in the Search panel (docs/plans/executed/PLAN-replace-in-files.md): in the selection, the current file, the
// open files or the files in the folder; per match (a row's Replace), per file (its head's Replace) and all (Replace
// all, Alt+A in the panel). Before Replace per file and all, the preview window (ReplacePreviewForm, replace.html) when
// the setting for the scope says so (replacePreview; replacePreviewFiles for Files in folder); Preview... shows it at any
// time. An open file is changed through its editor document: each replace is one undo step, the file stays unsaved.
// A file in the folder that is not open is read, changed and written: no undo and no copy (the preview is the check).
// Read-only files are skipped and said so; a file changed since the search is searched again first. Loaded after app.js.

// The replace row is in the Search pane's page (app.js searchPage): these stand for it here.
const replaceUi = {
  row: { get hidden() { return !searchPage.replace; }, set hidden(v) { searchPage.replace = !v; toSearch({ kind: 'replace', on: !v }); } },
  with: searchField('with'),
};
let searchScope = null;   // In selection: { doc, marks }, the parts marked while the results show

function showReplace(on) {
  replaceUi.row.hidden = !on;   // its page shows the row and its button on
}

// Ctrl+Shift+R: the panel with its replace row; the focus in Replace with when there is something to find.
function startReplace() {
  startSearch();
  showReplace(true);
  if (!searchUi.input.value) return;
  replaceUi.with.focus();
  replaceUi.with.select();
}

// ---------- In selection ----------
// The active editor's selections (one, several, a column block), marked on the document so they move with the text.
// A selection inside the scope there is (a result clicked) keeps that scope.
function takeSearchScope() {
  const pane = panes[state.activePane], cm = pane.cm, doc = pane.active?.doc;
  if (!cm || !doc || pane.el.dataset.mode === 'preview') return clearSearchScope();
  const ranges = cm.listSelections().map(r => [r.from(), r.to()]).filter(([a, b]) => CodeMirror.cmpPos(a, b) < 0);
  if (searchScope?.doc === doc) {
    const parts = scopeRanges(searchScope), at = ([a, b]) => [cm.indexFromPos(a), cm.indexFromPos(b)];
    if (parts.length && (!ranges.length || ranges.length === 1 && parts.some(([s, e]) => s <= at(ranges[0])[0] && at(ranges[0])[1] <= e)))
      return searchScope;
  }
  clearSearchScope();
  if (!ranges.length) return null;
  const root = materialize(doc);
  searchScope = { doc, marks: ranges.map(([a, b]) => root.markText(a, b,
    { className: 'mm-find-scope', inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false, shared: true })) };
  return searchScope;
}

function clearSearchScope() {
  for (const m of searchScope?.marks ?? []) m.clear();
  searchScope = null;
  return null;
}

// The scope's parts as [start, end] in its document's text, in order.
function scopeRanges(scope) {
  const cmDoc = scope.doc.cmDoc;
  return scope.marks.map(m => m.find()).filter(Boolean)
    .map(({ from, to }) => [cmDoc.indexFromPos(from), cmDoc.indexFromPos(to)]).sort((a, b) => a[0] - b[0]);
}

// ---------- Replacing ----------
const samePlace = (a, b) => a.line === b.line && a.col === b.col && a.endLine === b.endLine && a.endCol === b.endCol;

// What a match becomes: the replacement with its codes read (replacementText); with a regular expression, $1 and $& filled
// in. A line break gets the file's line end where the text is the file's own (not open).
function newText(old, eol) {
  const rep = replacementText(replaceUi.with.value, lastSearch.options.regex);
  const text = lastSearch.options.regex ? old.replace(new RegExp(lastSearch.regex.source, lastSearch.regex.flags.replace('g', '')), rep) : rep;
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}

// Per file of `groups`: its text now, searched again (so a change since the search counts), or why it is skipped.
// An open file through its editor document; another from disk. The group's matches become the ones found now.
async function prepareReplace(groups) {
  const jobs = [];
  let id = 0;
  for (const group of groups) {
    const doc = group.draft ? findDraft(group.draft) : findDoc(group.path);
    const job = { group, doc };
    jobs.push(job);
    const inSelection = lastSearch.scope === 'selection';
    if (!group.path && !group.draft) { job.skip = 'not a file'; continue; }
    if (inSelection && searchScope?.doc !== doc) { job.skip = 'the selection is gone (search again)'; continue; }
    if (doc) {
      job.skip = !doc.lock ? 'edited in another window' : doc.diskReadOnly ? 'read-only on disk'
        : tabsOf(doc).some(t => t.readOnly) ? 'a read-only tab' : null;
      if (job.skip) continue;
      await loadEditor();
      job.cmDoc = materialize(doc);
      job.text = job.cmDoc.getValue();
      job.eol = '\n';
    } else {
      try {
        const read = await host('read', { path: group.path });
        if (read.readOnly) { job.skip = 'read-only on disk'; continue; }
        job.text = read.text;
        job.encoding = read.encoding;
        job.eol = /\r\n/.test(read.text) ? '\r\n' : /\r/.test(read.text) ? '\r' : '\n';
      } catch (e) { job.skip = e.message; continue; }
    }
    const parts = inSelection ? scopeRanges(searchScope) : undefined;
    const found = searchText(job.text, lastSearch.regex, parts);
    const live = group.matches.filter(m => !m.done);
    job.changed = found.length !== live.length || found.some((m, i) => !samePlace(m, live[i]));
    // The found ones in the place of the live ones (in text order), the replaced ones kept.
    group.matches = [...group.matches.filter(m => m.done), ...found].sort((a, b) => a.line - b.line || a.col - b.col);
    job.matches = found.map(m => ({ ...m, id: id++, old: job.text.slice(m.s, m.e), new: newText(job.text.slice(m.s, m.e), job.eol) }));
  }
  for (const job of jobs) job.group.skip = job.skip;
  return jobs;
}

// The preview window (ReplacePreviewForm): the ids of the changes to make; null: cancelled.
function previewReplace(jobs, title) {
  const files = jobs.filter(j => !j.skip && j.matches.length).map(j => ({
    name: j.group.path ? nameOf(j.group.path) : j.doc?.draftName || j.group.draft,
    dir: j.group.path ? dirOf(j.group.path) : '',
    disk: !j.doc,
    note: j.doc ? 'open: one undo step' : 'not open: changed on disk, no undo',
    matches: j.matches.map(m => {
      const end = m.endLine === m.line ? m.endCol : m.text.length, from = Math.max(0, m.col - 40);
      return { id: m.id, line: m.line, before: (from ? '...' : '') + m.text.slice(from, m.col), old: m.old, new: m.new, after: m.text.slice(end, end + 160) };
    }),
  }));
  return host('confirmReplace', { changes: { title, files } });
}

// Makes the kept changes (all when `kept` is null): per file one undo step (open) or one write (not open). A file
// changed while the preview showed is left alone. Returns { done, files, skipped, docs }.
async function applyReplace(jobs, kept) {
  const result = { done: 0, files: 0, skipped: jobs.filter(j => j.skip).map(j => j.group), docs: new Set() };
  for (const job of jobs) {
    if (job.skip) continue;
    const doing = job.matches.filter(m => !kept || kept.includes(m.id));
    if (!doing.length) continue;
    if (job.cmDoc ? job.cmDoc.getValue() !== job.text : false) { result.skipped.push(job.group); job.group.skip = 'changed meanwhile'; continue; }
    let after;
    if (job.cmDoc) {
      job.cmDoc.changeGeneration(true);   // its own undo step: not joined to the edit before
      for (const m of [...doing].reverse())
        job.cmDoc.replaceRange(m.new, job.cmDoc.posFromIndex(m.s), job.cmDoc.posFromIndex(m.e), '*searchReplace');
      job.cmDoc.changeGeneration(true);   // nor to the next replace
      after = job.cmDoc.getValue();
      result.docs.add(job.doc);
    } else {
      let text = job.text;
      for (const m of [...doing].reverse()) text = text.slice(0, m.s) + m.new + text.slice(m.e);
      try { await host('write', { path: job.group.path, text, encoding: job.encoding, backup: false }); }
      catch (e) { job.group.skip = e.message; result.skipped.push(job.group); continue; }
      after = text;
    }
    // The replaced matches shown as replaced; the others move along with the text before them.
    for (const m of doing) {
      const shown = job.group.matches.find(g => !g.done && samePlace(g, m));
      if (shown) shown.done = { old: m.old, new: m.new };
    }
    placeLive(job, after, doing);
    result.done += doing.length;
    result.files++;
  }
  return result;
}

// The matches not replaced, at their place in the text after the replacements (their line and column).
function placeLive(job, text, doing) {
  const shift = s => doing.reduce((n, m) => m.e <= s ? n + m.new.length - (m.e - m.s) : n, 0);
  const moved = job.matches.filter(m => !doing.includes(m)).map(m => ({ ...m, s: m.s + shift(m.s), e: m.e + shift(m.s) }));
  const placed = moved.length ? searchText(text, /[^]+/g, moved.map(m => [m.s, m.e])) : [];
  for (const [i, m] of moved.entries()) {
    const shown = job.group.matches.find(g => !g.done && samePlace(g, m));
    if (shown && placed[i]) Object.assign(shown, { line: placed[i].line, col: placed[i].col, endLine: placed[i].endLine, endCol: placed[i].endCol, text: placed[i].text });
  }
}

// Replace in `groups` (all of them, or one file): the preview first when `preview` says so; then the results again.
async function replaceGroups(groups, preview, title) {
  if (!lastSearch || !groups.length) return toast('Nothing to replace: search first (Enter in the find field).', true);
  recordReplace(replaceUi.with.value);   // the history (history.js), shared with the find bar
  const jobs = await prepareReplace(groups);
  let kept = null;
  if (preview && jobs.some(j => !j.skip && j.matches.length)) {
    kept = await previewReplace(jobs, title);
    if (!kept) return drawSearchResults();
  }
  const r = await applyReplace(jobs, kept);
  drawSearchResults();
  const skipped = r.skipped.length ? `; skipped ${r.skipped.length} file${r.skipped.length === 1 ? '' : 's'} (${[...new Set(r.skipped.map(g => g.skip))].join(', ')})` : '';
  searchUi.status.textContent = `Replaced ${r.done} in ${r.files} file${r.files === 1 ? '' : 's'}${skipped}.`;
  syncTabsAfterReplace(r.docs);
}

// Open files changed: their tabs show it (the dot, the preview).
function syncTabsAfterReplace(changedDocs) {
  for (const doc of changedDocs) for (const tab of tabsOf(doc)) tab.stale = true;
  refreshTabs();
  showAll();
}

const previewFirst = () => setting(lastSearch?.scope === 'folder' ? 'replacePreviewFiles' : 'replacePreview');

function replaceAllResults() { return replaceGroups(searchGroups.filter(g => !g.skip), previewFirst(), 'Replace all'); }

function replaceFile(g) {
  const group = searchGroups[g];
  return group && replaceGroups([group], previewFirst(), 'Replace in ' + (group.path ? nameOf(group.path) : group.draft));
}

// One match: no preview, one undo step. Searched again first: gone or moved, the results say so.
async function replaceMatch(hit) {
  const group = searchGroups[hit.group];
  if (!group || !lastSearch) return;
  recordReplace(replaceUi.with.value);
  const jobs = await prepareReplace([group]), job = jobs[0];
  if (job.skip) { drawSearchResults(); return toast(`Skipped: ${job.skip}.`); }
  const m = job.matches.find(x => samePlace(x, hit));
  if (!m) { drawSearchResults(); return toast('That match is no longer there: the file changed since the search. The results are updated.'); }
  const r = await applyReplace(jobs, [m.id]);
  drawSearchResults();
  syncTabsAfterReplace(r.docs);
}

// ---------- The panel ----------
// Its buttons and keys (Replace, Replace all, Preview..., ?, Enter, Alt+A) are in the Search pane's page; their
// messages come to app.js fromSearch.
