'use strict';
// Reformat (docs/plans/executed/PLAN-reformat.md): one formatter for every language. The engine knows roles only (groups,
// blocks, conditions, statements, clauses, join items, elements, tables); a language pack names its words, signs
// and attribute values under `format:` in its language.yaml. It changes only whitespace and line breaks outside
// strings and comments: tokens are never altered. A port of docs/plans/reformat-prototype/engine.py, whose outputs
// are the tests (t64).
// Loaded before convert.js (which runs it as the action kind format: rules) and format.js (Enter).

// ================================================================ tokens
const RF_TOK = (k, t, cont = false) => ({ k, t, cont, oi: 0, fz: false });
const rfLow = (cfg, w) => cfg.case ? w : w.toLowerCase();
const rfFlags = cfg => cfg.case ? '' : 'i';
const rfIsCode = t => t.k === 'w' || t.k === 's' || t.k === 'str' || t.k === 'text';
const rfText = toks => toks.map(t => t.t).join('');
const rfCodeIdx = line => line.flatMap((t, i) => t.k === 'ws' ? [] : [i]);
// Patterns from a pack, compiled once per pattern and flags.
const rfReCache = new Map();
function rfRe(src, flags = '') {
  const key = flags + '\u0001' + src;
  let re = rfReCache.get(key);
  if (!re) { re = new RegExp(src, flags); rfReCache.set(key, re); }
  re.lastIndex = 0;
  return re;
}
const rfMatchStart = (src, text, flags) => rfRe('^(?:' + src + ')', flags).test(text);   // Python's re.match
const rfSearch = (src, text, flags) => rfRe(src, flags).test(text);

function rfSigns(cfg) {
  const signs = new Set(cfg.signs ?? []);
  for (const g of cfg.groups ?? []) g.pair.forEach(p => signs.add(p));
  for (const key of ['operators', 'compare', 'align', 'ends', 'continue', 'separators'])
    for (const p of cfg[key] ?? []) if (p !== '\n' && !/^[A-Za-z_]/.test(p)) signs.add(p);
  return [...signs].filter(Boolean).sort((a, b) => b.length - a.length);
}

function rfTokenize(text, cfg) {
  if (cfg.markup) return rfTokenizeMarkup(text, cfg);
  const com = cfg.comments ?? {}, signs = rfSigns(cfg);
  const keep = (cfg.keep ?? []).map(k => typeof k === 'string' ? { re: k } : k);
  const word = rfRe(cfg.word ?? '[A-Za-z_][A-Za-z0-9_]*', 'y');
  const toks = [], n = text.length;
  const atWordStart = i => i === 0 || ' \t\n'.includes(text[i - 1]);
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\n') { toks.push(RF_TOK('nl', '\n')); i++; continue; }
    if (c === ' ' || c === '\t') {
      let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
      toks.push(RF_TOK('ws', text.slice(i, j))); i = j; continue;
    }
    if (c === '\u0000') {                                  // a placeholder line: another language's part
      let j = text.indexOf('\n', i); if (j < 0) j = n;
      toks.push(RF_TOK('keep', text.slice(i, j), true)); i = j; continue;
    }
    let hit = null;
    for (const k of keep) {
      if (k.after != null) {
        let j = i - 1; while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
        if (j >= 0 && text[j] !== '\n' && !k.after.includes(text[j])) continue;
      }
      const re = rfRe(k.re, 'msy'); re.lastIndex = i;
      const m = re.exec(text);
      if (m && m[0].length) { hit = ['str', i + m[0].length]; break; }
    }
    if (!hit) for (const [o, cl] of com.block ?? []) {
      if (text.startsWith(o, i)) { const j = text.indexOf(cl, i + o.length); hit = ['com', j < 0 ? n : j + cl.length]; break; }
    }
    if (!hit) for (const o of com.line ?? []) {
      const spaced = o.startsWith(' '), worded = o.endsWith(' '), o2 = o.trim();
      if (text.startsWith(o2, i) && (!spaced || atWordStart(i)) && (!worded || i + o2.length >= n || ' \t\n'.includes(text[i + o2.length]))) {
        const j = text.indexOf('\n', i); hit = ['com', j < 0 ? n : j]; break;
      }
    }
    if (!hit) for (const q of cfg.strings ?? []) {
      const o = q.open, cl = q.close ?? o;
      if (!text.startsWith(o, i)) continue;
      let j = i + o.length;
      while (j < n) {
        if (q.escape && text[j] === q.escape) { j += 2; continue; }
        if (text.startsWith(cl, j)) {
          if (q.double && text.startsWith(cl, j + cl.length)) { j += 2 * cl.length; continue; }
          j += cl.length; break;
        }
        if (text[j] === '\n' && !q.lines) break;
        j++;
      }
      hit = ['str', Math.min(j, n)]; break;
    }
    if (hit) { toks.push(RF_TOK(hit[0], text.slice(i, hit[1]))); i = hit[1]; continue; }
    word.lastIndex = i;
    const m = word.exec(text);
    if (m && m[0].length) { toks.push(RF_TOK('w', m[0])); i += m[0].length; continue; }
    const s = signs.find(s => text.startsWith(s, i));
    if (s) { toks.push(RF_TOK('s', s)); i += s.length; continue; }
    toks.push(RF_TOK('s', c)); i++;
  }
  return toks;
}

