'use strict';
// Matching brackets (docs/plans/02-PLAN-brackets.md): the pair or word set around the cursor highlighted, the text
// between a pair selected, closing signs added while typing. The pairs are the formatter's (reformat.js): a pack's
// groups (( ) [ ] { }) and blocks (begin ... end, if ... else ... end if), read as Format reads them; a pack without
// them has ( ) [ ] { }. Only the language that holds the cursor counts: a part of another language in between is
// skipped as a comment is, and inside a part the scan stops at its ends.
// Loaded together with the editor (see loadEditor).

const BRACKET_WINDOW = 2000;   // lines read above and below the cursor; past them: no highlight rather than a wrong one
const BRACKET_SIGNS = [['(', ')'], ['[', ']'], ['{', '}']];

// The lines the matcher reads: the cursor's language, at most BRACKET_WINDOW lines each way; inside a part of
// another language only that part. `cutTop` / `cutBottom`: the window ended before the text did.
function bracketScope(cm, line) {
  const doc = panes.find(p => p.cm === cm)?.active?.doc;
  if (!doc) return null;
  const fileLang = languageOf(doc), langAt = l => lineLanguage(cm, l) ?? fileLang, lang = langAt(line);
  const inner = lang !== fileLang, last = cm.lastLine();
  let from = line, to = line;
  while (from > 0 && line - from < BRACKET_WINDOW && (!inner || langAt(from - 1) === lang)) from--;
  while (to < last && to - line < BRACKET_WINDOW && (!inner || langAt(to + 1) === lang)) to++;
  const cutTop = from > 0 && (!inner || langAt(from - 1) === lang), cutBottom = to < last && (!inner || langAt(to + 1) === lang);
  return { lang, from, to, langAt, cutTop, cutBottom };
}

// What is in the scope: `sets` (a pair or a word set: its parts as [start, end] offsets, `words` when a block),
// `bad` (an opener without its closer, a closer without its opener), `spans` (strings and comments: their start
// and end signs; a line comment has none). Offsets count in the scope's text, `starts` holds each line's offset.
// Kept per document until it changes (or the cursor leaves the middle of a long text's window).
function bracketAnalysis(cm, line) {
  const sc = bracketScope(cm, line);
  if (!sc) return null;
  const doc = cm.getDoc(), gen = cm.changeGeneration(), c = doc.mmBrackets;
  const half = BRACKET_WINDOW / 2;
  if (c && c.gen === gen && c.lang === sc.lang && line >= c.from && line <= c.to
      && (c.from === sc.from || (c.from < sc.from && line - c.from >= half))
      && (c.to === sc.to || (c.to > sc.to && c.to - line >= half))) return c;
  const texts = [], starts = [];
  let off = 0;
  for (let l = sc.from; l <= sc.to; l++) {
    const t = sc.langAt(l) === sc.lang ? cm.getLine(l) : '\u0000' + l;   // another language: a placeholder line
    starts.push(off); texts.push(t); off += t.length + 1;
  }
  const cfg = rfConfig(sc.lang);
  const found = cfg && (cfg.groups?.length || cfg.blocks) && !cfg.markup ? formatPairs(texts.join('\n'), cfg, sc) : signPairs(cm, sc, starts);
  return doc.mmBrackets = { gen, lang: sc.lang, from: sc.from, to: sc.to, starts, texts, ...found };
}

