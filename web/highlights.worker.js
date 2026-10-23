'use strict';
// Placing highlights in a file that changed since they were written (docs/plans/executed/PLAN-highlights.md, 3.6), in the
// background: { id, text, list, unchanged } in, { id, list, counts } out. Each highlight { from, to, text, before,
// after, note, state, was } comes back placed in `text` with its own text and the text around it as they are now:
// 1. unchanged file and its text still at its place: there;
// 2. its text elsewhere: the occurrence whose surroundings match best, then the nearest to the old place;
// 3. its text changed a little: the most similar passage near the old place, found by the text around it: there,
//    state "adjusted" (and `was`, the text it was, kept until confirmed);
// 4. else "detached": kept, not placed (from / to null).

const AROUND = 40;          // characters of text kept before and after a highlight
const SIMILAR = 0.55;       // how alike (bigram Dice) a changed passage must be
const MAX_HITS = 2000;      // occurrences looked at, at most

self.onmessage = ({ data }) => {
  const { id, text, list, unchanged } = data;
  const starts = lineStarts(text);
  const offset = p => p ? Math.min(text.length, (starts[p[0]] ?? text.length) + p[1]) : 0;
  const position = o => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= o) lo = mid; else hi = mid - 1; } return [lo, o - starts[lo]]; };
  const counts = { moved: 0, adjusted: 0, detached: 0 };
  const out = list.map(h => {
    const was = { from: offset(h.from), to: offset(h.to) };
    const placed = (from, to, state) => ({
      ...h, from: position(from), to: position(to), text: text.slice(from, to),
      before: text.slice(Math.max(0, from - AROUND), from), after: text.slice(to, to + AROUND),
      state, was: state === 'adjusted' ? (h.state === 'adjusted' && h.was != null ? h.was : h.text) : (h.state === 'adjusted' ? h.was : null),
    });
    if (h.state === 'detached' && !h.text) return { ...h };
    // 1. Where it was.
    if (h.from && text.slice(was.from, was.to) === h.text && (unchanged || matchesAround(text, was.from, was.to, h)))
      return placed(was.from, was.to, h.state === 'adjusted' ? 'adjusted' : '');
    // 2. Its text elsewhere.
    const hits = occurrences(text, h.text);
    if (hits.length) {
      let best = hits[0], score = -1;
      for (const at of hits) {
        const s = around(text, at, at + h.text.length, h) * 1e6 - Math.abs(at - was.from) / 1e6;
        if (s > score) { score = s; best = at; }
      }
      counts.moved += best !== was.from ? 1 : 0;
      return placed(best, best + h.text.length, h.state === 'adjusted' ? 'adjusted' : '');
    }
    // 3. Changed a little: between the text before and the text after it, near the old place.
    const near = similarNear(text, h, was.from);
    if (near) { counts.adjusted++; return placed(near.from, near.to, 'adjusted'); }
    // 4. Gone.
    counts.detached++;
    return { ...h, from: null, to: null, state: 'detached' };
  });
  self.postMessage({ id, list: out, counts });
};

function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function occurrences(text, part) {
  const hits = [];
  if (!part) return hits;
  for (let at = text.indexOf(part); at >= 0 && hits.length < MAX_HITS; at = text.indexOf(part, at + 1)) hits.push(at);
  return hits;
}

// How much of the text around a place is as it was: the characters before it that match (from the place back) plus
// those after it (from the place on).
function around(text, from, to, h) {
  let n = 0;
  const before = h.before ?? '', after = h.after ?? '';
  for (let i = 1; i <= before.length && from - i >= 0 && text[from - i] === before[before.length - i]; i++) n++;
  for (let i = 0; i < after.length && to + i < text.length && text[to + i] === after[i]; i++) n++;
  return n;
}
const matchesAround = (text, from, to, h) => around(text, from, to, h) >= Math.min(8, (h.before ?? '').length + (h.after ?? '').length);

// A passage like the highlight's text near its old place, framed by (part of) the text that was around it.
function similarNear(text, h, at) {
  const len = h.text.length, reach = Math.max(4000, len * 20);
  const lo = Math.max(0, at - reach), hi = Math.min(text.length, at + len + reach);
  const window = text.slice(lo, hi);
  const before = (h.before ?? '').slice(-16), after = (h.after ?? '').slice(0, 16);
  const candidates = [];
  // Both the text before and the text after found: the passage between them.
  if (before.length >= 4 && after.length >= 4)
    for (const b of occurrences(window, before)) {
      const start = b + before.length;
      const e = window.indexOf(after, start);
      if (e >= 0 && e - start <= len * 3 + 20) candidates.push([start, e]);
    }
  // Also a passage of about the same length right after the text before, or right before the text after (lines added
  // between the highlight and its old surroundings); the most similar of all of them wins.
  if (before.length >= 4)
    for (const b of occurrences(window, before)) candidates.push([b + before.length, Math.min(window.length, b + before.length + len)]);
  if (after.length >= 4)
    for (const e of occurrences(window, after)) candidates.push([Math.max(0, e - len), e]);
  let best = null, score = SIMILAR;
  for (const [s, e] of candidates) {
    const sim = dice(window.slice(s, e), h.text);
    if (sim >= score) { score = sim; best = { from: lo + s, to: lo + e }; }
  }
  return best;
}

// How alike two texts are: shared character pairs (Dice), 0 to 1; case and runs of spaces do not count (a word in
// capitals, a line wrapped again is the same passage).
function dice(a, b) {
  a = a.toLowerCase().replace(/\s+/g, ' ');
  b = b.toLowerCase().replace(/\s+/g, ' ');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = new Map();
  for (let i = 0; i < a.length - 1; i++) { const p = a.substr(i, 2); pairs.set(p, (pairs.get(p) ?? 0) + 1); }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) { const p = b.substr(i, 2), n = pairs.get(p); if (n) { shared++; pairs.set(p, n - 1); } }
  return 2 * shared / (a.length + b.length - 2);
}
