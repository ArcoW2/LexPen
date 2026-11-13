'use strict';
// The Hex view (docs/plans/executed/PLAN-hex-view.md): a tab's bytes, per line the offset, the bytes in hex and the same
// bytes as characters (hexmodel.js), edited in either part and always overwriting; what changes the length is a choice
// (Insert bytes, Delete bytes, Paste in, Cut). A file LexPen does not know opens here only (doc.binary: its bytes read
// from the host, saved as they are, with an undo of its own). A text tab switched here shows its text as it would be
// saved, unsaved changes included; a change goes back into the text, decoded by the host in the file's encoding (a
// byte it cannot read becomes the stand-in, as on reading), as one undo step of the editor.

// ---------- The bytes ----------
// doc.hexData: { bytes, changed (a flag per byte: changed in Hex since saved or shown), undo, redo, saved (the undo
// step at the last save), key (a text tab: what the bytes were made from), busy (changes on their way into the text) }.
const hexB64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const hexFromB64 = s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const hexOfText = doc => !doc.binary && !doc.pdf;   // a text tab: its bytes made from the text
const hexTextKey = doc => `${doc.version}|${doc.eol}|${doc.encoding}`;

async function hexLoad(doc) {
  const d = doc.hexData;
  if (!hexOfText(doc)) {
    if (d) return d;
    const { data } = await host('hexRead', { path: doc.path });
    const bytes = hexFromB64(data);
    return doc.hexData = { bytes, changed: new Uint8Array(bytes.length), undo: [], redo: [], saved: null };
  }
  if (d && (d.busy || d.key === hexTextKey(doc))) return d;
  const key = hexTextKey(doc);
  const { data } = await host('hexEncode', { text: diskText(doc), encoding: doc.encoding, name: docName(doc) });
  const bytes = hexFromB64(data), old = doc.hexData;
  if (old?.busy) return old;   // changed in Hex meanwhile: those bytes stand
  // A change of our own come back through the text: the marks stay while the length does.
  const changed = old && old.bytes.length === bytes.length ? old.changed : new Uint8Array(bytes.length);
  return doc.hexData = { bytes, changed, key, busy: 0 };
}

// The bytes from `at` on: `count` of them become `put` (a Uint8Array).
function hexApply(d, at, count, put) {
  if (count === put.length) { d.bytes.set(put, at); d.changed.fill(1, at, at + put.length); return; }
  const join = (a, mid) => {
    const out = new Uint8Array(a.length - count + mid.length);
    out.set(a.subarray(0, at));
    out.set(mid, at);
    out.set(a.subarray(at + count), at + mid.length);
    return out;
  };
  d.bytes = join(d.bytes, put);
  d.changed = join(d.changed, new Uint8Array(put.length).fill(1));
}

// A change: one undo step (bytes: its own; a text tab: the editor's). False: not allowed (read-only).
function hexChange(tab, at, count, put) {
  const doc = tab.doc, d = doc.hexData;
  if (!editable(tab)) { toast('This tab is read-only.'); return false; }
  const before = d.bytes.slice(at, at + count);
  hexApply(d, at, count, put);
  if (hexOfText(doc)) hexToText(tab);
  else {
    d.undo.push({ at, before, after: put.slice() });
    d.redo.length = 0;
    hexDirty(doc);
  }
  hexRedraw(doc);
  return true;
}

// A text tab: the bytes read back as its text (the host, in its encoding), put in as one change of what differs. One
// at a time, in order; each takes the bytes as they are by then.
function hexToText(tab) {
  const doc = tab.doc, d = doc.hexData;
  d.busy++;
  doc.hexQueue = (doc.hexQueue ?? Promise.resolve()).then(async () => {
    const { text } = await host('hexDecode', { data: hexB64(d.bytes), encoding: doc.encoding });
    await loadEditor();
    const cmd = tabDoc(tab), old = cmd.getValue(), now = text.replace(/\r\n|\r/g, '\n');
    let s = 0, e = 0;
    while (s < old.length && s < now.length && old[s] === now[s]) s++;
    while (e < old.length - s && e < now.length - s && old[old.length - 1 - e] === now[now.length - 1 - e]) e++;
    if (s < old.length - e || s < now.length - e) cmd.replaceRange(now.slice(s, now.length - e), cmd.posFromIndex(s), cmd.posFromIndex(old.length - e), '+hex');
  }).catch(err => toast(err.message)).finally(() => {
    if (--d.busy) return;
    hexRedraw(doc);   // made again from the text: what a save will write
  });
}

