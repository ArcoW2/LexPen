'use strict';
// Position back / forward (docs/plans/09-PLAN-position-history.md): every document keeps the places its cursor
// jumped from. A jump: the main cursor lands more than jumpLines lines away without an edit; a found item (find, the
// search in files) is always one. A place is a mark in the text, so it moves with the edits. Ctrl+Alt+- /
// Ctrl+Alt++ and the mouse buttons go through the places of the active tab's document; Ctrl + the mouse buttons go
// through the tabs (back / forward, app.js). Loaded before app.js.

const PLACES_MAX = 100;
const JUMP_RUN_MS = 500;   // jumps closer together than this (a held Page Down) leave one place

// The editor's watch: where the cursor was, and whether an edit or a found item moved it.
function setupPlaces(pane) {
  const cm = pane.cm;
  const note = () => { const s = cm.listSelections()[0]; pane.placeAt = { doc: cm.getDoc(), anchor: s.anchor, head: s.head }; };
  note();
  cm.on('swapDoc', note);
  // An edit moves no place; the flag lasts to the end of its operation (an edit in the other pane moves no cursor here).
  cm.on('change', () => { pane.placeEdited = true; setTimeout(() => { pane.placeEdited = false; }); });
  cm.on('cursorActivity', () => {
    const was = pane.placeAt, edited = pane.placeEdited, how = pane.placeHow;
    pane.placeEdited = false;
    note();
    const doc = pane.active?.doc;
    if (!doc?.cmDoc || !was || was.doc !== cm.getDoc() || edited || how === 'quiet' || pane.placeGoing) return;
    const now = pane.placeAt;
    if (how === 'found') return recordPlace(doc, was.head, true);
    // A selection that grows (the anchor stays) is no jump.
    if (now.anchor.line === was.anchor.line && now.anchor.ch === was.anchor.ch && (now.head.line !== now.anchor.line || now.head.ch !== now.anchor.ch)) return;
    if (Math.abs(now.head.line - was.head.line) > (setting('jumpLines') ?? 10)) recordPlace(doc, was.head, false);
  });
}

// A cursor move by `run` counts as a found item ('found': always a place) or as none at all ('quiet': the find
// field while typing, its origin already kept).
function asFound(pane, run, how = 'found') {
  pane.placeHow = how;
  try { return run(); } finally { pane.placeHow = null; }
}

function recordPlace(doc, pos, found) {
  const now = Date.now(), back = doc.placesBack ??= [];
  const run = !found && doc.placeTime && now - doc.placeTime < JUMP_RUN_MS;
  doc.placeTime = found ? 0 : now;
  clearPlaces(doc.placesForward);
  doc.placesForward = [];
  if (run) return;   // the place before the run is kept
  back.push(makePlace(doc.cmDoc, pos));
  if (back.length > PLACES_MAX) back.shift().mark.clear();
}

// A place: a mark over its line (cleared by the editor when the line is deleted) and the column; an empty line a
// bookmark (that one stays, at the edge of what was deleted).
function makePlace(cmDoc, pos) {
  const len = cmDoc.getLine(pos.line).length;
  const mark = len ? cmDoc.markText(CodeMirror.Pos(pos.line, 0), CodeMirror.Pos(pos.line, len)) : cmDoc.setBookmark(pos);
  return { mark, ch: pos.ch };
}
function placePos(cmDoc, place) {
  const at = place.mark.find();
  if (!at) return null;
  const line = (at.from ?? at).line;
  return CodeMirror.Pos(line, Math.min(place.ch, cmDoc.getLine(line).length));
}

function clearPlaces(list) { for (const place of list ?? []) place.mark.clear(); }

// The document is gone from this window: its places with it.
function dropPlaces(doc) {
  clearPlaces(doc.placesBack);
  clearPlaces(doc.placesForward);
  doc.placesBack = doc.placesForward = null;
}

// A link followed (the window's back / forward, app.js), when that is the window's next step: taken.
function linkStep(dir) {
  if (!(dir < 0 ? navHistory.back : navHistory.forward).at(-1)?.link) return false;
  commands[dir < 0 ? 'back' : 'forward']();
  return true;
}

// The preview's cursor jumped (previewcursor.js): where it was, as a found item's place. Its places are marks in the
// document's main Doc, so they need the editor's library; until it is loaded (in the background, warmEditor) none.
function recordPreviewPlace(doc, pos) {
  if (typeof CodeMirror === 'undefined' || doc.pdf) return;
  const cmDoc = materialize(doc), line = Math.min(pos.line, cmDoc.lastLine());
  recordPlace(doc, CodeMirror.Pos(line, Math.min(pos.ch, cmDoc.getLine(line).length)), true);
}

// One step back (dir -1) or forward (1) in the active tab's document, at the cursor in use: the editor's, or the
// preview's (the preview alone, or the part of a split last in use); past its places, the file a link came from (back)
// or went to (forward).
function stepPlace(dir) {
  const pane = panes[state.activePane], tab = pane?.active;
  if (!tab) return;
  if (tab.mode === 'preview' || tab.mode === 'split' && tab.focusPart === 'preview') return stepPreviewPlace(pane, dir);
  if (!pane.cm) return linkStep(dir) || toast('No positions here.', true);
  const doc = tab.doc, cm = pane.cm, here = cm.getCursor('head');
  const from = (dir < 0 ? doc.placesBack : doc.placesForward) ?? [];
  let to;
  while (from.length) {
    const place = from.pop(), pos = placePos(doc.cmDoc, place);
    place.mark.clear();
    if (pos && (pos.line !== here.line || pos.ch !== here.ch)) { to = pos; break; }   // its text deleted, or here: skipped
  }
  if (!to) return linkStep(dir) || flashEdge(cm, 0);   // virtual.js: both edges, no position to go to
  const other = dir < 0 ? (doc.placesForward ??= []) : (doc.placesBack ??= []);
  other.push(makePlace(doc.cmDoc, here));
  if (other.length > PLACES_MAX) other.shift().mark.clear();
  pane.placeGoing = true;
  try {
    cm.setCursor(to);
    cm.scrollIntoView(to, cm.getScrollInfo().clientHeight / 2);
  } finally { pane.placeGoing = false; }
  cm.focus();
}

// The same in the preview: its cursor goes to the place, and where it was becomes a place the other way.
function stepPreviewPlace(pane, dir) {
  const doc = pane.active.doc, here = ensurePreviewCursor(pane);
  const from = (dir < 0 ? doc.placesBack : doc.placesForward) ?? [];
  if (!doc.cmDoc || !here || !from.length) return linkStep(dir) || toast(dir < 0 ? 'No position to go back to.' : 'No position to go forward to.', true);
  let to;
  while (from.length) {
    const place = from.pop(), pos = placePos(doc.cmDoc, place);
    place.mark.clear();
    if (pos && (pos.line !== here.line || pos.ch !== here.ch)) { to = pos; break; }
  }
  if (!to) return linkStep(dir) || toast(dir < 0 ? 'No position to go back to.' : 'No position to go forward to.', true);
  const line = Math.min(here.line, doc.cmDoc.lastLine());
  const other = dir < 0 ? (doc.placesForward ??= []) : (doc.placesBack ??= []);
  other.push(makePlace(doc.cmDoc, CodeMirror.Pos(line, Math.min(here.ch, doc.cmDoc.getLine(line).length))));
  if (other.length > PLACES_MAX) other.shift().mark.clear();
  pane.placeGoing = true;
  try { previewCursorTo(pane, { line: to.line, ch: to.ch }); } finally { pane.placeGoing = false; }
}