// By the formatter: its tokens (strings and comments known) and its frames (each group and block with its opener,
// middles and closer).
function formatPairs(text, cfg, sc) {
  const c = { ...cfg, indent: 2 };
  const toks = rfTokenize(text, c);
  let o = 0;
  for (const t of toks) { t.at = o; o += t.t.length; }
  const lines = rfLines(toks), sim = rfSimulate(lines, c);
  const ext = (a, b) => [a.at, (b ?? a).at + (b ?? a).t.length];
  const sets = [], bad = [], spans = [];
  for (const f of sim.frames) {
    if (!['group', 'block', 'single'].includes(f.kind) || f.opener?.at === undefined) continue;
    if (!f.closer) {
      const open = sim.open.includes(f) && (f.kind === 'group' || f.closes !== false);
      if (open && !sc.cutBottom) bad.push({ parts: [ext(f.opener, f.openerLast)], words: f.kind !== 'group' });
      continue;
    }
    const parts = [ext(f.opener, f.openerLast), ...f.middles.map((m, i) => ext(m, f.middleLasts[i])), ext(f.closer, f.closerLast)];
    sets.push({ parts, words: f.kind !== 'group' });
  }
  if (!sc.cutTop)
    for (const key of sim.strays.keys()) {
      const [li, i] = key.split(':').map(Number), t = lines[li]?.[i];
      if (t?.at !== undefined) bad.push({ parts: [ext(t)], words: /\w/.test(t.t) });
    }
  const blockCom = cfg.comments?.block ?? [];
  for (const t of toks) {
    if (t.k !== 'str' && t.k !== 'com') continue;
    const s = t.at, e = s + t.t.length;
    let open = 1, close = 1;
    if (t.k === 'com') {
      const b = blockCom.find(([a]) => t.t.startsWith(a));
      if (!b) { spans.push({ from: s, to: e, line: true }); continue; }   // a line comment: nothing to match
      open = b[0].length;
      close = t.t.length >= b[0].length + b[1].length && t.t.endsWith(b[1]) ? b[1].length : 0;
    } else {
      const q = (cfg.strings ?? []).find(q => t.t.startsWith(q.open));
      if (q) {
        const cl = q.close ?? q.open;
        open = q.open.length;
        close = t.t.length >= open + cl.length && t.t.endsWith(cl) ? cl.length : 0;
      } else if (t.t.length < 2) close = 0;
    }
    spans.push({ from: s, to: e, open: [s, s + open], close: close ? [e - close, e] : null });
  }
  return { sets, bad, spans };
}

// Without the formatter's pairs: ( ) [ ] { } outside the editor's string and comment tokens; a string on one line
// has its quotes as a pair.
function signPairs(cm, sc, starts) {
  const sets = [], bad = [], spans = [], stack = [];
  for (let l = sc.from; l <= sc.to; l++) {
    if (sc.langAt(l) !== sc.lang) continue;
    const base = starts[l - sc.from];
    let run = null;
    const endRun = () => {
      if (!run) return;
      const text = cm.getLine(l).slice(run.from - base, run.to - base), q = text[0];
      const pair = run.kind === 'str' && text.length >= 2 && `'"\``.includes(q) && text.at(-1) === q;
      spans.push(pair ? { from: run.from, to: run.to, open: [run.from, run.from + 1], close: [run.to - 1, run.to] }
        : { from: run.from, to: run.to, line: run.kind === 'com' });
      run = null;
    };
    for (const tok of cm.getLineTokens(l, true)) {
      const kind = /\bcomment\b/.test(tok.type ?? '') ? 'com' : /\bstring\b/.test(tok.type ?? '') ? 'str' : null;
      const a = base + tok.start, b = base + tok.end;
      if (kind) {
        if (run && run.kind === kind && run.to === a) run.to = b; else { endRun(); run = { kind, from: a, to: b }; }
        continue;
      }
      endRun();
      for (let k = 0; k < tok.string.length; k++) {
        const ch = tok.string[k], at = a + k;
        if (BRACKET_SIGNS.some(p => p[0] === ch)) stack.push({ ch, at });
        else {
          const p = BRACKET_SIGNS.find(p => p[1] === ch);
          if (!p) continue;
          if (stack.length && stack.at(-1).ch === p[0]) {
            const o = stack.pop();
            sets.push({ parts: [[o.at, o.at + 1], [at, at + 1]], words: false });
          } else if (!sc.cutTop) bad.push({ parts: [[at, at + 1]], words: false });
        }
      }
    }
    endRun();
  }
  if (!sc.cutBottom) for (const o of stack) bad.push({ parts: [[o.at, o.at + 1]], words: false });
  return { sets, bad, spans };
}

// The pair at offset p: inside a string or block comment its start and end; on a word of a set (its edges too) that
// set; else the innermost pair that holds p (p after its opener and before its closer). An unmatched sign or word
// that touches p: that one, bad. `inner`: what lies between the pair.
function bracketHit(an, p) {
  for (const s of an.spans) {
    if (!(s.from < p && (p < s.to || (s.close === null && p === s.to)))) continue;
    if (s.line || !s.open) return null;
    return { parts: s.close ? [s.open, s.close] : [s.open], bad: !s.close, inner: s.close ? [s.open[1], s.close[0]] : null };
  }
  for (const s of an.sets) {
    if (s.words && s.parts.some(([a, b]) => a <= p && p <= b)) return { parts: s.parts, bad: false, inner: [s.parts[0][1], s.parts.at(-1)[0]] };
  }
  for (const s of an.bad) {
    if (s.parts.some(([a, b]) => a <= p && p <= b)) return { parts: s.parts, bad: true, inner: null };
  }
  let best = null;
  for (const s of an.sets) {
    const open = s.parts[0][1], close = s.parts.at(-1)[0];
    if (open <= p && p <= close && (!best || open > best.parts[0][1])) best = s;
  }
  return best ? { parts: best.parts, bad: false, inner: [best.parts[0][1], best.parts.at(-1)[0]] } : null;
}