function hexDirty(doc) {
  const d = doc.hexData, was = doc.dirty;
  doc.dirty = (d.undo.at(-1) ?? null) !== d.saved;
  if (doc.dirty !== was) { refreshTabs(); updateChrome(); }
}

async function hexUndo(tab, redo) {
  const doc = tab.doc, d = doc.hexData, st = hexState(tab);
  if (!editable(tab)) return;
  if (hexOfText(doc)) {   // the editor's undo: the text, then its bytes again
    await loadEditor();
    const cmd = tabDoc(tab);
    if (redo) cmd.redo(); else cmd.undo();
    return;
  }
  const from = redo ? d.redo : d.undo, to = redo ? d.undo : d.redo, step = from.pop();
  if (!step) return;
  const [now, then] = redo ? [step.before, step.after] : [step.after, step.before];
  hexApply(d, step.at, now.length, then);
  to.push(step);
  hexDirty(doc);
  hexMove(tab, Math.min(step.at, Math.max(0, d.bytes.length - 1)), false);
  hexRedraw(doc);
}

// Save (saveDoc): a file of bytes written as they are.
async function hexSave(doc, saveAs) {
  const d = doc.hexData;
  if (!d) return true;
  let path = doc.path;
  if (saveAs || !path) {
    path = await host('pickSave', { name: nameOf(doc.path), dir: dirOf(doc.path) });
    if (!path) return false;
  }
  if (!doc.lock && samePath(path, doc.path)) { toast('This file is being edited in another window; save it there.'); return false; }
  if (!await hostWrite('hexWrite', { path, data: hexB64(d.bytes), backup: setting('backup') })) return false;
  if (!samePath(path, doc.path)) {
    if (doc.path) host('unlock', { path: doc.path });
    doc.path = path;
    doc.lock = await host('lock', { path });
    unfresh(path);
  }
  d.saved = d.undo.at(-1) ?? null;
  d.changed.fill(0);
  doc.dirty = false;
  doc.disk = 'ok';
  syncWatchFiles();
  refreshTabs();
  updateChrome();
  hexRedraw(doc);
  saveSession();
  return true;
}

// Changed on disk with nothing unsaved (or Reload): read again.
async function hexReload(doc) {
  doc.hexData = null;
  doc.disk = 'ok';
  doc.dirty = false;
  await hexRedraw(doc);
}

// ---------- The view ----------
const hexPer = () => Math.max(1, Number(setting('hexBytesPerLine')) || 16);
const hexGroupOf = () => Math.max(0, Number(setting('hexGroup')) || 0);

// Per tab: the cursor byte, its digit (0 high, 1 low) in the hex part, the part with the caret, the selection's
// anchor (null: none), a byte with a digit removed ({ i, d: [high, low] }), the first line in view.
const hexState = tab => tab.hexAt ??= { cur: 0, digit: 0, part: 'hex', anchor: null, pend: null, top: 0 };

function hexEl(pane) {
  if (pane.hexEl) return pane.hexEl;
  const el = pane.hexEl = document.createElement('div');
  el.className = 'mm-hex';
  el.tabIndex = 0;
  el.innerHTML = '<div class="mm-hex-space"></div><div class="mm-hex-lines"></div>';
  pane.el.querySelector('.mm-content').append(el);
  el.addEventListener('scroll', () => hexDraw(pane));
  el.addEventListener('keydown', e => hexKey(pane, e));
  el.addEventListener('mousedown', e => hexMouseDown(pane, e));
  el.addEventListener('contextmenu', e => hexContext(pane, e));
  new ResizeObserver(() => hexDraw(pane)).observe(el);
  return el;
}

