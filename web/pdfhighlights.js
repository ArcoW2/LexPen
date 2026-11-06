'use strict';
// A PDF's highlights, with notes (docs/plans/38-PLAN-pdf-view.md 3.2b). A highlight is a part of one page's text:
// { id, page, from, to, text, note } (from / to in that page's text, as pdf-pane.js counts it). They are kept in one of
// three places, per PDF: in LexPen (its highlights store), next to the file (name.pdf.lph), or inside the PDF as its
// highlight annotations. The PDF's own highlight annotations (read by its frame) are always listed: `own`, with their
// id in the file; with the PDF's highlights kept inside it they are changed and removed as any, else they are the
// PDF's and stay as they are. Inside the PDF a change marks the tab as changed, and Save writes the PDF (pdf.js makes
// the bytes in the frame). Loaded after pdfview.js and highlights.js.

const pdfHl = { id: 0, saving: new Map(), saveId: 0 };
const pdfHlsOf = doc => doc.pdfHls ??= { loaded: false, place: 'lexpen', list: [], removed: [], changeable: true, ownRead: false };
const PDF_PLACES = { lexpen: 'in LexPen', beside: 'next to the file', pdf: 'inside the PDF' };

// Where they are kept, and LexPen's own (the store or the .lph), when the PDF is opened.
async function pdfHlLoad(doc) {
  const hls = pdfHlsOf(doc);
  if (hls.loaded) return;
  hls.loaded = true;
  const got = await host('highlightsGet', { path: doc.path }).catch(() => null);
  hls.place = doc.pdfPrefs?.highlights === 'pdf' ? 'pdf'
    : got?.beside ? 'beside' : got?.list?.length ? 'lexpen' : setting('highlightsStore') === 'beside' ? 'beside' : 'lexpen';
  for (const h of got?.list ?? []) if (h.page) hls.list.push({ ...h, id: ++pdfHl.id, own: false });
  pdfHlChanged(doc, false);
}

// The PDF's own highlight annotations, as its frame read them: they take the place of the ones read before.
function pdfHlAnnotations(doc, { list, changeable }) {
  const hls = pdfHlsOf(doc), removed = new Set(hls.removed.map(r => r.annotId)), changed = new Map(hls.list.filter(h => h.own && h.noteChanged).map(h => [h.annotId, h.note]));
  hls.list = hls.list.filter(h => !h.own);
  for (const a of list) if (!removed.has(a.annotId))
    hls.list.push({ ...a, id: ++pdfHl.id, own: true, ...(changed.has(a.annotId) ? { note: changed.get(a.annotId), noteChanged: true } : {}) });
  hls.changeable = changeable && !doc.pdfPrefs?.readOnly;
  hls.ownRead = true;
  pdfHlChanged(doc, false);
}

// May a highlight be changed (its note, removed): LexPen's always; the PDF's own only while its highlights are kept in it.
const pdfHlFixed = (doc, h) => h.own && pdfHlsOf(doc).place !== 'pdf';

// After a change: kept (`store`: written), drawn in every frame of the PDF, the Highlights pane told.
function pdfHlChanged(doc, store = true) {
  const hls = pdfHlsOf(doc);
  if (store) {
    if (hls.place === 'pdf') pdfHlDirty(doc);
    else {
      clearTimeout(hls.timer);
      hls.timer = setTimeout(() => pdfHlWrite(doc), 1000);
    }
  }
  for (const tab of tabsOf(doc)) { pdfHlSend(tab); pdfSyncBar(tab); }   // the bar's Highlights place too
  if (typeof tellHighlightsWindow === 'function') tellHighlightsWindow();
}

// LexPen's (not the PDF's own) into the store or next to the file.
function pdfHlWrite(doc) {
  const hls = pdfHlsOf(doc), list = hls.place === 'pdf' ? [] : hls.list.filter(h => !h.own)
    .map(h => ({ page: h.page, from: h.from, to: h.to, text: h.text ?? '', note: h.note ?? '', state: '' }));
  return host('highlightsSet', { path: doc.path, list, beside: hls.place === 'beside' }).catch(() => {});
}

// Kept inside the PDF: anything not yet in the file marks it as changed (Save writes it; closing asks).
function pdfHlDirty(doc) {
  const hls = pdfHlsOf(doc);
  doc.dirty = hls.place === 'pdf' && (hls.list.some(h => !h.own || h.noteChanged) || hls.removed.length > 0)
    || hls.removed.length > 0;
  refreshTabs();
  if (typeof updateChrome === 'function') updateChrome();
}

