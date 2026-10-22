'use strict';
// Line and character differences: the gutter's change and git markers (gutter.js) and the compare (compare.js, in a
// worker: diff.worker.js loads this file). No page globals: it runs in both.

// ---------- Line diff ----------
// Which lines of `b` differ from `a`: hunks { aFrom, aTo, bFrom, bTo } (line ranges, `to` not included).
// Myers' algorithm on what is left after the common start and end; past `maxEdits` (very different texts)
// the whole middle counts as one change.
function diffLines(a, b, maxEdits = 2000) {
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  if (!A.length && !B.length) return [];
  const ops = A.length && B.length ? editScript(A, B, maxEdits) : null;
  if (!ops) return [{ aFrom: start, aTo: endA, bFrom: start, bTo: endB }];
  return hunksOf(ops, start, start);
}

// Runs of deletions and insertions between equal items are the hunks; `ai`, `bi`: where A and B start.
function hunksOf(ops, ai, bi) {
  const hunks = [];
  let i = ai, j = bi, hunk = null;
  for (const op of ops) {
    if (op === '=') {
      if (hunk) hunks.push(hunk), hunk = null;
      i++; j++;
      continue;
    }
    hunk ??= { aFrom: i, aTo: i, bFrom: j, bTo: j };
    if (op === '-') hunk.aTo = ++i; else hunk.bTo = ++j;
  }
  if (hunk) hunks.push(hunk);
  return hunks;
}

// The shortest edit script from A to B as '=', '-' (a line of A goes), '+' (a line of B comes); null when
// it needs more than maxEdits edits.
function editScript(A, B, maxEdits) {
  const N = A.length, M = B.length, max = Math.min(N + M, maxEdits);
  const v = new Map([[1, 0]]), trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v.get(k - 1) < v.get(k + 1)) ? v.get(k + 1) : v.get(k - 1) + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      v.set(k, x);
      if (x >= N && y >= M) return backtrack(trace, N, M);
    }
  }
  return null;
}

function backtrack(trace, N, M) {
  const ops = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && v.get(k - 1) < v.get(k + 1)) ? k + 1 : k - 1;
    const prevX = v.get(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push('='); x--; y--; }
    ops.push(x === prevX ? '+' : '-');
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) { ops.push('='); x--; y--; }
  return ops.reverse();
}

// ---------- The compare ----------
// Two texts (as lines) compared for the compare view: hunks { aFrom, aTo, bFrom, bTo, ignorable, pairs }.
// `opts`: { whitespace: ignore its amount and the spaces at the ends of a line, an empty line against none;
// case: ignore case }; the lines are compared by a key, the text itself stays as it is. `ties`: [{ a, b }], lines
// that are each other's match (Align): the stretches between them are compared on their own. `pairs`: the lines a
// changed hunk has on both sides, line by line, with the characters that differ: { a: line, b: line, ac: [[from, to]],
// bc: [[from, to]] }. `ignorable`: a hunk that only differs by what the options ignore (kept, so both sides stay
// level, but not a difference).
function compareLines(a, b, opts = {}, ties = []) {
  const key = line => {
    let k = line;
    if (opts.whitespace) k = k.replace(/[ \t]+/g, ' ').trim();
    if (opts.case) k = k.toLowerCase();
    return k;
  };
  const ka = a.map(key), kb = b.map(key);
  // The ties in order, each after the one before on both sides (a tie that crosses another is left out).
  const sorted = [...ties].filter(t => t.a >= 0 && t.b >= 0 && t.a < a.length && t.b < b.length).sort((x, y) => x.a - y.a);
  const kept = [];
  for (const t of sorted) if (!kept.length || (t.a > kept[kept.length - 1].a && t.b > kept[kept.length - 1].b)) kept.push(t);
  const hunks = [];
  let ai = 0, bi = 0;
  for (const t of [...kept, { a: a.length, b: b.length, end: true }]) {
    hunks.push(...diffRange(ka, kb, ai, t.a, bi, t.b));
    if (t.end) break;
    if (ka[t.a] !== kb[t.b]) hunks.push({ aFrom: t.a, aTo: t.a + 1, bFrom: t.b, bTo: t.b + 1 });   // tied, yet different
    ai = t.a + 1;
    bi = t.b + 1;
  }
  const refined = hunks.flatMap(h => pairUp(h, ka, kb));
  for (const h of refined) {
    const na = h.aTo - h.aFrom, nb = h.bTo - h.bFrom;
    h.ignorable = !!opts.whitespace && [...ka.slice(h.aFrom, h.aTo), ...kb.slice(h.bFrom, h.bTo)].every(k => k === '');
    h.pairs = [];
    for (let i = 0; i < Math.min(na, nb); i++) {
      const [ac, bc] = charRanges(a[h.aFrom + i], b[h.bFrom + i], opts);
      h.pairs.push({ a: h.aFrom + i, b: h.bFrom + i, ac, bc });
    }
  }
  return refined;
}