// XML / HTML: '<name' opens a start tag, then attribute words, '=', values, then '>' or '/>'; an end tag is one token
// '</name>'; text runs are 'text' tokens.
function rfTokenizeMarkup(text, cfg) {
  const toks = [], n = text.length, verb = cfg.verbatimElements ?? [];
  const ws = i => { let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t')) j++; return j; };
  const endTag = /<\/\s*([\w:.-]+)\s*>/y, startTag = /<([\w:.-]+)/y, attr = /[^\s=>/"']+/y;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\n') { toks.push(RF_TOK('nl', '\n')); i++; continue; }
    if (c === ' ' || c === '\t') { const j = ws(i); toks.push(RF_TOK('ws', text.slice(i, j))); i = j; continue; }
    if (c === '\u0000') { let j = text.indexOf('\n', i); if (j < 0) j = n; toks.push(RF_TOK('keep', text.slice(i, j), true)); i = j; continue; }
    const sp = [['<!--', '-->', 'com'], ['<![CDATA[', ']]>', 'str'], ['<?', '?>', 'str'], ['<!', '>', 'str']].find(([o]) => text.startsWith(o, i));
    if (sp) { let j = text.indexOf(sp[1], i); j = j < 0 ? n : j + sp[1].length; toks.push(RF_TOK(sp[2], text.slice(i, j))); i = j; continue; }
    endTag.lastIndex = i;
    let m = endTag.exec(text);
    if (m) { toks.push(RF_TOK('s', m[0])); i += m[0].length; continue; }
    startTag.lastIndex = i;
    m = startTag.exec(text);
    if (m) {
      const name = m[1];
      toks.push(RF_TOK('s', m[0])); i += m[0].length;
      while (i < n) {
        const c2 = text[i];
        if (c2 === '\n') { toks.push(RF_TOK('nl', '\n')); i++; continue; }
        if (c2 === ' ' || c2 === '\t') { const j = ws(i); toks.push(RF_TOK('ws', text.slice(i, j))); i = j; continue; }
        if (text.startsWith('/>', i)) { toks.push(RF_TOK('s', '/>')); i += 2; break; }
        if (c2 === '>') { toks.push(RF_TOK('s', '>')); i++; break; }
        if (c2 === '"' || c2 === "'") { let j = text.indexOf(c2, i + 1); j = j < 0 ? n : j + 1; toks.push(RF_TOK('str', text.slice(i, j))); i = j; continue; }
        if (c2 === '=') { toks.push(RF_TOK('s', '=')); i++; continue; }
        attr.lastIndex = i;
        const a = attr.exec(text);
        if (a) { toks.push(RF_TOK('w', a[0])); i += a[0].length; } else { toks.push(RF_TOK('s', c2)); i++; }
      }
      if (verb.includes(rfLow(cfg, name)) && toks.at(-1).t === '>') {
        const re = new RegExp('</\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>', 'ig');
        re.lastIndex = i;
        const e = re.exec(text), j = e ? e.index : n;
        if (j > i) { toks.push(RF_TOK('str', text.slice(i, j))); i = j; }
      }
      continue;
    }
    let j = i; while (j < n && text[j] !== '<' && text[j] !== '\n') j++;
    const t = text.slice(i, j).replace(/[ \t]+$/, '');
    toks.push(RF_TOK('text', t)); i += t.length;
  }
  return toks;
}

function rfLines(toks) {
  const lines = [[]];
  for (const t of toks) {
    if (t.k === 'nl') { lines.push([]); continue; }
    if (t.t.includes('\n')) {
      const parts = t.t.split('\n');
      lines.at(-1).push(RF_TOK(t.k, parts[0]));
      for (const p of parts.slice(1)) lines.push([RF_TOK(t.k, p, true)]);
    } else lines.at(-1).push(t);
  }
  for (const l of lines) {
    if (!(l.length && l[0].cont)) {
      const oi = l.length && l[0].k === 'ws' ? l[0].t.replace(/\t/g, '    ').length : 0;
      while (l.length && l[0].k === 'ws') l.shift();
      if (l.length) l[0].oi = oi;
    }
    while (l.length && l.at(-1).k === 'ws') l.pop();
  }
  return lines;
}

// The longest of `phrases` at token i ('end if', 'left outer join', '<>'): [phrase, tokens used] or null.
function rfPhrase(cfg, line, i, phrases) {
  let best = null;
  for (const p of phrases ?? []) {
    const parts = /^[A-Za-z_#@$]/.test(p) ? p.split(' ') : [p];
    let j = i, ok = true;
    for (let k = 0; k < parts.length; k++) {
      if (k) { if (j < line.length && line[j].k === 'ws') j++; else { ok = false; break; } }
      if (j >= line.length || (line[j].k !== 'w' && line[j].k !== 's') || rfLow(cfg, line[j].t) !== rfLow(cfg, parts[k])) { ok = false; break; }
      j++;
    }
    if (ok && (!best || j - i > best[1])) best = [p, j - i];
  }
  return best;
}

let rfFrameId = 0;
function rfFrame(kind, props) {
  return Object.assign({ id: ++rfFrameId, kind, name: null, col: 0, indent: 0, content: 0, closecol: 0, midcol: 0, opcol: null,
    opener: null, openerLast: null, closer: null, until: null, endsBefore: [], endsAfter: [], line: 0, group: null, block: null,
    item: null, bodyLine: null, clauses: [], lastbase: null, wait: null, endTok: null, middles: [], untils: [], odef: {},
    tag: null, children: [], closes: true }, props);
}
const rfGroupCfg = (cfg, opener) => (cfg.groups ?? []).find(g => g.pair[0] === opener) ?? null;
const rfSty = (cfg, key, g) => g && key in g ? g[key] : cfg.style?.[key];

// ================================================================ structure
// Walks the lines with a stack of frames: the indentation of every line, and what it found (frames with their
// opener and closer tokens, the frame at the start of each line). Every pass uses it.
function rfSimulate(lines, cfg, override = new Map()) {
  const step = cfg.indent ?? 2, B = cfg.blocks ?? {};
  const openers = B.open ?? [], middles = B.middle ?? [], closers = B.close ?? {};
  const openPh = openers.map(o => o.w), midPh = middles.map(m => m.w), closePh = Object.keys(closers);
  const stmts = cfg.statements ?? {}, ops = cfg.operators ?? [], ends = cfg.ends ?? [];
  const items = cfg.items ?? {}, itemStart = Object.values(items).flatMap(it => it.start), itemClause = Object.values(items).flatMap(it => it.clause);
  const keepLines = cfg.keepLines ?? [], contTokens = cfg.continue ?? [], singleBody = cfg.singleBody ?? [];
  const fl = rfFlags(cfg);
  const stack = [], indents = [], atStart = [], firstRole = [], frames = [], strays = new Map(), unclosed = [], rootChildren = [];
  const nearest = pred => { for (let k = stack.length - 1; k >= 0; k--) if (pred(stack[k])) return k; return null; };
  const popTo = (k, tok = null) => {
    for (const f of stack.slice(k)) if (f.kind === 'elem' && !f.closer && tok && !f.endTok) f.endTok = tok;   // implied end tags
    stack.length = k;
  };
  const top = () => stack.at(-1) ?? null;
  const activeStmt = () => {
    for (let k = stack.length - 1; k >= 0; k--) { if (stack[k].kind === 'stmt') return k; if (stack[k].kind !== 'clause') return null; }
    return null;
  };
  const odef = p => openers.find(o => o.w === p), mdef = p => middles.find(m => m.w === p);
  const lows = list => (list ?? []).map(x => rfLow(cfg, x));
  const closeTargets = p => {
    let c = closers[p];
    if (c && typeof c === 'object' && !Array.isArray(c)) c = c.of;
    if (c == null) return null;
    return lows(Array.isArray(c) ? c : [c]);
  };
  const isStrict = p => { const c = closers[p]; return !!(c && typeof c === 'object' && !Array.isArray(c) && c.strict); };
  const cur = { li: 0 };
  const contAfter = cfg.continueAfter ? cfg.continueAfter : null;
  const freeCloser = (line, i) => (cfg.freeClosers ?? []).some(x => rfMatchStart(x, rfText(line.slice(i)), fl) || rfMatchStart(x, rfText(line), fl));
  const skipped = k => {
    for (const f of stack.slice(k + 1)) if (f.kind === 'group' || (f.kind === 'block' && f.closes !== false && !f.endsBefore.length)) unclosed.push(f);
  };

  function classify(line, i, lineStart) {
    const t = line[i];
    if (t.k !== 'w' && t.k !== 's') return [null, 1];
    if (cfg.markup) {
      if (t.t.startsWith('</')) return [['eclose'], 1];
      if (t.t.startsWith('<')) return [['topen'], 1];
      if ((t.t === '>' || t.t === '/>') && nearest(f => f.kind === 'tag') !== null) return [['tend'], 1];
      return [null, 1];
    }
    let p = rfPhrase(cfg, line, i, closePh);
    if (p) {
      const tg = closeTargets(p[0]);
      const k = nearest(f => (f.kind === 'block' || f.kind === 'single') && f.closes && (tg === null || tg.includes(f.name)));
      const strict = isStrict(p[0]);
      if (k !== null && (!strict || k === stack.length - 1)) return [['bclose', p[0], k], p[1]];
      if (k === null && !strict) {
        if (!freeCloser(line, i)) strays.set(cur.li + ':' + i, p[0]);
        return [['stray'], p[1]];                     // its words are not read as openers
      }
    }
    p = rfPhrase(cfg, line, i, midPh);
    if (p) {
      const m = mdef(p[0]);
      const k = nearest(f => f.kind === 'block' && (!m.of || lows(m.of).includes(f.name)));
      if (k !== null && stack.slice(k + 1).every(f => ['cond', 'single', 'stmt', 'clause'].includes(f.kind)) && (!m.lineStart || lineStart))
        return [['bmid', p[0], k], p[1]];
    }
    const f = top();
    if (f && f.kind === 'cond') {
      p = rfPhrase(cfg, line, i, f.until);
      if (p) return [['until', p[0]], p[1]];
    }
    if (lineStart) {
      for (const o of openers) {
        if (!('line' in o) || !rfMatchStart(o.line, rfText(line.slice(i)), fl)) continue;
        const k = nearest(f => f.kind === 'block' || f.kind === 'group');
        if (!('inside' in o) || (k !== null && lows(o.inside).includes(stack[k].name))) return [['bopen', o.w], 1];
      }
    }
    p = rfPhrase(cfg, line, i, openPh);
    if (p && 'line' in odef(p[0])) p = null;
    if (p) {
      const o = odef(p[0]);
      const before = rfText(line.slice(0, i));
      let after = rfText(line.slice(i + p[1]));
      let k = cur.li;                                 // a line continued (VB's _): its next line counts too
      while (contAfter && k + 1 < lines.length && rfSearch(contAfter, rfText(lines[k].filter(t => t.k !== 'com')))) { k++; after += ' ' + rfText(lines[k]); }
      let ok = (!('before' in o) || rfSearch(o.before, before, fl)) && (!('when' in o) || rfSearch(o.when, after, fl));
      if (ok && o.notInside && stack.some(f => f.kind === 'block' && lows(o.notInside).includes(f.name))) ok = false;
      if (ok && o.inside) {
        const kk = nearest(f => f.kind === 'block' || f.kind === 'group');
        ok = kk !== null && lows(o.inside).includes(stack[kk].name);
      }
      if (ok) return [['bopen', p[0]], p[1]];
    }
    if (t.k === 's') {
      const g = rfGroupCfg(cfg, t.t);
      if (g) return [['gopen', g], 1];
      const k = nearest(f => f.kind === 'group' && f.group.pair[1] === t.t);
      if (k !== null) return [['gclose', k], 1];
      if ((cfg.groups ?? []).some(g2 => g2.pair[1] === t.t) && !freeCloser(line, i)) strays.set(cur.li + ':' + i, t.t);
      if (ends.includes(t.t)) return [['end'], 1];
    }
    if (lineStart) {
      const k = activeStmt();
      if (k !== null) { p = rfPhrase(cfg, line, i, stack[k].clauses); if (p) return [['clause', p[0], k], p[1]]; }
      if (Object.keys(stmts).length) { p = rfPhrase(cfg, line, i, Object.keys(stmts)); if (p) return [['stmt', p[0]], p[1]]; }
      for (const [key, ph] of [['op', ops], ['item', itemStart], ['iclause', itemClause], ['cont', contTokens]]) {
        p = rfPhrase(cfg, line, i, ph);
        if (p) return [[key, p[0]], p[1]];
      }
    }
    return [null, 1];
  }

  let itemOwner = null, prevText = null, prevBase = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const verbatim = !!(line.length && line[0].cont) || stack.some(f => f.verbatim);
    if (ends.includes('\n'))                              // a statement ends with its line
      while (stack.length && stack.at(-1).kind === 'single' && stack.at(-1).bodyLine !== null && stack.at(-1).bodyLine < li) stack.pop();
    for (const f of stack) if (f.kind === 'single' && f.bodyLine === null && f.line < li && line.length && !verbatim) f.bodyLine = li;
    if (!line.length || (verbatim && !line.some(t => t.k === 'w' || t.k === 's'))) {
      indents.push(null); atStart.push(top()); firstRole.push(null);
      continue;
    }
    let fi = rfCodeIdx(line)[0];
    if (verbatim) fi = line.findIndex(t => t.k === 'w' || t.k === 's');
    let changed = true;
    while (changed && stack.length) {
      changed = false;
      const f = stack.at(-1);
      if (f.endsBefore.length && rfPhrase(cfg, line, fi, f.endsBefore)) { stack.pop(); changed = true; }
      else if (f.kind === 'single' && rfPhrase(cfg, line, fi, singleBody)) { stack.pop(); changed = true; }
      else if (cfg.markup && f.kind === 'elem' && line[fi].k === 's' && line[fi].t.startsWith('<') && !line[fi].t.startsWith('</') &&
               (cfg.autoClose?.[rfLow(cfg, line[fi].t.slice(1))] ?? []).includes(rfLow(cfg, f.name))) {
        popTo(stack.length - 1, line[fi]); changed = true;
      }
    }
    cur.li = li;
    let [role, used0] = classify(line, fi, true);
    let f = top();
    let col = f ? f.content : 0;
    if (f && f.kind === 'stmt' && f.line < li) col = f.content;
    // A ( that starts a line of a statement (declare x ROW then ( on the next line): at the statement's column.
    if (f && f.kind === 'stmt' && f.line < li && role?.[0] === 'gopen') col = f.col;
    let r = role ? role[0] : null;
    if (r === 'gclose') col = stack[role[1]].closecol;
    else if (r === 'eclose') {
      const name = rfLow(cfg, line[fi].t.slice(2, -1).trim());
      const k = nearest(x => x.kind === 'elem' && rfLow(cfg, x.name) === name);
      if (k !== null) col = stack[k].closecol;
    } else if (r === 'bclose') col = stack[role[2]].closecol;
    else if (r === 'bmid') col = stack[role[2]].midcol;
    else if (r === 'until') col = f.block.midcol;
    else if (r === 'clause') col = stack[role[2]].col;
    else if (r === 'stmt') {
      const k = activeStmt();
      if (k !== null) { popTo(k); f = top(); col = f ? f.content : 0; }
    } else if (r === 'iclause') {
      const it = f ? f.item : null;
      if (it && it.closedLine === li - 1) col = it.col + it.kind.length - role[1].length;
      else if (it) col = it.col;
    } else if ((r === 'cont' || r === 'op') && f && f.lastbase !== null && (!['group', 'cond', 'clause'].includes(f.kind) || (f.kind === 'group' && f.group.block))) {
      col = f.lastbase + step; r = 'cont';
    } else if ((r === 'cont' || r === 'op') && !f) { col = prevBase + step; r = 'cont'; }
    if (r === null && f && f.kind === 'group' && (cfg.labels ?? []).some(x => rfMatchStart(x, rfText(line.slice(fi)), fl))) col = f.closecol;
    if (r !== 'cont' && contAfter && prevText !== null && rfSearch(contAfter, prevText) && f && f.lastbase !== null) { col = f.lastbase + step; r = 'cont'; }
    else if (r !== 'cont' && contAfter && prevText !== null && rfSearch(contAfter, prevText) && !f) { col = (prevBase || 0) + step; r = 'cont'; }
    if (cfg.keepIndent && (!f || f.kind !== 'group')) col = line[fi].oi;
    if (keepLines.some(k => rfSearch(k, rfText(line), fl))) col = 0;
    if (line[0].fz) col = line[0].oi;                     // outside the selection: as it is
    if (override.has(li)) col = override.get(li);
    if (verbatim) col = null;
    if (f && r !== 'cont') f.lastbase = col;
    if (r !== 'cont') prevBase = col;
    prevText = rfText(line.filter(t => t.k !== 'com'));
    indents.push(col); atStart.push(top()); firstRole.push(role);
    const cols = []; let x = col ?? 0;
    for (const t of line) { cols.push(x); x += t.t.length; }
    let i = 0;
    while (i < line.length) {
      const t = line[i];
      if (t.k === 'com' && cfg.markup) { const pe = nearest(x2 => x2.kind === 'elem'); if (pe !== null) stack[pe].children.push(t); }
      if (t.k !== 'w' && t.k !== 's') { i++; continue; }
      let used;
      [role, used] = i === fi ? [role, used0] : classify(line, i, false);
      if (!role) {
        if (stack.length && stack.at(-1).endsAfter.length && lows(stack.at(-1).endsAfter).includes(rfLow(cfg, t.t))) stack.pop();
        i += used; continue;
      }
      const rr = role[0], here = cols[i];
      let nxt = null;
      for (let j = i + used; j < line.length; j++) if (line[j].k !== 'ws') { nxt = j; break; }
      const nxtCode = nxt !== null && line[nxt].k !== 'com';
      if (rr === 'gopen') {
        const g = role[1], base = rfSty(cfg, 'base', g);
        const fr = rfFrame('group', { name: t.t, group: g, col: here, indent: col, line: li, opener: t });
        if (base === 'word') { fr.content = nxtCode ? cols[nxt] : here + (i === fi ? step : 1); fr.closecol = here; }
        else { fr.content = (col ?? 0) + step; fr.closecol = col ?? 0; }
        fr.opcol = base === 'word' ? here + 1 : (col ?? 0) + step;
        stack.push(fr); frames.push(fr);
      } else if (rr === 'gclose') {
        const k = role[1], fr = stack[k]; fr.closer = t; skipped(k); popTo(k);
        const w = top();
        if (w && w.kind === 'single' && w.wait === fr.opener) {
          w.wait = null;
          let after = null;
          for (let j = i + 1; j < line.length; j++) if (line[j].k !== 'ws' && line[j].k !== 'com') { after = line[j]; break; }
          if (after && rfPhrase(cfg, [after], 0, singleBody)) stack.pop();
          else if (after) w.bodyLine = li;
        }
        if (top()?.item && top().item.source === fr) top().item.closedLine = li;
      } else if (rr === 'topen') {
        const name = rfLow(cfg, t.t.slice(1)), closes = cfg.autoClose?.[name] ?? [];
        const k2 = nearest(x2 => x2.kind === 'elem');
        if (k2 !== null && closes.includes(rfLow(cfg, stack[k2].name))) popTo(k2, t);
        const fr = rfFrame('tag', { name: t.t.slice(1), col: here, indent: col, line: li, opener: t });
        fr.content = nxtCode ? cols[nxt] : here + t.t.length + 1; fr.closecol = here;
        stack.push(fr); frames.push(fr);
        const pe = nearest(x2 => x2.kind === 'elem');
        if (pe !== null) stack[pe].children.push(t); else rootChildren.push(t);   // the document's own: a line each
      } else if (rr === 'tend') {
        const k = nearest(x2 => x2.kind === 'tag'), tag = stack[k]; tag.closer = t; popTo(k);
        const name = rfLow(cfg, tag.name);
        if (t.t === '>' && !(cfg.void ?? []).includes(name)) {
          const ti = indents[tag.line] ?? tag.col;
          const el = rfFrame('elem', { name: tag.name, col: tag.col, indent: col, line: li, opener: t, tag, content: ti + step, closecol: ti });
          stack.push(el); frames.push(el);
        }
      } else if (rr === 'eclose') {
        const name = rfLow(cfg, t.t.slice(2, -1).trim());
        const k = nearest(x2 => x2.kind === 'elem' && rfLow(cfg, x2.name) === name);
        if (k !== null) {
          for (const f of stack.slice(k + 1)) if (f.kind === 'elem') unclosed.push(f);   // ended by an outer end tag
          stack[k].closer = t; popTo(k, t);
        }
      } else if (rr === 'bopen') {
        const o = odef(role[1]), base = rfSty(cfg, 'base');
        const fr = rfFrame(o.kind ?? 'block', { name: rfLow(cfg, role[1]), col: here, indent: col, line: li, opener: t,
          openerLast: line[i + used - 1], odef: o, closes: o.closes ?? true });
        if (base === 'word') { fr.content = here + step; fr.midcol = fr.closecol = here; }
        else { fr.content = (col ?? 0) + step; fr.midcol = fr.closecol = col ?? 0; }
        fr.endsBefore = o.endsBefore ?? []; fr.endsAfter = o.endsAfter ?? [];
        if (o.afterGroup) fr.wait = nxt !== null ? line[nxt] : null;   // if (...): decided when its ( ) closes
        stack.push(fr); frames.push(fr);
        if (o.until) {
          const c = rfFrame('cond', { block: fr, col: here, line: li, until: o.until, opener: line[i + used - 1], odef: o });
          c.content = nxtCode ? cols[nxt] : here + t.t.length + 1;
          c.opcol = base === 'word' ? here + step : (col ?? 0) + step;
          stack.push(c); frames.push(c);
        }
      } else if (rr === 'bmid') {
        const k = role[2], bl = stack[k]; popTo(k + 1); bl.middles.push(t);
        const m = mdef(role[1]);
        if (m.until) {
          const c = rfFrame('cond', { block: bl, col: here, line: li, until: m.until, opener: line[i + used - 1], odef: m });
          c.content = nxtCode ? cols[nxt] : here + t.t.length + 1;
          c.opcol = rfSty(cfg, 'base') === 'word' ? here + step : (col ?? 0) + step;
          stack.push(c); frames.push(c);
        } else if (m.single && !nxtCode) {
          const s1 = rfFrame('single', { name: '', col: here, line: li, content: (col ?? 0) + step, opener: t, closes: false, closecol: col ?? 0 });
          stack.push(s1); frames.push(s1);
        }
      } else if (rr === 'bclose') {
        const k = role[2]; stack[k].closer = t; skipped(k); popTo(k);
      } else if (rr === 'until') {
        const c = stack.pop(); c.closer = t; c.block.untils.push(t);
        if (c.odef.body === 'single') {                   // Pascal: if ... then <one statement>
          if (!nxtCode) c.block.content = (col ?? 0) + step; else c.block.bodyLine = li;
        }
      } else if (rr === 'end') {
        while (stack.length && ['clause', 'stmt'].includes(stack.at(-1).kind)) stack.pop();
        while (stack.length && stack.at(-1).kind === 'single' && (stack.at(-1).bodyLine !== null || stack.at(-1).line === li)) {
          stack.pop();
          while (stack.length && ['clause', 'stmt'].includes(stack.at(-1).kind)) stack.pop();
        }
      } else if (rr === 'stmt') {
        const s0 = rfFrame('stmt', { name: role[1], col: here, line: li, content: here + step, clauses: stmts[role[1]], opener: t });
        stack.push(s0); frames.push(s0);
      } else if (rr === 'clause') {
        const k = activeStmt(); popTo(k + 1);
        const c = rfFrame('clause', { name: role[1], col: here, line: li, content: here + step, opener: t });
        stack.push(c); frames.push(c);
      } else if (rr === 'item') {
        if (stack.length) {                               // the item belongs to the list it is in
          let j = i + used; while (j < line.length && line[j].k === 'ws') j++;
          itemOwner = stack.at(-1);
          itemOwner.item = { col: here, kind: role[1], line: li, source: null, srcTok: j < line.length ? line[j] : null };
        }
      }
      i += used;
      if (stack.length && stack.at(-1).endsAfter.length && lows(stack.at(-1).endsAfter).includes(rfLow(cfg, t.t)) && stack.at(-1).opener !== t) stack.pop();
    }
    if (itemOwner && itemOwner.item.line === li && itemOwner.item.source === null) {
      const st0 = itemOwner.item.srcTok;
      itemOwner.item.source = frames.find(fr => fr.kind === 'group' && fr.opener === st0) ?? null;
    }
    itemOwner = null;
  }
  return { indents, atStart, firstRole, frames, open: [...stack, ...unclosed], strays, rootChildren };
}

// ================================================================ line breaks
function rfPositions(lines) {
  const pos = new Map();
  lines.forEach((l, li) => l.forEach((t, i) => pos.set(t, [li, i])));
  return pos;
}
const rfCodeBefore = (lines, li, i) => lines[li].slice(0, i).some(t => rfIsCode(t) || t.k === 'com');
const rfCodeAfter = (lines, li, i) => lines[li].slice(i + 1).some(rfIsCode);
const rfLastIsCom = line => line.length > 0 && line.at(-1).k === 'com';
const rfFixed = line => line.length > 0 && (line[0].fz || line[0].k === 'keep');   // not to be changed

function rfBreakBefore(lines, li, i) {
  const rest = lines[li].slice(i), head = lines[li].slice(0, i);
  while (head.length && head.at(-1).k === 'ws') head.pop();
  lines[li] = head; lines.splice(li + 1, 0, rest);
}
function rfJoinNext(lines, li, sep) {
  const a = lines[li], b = lines[li + 1];
  while (a.length && a.at(-1).k === 'ws') a.pop();
  while (b.length && b[0].k === 'ws') b.shift();
  lines[li] = [...a, ...(sep && a.length && b.length ? [RF_TOK('ws', sep)] : []), ...b];
  lines.splice(li + 1, 1);
}
function rfSetWsAfter(lines, li, i, width) {
  const line = lines[li];
  if (i + 1 < line.length && line[i + 1].k === 'ws') { if (width) line[i + 1] = RF_TOK('ws', ' '.repeat(width)); else line.splice(i + 1, 1); }
  else if (width && i + 1 < line.length) line.splice(i + 1, 0, RF_TOK('ws', ' '.repeat(width)));
}
// Where the `{` goes: `openAt` is same / next / keep, or {default, next: pattern of the head}.
function rfOpenAt(cfg, g, lines, lo, io) {
  const oa = g.openAt;
  if (!oa || typeof oa !== 'object') return oa;
  let head = rfText(lines[lo].slice(0, io)).trim();
  if (!head && lo > 0) head = rfText(lines[lo - 1]).trim();
  return rfSearch(oa.next, head, rfFlags(cfg)) ? 'next' : oa.default;
}
function rfDirectChildren(inner) {
  const out = []; let depth = 0;
  for (const t of inner) {
    if (t.k === 's' && t.t.startsWith('</')) { depth--; continue; }
    if (t.k === 's' && t.t.startsWith('<')) { depth++; out.push(t); continue; }
    if (t.k === 's' && t.t === '/>') { depth--; continue; }
    if (depth === 0) out.push(t);
  }
  return out;
}
function rfSepTokens(lines, fr, pos, cfg) {
  const seps = cfg.separators ?? [','], out = [];
  const [lo, io] = pos.get(fr.opener), [lc, ic] = pos.get(fr.closer);
  const opens = (cfg.groups ?? []).map(g => g.pair[0]), closes = (cfg.groups ?? []).map(g => g.pair[1]);
  let depth = 0;
  for (let li = lo; li <= lc; li++) lines[li].forEach((t, i) => {
    if ((li === lo && i <= io) || (li === lc && i >= ic) || t.k !== 's') return;
    if (opens.includes(t.t)) depth++; else if (closes.includes(t.t)) depth--; else if (depth === 0 && seps.includes(t.t)) out.push([li, i, t]);
  });
  return out;
}
// A long clause of an item (a join's `on` with more comparisons than `longLimit`): over lines.
function rfItemBreaks(lines, cfg, sim, pos) {
  const out = [], items = cfg.items ?? {};
  if (!Object.keys(items).length) return out;
  const limit = cfg.longLimit ?? 2, ops = cfg.operators ?? [], clause = Object.values(items).flatMap(it => it.clause);
  for (const fr of sim.frames) {
    if (fr.kind !== 'group' || !fr.closer || !pos.has(fr.opener) || !pos.has(fr.closer)) continue;
    const [lo, io] = pos.get(fr.opener), [lc, ic] = pos.get(fr.closer);
    const prev = lines[lo].slice(0, io).filter(t => t.k !== 'ws');
    if (!prev.length || !rfPhrase(cfg, [prev.at(-1)], 0, clause)) continue;
    const opsin = []; let depth = 0;
    for (let li = lo; li <= lc; li++) lines[li].forEach((t, i) => {
      if ((li === lo && i <= io) || (li === lc && i >= ic)) return;
      if (t.k === 's' && rfGroupCfg(cfg, t.t)) depth++;
      else if (t.k === 's' && (cfg.groups ?? []).some(g => g.pair[1] === t.t)) depth--;
      else if (depth === 0 && rfPhrase(cfg, lines[li], i, ops)) opsin.push([li, i, t]);
    });
    if (opsin.length + 1 <= limit) continue;
    const onTok = prev.at(-1), [ol, oi] = pos.get(onTok);
    if (rfSty(cfg, 'longClause') === 'next' && rfCodeBefore(lines, ol, oi)) out.push([[ol, oi], 'before', onTok]);
    for (const [li, i, t] of opsin) if (rfCodeBefore(lines, li, i)) out.push([[li, i], 'before', t]);
    if (lines[lc].slice(0, ic).some(rfIsCode)) out.push([[lc, ic], 'before', fr.closer]);
  }
  return out;
}

function rfFindBreaks(lines, cfg) {
  const sim = rfSimulate(lines, cfg), pos = rfPositions(lines), fixes = [];
  const add = (kind, tok, arg) => { if (pos.has(tok)) fixes.push([pos.get(tok), kind, tok, arg]); };
  const trail = cfg.trail ?? [';', ',', ')', ']', '}', '.'];
  for (const fr of sim.frames) {
    if (fr.kind === 'group' && fr.closer && pos.has(fr.closer) && pos.has(fr.opener)) {
      const g = fr.group, [lo, io] = pos.get(fr.opener), [lc, ic] = pos.get(fr.closer), spans = lc > lo;
      const oa = rfOpenAt(cfg, g, lines, lo, io);
      if (oa === 'next' && rfCodeBefore(lines, lo, io)) add('before', fr.opener);
      if (oa === 'same' && !rfCodeBefore(lines, lo, io) && lo > 0 && lines[lo - 1].length && rfIsCode(lines[lo - 1].at(-1)) &&
          ![';', '{', '}'].includes(lines[lo - 1].at(-1).t) && !lines[lo - 1][0].cont)
        add('joinprev', fr.opener, ' ');
      if (!spans && rfSty(cfg, 'oneLine', g) === 'split' && rfCodeAfter(lines, lo, io) && ic > io + 1) { add('after', fr.opener); continue; }
      if (spans) {
        const o = rfSty(cfg, 'open', g), c = rfSty(cfg, 'close', g);
        if (o === 'same' && !rfCodeAfter(lines, lo, io) && rfCodeBefore(lines, lo, io) && lo + 1 < lines.length && lines[lo + 1].length &&
            lines[lo + 1][0].k !== 'com' && !lines[lo + 1][0].cont && !rfLastIsCom(lines[lo]))
          add('joinnext', fr.opener, rfSty(cfg, 'parenSpace', g) === 'on' ? ' ' : '');
        if (o === 'next' && rfCodeAfter(lines, lo, io)) add('after', fr.opener);
        if (c === 'own' && lines[lc].slice(0, ic).some(rfIsCode)) add('before', fr.closer);
        if (c === 'same' && !rfCodeBefore(lines, lc, ic) && lc > 0 && lines[lc - 1].length && !rfLastIsCom(lines[lc - 1])) add('joinprev', fr.closer, '');
        const ac = rfSty(cfg, 'afterClose', g);
        if (ac === 'next') {
          let j = null;
          for (let k = ic + 1; k < lines[lc].length; k++) if (lines[lc][k].k !== 'ws') { j = k; break; }
          if (j !== null && rfIsCode(lines[lc][j]) && !trail.includes(lines[lc][j].t)) add('before', lines[lc][j]);
        }
        if (ac === 'same' && lc + 1 < lines.length && lines[lc + 1].length && !rfCodeAfter(lines, lc, ic) && rfPhrase(cfg, lines[lc + 1], 0, cfg.joinAfterClose ?? []))
          add('joinnext', fr.closer, ' ');
        if (g.list) for (const [li, i, t] of rfSepTokens(lines, fr, pos, cfg)) if (rfCodeAfter(lines, li, i)) add('after', t);
      }
      if (rfSty(cfg, 'parenSpace', g) === 'off' && g.tight) {
        if (io + 1 < lines[lo].length && lines[lo][io + 1].k === 'ws' && io + 2 < lines[lo].length) add('nowsAfter', fr.opener);
        if (ic > 0 && lines[lc][ic - 1].k === 'ws' && rfCodeBefore(lines, lc, ic - 1)) add('nowsBefore', fr.closer);
      }
    }
    if (fr.kind === 'tag' && fr.closer && pos.has(fr.closer) && pos.has(fr.opener)) {
      const [lo, io] = pos.get(fr.opener), [lc, ic] = pos.get(fr.closer);
      if (lc > lo) {                                      // attributes over lines: one per line
        let seen = 0;
        for (let li = lo; li <= lc; li++) for (let i = 0; i < lines[li].length; i++) {
          if (li === lo && i <= io) continue;
          if (li === lc && i >= ic) break;
          if (lines[li][i].k === 'w' && ++seen > 1 && rfCodeBefore(lines, li, i)) add('before', lines[li][i]);
        }
        if (!rfCodeBefore(lines, lc, ic)) add('joinprev', fr.closer, '');
      }
    }
    const end = fr.kind === 'elem' ? fr.closer ?? fr.endTok : null;
    if (fr.kind === 'elem' && end && pos.has(end) && pos.has(fr.opener)) {
      const [lo, io] = pos.get(fr.opener), [lc, ic] = pos.get(end);
      const inner = [];
      for (let li = lo; li <= lc; li++) lines[li].forEach((t, i) => { if ((li > lo || i > io) && (li < lc || i < ic)) inner.push(t); });
      const hasText = rfDirectChildren(inner).some(t => t.k === 'text');
      const hasElems = inner.some(t => t.k === 's' && t.t.startsWith('<') && !t.t.startsWith('</'));
      if (!hasText && hasElems && (lc > lo || rfSty(cfg, 'oneLine') === 'split')) {
        if (rfCodeAfter(lines, lo, io)) add('after', fr.opener);
        if (fr.closer && lines[lc].slice(0, ic).some(rfIsCode)) add('before', fr.closer);
        for (const t of fr.children) if (pos.has(t)) { const [l2, i2] = pos.get(t); if (rfCodeBefore(lines, l2, i2)) add('before', t); }
      }
    }
    if (fr.kind === 'block' && fr.closer && pos.has(fr.closer) && pos.has(fr.opener)) {
      const [lo] = pos.get(fr.opener), [lc, ic] = pos.get(fr.closer);
      if (lc > lo) {
        if (fr.odef.breakAfter && pos.has(fr.openerLast)) { const [l2, i2] = pos.get(fr.openerLast); if (rfCodeAfter(lines, l2, i2)) add('after', fr.openerLast); }
        for (const t of fr.untils) {
          if (!pos.has(t)) continue;
          const [l2, i2] = pos.get(t);
          if (rfCodeAfter(lines, l2, i2)) add('after', t);
        }
        for (const t of fr.middles) {
          if (!pos.has(t)) continue;
          const [l2, i2] = pos.get(t);
          const m = (cfg.blocks?.middle ?? []).find(m2 => rfPhrase(cfg, lines[l2], i2, [m2.w])) ?? {};
          if ((m.breakBefore ?? true) && rfCodeBefore(lines, l2, i2)) add('before', t);
          const pm = m.w ? rfPhrase(cfg, lines[l2], i2, [m.w]) : null;
          if (m.breakAfter && pm && rfCodeAfter(lines, l2, i2 + pm[1] - 1)) add('after', lines[l2][i2 + pm[1] - 1]);
        }
        if (rfCodeBefore(lines, lc, ic)) add('before', fr.closer);
      }
    }
  }
  fixes.push(...rfItemBreaks(lines, cfg, sim, pos));
  // XML / HTML: the elements of the document itself (after the declaration) on lines of their own.
  if (cfg.markup && rfSty(cfg, 'oneLine') === 'split')
    for (const t of sim.rootChildren) if (pos.has(t)) { const [l2, i2] = pos.get(t); if (rfCodeBefore(lines, l2, i2)) add('before', t); }
  return fixes.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
}

// Applies the fixes found in one pass, from the end of the text to its start (so the positions before stay valid),
// skipping one on a line another fix of this pass changed, or on a line that is not to be changed.
function rfApply(lines, fixes) {
  const touched = new Set();
  let done = 0;
  for (let n = fixes.length - 1; n >= 0; n--) {
    const [[li, i], kind, tok, arg] = fixes[n];
    if (lines[li]?.[i] !== tok) continue;
    const span = kind.startsWith('join') ? [kind === 'joinprev' ? li - 1 : li, kind === 'joinprev' ? li : li + 1] : [li, li];
    if (span[0] < 0 || span[1] >= lines.length) continue;
    if (span.some(l => touched.has(l)) || rfFixed(lines[span[0]]) || rfFixed(lines[span[1]])) continue;
    if (kind.startsWith('join') && (!lines[span[0]].length || !lines[span[1]].length)) continue;
    if (kind === 'before') rfBreakBefore(lines, li, i);
    else if (kind === 'after') { let j = i + 1; while (j < lines[li].length && lines[li][j].k === 'ws') j++; rfBreakBefore(lines, li, j); }
    else if (kind === 'joinnext') rfJoinNext(lines, li, arg);
    else if (kind === 'joinprev') { if (i === 0 || !rfCodeBefore(lines, li, i)) rfJoinNext(lines, li - 1, arg); }
    else if (kind === 'nowsAfter') lines[li].splice(i + 1, 1);
    else if (kind === 'nowsBefore') lines[li].splice(i - 1, 1);
    for (const l of span) touched.add(l);
    if (kind === 'before' || kind === 'after') touched.add(li + 1);
    done++;
  }
  return done;
}

function rfBreaks(lines, cfg) {
  for (let n = 0; n < 400; n++) {
    const fixes = rfFindBreaks(lines, cfg).filter(f => !rfFixed(lines[f[0][0]]));
    if (!fixes.length || !rfApply(lines, fixes)) return;
  }
  throw new Error('the line breaks do not settle');
}

function rfInsideGroup(lines, li, i, opener, cfg) {
  const closer = rfGroupCfg(cfg, opener)?.pair[1];
  let depth = 0;
  for (let l2 = li; l2 >= 0; l2--) for (let k = l2 === li ? i - 1 : lines[l2].length - 1; k >= 0; k--) {
    const t = lines[l2][k];
    if (t.k !== 's') continue;
    if (t.t === closer) depth++;
    else if (t.t === opener) { if (!depth) return true; depth--; }
  }
  return false;
}
// Exactly one space after the signs listed (`space: [{after: ':', inside: '{'}]`), none before them; or one before.
function rfSpaces(lines, cfg) {
  for (const rule of cfg.space ?? []) {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (rfFixed(line)) continue;
      if ('before' in rule) {
        for (let i = line.length - 1; i > 0; i--) if (line[i].k === 's' && line[i].t === rule.before && rfIsCode(line[i - 1])) line.splice(i, 0, RF_TOK('ws', ' '));
        continue;
      }
      for (let i = 0; i < line.length; i++) {
        const t = line[i];
        if (t.k !== 's' || t.t !== rule.after || i + 1 >= line.length) continue;
        if (rule.inside && !rfInsideGroup(lines, li, i, rule.inside, cfg)) continue;
        if (line[i + 1].k === 'ws') line[i + 1] = RF_TOK('ws', ' ');
        else if (rfIsCode(line[i + 1])) line.splice(i + 1, 0, RF_TOK('ws', ' '));
        if (i > 0 && line[i - 1].k === 'ws' && (rule.noneBefore ?? true)) { line.splice(i - 1, 1); i--; }
      }
    }
  }
}