// The scope's offsets as editor positions.
function bracketPos(an, at) {
  let lo = 0, hi = an.starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (an.starts[mid] <= at) lo = mid; else hi = mid - 1; }
  return CodeMirror.Pos(an.from + lo, at - an.starts[lo]);
}

function bracketAt(cm, pos) {
  const an = bracketAnalysis(cm, pos.line);
  if (!an) return null;
  const hit = bracketHit(an, an.starts[pos.line - an.from] + pos.ch);
  return hit && { ...hit, an };
}

// ---------- Highlight ----------
// Setting bracketHighlight: colour (the theme's bracketMatch behind it), underline (in the find box's colour), off.
// After every cursor move and change, a moment later (typing: once it pauses).
function scheduleBrackets(cm) {
  clearTimeout(cm.state.mmBracketTimer);
  cm.state.mmBracketTimer = setTimeout(() => paintBrackets(cm), 60);
}

function paintBrackets(cm) {
  for (const m of cm.state.mmBracketMarks ?? []) m.clear();
  cm.state.mmBracketMarks = [];
  if ((setting('bracketHighlight') || 'colour') === 'off') return;
  const hit = bracketAt(cm, cm.getCursor('head'));
  if (!hit) return;
  const cls = 'mm-bracket' + (hit.bad ? ' mm-bracket-bad' : '');
  cm.operation(() => {
    for (const [a, b] of hit.parts)
      cm.state.mmBracketMarks.push(cm.markText(bracketPos(hit.an, a), bracketPos(hit.an, b), { className: cls }));
  });
}

function setupBrackets(pane) {
  const cm = pane.cm;
  cm.on('cursorActivity', () => scheduleBrackets(cm));
  cm.on('swapDoc', () => scheduleBrackets(cm));
  cm.addKeyMap(closeBracketKeys());
}

// Select inside brackets: what lies between the pair the highlight shows (without the signs or words themselves).
function selectInsideBrackets(cm) {
  const hit = bracketAt(cm, cm.getCursor('head'));
  if (!hit?.inner) return false;
  cm.setSelection(bracketPos(hit.an, hit.inner[0]), bracketPos(hit.an, hit.inner[1]));
  return true;
}

// Go to the opener ('open': the cursor before it) or the closer ('close': after it) of the pair the highlight shows;
// `extend`: select from where the selection starts. An unmatched one: nowhere to go.
function goToBracket(cm, which, extend) {
  const hit = bracketAt(cm, cm.getCursor('head'));
  if (!hit || hit.bad) return false;
  const to = bracketPos(hit.an, which === 'open' ? hit.parts[0][0] : hit.parts.at(-1)[1]);
  if (extend) cm.setSelection(cm.getCursor('anchor'), to); else cm.setCursor(to);
  cm.scrollIntoView(to, 60);
  return true;
}

// ---------- The { } block around the cursor (docs/plans/executed/PLAN-json-blocks.md) ----------
// In JSON the object; in C#, JavaScript, CSS, ... the { } block. The innermost { } pair around the selection, from
// the pairs the highlight reads (strings, comments and other pairs passed over: inside a JSON array, the object that
// holds it). `strict`: a pair that only touches the selection's ends is not around it, so the cursor before its { or
// after its } goes on to the block around it. Not strict (select): a selection that is a whole block takes the one
// around it. { from, to } (the { and the } included), or null.
function braceBlock(cm, strict) {
  const from = cm.getCursor('from'), to = cm.getCursor('to'), an = bracketAnalysis(cm, cm.getCursor('head').line);
  if (!an || from.line < an.from || to.line > an.to) return null;
  const off = pos => an.starts[pos.line - an.from] + pos.ch, a = off(from), b = off(to);
  const sign = at => { const p = bracketPos(an, at); return an.texts[p.line - an.from][p.ch]; };
  let best = null;
  for (const s of an.sets) {
    if (s.words || s.parts.length !== 2) continue;
    const open = s.parts[0][0], close = s.parts[1][1];
    if (sign(open) !== '{' || sign(close - 1) !== '}') continue;
    const around = strict ? open < a && b < close : open <= a && b <= close && !(open === a && close === b);
    if (around && (!best || open > best.open)) best = { open, close };
  }
  return best && { from: bracketPos(an, best.open), to: bracketPos(an, best.close) };
}