// showActive: the tab's bytes in its pane.
async function hexShow(pane) {
  const tab = pane.active, el = hexEl(pane);
  try { await hexLoad(tab.doc); }
  catch (err) {
    toast(err.message);
    if (!tab.doc.binary) { tab.hex = false; return showActive(pane); }   // a text tab: back to its text
    el.querySelector('.mm-hex-lines').replaceChildren();
    return;
  }
  if (pane.active !== tab) return;
  hexDraw(pane);
  if (pane.index === state.activePane && document.activeElement?.closest('.mm-pane') !== pane.el) el.focus({ preventScroll: true });
}

// Every pane showing this document in Hex, drawn again (its bytes loaded again where they are out of date).
async function hexRedraw(doc) {
  for (const pane of panes) if (pane.active?.doc === doc && pane.active.hex) {
    try { await hexLoad(doc); } catch (err) { toast(err.message); continue; }
    hexDraw(pane);
  }
  updateStatus();
}
const hexRedrawAll = () => { for (const pane of panes) if (pane.active?.hex) hexDraw(pane); };

// A text tab's text changed (onDocChange): its Hex follows, unless the change came from Hex.
function hexDocChanged(doc) {
  if (doc.hexData?.busy) return;
  clearTimeout(doc.hexTimer);
  doc.hexTimer = setTimeout(() => hexRedraw(doc), 150);
}

function hexLineHeight(el) {
  return parseFloat(getComputedStyle(el.querySelector('.mm-hex-lines')).lineHeight) || 18;
}

// The lines in view, as cells: a byte's two digits and its character carry data-i (and data-d: which digit).
function hexDraw(pane) {
  const tab = pane.active, el = pane.hexEl, d = tab?.doc.hexData;
  if (!tab?.hex || !el || !d) return;
  const per = hexPer(), group = hexGroupOf(), size = d.bytes.length, st = hexState(tab);
  const lh = hexLineHeight(el), lines = Math.max(1, Math.ceil(size / per));
  el.querySelector('.mm-hex-space').style.height = lines * lh + 'px';
  const first = Math.max(0, Math.floor(el.scrollTop / lh)), count = Math.ceil(el.clientHeight / lh) + 1;
  const digits = hexOffsetDigits(size), [s, e] = hexSel(st);
  let html = '';
  for (let line = first; line < Math.min(lines, first + count); line++) {
    const from = line * per;
    let hex = '', text = '';
    for (let k = 0; k < per; k++) {
      const i = from + k, gap = group > 0 && (k + 1) % group === 0 && k + 1 < per ? ' mm-hx-gap' : '';
      if (i >= size) { hex += `<span class="mm-hx-b mm-hx-none${gap}"></span>`; continue; }
      const b = d.bytes[i], ch = hexChar(b);
      const dg = st.pend?.i === i ? st.pend.d : hexDigits(b);
      let cls = gap;
      if (i >= s && i <= e && st.anchor !== null) cls += ' mm-hx-sel';
      if (d.changed[i]) cls += ' mm-hx-chg';
      const cur = i === st.cur;
      const hexCls = cls + (cur ? (st.part === 'hex' ? ' mm-hx-cur' : ' mm-hx-ul') : '');
      const textCls = cls + (cur ? (st.part === 'text' ? ' mm-hx-cur mm-hx-caret' : ' mm-hx-ul') : '') + (ch === null ? ' mm-hx-dot' : '');
      const digit = n => `<i data-i="${i}" data-d="${n}"${cur && st.part === 'hex' && st.digit === n ? ' class="mm-hx-caret"' : ''}>${dg[n] ?? ''}</i>`;
      hex += `<span class="mm-hx-b${hexCls}">${digit(0)}${digit(1)}</span>`;
      text += `<span class="mm-hx-c${textCls}" data-i="${i}">${ch === null ? HEX_DOT : escapeHtml(ch === ' ' ? '\u00A0' : ch)}</span>`;
    }
    html += `<div class="mm-hx-line"><span class="mm-hx-off">${from.toString(16).toUpperCase().padStart(digits, '0')}</span>` +
      `<span class="mm-hx-hex">${hex}</span><span class="mm-hx-text">${text}</span></div>`;
  }
  const box = el.querySelector('.mm-hex-lines');
  box.style.top = first * lh + 'px';
  box.innerHTML = html;
  if (!size) box.innerHTML = '<div class="mm-hx-empty">(empty: Insert bytes... in the right-click)</div>';
}