// ================================================================ operators and alignment
const rfColOf = (lines, sim, li, i) => (sim.indents[li] ?? 0) + lines[li].slice(0, i).reduce((s, t) => s + t.t.length, 0);

// operator: start: the operators of a condition over lines in one column, every operand after them.
function rfOperators(lines, cfg, sim) {
  const over = new Map();
  if (rfSty(cfg, 'operator') !== 'start' || !(cfg.operators ?? []).length) return over;
  const ops = cfg.operators, pos = rfPositions(lines), byFrame = new Map();
  sim.atStart.forEach((f, li) => {
    if (f && sim.indents[li] !== null && !rfFixed(lines[li])) { if (!byFrame.has(f)) byFrame.set(f, []); byFrame.get(f).push(li); }
  });
  for (const [f, lis] of byFrame) {
    if (!['group', 'cond', 'clause'].includes(f.kind)) continue;
    const oplines = lis.map(li => [li, rfPhrase(cfg, lines[li], rfCodeIdx(lines[li])[0], ops)])
      .filter(([li, p]) => p && sim.firstRole[li] && sim.firstRole[li][0] === 'op');
    if (!oplines.length) continue;
    const oplen = Math.max(...oplines.map(([, p]) => p[0].length));
    const opcol = f.opcol ?? f.content, operand = opcol + oplen + 1;
    for (const li of lis) {
      const r = sim.firstRole[li];
      if (r && ['gclose', 'bclose', 'bmid', 'until', 'clause', 'eclose'].includes(r[0])) continue;
      const p = oplines.find(([l2]) => l2 === li)?.[1];
      if (p) { over.set(li, opcol); rfSetWsAfter(lines, li, rfCodeIdx(lines[li])[0] + p[1] - 1, operand - opcol - p[0].length); }
      else if (lines[li][0].k !== 'com') over.set(li, operand);
    }
    if ((f.kind === 'group' || f.kind === 'cond') && pos.has(f.opener)) {
      const [lo, io] = pos.get(f.opener);
      if (rfFixed(lines[lo])) continue;
      let j = null;
      for (let k = io + 1; k < lines[lo].length; k++) if (lines[lo][k].k !== 'ws') { j = k; break; }
      if (j !== null && rfIsCode(lines[lo][j])) {
        const ind = over.get(lo) ?? sim.indents[lo] ?? 0;
        const cEnd = ind + lines[lo].slice(0, io + 1).reduce((s, t) => s + t.t.length, 0);
        rfSetWsAfter(lines, lo, io, Math.max(f.kind === 'cond' ? 1 : 0, operand - cEnd));
      }
    }
  }
  return over;
}

