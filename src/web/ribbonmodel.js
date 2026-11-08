'use strict';
// The ribbon's rules without a page (ribbon.js draws it; the tests run this file under Jint): a group's items as its
// columns, and the key tips of one level. docs/plans/39-PLAN-ribbon.md.

const RB_STACK = 3;   // small buttons in one column at most

// ---------- The model: plain functions (the tests run them under Jint) ----------
// A group's items as its columns, in order: { kind: 'large', items: [{ item, i }] }, { kind: 'small', items: [up to
// three] }, { kind: 'divider', i }. A small item with stack goes under the small column before it while that has room;
// else, and without stack, it starts a column of its own.
function ribbonColumns(items) {
  const cols = [];
  (items ?? []).forEach((item, i) => {
    if (item === 'divider') return cols.push({ kind: 'divider', i });
    if (item?.size === 'large') return cols.push({ kind: 'large', items: [{ item, i }] });
    const last = cols.at(-1);
    if (item?.stack && last?.kind === 'small' && last.items.length < RB_STACK) last.items.push({ item, i });
    else cols.push({ kind: 'small', items: [{ item, i }] });
  });
  return cols;
}

// The key tips of one level (the tab names; a tab's buttons and corners): per name a letter no other one at that level
// has: its own tip first (when free), else the first letter of its words, else any letter of it, else two letters.
// Upper case; names without a usable letter get a number.
function ribbonTips(names, own = []) {
  const used = new Set(), tips = Array(names.length).fill('');
  const take = (i, t) => { if (!t || used.has(t)) return false; used.add(t); tips[i] = t; return true; };
  names.forEach((_, i) => { if (own[i]) take(i, String(own[i]).toUpperCase().slice(0, 2)); });
  const letters = name => [...String(name).toUpperCase()].filter(c => /[A-Z0-9]/.test(c));
  const starts = name => String(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(w => w[0]);
  names.forEach((name, i) => {
    if (tips[i]) return;
    if (starts(name).some(c => take(i, c))) return;
    if (letters(name).some(c => take(i, c))) return;
  });
  names.forEach((name, i) => {
    if (tips[i]) return;
    const l = letters(name), first = l[0] ?? 'X';
    for (const c of [...l.slice(1), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) if (take(i, first + c)) return;
  });
  return tips;
}