// The selection [first, last] (inclusive); with no anchor the cursor byte.
const hexSel = st => st.anchor === null ? [st.cur, st.cur] : [Math.min(st.anchor, st.cur), Math.max(st.anchor, st.cur)];

// The cursor to byte i (kept in the file and in view); extend: the selection grows from its anchor.
function hexMove(tab, i, extend, digit = 0) {
  const st = hexState(tab), size = tab.doc.hexData?.bytes.length ?? 0;
  const to = Math.max(0, Math.min(i, Math.max(0, size - 1)));
  if (extend) st.anchor ??= st.cur; else st.anchor = null;
  if (st.pend && st.pend.i !== to) st.pend = null;   // left the byte: its empty half is 0 (its value already)
  st.cur = to;
  st.digit = digit;
  const pane = paneOf(tab), el = pane?.hexEl;
  if (el && pane.active === tab) {
    const lh = hexLineHeight(el), y = Math.floor(to / hexPer()) * lh;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + lh > el.scrollTop + el.clientHeight) el.scrollTop = y + lh - el.clientHeight;
    hexDraw(pane);
  }
  updateStatus();
}

// The bottom bar: where the cursor is, and the selection.
function hexStatus(pane) {
  const tab = pane.active, d = tab?.doc.hexData;
  if (!d) return '';
  const st = hexState(tab), [s, e] = hexSel(st), size = d.bytes.length;
  const sel = st.anchor !== null ? ` (${e - s + 1} selected)` : '';
  return `Offset ${st.cur.toString(16).toUpperCase()}h (${st.cur})${sel} of ${size} bytes`;
}

// ---------- Keys ----------
function hexKey(pane, e) {
  const tab = pane.active, d = tab?.doc.hexData;
  if (!tab?.hex || !d || e.isComposing) return;
  const st = hexState(tab), per = hexPer(), size = d.bytes.length, ctrl = e.ctrlKey || e.metaKey;
  const done = () => { e.preventDefault(); e.stopPropagation(); };
  const page = Math.max(1, Math.floor(pane.hexEl.clientHeight / hexLineHeight(pane.hexEl)) - 1) * per;
  const move = (i, digit = 0) => { done(); hexMove(tab, i, e.shiftKey, digit); };
  const key = e.key;
  if (key === 'ArrowLeft' && !ctrl) {
    if (st.part === 'hex' && !e.shiftKey) return st.digit === 1 ? move(st.cur, 0) : move(st.cur - 1, st.cur > 0 ? 1 : 0);
    return move(st.cur - 1);
  }
  if (key === 'ArrowRight' && !ctrl) {
    if (st.part === 'hex' && !e.shiftKey) return st.digit === 0 ? move(st.cur, 1) : move(st.cur + 1, st.cur + 1 < size ? 0 : 1);
    return move(st.cur + 1);
  }
  if (key === 'ArrowUp' && !ctrl) return move(st.cur - per, st.digit);
  if (key === 'ArrowDown' && !ctrl) return move(Math.min(size - 1, st.cur + per), st.digit);
  if (key === 'PageUp') return move(st.cur - page, st.digit);
  if (key === 'PageDown') return move(Math.min(size - 1, st.cur + page), st.digit);
  if (key === 'Home') return move(ctrl ? 0 : st.cur - st.cur % per);
  if (key === 'End') return move(ctrl ? size - 1 : Math.min(size - 1, st.cur - st.cur % per + per - 1));
  if (key === 'Tab' && !ctrl) { done(); st.part = st.part === 'hex' ? 'text' : 'hex'; st.digit = 0; return hexDraw(pane); }
  if (key === 'Escape' && st.anchor !== null) { done(); st.anchor = null; hexDraw(pane); return updateStatus(); }
  if (key === 'Insert' && !ctrl && !e.shiftKey) return done();   // never inserting by typing
  if (ctrl && !e.altKey) {
    const k = key.toLowerCase();
    if (k === 'a') { done(); st.anchor = 0; st.cur = Math.max(0, size - 1); hexDraw(pane); return updateStatus(); }
    if (k === 'c') { done(); return hexCopy(tab); }
    if (k === 'v') { done(); return hexMenuAtCursor(pane, hexPasteItems(tab)); }
    if (k === 'x') { done(); return hexMenuAtCursor(pane, hexCutItems(tab)); }
    if (k === 'z') { done(); return hexUndo(tab, e.shiftKey); }
    if (k === 'y') { done(); return hexUndo(tab, true); }
    if (k === 'f') { done(); return hexFind(tab); }
    return;
  }
  if (key === 'F3') { done(); return hexFindNext(tab, e.shiftKey); }
  if (!size) return;
  if (key === 'Delete' || key === 'Backspace') { done(); return hexErase(tab, key === 'Backspace'); }
  if (key.length !== 1 || e.altKey && !e.getModifierState?.('AltGraph')) return;
  if (st.part === 'hex') {
    if (!isHexDigit(key)) return done();
    done();
    return hexTypeDigit(tab, key.toUpperCase());
  }
  done();
  const b = hexByteOf(key);
  if (b === null) return toast(`"${key}" has no byte of its own here: one byte, one character (Windows-1252).`, true);
  if (hexChange(tab, st.cur, 1, Uint8Array.of(b))) hexMove(tab, Math.min(size - 1, st.cur + 1), false);
}