// The first anchor at depth 0 of the line (from token `start`): its index, or null.
function rfFirstAnchor(cfg, line, start = 0) {
  const ph = [...(cfg.compare ?? []), ...(cfg.align ?? [])];
  const opens = (cfg.groups ?? []).map(g => g.pair[0]), closes = (cfg.groups ?? []).map(g => g.pair[1]);
  let depth = 0;
  for (let i = start; i < line.length; i++) {
    const t = line[i];
    if (t.k === 's' && opens.includes(t.t)) depth++;
    else if (t.k === 's' && closes.includes(t.t)) depth--;
    else if (depth === 0 && (t.k === 'w' || t.k === 's') && i > start && rfPhrase(cfg, line, i, ph)) return i;
  }
  return null;
}

function rfAlign(lines, cfg, sim) {
  if (rfSty(cfg, 'align') !== 'on') return;
  const ind = sim.indents, runs = [];
  let cur = [], key;
  lines.forEach((line, li) => {
    if (!line.length) return;                             // a blank line does not end a run (a list's columns go on)
    if (ind[li] === null || rfFixed(line)) { if (cur.length) runs.push(cur); cur = []; key = undefined; return; }
    if (line[0].k === 'com' && rfCodeIdx(line).length === 1) return;
    let k = sim.atStart[li]?.id ?? 0;
    const r = sim.firstRole[li];
    if (r && ['gclose', 'bclose', 'bmid', 'until', 'eclose', 'clause'].includes(r[0])) k = k + ':' + li;
    if (k !== key) { if (cur.length) runs.push(cur); cur = []; key = k; }
    cur.push(li);
  });
  if (cur.length) runs.push(cur);
  const pos = rfPositions(lines), ops = cfg.operators ?? [];
  const padTo = found => {
    const ends = found.map(([li, a]) => { let j = a - 1; while (j >= 0 && lines[li][j].k === 'ws') j--; return rfColOf(lines, sim, li, j + 1); });
    const target = Math.max(...ends) + 1;
    found.forEach(([li, a], n) => {
      if (a > 0 && lines[li][a - 1].k === 'ws') lines[li][a - 1] = RF_TOK('ws', ' '.repeat(target - ends[n]));
      else lines[li].splice(a, 0, RF_TOK('ws', ' '.repeat(target - ends[n])));
    });
  };
  for (const run of runs) {
    const f = sim.atStart[run[0]];
    if (!f || !['group', 'clause', 'cond', 'tag'].includes(f.kind)) continue;   // only inside lists and conditions
    const segs = run.map(li => [li, 0]);
    if ((f.kind === 'group' || f.kind === 'cond') && pos.has(f.opener)) {
      const [lo, io] = pos.get(f.opener);
      if (lo === run[0] - 1 && !rfFixed(lines[lo])) {
        let j = null;
        for (let k = io + 1; k < lines[lo].length; k++) if (lines[lo][k].k !== 'ws') { j = k; break; }
        if (j !== null) segs.unshift([lo, j]);
      }
    }
    rfColumns(lines, cfg, sim, run);
    const found = segs.map(([li, s]) => [li, rfFirstAnchor(cfg, lines[li], s)]).filter(([, a]) => a !== null);
    if (found.length >= 2) padTo(found);
    const trail = [];                                     // operators at the line end in one column
    for (const [li] of segs) {
      const ci = rfCodeIdx(lines[li]).filter(i => lines[li][i].k !== 'com');
      if (!ci.length) continue;
      const last = ci.at(-1);
      for (let k = last; k >= 0; k--) { const p = rfPhrase(cfg, lines[li], k, ops); if (p && k + p[1] - 1 === last) { trail.push([li, k]); break; } }
    }
    if (trail.length >= 2) {
      const ends = trail.map(([li, a]) => { let j = a - 1; while (j >= 0 && lines[li][j].k === 'ws') j--; return rfColOf(lines, sim, li, j + 1); });
      const target = Math.max(...ends) + 1;
      trail.forEach(([li, a], n) => { if (lines[li][a - 1].k === 'ws') lines[li][a - 1] = RF_TOK('ws', ' '.repeat(target - ends[n])); });
    }
  }
  rfItemColumns(lines, cfg, sim);
}