// A changed hunk split by which lines resemble each other: a line that has a look-alike on the other side is a change
// of it, the others are removed or added. So "WHERE x" removed and "ORDER BY a" changed into "ORDER BY a, b" rather
// than WHERE changed into ORDER. The best pairing by a table of resemblances (lines in order on both sides);
// a large hunk stays as it is.
function pairUp(h, ka, kb) {
  const na = h.aTo - h.aFrom, nb = h.bTo - h.bFrom;
  if (!na || !nb || na * nb > 10000 || (na === 1 && nb === 1)) return [h];
  const sim = (x, y) => resemblance(ka[h.aFrom + x], kb[h.bFrom + y]);
  // score[i][j]: the best total over A[i..] and B[j..]; a pair counts when its resemblance is at least half.
  const score = Array.from({ length: na + 1 }, () => new Float64Array(nb + 1));
  for (let i = na - 1; i >= 0; i--) for (let j = nb - 1; j >= 0; j--) {
    const r = sim(i, j);
    score[i][j] = Math.max(score[i + 1][j], score[i][j + 1], r >= .5 ? r + score[i + 1][j + 1] : 0);
  }
  const out = [];
  let i = 0, j = 0, open = null;
  const gap = () => { open ??= { aFrom: h.aFrom + i, aTo: h.aFrom + i, bFrom: h.bFrom + j, bTo: h.bFrom + j }; };
  while (i < na || j < nb) {
    const r = i < na && j < nb ? sim(i, j) : 0;
    if (i < na && j < nb && r >= .5 && score[i][j] === r + score[i + 1][j + 1]) {
      if (open) out.push(open), open = null;
      out.push({ aFrom: h.aFrom + i, aTo: h.aFrom + i + 1, bFrom: h.bFrom + j, bTo: h.bFrom + j + 1 });
      i++; j++;
    } else if (i < na && (j >= nb || score[i][j] === score[i + 1][j])) { gap(); open.aTo = h.aFrom + ++i; }
    else { gap(); open.bTo = h.bFrom + ++j; }
  }
  if (open) out.push(open);
  return out;
}

// How much two lines look alike, 0 to 1: the share of their character pairs (bigrams) they have in common.
function resemblance(x, y) {
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = new Map();
  for (let k = 0; k < x.length - 1; k++) { const g = x.slice(k, k + 2); grams.set(g, (grams.get(g) ?? 0) + 1); }
  let common = 0;
  for (let k = 0; k < y.length - 1; k++) { const g = y.slice(k, k + 2), n = grams.get(g); if (n) { common++; grams.set(g, n - 1); } }
  return 2 * common / (x.length + y.length - 2);
}