// A hex digit typed at the caret: that digit of the byte; after the low one the caret goes on to the next byte.
function hexTypeDigit(tab, ch) {
  const st = hexState(tab), d = tab.doc.hexData, i = st.cur;
  const dg = st.pend?.i === i ? [...st.pend.d] : hexDigits(d.bytes[i]);
  dg[st.digit] = ch;
  if (!hexChange(tab, i, 1, Uint8Array.of(hexValue(dg)))) return;
  st.pend = dg.includes(null) ? { i, d: dg } : null;
  if (st.digit === 0) hexMove(tab, i, false, 1);
  else if (i + 1 < d.bytes.length) hexMove(tab, i + 1, false, 0);
  else hexMove(tab, i, false, 1);
}

// Delete / Backspace never remove a byte. Hex part: one digit (Delete the one at the caret, Backspace the one before
// it); the byte shows the other where it stands, and counts the gone one as 0. Text part: the byte becomes 00 (Delete
// at the cursor; Backspace the one before, the cursor going there).
function hexErase(tab, back) {
  const st = hexState(tab), d = tab.doc.hexData;
  if (st.part === 'text') {
    const i = back ? st.cur - 1 : st.cur;
    if (i < 0) return;
    if (hexChange(tab, i, 1, Uint8Array.of(0))) hexMove(tab, i, false);
    return;
  }
  let i = st.cur, digit = st.digit;
  if (back) {
    if (digit === 1) digit = 0;
    else if (i > 0) { i--; digit = 1; }
    else return;
  }
  const dg = st.pend?.i === i ? [...st.pend.d] : hexDigits(d.bytes[i]);
  dg[digit] = null;
  if (!hexChange(tab, i, 1, Uint8Array.of(hexValue(dg)))) return;
  hexMove(tab, i, false, digit);
  st.pend = { i, d: dg };
  hexDraw(paneOf(tab));
}

// ---------- The mouse ----------
function hexMouseDown(pane, e) {
  const tab = pane.active, cell = e.target.closest('[data-i]');
  if (!tab?.hex || !cell || e.button === 2) return;
  e.preventDefault();
  pane.hexEl.focus({ preventScroll: true });
  const st = hexState(tab), pick = c => {
    st.part = c.closest('.mm-hx-text') ? 'text' : 'hex';
    return [+c.dataset.i, +(c.dataset.d ?? 0)];
  };
  const [i, digit] = pick(cell);
  hexMove(tab, i, e.shiftKey, digit);
  const anchor = st.anchor ?? st.cur;
  const over = ev => {
    const c = ev.target.closest?.('[data-i]');
    if (!c || +c.dataset.i === st.cur) return;
    st.anchor = anchor;
    hexMove(tab, +c.dataset.i, true);
  };
  const up = () => { removeEventListener('mousemove', over); removeEventListener('mouseup', up); };
  addEventListener('mousemove', over);
  addEventListener('mouseup', up);
}