// The items of a list over lines (each line ends with a separator): their words before the first anchor in columns.
function rfColumns(lines, cfg, sim, run) {
  const f = sim.atStart[run[0]];
  if (!f || f.kind !== 'group' || run.length < 2) return;
  const seps = cfg.separators ?? [','];
  const lastCode = line => { const ci = line.flatMap((t, i) => rfIsCode(t) ? [i] : []); return ci.length ? line[ci.at(-1)] : null; };
  if (!run.slice(0, -1).every(li => lastCode(lines[li]) && seps.includes(lastCode(lines[li]).t))) return;
  const cells = new Map();
  for (const li of run) {
    const line = lines[li], a = rfFirstAnchor(cfg, line);
    let stop = a ?? line.length;
    const com = line.findIndex(t => t.k === 'com');
    if (com >= 0) stop = Math.min(stop, com);
    const gaps = line.slice(0, stop).flatMap((t, i) => t.k === 'ws' ? [i] : []);
    if (stop === com && gaps.at(-1) === com - 1) gaps.pop();   // the gap before a comment at the line end is no column
    cells.set(li, gaps);
  }
  // Only the gaps every row has are columns (mode, name); the rest of a row is one cell (a type of two words:
  // long nvarchar), lined up by its anchor (default) if it has one.
  const ncol = Math.min(...[...cells.values()].map(w => w.length));
  for (let c = 0; c < ncol; c++) {
    const rows = run.filter(li => cells.get(li).length > c);
    if (rows.length < 2) continue;
    const widths = new Map(rows.map(li => {
      const w = cells.get(li)[c], start = c ? cells.get(li)[c - 1] + 1 : 0;
      return [li, lines[li].slice(start, w).reduce((s, t) => s + t.t.length, 0)];
    }));
    const wmax = Math.max(...widths.values());
    for (const li of rows) lines[li][cells.get(li)[c]] = RF_TOK('ws', ' '.repeat(wmax - widths.get(li) + 1));
  }
}