// The frame draws LexPen's (the PDF's own it draws itself), in the preview's highlight look.
function pdfHlSend(tab) {
  if (!tab.pdf?.frame?.isConnected) return;
  const pane = paneOf(tab) ?? panes[0], solid = atIntensity(colourCss(setting('previewHighlightColour'), 'highlight'), setting('previewHighlightIntensity'), pane.previewEl);
  const fill = solid.replace(/^rgb\((\d+), (\d+), (\d+)\)$/, 'rgb($1 $2 $3 / .45)');
  pdfSend(tab, { kind: 'highlights', fill, line: solid, underline: setting('previewHighlightStyle') === 'underline',
    list: pdfHlsOf(tab.doc).list.filter(h => !h.own).map(h => ({ id: h.id, page: h.page, from: h.from, to: h.to, note: h.note ?? '' })) });
}

// ---------- Making, notes, removing ----------
// Parts of pages' texts (a selection) highlighted; one touching a highlight of LexPen's on its page takes it in (their
// notes joined). `note`: the new one's.
function pdfHlAdd(doc, parts, note = '') {
  const hls = pdfHlsOf(doc);
  for (let { page, from, to, text } of parts) {
    const notes = [];
    for (const h of [...hls.list]) {
      if (h.own || h.page !== page || h.to < from || h.from > to) continue;
      if (h.from < from || h.to > to) {   // its text joins this one's (the selection's text covers only the selection)
        text = h.from < from ? (h.text ?? '').slice(0, from - h.from) + text : text;
        text = h.to > to ? text + (h.text ?? '').slice(to - h.from) : text;
      }
      from = Math.min(from, h.from);
      to = Math.max(to, h.to);
      if (h.note) notes.push(h.note);
      hls.list.splice(hls.list.indexOf(h), 1);
    }
    if (note) notes.push(note);
    hls.list.push({ id: ++pdfHl.id, page, from, to, text, note: notes.join('\n'), own: false });
  }
  pdfHlChanged(doc);
}

// The highlights at a page's offset, or touching parts of pages' texts.
const pdfHlAt = (doc, page, offset) => pdfHlsOf(doc).list.filter(h => h.page === page && h.from <= offset && offset <= h.to);
const pdfHlIn = (doc, parts) => pdfHlsOf(doc).list.filter(h => parts.some(p => p.page === h.page && h.from < p.to && h.to > p.from));

async function pdfHlRemove(doc, list) {
  const fixed = list.filter(h => pdfHlFixed(doc, h)), gone = list.filter(h => !pdfHlFixed(doc, h));
  if (fixed.length) toast(`${fixed.length === 1 ? 'That highlight is' : `${fixed.length} highlights are`} the PDF's own (keep the highlights inside the PDF to change them).`, true);
  if (!gone.length) return;
  const notes = gone.filter(h => h.note).length;
  if (notes && !await confirmBox(gone.length === 1 ? 'Remove the highlight and its note?' : `Remove ${gone.length} highlights, ${notes} with a note?`)) return;
  const hls = pdfHlsOf(doc);
  for (const h of gone) {
    hls.list.splice(hls.list.indexOf(h), 1);
    if (h.own) hls.removed.push({ annotId: h.annotId, popupRef: h.popupRef, page: h.page });
  }
  pdfHlChanged(doc);
}

// A note written or changed (on a highlight), or a new highlight with it (on parts of a selection).
async function pdfHlNote(doc, target, parts) {
  if (target && pdfHlFixed(doc, target)) return toast('That highlight is the PDF\'s own (keep the highlights inside the PDF to change it).', true);
  const note = await noteBox(target?.note ?? '', target ? target.text ?? '' : parts?.map(p => p.text).join(' ') ?? '');
  if (note === null) return;
  if (target) {
    target.note = note.trim();
    if (target.own) target.noteChanged = true;
    return pdfHlChanged(doc);
  }
  if (note.trim() && parts?.length) pdfHlAdd(doc, parts, note.trim());
}