function hexContext(pane, e) {
  const tab = pane.active, cell = e.target.closest('[data-i]');
  if (!tab?.hex) return;
  e.preventDefault();
  const st = hexState(tab), [s, en] = hexSel(st);
  if (cell && (st.anchor === null || +cell.dataset.i < s || +cell.dataset.i > en)) hexMove(tab, +cell.dataset.i, false);
  const has = st.anchor !== null;
  openContextMenu([
    { label: 'Insert &bytes...', run: () => runAction('hex.insert') },
    { label: '&Fill with 00', enabled: has, run: () => runAction('hex.fill') },
    { label: '&Delete bytes', enabled: has, run: () => runAction('hex.delete') }, '-',
    { label: '&Copy', run: () => hexCopy(tab) },
    ...hexCutItems(tab), '-', ...hexPasteItems(tab)], e.clientX, e.clientY);
}

// A small menu at the caret (Ctrl+V, Ctrl+X: the choice of what changes the length).
function hexMenuAtCursor(pane, items) {
  const r = pane.hexEl.querySelector('.mm-hx-caret')?.getBoundingClientRect() ?? pane.hexEl.getBoundingClientRect();
  openContextMenu(items, r.left, r.bottom);
}

// ---------- Copy, cut, paste ----------
function hexSelBytes(tab) {
  const [s, e] = hexSel(hexState(tab));
  return tab.doc.hexData.bytes.slice(s, e + 1);
}

// A copy from Hex: its bytes kept with its text, so while the clipboard still holds that text it pastes as those
// bytes in either part (the text part's copy has a "." for a byte without a character).
let hexCopied = null;
function hexCopy(tab) {
  const bytes = hexSelBytes(tab);
  const text = hexState(tab).part === 'hex' ? [...bytes].map(b => hex2(b)).join(' ') : [...bytes].map(b => hexChar(b) ?? '.').join('');
  hexCopied = { text, bytes };
  putOnClipboard(text, false, clips.active);
}

const hexCutItems = tab => [
  { label: 'Cut and fill with &00', run: () => { hexCopy(tab); runAction('hex.fill'); } },
  { label: 'Cu&t (the bytes removed)', run: () => { hexCopy(tab); runAction('hex.delete'); } }];
const hexPasteItems = () => [
  { label: 'Paste &over (the same length)', run: () => runAction('hex.pasteOver') },
  { label: 'Paste &in (the bytes after it move along)', run: () => runAction('hex.pasteIn') }];

// The clipboard's bytes: a copy from Hex its own bytes, in either part; else in the hex part its text read as hex
// (hexParseBytes), in the text part its characters. Null: none (said).
async function hexClipBytes(tab) {
  const n = clips.active, text = n === 0 ? await host('clipboardText') : await host('clipGet', { n });
  if (!text) { toast('The clipboard is empty.', true); return null; }
  if (hexCopied?.text === text) return hexCopied.bytes.slice();
  if (hexState(tab).part === 'hex') {
    const bytes = hexParseBytes(text);
    if (!bytes) { toast('The clipboard holds no hex bytes (like 3F 00 A1, 0x3F, $3F, \\x3F): nothing pasted.', true); return null; }
    return Uint8Array.from(bytes);
  }
  const bytes = [...text.replace(/\r\n/g, '\n')].map(hexByteOf);
  const bad = bytes.indexOf(null);
  if (bad >= 0) { toast(`"${[...text.replace(/\r\n/g, '\n')][bad]}" has no byte of its own here (Windows-1252): nothing pasted.`, true); return null; }
  return Uint8Array.from(bytes);
}