// Go to the { ('open': the cursor before it) or the } ('close': after it) of the block around the cursor; again: of
// the block around that one. `extend`: select from where the selection starts.
function goToBrace(cm, which, extend) {
  const block = braceBlock(cm, true);
  if (!block) return false;
  const to = which === 'open' ? block.from : block.to;
  if (extend) cm.setSelection(cm.getCursor('anchor'), to); else cm.setCursor(to);
  cm.scrollIntoView(to, 60);
  return true;
}

// Select the block around the cursor, its { and } included (in JSON: the object as a value); again: the one around it.
function selectBraceBlock(cm) {
  const block = braceBlock(cm, false);
  if (!block) return false;
  cm.setSelection(block.from, block.to);
  cm.scrollIntoView(block.from, 60);
  return true;
}

// ---------- Close while typing ----------
// Setting closeBrackets: an opening sign adds its closer; typing that closer right before one steps over it;
// Backspace between an empty pair removes both. Quotes the same, not after a letter or digit. Not inside a string
// or comment, signs only (never words), one cursor only.
function closePairs(cm) {
  const doc = panes.find(p => p.cm === cm)?.active?.doc;
  if (!doc) return null;
  const cfg = rfConfig(lineLanguage(cm, cm.getCursor().line) ?? languageOf(doc));
  const signs = (cfg?.groups ?? []).map(g => g.pair).filter(([a, b]) => a.length === 1 && b.length === 1);
  const quotes = (cfg?.strings ?? []).filter(q => q.open.length === 1 && (q.close ?? q.open) === q.open).map(q => q.open);
  return { signs: signs.length ? signs : BRACKET_SIGNS, quotes: cfg?.strings ? quotes : ['"', "'"] };
}

function inStringOrComment(cm, pos) {
  const an = bracketAnalysis(cm, pos.line);
  if (!an) return false;
  const p = an.starts[pos.line - an.from] + pos.ch;
  return an.spans.some(s => s.from < p && (p < s.to || (!s.close && p === s.to)));
}

function closeBracketKeys() {
  const keys = {};
  const usable = cm => setting('closeBrackets') === true && !cm.getOption('readOnly') && cm.listSelections().length === 1;
  const typed = ch => cm => {
    if (!usable(cm)) return CodeMirror.Pass;
    const pairs = closePairs(cm);
    if (!pairs) return CodeMirror.Pass;
    const pos = cm.getCursor(), line = cm.getLine(pos.line), next = line.charAt(pos.ch), prev = line.charAt(pos.ch - 1);
    const sign = pairs.signs.find(p => p[0] === ch), closer = pairs.signs.some(p => p[1] === ch), quote = pairs.quotes.includes(ch);
    if (cm.somethingSelected()) return CodeMirror.Pass;
    if ((closer || quote) && next === ch) { cm.setCursor(CodeMirror.Pos(pos.line, pos.ch + 1)); return; }   // step over
    if (!sign && !quote) return CodeMirror.Pass;
    if (inStringOrComment(cm, pos)) return CodeMirror.Pass;
    if (quote && /[\p{L}\p{N}_]/u.test(prev)) return CodeMirror.Pass;   // don't, it's
    const close = sign ? sign[1] : ch;
    // The cursor between the pair, counted from where the pair ended up: past the end of a line the spaces up to the
    // cursor come first (virtual.js), so the pair lands further right than `pos`.
    cm.replaceSelection(ch + close, 'end', '+input');
    const end = cm.getCursor();
    cm.setCursor(CodeMirror.Pos(end.line, end.ch - close.length));
  };
  for (const ch of new Set(['(', ')', '[', ']', '{', '}', '"', "'", '`'])) keys[`'${ch}'`] = typed(ch);
  keys.Backspace = cm => {
    if (!usable(cm) || cm.somethingSelected()) return CodeMirror.Pass;
    const pairs = closePairs(cm);
    if (!pairs) return CodeMirror.Pass;
    const pos = cm.getCursor(), line = cm.getLine(pos.line), prev = line.charAt(pos.ch - 1), next = line.charAt(pos.ch);
    const empty = pairs.signs.some(([a, b]) => a === prev && b === next) || (pairs.quotes.includes(prev) && prev === next);
    if (!empty) return CodeMirror.Pass;
    cm.replaceRange('', CodeMirror.Pos(pos.line, pos.ch - 1), CodeMirror.Pos(pos.line, pos.ch + 1), '+delete');
  };
  return keys;
}
