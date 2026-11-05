'use strict';
// The Columns pane, the window's side (docs/plans/executed/PLAN-csv-columns.md 3.2): a page of its own (columns.html) that
// sets how the active document is read as CSV and shown in the column view. Docked or floating (View > Panels), hidden
// at first. It gets the document's definition and the columns found with it; what is set there stays in the pane until
// Apply (csvApply, csvview.js). A definition being set is sent here to be tried on the text (`probe`): the columns
// found with it come back, with a sample value each. Loaded after csvview.js and app.js; registered with the others
// (registerDockPanes).

let colsChannel = null;
const colsPane = { timer: 0, doc: null };

const colsDoc = () => panes[state.activePane]?.active?.doc ?? null;
const colsText = doc => { const t = docText(doc); return t.includes('\r') ? t.replace(/\r\n?/g, '\n') : t; };

// The columns a definition finds in the text: per column its name in the file, a sample value, how many values do not
// fit its type (all rows: `full`; else the first 64 KB), and the first row that does not; the lines before the data.
function colsFound(text, def, full) {
  const read = csvRead(full ? text : text.slice(0, 64 * 1024), def);
  const columns = Array.from({ length: Math.max(read.columns, def.columns.length) }, (_, c) => {
    const col = def.columns[c];
    let bad = 0, firstBad = 0, sample = '';
    read.rows.forEach((r, i) => {
      const v = r.fields[c]?.text ?? '';
      if (!sample && v.trim()) sample = v;
      if (col && !csvShow(v, col).ok) { if (!bad) firstBad = i + 1; bad++; }
    });
    return { name: read.names?.[c] ?? '', sample: sample.slice(0, 200), bad, firstBad };
  });
  return { columns, pre: read.pre.map(p => p.text.slice(0, 200)), rows: read.rows.length, partial: !full && text.length > 64 * 1024 };
}

function colsState() {
  const doc = colsDoc(), csv = doc?.language === 'csv';
  colsPane.doc = doc;
  if (!doc || !csv || !doc.csvDef) return { kind: 'columns', name: doc ? docName(doc) : null, csv, def: null };
  return { kind: 'columns', name: docName(doc), csv, path: doc.path ?? null, beside: doc.csvBeside ?? null,
    def: doc.csvDef, found: colsFound(colsText(doc), doc.csvDef, true) };
}

// What it shows, again (the active document changed, its definition was applied): not at every key at once.
function tellColumnsPane() {
  if (!colsChannel || (!colsChannel.frame && !colsChannel.floating)) return;
  clearTimeout(colsPane.timer);
  colsPane.timer = setTimeout(() => {
    const doc = colsDoc();
    // A document read as CSV for the first time: its definition first (csvview.js).
    if (doc?.language === 'csv' && !doc.csvDef) return void csvLoad(doc, docText(doc)).then(() => colsChannel.send(colsState()));
    colsChannel.send(colsState());
  }, 200);
}

function fromColumnsPane(m) {
  const doc = colsDoc();
  if (m.kind === 'escape') return events.toolEscape();
  if (m.kind === 'readAsCsv') return runAction('csv.toggle');
  if (m.kind === 'info') return showColumnInfo(doc);   // csvview.js
  if (!doc || doc.language !== 'csv') return;
  if (m.kind === 'probe') {   // a definition being set: fitted to the text (new columns detected), and what it finds
    const text = colsText(doc), def = csvFit(m.def, text);
    return colsChannel.send({ kind: 'probe', def, found: colsFound(text, def, false) });
  }
  if (m.kind === 'detect') {
    const text = colsText(doc), def = csvDetect(text);
    return colsChannel.send({ kind: 'probe', def, found: colsFound(text, def, false), detected: true });
  }
  if (m.kind === 'deleteBeside') return doc.path && csvDeleteBeside(doc.path);   // Keep in LexPen instead
  if (m.kind === 'apply' || m.kind === 'saveBeside') {
    csvApply(doc, m.def);
    if (m.kind === 'saveBeside' && !doc.csvBeside) csvSaveBeside(doc).then(tellColumnsPane);
    tellColumnsPane();
  }
}

// `column`: the one to show (Column settings... in the column view's right-click).
function openColumnsPane(column) {
  if (dockModel().state.cols === 'floating') colsChannel.float();
  else showDockPane('cols');
  tellColumnsPane();
  if (column !== undefined) setTimeout(() => colsChannel.send({ kind: 'showColumn', column }), 300);
}

function registerColumnsPane() {
  const view = Object.assign(document.createElement('div'), { className: 'mm-tool-view' });
  $('.mm-dock-hold').append(view);
  colsChannel = paneChannel({ id: 'cols', page: 'columns.html', title: 'Columns', view: () => view,
    state: () => new Map([['look', paneLook()], ['title', { kind: 'title', text: 'Columns' }], ['columns', colsState()]]),
    receive: fromColumnsPane,
    onFloat: () => setDockFloating('cols', true),
    onDock: () => { if (colsPane.back) { colsPane.back = false; setDockFloating('cols', false); } } });
  registerDockPane('cols', { title: 'Columns', view, home: 'right', startHidden: true,
    focus: () => colsChannel.focus(),
    leave: m => { if (m.state.cols === 'floating') colsChannel.back(); m.state.cols = 'hidden'; },
    sync: () => { if (dockShown(dockModel(), 'cols') && !colsChannel.frame) colsChannel.send(colsState()); },
    channel: { get floating() { return colsChannel.floating; }, float: opts => colsChannel.float(opts),
      back: () => { colsPane.back = true; colsChannel.back(); } } });
}

appAction('csv.columns', { title: 'Columns...', hint: 'How the document is read as CSV and shown in the column view: delimiter, quotes, header, and per column its type and format', group: 'view',
  run: () => openColumnsPane() });

// Read as CSV: any document in the column view, or back to the language it had.
appAction('csv.toggle', { title: 'Read as CSV', hint: 'The document as columns in the preview (its text stays as it is); again: back to its own language', group: 'view',
  checked: () => colsDoc()?.language === 'csv',
  run: async () => {
    const doc = colsDoc();
    if (!doc) return;
    if (doc.language === 'csv') await setLanguage(doc, doc.csvWas ?? 'plaintext');   // languages.js
    else {
      doc.csvWas = doc.language ?? 'markdown';
      await setLanguage(doc, 'csv');
      if (panes[state.activePane].active?.mode === 'edit') await setMode('split');   // the columns in view
    }
    tellColumnsPane();
  } });

// Save definition next to the file: name.csv-metadata.json, the CSVW file other tools read too.
appAction('csv.saveBeside', { title: 'Save definition next to the file', hint: 'The column definition as name.csv-metadata.json beside the file (CSV on the Web); from then on Apply writes there too', group: 'view',
  enabled: () => colsDoc()?.language === 'csv' && !!colsDoc()?.path,
  run: () => csvSaveBeside(colsDoc()).then(tellColumnsPane) });