// ---------- The actions on a PDF (highlights.js hands a PDF's over) ----------
const pdfSelection = tab => tab.pdf?.selection ?? [];
function pdfHlToggle(pane) {
  const tab = pane.active, parts = pdfSelection(tab);
  if (!parts.length) return toast('Select text in the PDF to highlight it.', true);
  pdfHlAdd(tab.doc, parts);
}
async function pdfHlRemoveSelected(pane) {
  const tab = pane.active, parts = pdfSelection(tab), hit = parts.length ? pdfHlIn(tab.doc, parts) : [];
  if (!hit.length) return toast('Select highlighted text in the PDF to remove its highlight.', true);
  await pdfHlRemove(tab.doc, hit);
}
async function pdfHlNoteSelected(pane) {
  const tab = pane.active, parts = pdfSelection(tab), hit = parts.length ? pdfHlIn(tab.doc, parts)[0] : null;
  if (!hit && !parts.length) return toast('Select text in the PDF (or a highlight) to write a note.', true);
  await pdfHlNote(tab.doc, hit, hit ? null : parts);
}
async function pdfHlClear(pane) {
  const doc = pane.active.doc, list = pdfHlsOf(doc).list.filter(h => !pdfHlFixed(doc, h));
  if (!list.length) return toast('No highlights to remove in this PDF.', true);
  const notes = list.filter(h => h.note).length;
  if (!await confirmBox(`Remove the ${list.length} highlight${list.length === 1 ? '' : 's'} in ${docName(doc)}${notes ? `, ${notes} with a note` : ''}?`)) return;
  const hls = pdfHlsOf(doc);
  for (const h of list) { hls.list.splice(hls.list.indexOf(h), 1); if (h.own) hls.removed.push({ annotId: h.annotId, popupRef: h.popupRef, page: h.page }); }
  pdfHlChanged(doc);
}
const pdfHlSorted = doc => [...pdfHlsOf(doc).list].sort((a, b) => a.page - b.page || a.from - b.from);
// Next / previous highlight: from the page shown.
function pdfHlGo(pane, dir) {
  const tab = pane.active, list = pdfHlSorted(tab.doc), page = tab.pdf?.state?.page ?? 1;
  if (!list.length) return toast('No highlights in this PDF.', true);
  const next = dir > 0 ? list.find(h => h.page > page) ?? list[0] : list.findLast(h => h.page < page) ?? list.at(-1);
  pdfSend(tab, { kind: 'showHighlight', page: next.page, from: next.from, to: next.to });
}

// ---------- Where they are kept ----------
// Moved to another place, all of them. Into the PDF or out of it asks first (the PDF changes: its highlights added or
// removed); Go ahead marks the tab as changed (Save writes it). Between LexPen and next to the file the PDF stays as it is.
async function pdfHlPlace(doc, place) {
  const hls = pdfHlsOf(doc), from = hls.place;
  if (place === from) return;
  if (place === 'pdf' && !hls.changeable) return toast(`${docName(doc)} cannot be changed (read-only or protected): its highlights stay in LexPen or next to it.`, true);
  if (place === 'pdf' || from === 'pdf') {
    const ownCount = hls.list.filter(h => h.own).length, mine = hls.list.length - ownCount;
    const q = place === 'pdf'
      ? `${docName(doc)} will be changed: ${mine ? `its ${mine} highlight${mine === 1 ? '' : 's'} will be added to the file` : 'its highlights will be kept in the file'} (when you save it).`
      : `${docName(doc)} will be changed: ${ownCount ? `its ${ownCount} highlight${ownCount === 1 ? '' : 's'} will be removed from the file` : 'its highlights will no longer be kept in the file'} (when you save it) and kept ${PDF_PLACES[place]}.`;
    if (!await confirmBox(q, 'Go ahead')) return;
  }
  if (from === 'pdf') {   // the PDF's own become LexPen's; the file loses them with Save
    for (const h of hls.list) if (h.own) {
      hls.removed.push({ annotId: h.annotId, popupRef: h.popupRef, page: h.page });
      Object.assign(h, { own: false, annotId: undefined, popupRef: undefined, noteChanged: false });
    }
  }
  hls.place = place;
  host('pdfLookSet', { path: doc.path, highlights: place === 'pdf' ? 'pdf' : 'store' }).catch(() => {});
  doc.pdfPrefs = { ...doc.pdfPrefs, highlights: place === 'pdf' ? 'pdf' : null };
  await pdfHlWrite(doc);   // LexPen's place: written now; inside the PDF: the store emptied
  pdfHlDirty(doc);
  pdfHlChanged(doc, false);
  toast(`The highlights of ${docName(doc)} are kept ${PDF_PLACES[place]}${doc.dirty ? '; save the PDF to change the file' : ''}.`, true);
}

