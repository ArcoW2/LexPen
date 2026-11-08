'use strict';
// The preview of a Replace in the Search panel (replace.html; ReplacePreviewForm hosts it, modal to its window),
// docs/plans/executed/PLAN-replace-in-files.md, 3.4: every change per file, the line with the old text crossed out and
// the new text marked, each with a check box (all checked). A file's check box checks or unchecks its changes. Apply
// (Ctrl+Enter) sends the ids still checked; Cancel (Esc) or closing the window changes nothing.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in themesets.js) ----------
const pending = new Map();
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return;
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = $('.rp-list');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- Look: the app's theme (as themesets.js) ----------
function applyLook(look, values) {
  const root = document.documentElement;
  root.dataset.theme = look.mode;
  for (const [name, value] of Object.entries(look.app.vars)) root.style.setProperty(name, value);
  root.style.setProperty('--app-font', values.appFont ? `"${values.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.style.setProperty('--ui-scale', values.appSize ? values.appSize * 96 / 72 / 13 : 1);
}

// ---------- Drawing ----------
// changes: { title, files: [{ name, dir, note, disk, matches: [{ id, line, before, old, new, after }] }] }
function draw(changes) {
  $('.rp-title').textContent = changes.title;
  let html = '';
  for (const [f, file] of changes.files.entries()) {
    html += `<label class="rp-file"><input type="checkbox" data-file="${f}" checked>${escapeHtml(file.name)}` +
      `<span class="rp-dir">${escapeHtml(file.dir)}</span><span class="rp-note${file.disk ? ' rp-disk' : ''}">${escapeHtml(file.note)}</span></label>`;
    for (const m of file.matches)
      html += `<label class="rp-row"><input type="checkbox" data-id="${m.id}" data-in="${f}" checked><span class="rp-line">${m.line + 1}</span>` +
        `<span class="rp-text">${escapeHtml(m.before)}<del>${escapeHtml(m.old)}</del><ins>${escapeHtml(m.new)}</ins>${escapeHtml(m.after)}</span></label>`;
  }
  list.innerHTML = html;
  count();
}

// The count of checked changes; a file's box follows its changes (mixed: indeterminate).
function count() {
  const boxes = [...list.querySelectorAll('[data-id]')], on = boxes.filter(b => b.checked);
  for (const box of boxes) box.closest('.rp-row').classList.toggle('rp-off', !box.checked);
  for (const file of list.querySelectorAll('[data-file]')) {
    const mine = boxes.filter(b => b.dataset.in === file.dataset.file), n = mine.filter(b => b.checked).length;
    file.checked = n > 0;
    file.indeterminate = n > 0 && n < mine.length;
  }
  const files = new Set(on.map(b => b.dataset.in)).size;
  $('.rp-count').textContent = `${plural(on.length, 'change')} of ${boxes.length}, in ${plural(files, 'file')}`;
  $('.rp-apply').disabled = !on.length;
}

list.addEventListener('change', e => {
  const file = e.target.dataset.file;
  if (file !== undefined) for (const box of list.querySelectorAll(`[data-in="${file}"]`)) box.checked = e.target.checked;
  count();
});

const apply = () => host('apply', { kept: [...list.querySelectorAll('[data-id]')].filter(b => b.checked).map(b => +b.dataset.id) });
document.addEventListener('click', e => {
  const cmd = e.target.closest('button')?.dataset.cmd;
  if (cmd === 'all' || cmd === 'none') {
    for (const box of list.querySelectorAll('[data-id]')) box.checked = cmd === 'all';
    count();
  } else if (cmd === 'apply') apply();
  else if (cmd === 'cancel') host('cancel');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); host('cancel'); }
  else if (e.key === 'Enter' && e.ctrlKey && !$('.rp-apply').disabled) { e.preventDefault(); apply(); }
});

// ---------- Start ----------
(async () => {
  const init = await host('init');
  applyLook(init.look, init.settings ?? {});
  draw(init.changes);
  $('.rp-apply').focus();
})();