// Joins in a list: join words, source and alias in columns over the whole list; a short `on` in a column `clauseGap`
// after the widest alias; alignClause: first lines up the first comparison of those `on`s.
function rfItemColumns(lines, cfg, sim) {
  const items = cfg.items ?? {};
  if (!Object.keys(items).length) return;
  const starts = Object.values(items).flatMap(it => it.start), clauseW = Object.values(items).flatMap(it => it.clause);
  const gap = cfg.clauseGap ?? 4, by = new Map();
  sim.atStart.forEach((f, li) => {
    if (!f || !['clause', 'group'].includes(f.kind) || !lines[li].length || sim.indents[li] === null || rfFixed(lines[li])) return;
    const p = rfPhrase(cfg, lines[li], rfCodeIdx(lines[li])[0], starts);
    if (p) { if (!by.has(f)) by.set(f, []); by.get(f).push([li, p]); }
  });
  for (const rows of by.values()) {
    const cells = [];
    for (const [li, p] of rows) {
      const line = lines[li], k = rfCodeIdx(line)[0] + p[1];
      const idx = line.flatMap((t, i) => i >= k && t.k !== 'ws' ? [i] : []);
      if (idx.length < 2 || line[idx[0]].k === 's') continue;   // a group as the source: not in the columns
      const on = idx.length > 2 && rfPhrase(cfg, line, idx[2], clauseW) ? idx[2] : null;
      cells.push([li, idx[0], idx[1], on, p[0].length]);
    }
    if (cells.length < 2) continue;
    const kw = Math.max(...cells.map(c => c[4])), sw = Math.max(...cells.map(c => lines[c[0]][c[1]].t.length));
    const withOn = cells.filter(c => c[3] !== null);
    const aw = withOn.length ? Math.max(...withOn.map(c => lines[c[0]][c[2]].t.length)) : 0;
    for (const [li, src, alias, on, klen] of cells) {
      const line = lines[li];
      if (on !== null) line[on - 1] = RF_TOK('ws', ' '.repeat(aw - line[alias].t.length + gap));
      line[alias - 1] = RF_TOK('ws', ' '.repeat(sw - line[src].t.length + 1));
      line[src - 1] = RF_TOK('ws', ' '.repeat(kw - klen + 1));
    }
    if (rfSty(cfg, 'alignClause') === 'first' && withOn.length >= 2) {
      // The first comparison after each `on (`: its anchor in one column.
      const found = [];
      for (const [li, , , on] of withOn) {
        const line = lines[li], open = line.findIndex((t, i) => i > on && t.k === 's' && rfGroupCfg(cfg, t.t));
        if (open < 0) continue;
        let depth = 0;
        for (let i = open + 1; i < line.length; i++) {
          const t = line[i];
          if (t.k === 's' && rfGroupCfg(cfg, t.t)) depth++;
          else if (t.k === 's' && (cfg.groups ?? []).some(g => g.pair[1] === t.t)) { if (!depth--) break; }
          else if (!depth && rfPhrase(cfg, line, i, cfg.compare ?? [])) { found.push([li, i]); break; }
        }
      }
      if (found.length >= 2) {
        const ends = found.map(([li, a]) => { let j = a - 1; while (j >= 0 && lines[li][j].k === 'ws') j--; return lines[li].slice(0, j + 1).reduce((s, t) => s + t.t.length, 0); });
        const target = Math.max(...ends) + 1;
        found.forEach(([li, a], n) => { if (lines[li][a - 1].k === 'ws') lines[li][a - 1] = RF_TOK('ws', ' '.repeat(target - ends[n])); });
      }
    }
  }
}