async function hexPaste(tab, insert) {
  const bytes = await hexClipBytes(tab);
  if (!bytes) return;
  const st = hexState(tab), d = tab.doc.hexData, [at] = hexSel(st);
  if (insert) {
    if (hexChange(tab, at, 0, bytes)) hexMove(tab, at + bytes.length, false);
    return;
  }
  const fits = Math.min(bytes.length, d.bytes.length - at);
  if (fits <= 0) return toast('Paste over stops at the end of the file: nothing pasted.', true);
  if (!hexChange(tab, at, fits, bytes.subarray(0, fits))) return;
  if (fits < bytes.length) toast(`Paste over stops at the end of the file: ${bytes.length - fits} of ${bytes.length} bytes not pasted.`, true);
  hexMove(tab, at + fits, false);
}

// ---------- Find (Ctrl+F, F3) ----------
// What is found depends on the part the cursor is in: in the hex part bytes written as hex in any of the usual ways
// (hexParseBytes), or text in quotes; in the text part text, its letters in either case. F3 goes on in the same way.
let hexFindLast = null;   // { q, part }
async function hexFind(tab) {
  const part = hexState(tab).part === 'hex' ? 'hex' : 'text';
  const ask = part === 'hex' ? 'Find in Hex: bytes (3F 00 A1, 3F00A1, 0x3F, $3F, \\x3F, ...), or text in quotes ("PDF")' : 'Find in Hex: text';
  const v = await askName(ask, hexFindLast?.part === part ? hexFindLast.q : '', 'What to find');
  if (!v?.trim()) return;
  hexFindLast = { q: part === 'hex' ? v.trim() : v, part };
  hexFindNext(tab, false);
}
function hexFindNext(tab, back) {
  if (!hexFindLast) return hexFind(tab);
  const { q, part } = hexFindLast, quoted = part === 'hex' && /^"(.*)"?$/s.exec(q);
  const text = part === 'text' ? q : quoted ? quoted[1].replace(/"$/, '') : null;
  const needle = text !== null ? [...text].map(hexByteOf) : hexParseBytes(q) ?? [null];
  if (!needle.length || needle.includes(null))
    return toast(part === 'hex' ? 'Find in Hex: hex bytes (3F 00, 0x3F, $3F, ...), or text in quotes.' : 'Find in Hex: a character there has no byte of its own (Windows-1252).', true);
  // Text: an ASCII letter matches either case.
  const fold = b => text !== null && (b >= 0x41 && b <= 0x5A) ? b + 0x20 : b;
  const want = needle.map(fold);
  const bytes = tab.doc.hexData.bytes, st = hexState(tab), n = bytes.length, m = want.length;
  const at = i => { for (let k = 0; k < m; k++) if (fold(bytes[i + k]) !== want[k]) return false; return true; };
  for (let step = 1; step <= n; step++) {
    const i = ((back ? st.cur - step : st.cur + step) % n + n) % n;
    if (i + m <= n && at(i)) {
      hexMove(tab, i + m - 1, false);
      st.anchor = i;
      hexDraw(paneOf(tab));
      return updateStatus();
    }
  }
  toast(`Not found: ${q}`, true);
}

// ---------- Switching ----------
// Hex on or off for a tab; off: to `mode` when given (the Editor / Preview switches), else the mode it had.
async function hexSet(tab, on, mode) {
  if (!tab) return;
  if (!on && tab.doc.binary) return toast(`${docName(tab.doc)} is not text: it is shown as its bytes only.`, true);
  const pane = paneOf(tab);
  tab.hex = on;
  tab.hexChosen = on;   // chosen: it stays when the tab takes another file (app.js); not chosen, only a binary file is in Hex
  if (!on && mode && !tab.doc.pdf) tab.mode = mode;
  await showActive(pane);
  if (pane.active === tab) focusPane(pane);
  saveSession();
}

// What the tab is worked on as: Text, Column (column mode on) or Hex; one at a time.
// A file shown in its own way only (a PDF; bytes LexPen does not know): no text to work on, so no Text or Column mode.
const notText = doc => !!(doc?.pdf || doc?.binary);
const hexEditMode = () => activeTab()?.hex ? 'hex' : notText(activeTab()?.doc) ? null : column.on ? 'column' : 'text';
// In Hex not by choice: a file LexPen does not know (the ribbon marks the Hex button with a dotted line, not lit).
const hexAuto = () => { const t = activeTab(); return !!t?.hex && !t.hexChosen; };

// ---------- Actions (F1, the menus, the ribbon) ----------
const hexTab = () => { const t = activeTab(); return t?.hex && t.doc.hexData ? t : null; };
const hexEditable = () => { const t = hexTab(); return !!t && editable(t); };
const hexHasSel = () => { const t = hexTab(); return !!t && hexState(t).anchor !== null && editable(t); };

appAction('hex.toggle', { title: 'Hex mode', hint: 'The tab as its bytes: offset, hex and characters, edited in either part (again: back to the text)',
  group: 'view', checked: () => !!activeTab()?.hex, auto: () => hexAuto(), enabled: () => !!activeTab() && !activeTab().doc.binary,
  run: () => { const t = activeTab(); if (t) hexSet(t, !t.hex); } });
appAction('editMode.set', { title: 'Work on the tab as', hint: 'Text, Column (column mode) or Hex (its bytes): one at a time', group: 'edit',
  variants: [['text'], ['column'], ['hex']], variantTitles: { text: 'Text mode', column: 'Column mode', hex: 'Hex mode' },
  checked: ([m]) => !!activeTab() && hexEditMode() === m,
  auto: ([m]) => m === 'hex' && hexAuto(),
  enabled: ([m]) => !!activeTab() && (m === 'hex' || !notText(activeTab().doc)),
  run: async ([m]) => {
    const t = activeTab();
    if (!t) return;
    if (m === 'hex') return t.hex && t.hexChosen || hexSet(t, true);   // in Hex by itself (a binary file): now chosen
    if (t.hex) await hexSet(t, false);
    if (column.on !== (m === 'column')) setColumnMode(m === 'column');
  } });
appAction('hex.insert', { title: 'Insert bytes...', hint: 'Hex: that many zero bytes (00) at the cursor, the file longer; typing never inserts',
  group: 'edit', enabled: hexEditable, run: async () => {
    const t = hexTab();
    if (!t) return;
    const v = await askName('Insert bytes: how many zero bytes (00) at the cursor', '1', 'A number');
    const n = Number(v);
    if (v === null || !Number.isInteger(n) || n < 1) return v === null || toast('Insert bytes: a whole number, 1 or more.', true);
    const at = hexState(t).cur;
    if (hexChange(t, Math.min(at, t.doc.hexData.bytes.length), 0, new Uint8Array(n))) hexMove(t, at, false);
  } });
appAction('hex.fill', { title: 'Fill with 00', hint: 'Hex: the selected bytes become 00, the length the same', group: 'edit',
  enabled: hexHasSel, run: () => { const t = hexTab(); if (!t) return; const [s, e] = hexSel(hexState(t)); hexChange(t, s, e - s + 1, new Uint8Array(e - s + 1)); } });
appAction('hex.delete', { title: 'Delete bytes', hint: 'Hex: the selected bytes removed, the bytes after them moving up (the file shorter)', group: 'edit',
  enabled: hexHasSel, run: () => { const t = hexTab(); if (!t) return; const [s, e] = hexSel(hexState(t)); if (hexChange(t, s, e - s + 1, new Uint8Array(0))) hexMove(t, s, false); } });
appAction('hex.pasteOver', { title: 'Paste over', hint: 'Hex: the clipboard\'s bytes over the bytes from the cursor on, the length the same (stops at the end)', group: 'edit',
  enabled: hexEditable, run: () => { const t = hexTab(); if (t) return hexPaste(t, false); } });
appAction('hex.pasteIn', { title: 'Paste in', hint: 'Hex: the clipboard\'s bytes placed at the cursor, the bytes after it moving along (the file longer)', group: 'edit',
  enabled: hexEditable, run: () => { const t = hexTab(); if (t) return hexPaste(t, true); } });