// The hunks between A[a0, a1) and B[b0, b1), by key: Myers on a moderate difference; on a large one the lines that
// occur once on each side are matched first (patience) and the parts between them compared on their own.
function diffRange(ka, kb, a0, a1, b0, b1, depth = 0) {
  while (a0 < a1 && b0 < b1 && ka[a0] === kb[b0]) { a0++; b0++; }
  while (a1 > a0 && b1 > b0 && ka[a1 - 1] === kb[b1 - 1]) { a1--; b1--; }
  if (a0 === a1 && b0 === b1) return [];
  if (a0 === a1 || b0 === b1) return [{ aFrom: a0, aTo: a1, bFrom: b0, bTo: b1 }];
  const A = ka.slice(a0, a1), B = kb.slice(b0, b1);
  const ops = editScript(A, B, 1500);
  if (ops) return hunksOf(ops, a0, b0);
  const anchors = depth < 20 ? uniqueAnchors(A, B) : [];
  if (!anchors.length) return [{ aFrom: a0, aTo: a1, bFrom: b0, bTo: b1 }];
  const out = [];
  let pa = a0, pb = b0;
  for (const [i, j] of anchors) {
    out.push(...diffRange(ka, kb, pa, a0 + i, pb, b0 + j, depth + 1));
    pa = a0 + i + 1;
    pb = b0 + j + 1;
  }
  out.push(...diffRange(ka, kb, pa, a1, pb, b1, depth + 1));
  return out;
}

// Lines that occur exactly once in A and once in B, as [i, j]; the longest run in the same order on both sides.
function uniqueAnchors(A, B) {
  const count = (list) => { const m = new Map(); list.forEach((k, i) => { const e = m.get(k); if (e) e.n++; else m.set(k, { n: 1, i }); }); return m; };
  const ca = count(A), cb = count(B), pairs = [];
  for (const [k, e] of ca) { const f = cb.get(k); if (e.n === 1 && f?.n === 1 && k !== '') pairs.push([e.i, f.i]); }
  pairs.sort((x, y) => x[0] - y[0]);
  // The longest increasing run of j (patience sorting).
  const tails = [], prev = new Array(pairs.length);
  for (let p = 0; p < pairs.length; p++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pairs[tails[m]][1] < pairs[p][1]) lo = m + 1; else hi = m; }
    prev[p] = lo ? tails[lo - 1] : -1;
    tails[lo] = p;
  }
  const out = [];
  for (let p = tails.length ? tails[tails.length - 1] : -1; p >= 0; p = prev[p]) out.push(pairs[p]);
  return out.reverse();
}

// The characters that differ between two lines: [rangesInX, rangesInY], each [[from, to]]. The common start and end
// first, then Myers on the characters between (a short line pair; a long one: that middle as a whole). With the
// whitespace option a range of only spaces and tabs is no difference.
function charRanges(x, y, opts = {}) {
  const fx = opts.case ? x.toLowerCase() : x, fy = opts.case ? y.toLowerCase() : y;
  let s = 0, ex = fx.length, ey = fy.length;
  while (s < ex && s < ey && fx[s] === fy[s]) s++;
  while (ex > s && ey > s && fx[ex - 1] === fy[ey - 1]) { ex--; ey--; }
  let rx = [], ry = [];
  if (ex - s + ey - s > 0) {
    const ops = ex - s <= 400 && ey - s <= 400 && ex > s && ey > s ? editScript([...fx.slice(s, ex)], [...fy.slice(s, ey)], 200) : null;
    if (!ops) { if (ex > s) rx.push([s, ex]); if (ey > s) ry.push([s, ey]); }
    else {
      let i = s, j = s;
      const add = (list, at) => { const last = list[list.length - 1]; if (last && last[1] === at) last[1] = at + 1; else list.push([at, at + 1]); };
      for (const op of ops) {
        if (op === '=') { i++; j++; } else if (op === '-') add(rx, i++); else add(ry, j++);
      }
    }
  }
  if (opts.whitespace) {
    rx = rx.filter(([f, t]) => /\S/.test(x.slice(f, t)));
    ry = ry.filter(([f, t]) => /\S/.test(y.slice(f, t)));
  }
  return [rx, ry];
}