// Python's str.center: the extra space of an odd margin goes left only when the width is odd too.
function rfCenter(text, w) {
  const marg = w - text.length;
  if (marg <= 0) return text;
  const left = Math.floor(marg / 2) + (marg & w & 1);
  return ' '.repeat(left) + text + ' '.repeat(marg - left);
}
// Tables (markdown): rows around a delimiter row; every row stays one line, its `sep` signs in columns, one space
// inside each cell, the delimiter row filled with `fill`, a cell's text placed as its column's markers say.
function rfTables(lines, cfg) {
  const tb = cfg.tables;
  if (!tb) return;
  const sep = tb.sep, fill = tb.fill ?? '-';
  const cells = line => {
    const out = []; let cur = [], lead = false;
    line.forEach((t, k) => {
      if (t.k === 's' && t.t === sep) {
        if (k === 0 || line.slice(0, k).every(x => x.k === 'ws')) lead = true; else out.push(rfText(cur).trim());
        cur = [];
      } else cur.push(t);
    });
    const trail = !rfText(cur).trim();
    if (!trail) out.push(rfText(cur).trim());
    return [out, lead, trail];
  };
  const kept = r => lines[r].length > 0 && (lines[r][0].cont || rfFixed(lines[r]));
  let li = 0;
  while (li < lines.length) {
    if (!(li > 0 && lines[li].length && !kept(li) && !kept(li - 1) && rfMatchStart(tb.delimiter, rfText(lines[li]), '') && rfText(lines[li - 1]).includes(sep))) { li++; continue; }
    const top = li - 1;
    let end = li + 1;
    while (end < lines.length && lines[end].length && !kept(end) && lines[end].some(t => t.k === 's' && t.t === sep)) end++;
    const rows = new Map();
    for (let r = top; r < end; r++) rows.set(r, cells(lines[r]));
    const n = Math.max(...[...rows.values()].map(c => c[0].length));
    const marks = rows.get(li)[0];
    const align = [...marks.map(m => m.endsWith(':') && !m.startsWith(':') ? 'r' : m.startsWith(':') && m.endsWith(':') && m.length > 1 ? 'c' : 'l'), ...Array(n).fill('l')];
    const width = Array.from({ length: n }, (_, c) => Math.max(3, ...[...rows].filter(([r, v]) => r !== li && c < v[0].length).map(([, v]) => v[0][c].length)));
    for (const [r, [cs, lead, trail]] of rows) {
      const parts = cs.map((text, c) => {
        const w = width[c];
        if (r === li) {
          const m = text.trim(), left = m.startsWith(':'), right = m.endsWith(':') && m.length > 1;
          return (left ? ':' : '') + fill.repeat(w - left - right) + (right ? ':' : '');
        }
        return align[c] === 'r' ? text.padStart(w) : align[c] === 'c' ? rfCenter(text, w) : text.padEnd(w);
      });
      if (!trail && parts.length) parts[parts.length - 1] = parts.at(-1).replace(/\s+$/, '');   // no spaces at the line end
      const row = (lead ? sep + ' ' : '') + parts.join(' ' + sep + ' ') + (trail ? ' ' + sep : '');
      const oi = lines[r][0]?.oi ?? 0;
      lines[r] = [RF_TOK('text', row)]; lines[r][0].oi = oi;
    }
    li = end;
  }
}