// ---------- Save ----------
// The PDF written with its highlights (kept inside it): its frame makes the bytes (pdf.js), the host writes them, a
// .bak first when backups are on. The file changed on disk then: drawn again, its annotations read again.
async function pdfSave(doc) {
  const hls = pdfHlsOf(doc);
  if (!doc.dirty) return true;
  let tab = tabsOf(doc).find(t => t.pdf?.frame?.isConnected);
  if (!tab) {   // not shown: shown first (its frame makes the bytes)
    tab = tabsOf(doc)[0];
    if (!tab) return false;
    await activate(paneOf(tab), tab);
    for (let k = 0; k < 60 && !tab.pdf?.state; k++) await new Promise(r => setTimeout(r, 100));
  }
  const solid = atIntensity(colourCss(setting('previewHighlightColour'), 'highlight'), 100, document.body);
  const colour = (solid.match(/\d+/g) ?? [255, 230, 0]).slice(0, 3).map(Number);
  const id = ++pdfHl.saveId;
  const done = new Promise(resolve => pdfHl.saving.set(id, resolve));
  pdfSend(tab, { kind: 'save', id, colour,
    added: hls.place === 'pdf' ? hls.list.filter(h => !h.own).map(h => ({ page: h.page, from: h.from, to: h.to, note: h.note ?? '' })) : [],
    notes: hls.list.filter(h => h.own && h.noteChanged).map(h => ({ annotId: h.annotId, popupRef: h.popupRef, page: h.page, note: h.note ?? '' })),
    removed: hls.removed });
  const got = await Promise.race([done, new Promise(r => setTimeout(() => r({ error: 'no answer from the PDF' }), 60000))]);
  pdfHl.saving.delete(id);
  if (got.error) { toast(`${docName(doc)} could not be saved: ${got.error}`); return false; }
  try {
    await host('writePdf', { path: doc.path, data: pdfBase64(got.data), backup: !!setting('backup') });
  } catch (e) { toast(`${docName(doc)} could not be saved: ${e.message ?? e}`); return false; }
  // In the file now: LexPen's new ones come back as the PDF's own once it is read again (kept elsewhere, LexPen's stay).
  if (hls.place === 'pdf') hls.list = hls.list.filter(h => h.own);
  for (const h of hls.list) h.noteChanged = false;
  hls.removed = [];
  doc.dirty = false;
  refreshTabs();
  if (typeof updateChrome === 'function') updateChrome();
  toast(`${docName(doc)} saved with its highlights.`, true);
  return true;
}

function pdfBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- The Highlights pane (highlights.js tellHighlightsWindow) ----------
// A PDF's list: by page, its own ones marked (and, kept elsewhere, not to be changed).
function pdfHlPaneList(doc) {
  return pdfHlSorted(doc).map(h => ({ id: h.id, line: h.page - 1, page: h.page, text: h.text ?? '', note: h.note ?? '', state: '', was: null,
    from: h.page * 1e7 + h.from, to: h.page * 1e7 + h.to, own: !!h.own, fixed: pdfHlFixed(doc, h) }));
}

// The right-click on the PDF: its highlight items before the look's (pdfview.js pdfMenu).
function pdfHlMenuItems(tab, m) {
  const doc = tab.doc, parts = m.parts ?? [], hit = m.at ? pdfHlAt(doc, m.at.page, m.at.offset)[0] : parts.length ? pdfHlIn(doc, parts)[0] : null;
  const hls = pdfHlsOf(doc), items = [];
  if (parts.length) items.push({ label: '&Highlight', run: () => pdfHlAdd(doc, parts) },
    { label: 'Highlight with a &note...', run: () => pdfHlNote(doc, null, parts) });
  if (hit) items.push({ label: hit.note ? 'Change the n&ote...' : 'N&ote...', enabled: !pdfHlFixed(doc, hit), run: () => pdfHlNote(doc, hit) },
    { label: '&Remove highlight', enabled: !pdfHlFixed(doc, hit), run: () => pdfHlRemove(doc, [hit]) });
  if (items.length) items.push('-');
  items.push({ label: 'Highlights &kept', sub: Object.entries(PDF_PLACES).map(([place, label]) => ({
    label: label[0].toUpperCase() + label.slice(1), checked: hls.place === place, enabled: place !== 'pdf' || hls.changeable,
    run: () => pdfHlPlace(doc, place) })) }, '-');
  return items;
}