function rfLayout(lines, cfg) {
  let override = new Map();
  const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  for (let rnd = 0; rnd < 6; rnd++) {
    let sim = rfSimulate(lines, cfg, override);
    const next = rfOperators(lines, cfg, sim);
    sim = rfSimulate(lines, cfg, next);
    rfAlign(lines, cfg, sim);
    if (same(next, override) && rnd > 1) break;
    override = next;
  }
  return rfSimulate(lines, cfg, override);
}

// The leading whitespace of a column: spaces, or with useTabs tabs as far as it goes (a leading tab is an indent
// step wide) and spaces for the rest.
const rfIndentText = (col, opts) => opts.useTabs ? '\t'.repeat(Math.floor(col / opts.indent)) + ' '.repeat(col % opts.indent) : ' '.repeat(col);

// The lines, each with `kept` when it is as it was (outside the selection, inside a string or comment over lines).
function rfRender(lines, sim, original, opts) {
  return lines.map((line, li) => {
    if (!line.length) return { text: '', kept: false };
    if (line[0].fz) return { text: original[line[0].fzLine], kept: true };   // outside the selection: as it was
    const ind = sim.indents[li];
    return ind === null ? { text: rfText(line), kept: true } : { text: rfIndentText(ind, opts) + rfText(line), kept: false };
  });
}

// The language's parameters with your settings per attribute (Options > Settings, Languages: format.<lang>.<attr>).
function rfConfig(lang) {
  const base = packs[lang]?.format;
  if (!base || typeof base !== 'object') return null;
  const style = { ...(base.style ?? {}) };
  for (const key of Object.keys(RF_ATTRIBUTES)) {
    const v = setting(`format.${lang}.${key}`);
    if (v) style[key] = v;
  }
  return { ...base, style };
}

// The style attributes (PLAN-reformat.md 3.7): their values, for the settings rows.
const RF_ATTRIBUTES = {
  open: ['After ( [ { and begin: the content', [['same', 'On the same line'], ['next', 'On the next line']]],
  close: [') ] } of a group over lines', [['same', 'At the end of the last line'], ['own', 'On a line of its own']]],
  base: ['The next line', [['word', 'Right of the ( or block word'], ['line', 'A step right of the line it is on']]],
  align: ['Alignment (=, default, lists as columns)', [['on', 'On'], ['off', 'Off']]],
  oneLine: ['A group written on one line', [['keep', 'Stays on one line'], ['split', 'Over lines']]],
  operator: ['and / or at a line start', [['start', 'In one column, operands after them'], ['end', 'As typed, operands lined up']]],
  afterClose: ['What follows a ) of a group over lines', [['same', 'On the line of the )'], ['next', 'On the next line']]],
  alignClause: ['The first comparison of each join\'s on', [['first', 'In one column'], ['off', 'Not lined up']]],
  longClause: ['A long on (more comparisons than the limit)', [['next', 'On the next line'], ['column', 'In its column']]],
  parenSpace: ['Spaces inside ( )', [['off', 'None'], ['on', 'One']]],
};

// Formats `text` (whole lines) with the language's parameters. opts: { indent, useTabs, frozen: Set of line numbers
// that stay as they are (outside a selection; their structure still counts) }.
function reformatText(text, cfg, opts) {
  return reformatLines(text, cfg, opts).map(l => l.text).join('\n');
}

function reformatLines(text, cfg, opts) {
  const c = { ...cfg, indent: opts.indent };
  const original = text.split('\n');
  const lines = rfLines(rfTokenize(text, c));
  for (const li of opts.frozen ?? []) if (lines[li]?.length) { lines[li][0].fz = true; lines[li][0].fzLine = li; }
  rfSpaces(lines, c);
  rfBreaks(lines, c);
  rfSpaces(lines, c);
  rfTables(lines, c);
  const sim = rfLayout(lines, c);
  return rfRender(lines, sim, original, opts);
}

// The column a line belongs at (Enter, a closing word typed): the lines up to it, as Format would indent them.
function reformatIndentAt(textUpTo, cfg, opts) {
  const c = { ...cfg, indent: opts.indent };
  const lines = rfLines(rfTokenize(textUpTo, c));
  if (!lines.at(-1).length) lines[lines.length - 1] = [RF_TOK('s', '\u0001')];   // an empty line: a neutral probe
  lines.forEach((l, li) => { if (li < lines.length - 1 && l.length) { l[0].fz = true; } });
  const sim = rfSimulate(lines, c);
  return sim.indents.at(-1);
}

// What a check would report (PLAN-reformat.md 3.7e): openers without their closer, closers without their opener.
function reformatProblems(text, cfg) {
  const c = { ...cfg, indent: 2 };
  const lines = rfLines(rfTokenize(text, c));
  const sim = rfSimulate(lines, c), pos = rfPositions(lines), out = [];
  const optional = (cfg.optionalEnd ?? []).map(n => rfLow(cfg, n));   // HTML: </p>, </li>, </body> may be left out
  for (const f of sim.open) {
    if (!['group', 'block', 'elem', 'tag'].includes(f.kind) || f.odef?.closes === false) continue;
    if (f.kind === 'elem' && optional.includes(rfLow(cfg, f.name))) continue;
    const opener = f.kind === 'elem' ? f.tag.opener : f.opener;   // an element: its start tag
    if (pos.has(opener)) out.push([pos.get(opener)[0] + 1, `"${opener.t}" is not closed`]);
  }
  for (const [key, w] of sim.strays) out.push([+key.split(':')[0] + 1, `"${w}" closes nothing`]);
  return out.sort((a, b) => a[0] - b[0]);
}
