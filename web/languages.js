'use strict';
// Language packs (LanguagePacks.cs reads them; see languages\_template\language.yaml for every part): which
// language a file has, its colouring in the editor and the preview, its outline, actions, bar, colours and
// how it opens. A document's `language` is its pack's name, or undefined for markdown (the app's own).
// Loaded before actions.js; the functions it calls in app.js and format.js run later.

let packs = {};             // name -> the pack, as the host sends it
let PACK_NAMES = [];        // in the order of their names
let packExtensions = {};    // ".cs" -> "csharp"
let languagesVersion = 0;   // counts loads: a changed pack gets a new editor mode

async function loadLanguages() {
  applyLanguages(await host('languages'));
}

function applyLanguages(all) {
  packs = all.packs ?? {};
  packExtensions = all.extensions ?? {};
  PACK_NAMES = Object.keys(packs).sort((a, b) => packs[a].name.localeCompare(packs[b].name));
  // A pack with format parameters (reformat.js) has the action Format, on its bar and in the Format menu; its own
  // `format` action keeps its title and hint.
  for (const p of Object.values(packs)) if (p.format && typeof p.format === 'object')
    p.actions = { ...p.actions, format: { title: 'Reformat', hint: 'The selected lines, else the whole file: indentation, line breaks and alignment by the rules of the language (Options > Settings, Languages)',
      ...p.actions?.format, format: 'rules' } };
  languagesVersion++;
  buildLanguageNames();
  if (all.problems?.length) toast(`Language packs: ${all.problems[0]}` + (all.problems.length > 1 ? ` (and ${all.problems.length - 1} more, see Options > Settings)` : ''));
  updatePackColours();
}

const languageOf = doc => !doc ? null : doc.language ?? 'markdown';
const packOf = doc => packs[languageOf(doc)];
const languageTitle = doc => packOf(doc)?.name ?? languageOf(doc);
const langDef = (doc, name) => doc ? packs[languageOf(doc)]?.actions?.[name] ?? packs.plaintext?.actions?.[name] : null;
const packActionNames = () => [...new Set(PACK_NAMES.flatMap(n => Object.keys(packs[n]?.actions ?? {})))];

// The language of a file: by extension, then by a pack's first-line pattern, else plain text.
function languageFor(path, text = '') {
  const ext = path?.match(/(\.[^.\\/]+)$/)?.[1].toLowerCase();
  if (ext && packExtensions[ext]) return packExtensions[ext];
  const first = text.slice(0, 500).split(/\r?\n/, 1)[0];
  for (const name of PACK_NAMES) {
    const pattern = packs[name].firstLine;
    try { if (pattern && new RegExp(pattern, 'i').test(first)) return name; } catch { /* reported by the host */ }
  }
  return 'plaintext';
}

// ---------- A language inside a language (docs/plans/PLAN-embedded-languages.md) ----------
// From a name (a markdown fence's ```bash, an embedded rule's language) to a language: your own mapping first
// (setting languageNames), then the packs: an id wins over a name, a name over an alias, an alias over an extension
// (so "sql" is the SQL pack, though .sql files open as ASA SQL); within each, your packs over shipped ones.
let packByName = new Map();
function buildLanguageNames() {
  packByName = new Map();
  const ids = Object.keys(packs).sort((a, b) => (packs[a].mine ? 1 : 0) - (packs[b].mine ? 1 : 0));
  const kinds = [p => (p.extensions ?? []).map(e => e.replace(/^\./, '')), p => p.aliases ?? [], p => [p.name], (p, id) => [id]];
  for (const names of kinds)   // the weakest first: a stronger kind overwrites
    for (const id of ids)
      for (const n of names(packs[id], id)) if (n != null && String(n).trim()) packByName.set(String(n).trim().toLowerCase(), id);
}
function languageByName(name) {
  const key = String(name ?? '').trim().toLowerCase().replace(/^\./, '');
  if (!key) return null;
  const mine = typeof setting === 'function' ? setting('languageNames') : null;
  if (mine && typeof mine === 'object')
    for (const [k, v] of Object.entries(mine)) if (k.trim().toLowerCase() === key && packs[v]) return v;
  return packByName.get(key) ?? null;
}

// A pack's block rules (its "embedded"): a test for the open line and for the close line, and the inner language
// (fixed, or the open line's regex group). Whole lines: a block is the lines between its open and close line.
function blockRules(pack) {
  const test = (text, regex, flags) => {
    if (regex) { try { const re = new RegExp(regex, flags); return line => re.exec(line); } catch { return () => null; } }
    return text ? line => line.includes(text) ? [line] : null : () => null;
  };
  return (Array.isArray(pack?.embedded) ? pack.embedded : []).filter(r => r && typeof r === 'object').map(r => ({
    open: test(r.open, r.openRegex, r.flags), close: test(r.close, r.closeRegex, r.flags),
    language: r.language, group: Number.isInteger(r.languageGroup) ? r.languageGroup : null,
  }));
}

// The mode of a file with blocks of other languages: it counts the lines and hands each line to the language it
// is in (a range of lines you set, a block between marker lines, else the outer language). The outer language's
// state waits during a block, so it goes on after it where it left off. Inner tokens also get "in-<language>"
// (their own looks, updatePackColours) and their lines "mm-embedded" (the gutter's tint). rangeAt(line): the
// language you set for that line, or null.
let embeddedModes = 0;
function embeddedMode(outerSpec, rules, rangeAt) {
  const name = `lp-emb-${++embeddedModes}`;
  CodeMirror.defineMode(name, config => {
    const outer = CodeMirror.getMode(config, outerSpec), modes = new Map();
    const modeOf = lang => {
      if (!modes.has(lang)) modes.set(lang, lang ? CodeMirror.getMode(config, languageMode(lang)) : null);
      return modes.get(lang);
    };
    const enter = (s, lang) => { s.lang = lang; s.mode = modeOf(lang); s.inner = CodeMirror.startState(s.mode); };
    // At the start of every line (also an empty one): which language this line is in.
    function lineStart(text, s) {
      s.line++;
      const set = rangeAt?.(s.line) ?? null;
      if (set) {
        if (s.set !== set || !s.inner) enter(s, set);
        s.set = set;
        return;
      }
      if (s.set) { s.set = null; s.lang = s.block; s.mode = s.block ? modeOf(s.block) : null; s.inner = s.blockState; }
      if (s.pending) {                       // the line after an open line: the block starts here
        enter(s, s.pending.lang);
        s.block = s.pending.lang; s.closeTest = s.pending.close; s.pending = null;
      }
      if (s.block && s.closeTest(text)) {   // the close line: the outer language's again
        s.block = null; s.lang = null; s.mode = null; s.inner = null;
      } else if (!s.block) {
        for (const r of rules) {
          const m = r.open(text);
          if (!m) continue;
          const lang = languageByName(r.group != null ? m[r.group] : r.language);
          if (lang && modeOf(lang)) s.pending = { lang, close: r.close };
          break;
        }
      }
      s.blockState = s.block ? s.inner : null;
    }
    const tag = (style, s) => `${style ? style + ' ' : ''}in-${s.lang} line-mm-embedded`;
    return {
      startState: () => ({ line: -1, outer: CodeMirror.startState(outer), lang: null, mode: null, inner: null,
        block: null, blockState: null, set: null, pending: null, closeTest: null }),
      copyState: s => {
        const c = { ...s, outer: CodeMirror.copyState(outer, s.outer) };
        c.inner = s.mode && s.inner ? CodeMirror.copyState(s.mode, s.inner) : null;
        c.blockState = s.blockState ? (s.blockState === s.inner ? c.inner : CodeMirror.copyState(modeOf(s.block), s.blockState)) : null;
        return c;
      },
      token(stream, s) {
        if (stream.sol()) lineStart(stream.string, s);
        if (s.lang && s.mode) {
          const style = s.mode.token(stream, s.inner);
          if (stream.pos === stream.start) stream.next();   // a mode that does not move on: one character
          return tag(style, s);
        }
        return outer.token(stream, s.outer);
      },
      blankLine(s) {
        lineStart('', s);
        if (s.lang && s.mode) { s.mode.blankLine?.(s.inner); return `in-${s.lang} line-mm-embedded`; }
        return outer.blankLine?.(s.outer);
      },
      // The state is the line before's: the line being indented is in the language it will be in.
      indent(s, after, line) {
        const next = rangeAt?.(s.line + 1) ?? (s.pending ? s.pending.lang : s.block && !s.closeTest(line ?? '') ? s.block : null);
        if (next) {
          const mode = modeOf(next), state = next === s.lang && s.inner ? s.inner : CodeMirror.startState(mode);
          return mode.indent ? mode.indent(state, after, line) : CodeMirror.Pass;
        }
        return outer.indent ? outer.indent(s.outer, after, line) : CodeMirror.Pass;
      },
      innerMode: s => s.lang && s.mode ? { state: s.inner, mode: s.mode } : { state: s.outer, mode: outer },
      lineComment: outer.lineComment, blockCommentStart: outer.blockCommentStart, blockCommentEnd: outer.blockCommentEnd,
      fold: outer.fold,
    };
  });
  return name;
}

// The editor mode of a document: its language's, wrapped when the language has blocks or you set lines.
const blockModes = new Map();   // language + version -> the wrapped mode's name
function documentMode(doc) {
  const lang = languageOf(doc), base = doc.language ? languageMode(doc.language) : { name: 'gfm', highlightFormatting: true };
  const rules = blockRules(packs[lang]), ranges = doc.ranges?.length ? doc.ranges : null;
  if (!rules.length && !ranges) return base;
  if (!ranges) {
    const key = `${lang}:${languagesVersion}`;
    if (!blockModes.has(key)) blockModes.set(key, embeddedMode(base, rules, null));
    return blockModes.get(key);
  }
  // Lines you set: a mode of this document's own, made again when its ranges change.
  const key = `${lang}:${languagesVersion}:${doc.rangesVersion ?? 0}`;
  if (doc.rangeModeKey !== key) {
    doc.rangeModeKey = key;
    doc.rangeMode = embeddedMode(base, rules, line => rangeLanguageAt(doc, line));
  }
  return doc.rangeMode;
}

// ---------- Lines you give a language (PLAN-embedded-languages.md 3.1.2) ----------
// doc.ranges: [{ language, from, to }] (line numbers), while the document is in the editor also fromLine / toLine:
// the editor's line handles, which move with edits. Kept by the host per file (State\file-ranges.json) with the
// text of the first and last line, to find them again after the file changed elsewhere.

// The lines of a range now (the handles when there are, else the numbers).
function rangeLines(doc, r) {
  if (doc.cmDoc && r.fromLine && r.toLine) {
    const a = doc.cmDoc.getLineNumber(r.fromLine), b = doc.cmDoc.getLineNumber(r.toLine);
    if (a != null && b != null) return [a, b];
  }
  return [r.from, r.to];
}

function rangeLanguageAt(doc, line) {
  for (const r of doc.ranges ?? []) {
    const [a, b] = rangeLines(doc, r);
    if (line >= a && line <= b) return packs[r.language] ? r.language : null;
  }
  return null;
}

// Stored ranges against the text as it is now: where the first and last line are still the same, at once; else
// the first line's text looked up (nearest to where it was), the last line's at the same distance or after it.
// A range not found is dropped.
function rangesFound(text, stored) {
  if (!Array.isArray(stored) || !stored.length) return [];
  const lines = text.split(/\r?\n/), found = [];
  for (const r of stored) {
    if (!r || !packs[r.language] || !Number.isInteger(r.from) || !Number.isInteger(r.to) || r.to < r.from) continue;
    if (lines[r.from] === r.first && lines[r.to] === r.last) { found.push({ language: r.language, from: r.from, to: r.to }); continue; }
    let best = -1;
    lines.forEach((l, i) => { if (l === r.first && (best < 0 || Math.abs(i - r.from) < Math.abs(best - r.from))) best = i; });
    if (best < 0) continue;
    const length = r.to - r.from;
    let end = lines[best + length] === r.last ? best + length : lines.findIndex((l, i) => i >= best && l === r.last);
    if (end < 0) continue;
    found.push({ language: r.language, from: best, to: end });
  }
  return found;
}

// The ranges follow edits: handles move by themselves; here what handles cannot know. A change that starts on a
// range's line and adds lines (Enter, a paste) keeps those lines in the range, also on its last line (the range
// grows there); lines added at the very start of its first line come before it. Lines of the range deleted: its
// ends move inwards; all of them deleted: the range goes.
function attachRanges(doc) {
  const cm = doc.cmDoc;
  const bind = () => { for (const r of doc.ranges ?? []) { r.fromLine = cm.getLineHandle(r.from); r.toLine = cm.getLineHandle(r.to); } };
  bind();
  cm.on('beforeChange', (_, ch) => {
    if (!doc.ranges?.length) return;
    ch.rangesBefore = doc.ranges.map(r => rangeLines(doc, r));
  });
  cm.on('change', (_, ch) => {
    if (!doc.ranges?.length) return;
    const added = ch.text.length - 1, before = ch.rangesBefore ?? [];
    let removed = false;
    doc.ranges = doc.ranges.filter((r, i) => {
      const [a0, b0] = before[i] ?? rangeLines(doc, r);
      let a = cm.getLineNumber(r.fromLine), b = cm.getLineNumber(r.toLine);
      if (a == null && b == null) { removed = true; return false; }   // its first and last line are gone
      if (a == null) a = Math.min(ch.from.line, b);
      if (b == null) b = Math.max(a, ch.from.line + added);
      if (added > 0 && ch.from.line === b0) b = ch.from.line + added;                            // on its last line: grows
      if (added > 0 && ch.from.line === a0 && ch.from.ch === 0 && a0 !== b0) a = a0 + added;     // at its very start: before it
      if (b < a) { removed = true; return false; }
      r.fromLine = cm.getLineHandle(a);
      r.toLine = cm.getLineHandle(b);
      return true;
    });
    if (removed) rangesChanged(doc);
    storeRangesSoon(doc);
  });
  doc.rangesAttached = true;
}

// A language for lines from..to (null: the file's own language again): it replaces the parts of other ranges there.
function setLinesLanguage(doc, from, to, language) {
  const kept = [];
  for (const r of doc.ranges ?? []) {
    const [a, b] = rangeLines(doc, r);
    if (b < from || a > to) { kept.push({ language: r.language, from: a, to: b }); continue; }
    if (a < from) kept.push({ language: r.language, from: a, to: from - 1 });
    if (b > to) kept.push({ language: r.language, from: to + 1, to: b });
  }
  if (language && language !== languageOf(doc)) kept.push({ language, from, to });
  doc.ranges = kept.sort((x, y) => x.from - y.from);
  if (doc.cmDoc) for (const r of doc.ranges) { r.fromLine = doc.cmDoc.getLineHandle(r.from); r.toLine = doc.cmDoc.getLineHandle(r.to); }
  rangesChanged(doc);
  storeRanges(doc);
}

// Ranges added or removed: the document's mode is made again (documentMode), editor and preview colour again.
function rangesChanged(doc) {
  doc.rangesVersion = (doc.rangesVersion ?? 0) + 1;
  for (const tab of tabsOf(doc)) tab.stale = true;
  showAll();
}

function storeRanges(doc) {
  clearTimeout(doc.rangesTimer);
  if (!doc.path) return;
  const lines = docText(doc).split(/\r?\n/);
  host('setFileRanges', { path: doc.path, ranges: (doc.ranges ?? []).map(r => {
    const [from, to] = rangeLines(doc, r);
    return { language: r.language, from, to, first: lines[from] ?? '', last: lines[to] ?? '' };
  }) });
}
function storeRangesSoon(doc) {
  clearTimeout(doc.rangesTimer);
  doc.rangesTimer = setTimeout(() => storeRanges(doc), 1000);
}

// ---------- Colouring ----------
// The editor mode of a language: a built-in mode the pack names, else one made from the pack's comments,
// quotes, words and rules (CodeMirror's simple mode), else plain text. Needs the editor script loaded.
function languageMode(name) {
  const pack = packs[name];
  if (!pack) return 'text/plain';
  if (pack.mode === 'markdown') return { name: 'gfm', highlightFormatting: true };
  if (pack.mode) return pack.mode;
  if (!pack.words && !pack.rules && !pack.quotes && !pack.comments && pack.numbers == null) return 'text/plain';
  const mode = `lp-${name}-${languagesVersion}`;
  if (!CodeMirror.modes[mode]) CodeMirror.defineSimpleMode(mode, simpleMode(pack));
  return mode;
}

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');

// The simple-mode states of a pack: your rules first, then comments, quotes, the word lists and numbers.
function simpleMode(pack) {
  const flags = pack.caseSensitive === false ? 'i' : '';
  const re = (source, f = flags) => { try { return new RegExp(source, f); } catch { return /(?!)/; } };
  const start = [], states = {};
  for (const r of pack.rules ?? []) if (r?.regex) start.push({ regex: re(r.regex, r.flags ?? flags), token: r.token ?? null, sol: !!r.sol });
  const c = pack.comments ?? {};
  const commentToken = c.token ?? 'comment';
  for (const line of [c.line, ...(c.moreLines ?? [])].filter(Boolean)) start.push({ regex: re(escapeRegex(line) + '.*'), token: commentToken });
  [c.block, ...(c.moreBlocks ?? [])].filter(b => Array.isArray(b) && b.length === 2).forEach(([open, close], i) => {
    start.push({ regex: re(escapeRegex(open)), token: commentToken, next: 'comment' + i });
    states['comment' + i] = [{ regex: re('.*?' + escapeRegex(close)), token: commentToken, next: 'start' }, { regex: /.*/, token: commentToken }];
  });
  // Strings: open and close (else the same); double: the closing quote written twice is one quote inside
  // ('it''s', "say ""hi"""); escape: a character that makes the next one plain; multiline: may go on over lines.
  (pack.quotes ?? []).forEach((q, i) => {
    if (!q?.open) return;
    const open = escapeRegex(q.open), close = escapeRegex(q.close ?? q.open), escape = q.escape && escapeRegex(q.escape);
    // As much as possible (a doubled quote or an escaped character never ends it), then the closing quote.
    const inner = q.double ? `(?:${close}${close}|(?!${close}).)*` : escape ? `(?:${escape}.|(?!${close}).)*` : `(?:(?!${close}).)*`;
    const token = q.token ?? 'string';
    if (!q.multiline) return start.push({ regex: re(open + inner + `(?:${close}|$)`), token });
    start.push({ regex: re(open + inner + close), token });          // closed on the same line
    start.push({ regex: re(open + '.*'), token, next: 'string' + i });   // goes on
    states['string' + i] = [{ regex: re(inner + close), token, next: 'start' }, { regex: /.*/, token }];
  });
  // Word lists: a word ending in * stands for every word starting with it ('@@*'). The exact words come first (a
  // word in a list wins over a "starts with"), then those, the longest first, so '@@*' wins over '@*'.
  const prefixes = [], lists = [];
  // In the order of the file (wordOrder: the host's; the keys themselves arrive sorted): the first list with a word wins.
  for (const token of pack.wordOrder ?? Object.keys(pack.words ?? {})) {
    const words = pack.words?.[token];
    if (!Array.isArray(words) || !/^[\w-]+$/.test(token)) continue;
    const exact = words.map(String).filter(w => !w.endsWith('*'));
    for (const w of words.map(String).filter(w => w.endsWith('*') && w.length > 1)) prefixes.push({ prefix: w.slice(0, -1), token });
    // The longest first ('background-color' before 'background'); a word ending in a letter or digit must not go on
    // ('for' is not the start of 'format'), one ending in a sign may ('</a>' in '</a>text').
    const word = w => escapeRegex(w) + (/[\w$]$/.test(w) ? '(?![\\w$])' : '');
    if (exact.length) lists.push({ regex: re('(?:' + [...exact].sort((a, b) => b.length - a.length).map(word).join('|') + ')'), token });
  }
  start.push(...lists);
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, token } of prefixes) start.push({ regex: re(escapeRegex(prefix) + '[\\w$]*'), token });
  // Numbers: the pack's patterns ("numbers": a pattern, a list of them, or false for none), else 0x1F, 12, 1.5e3.
  const numbers = pack.numbers === false ? [] : pack.numbers == null || pack.numbers === true
    ? [{ regex: '(?:0x[\\da-f]+|\\d+\\.?\\d*(?:e[-+]?\\d+)?|\\.\\d+)(?![\\w$])', flags: 'i' }]
    : [].concat(pack.numbers).map(n => typeof n === 'string' ? { regex: n } : n);
  for (const n of numbers) if (n?.regex) start.push({ regex: re(n.regex, n.flags ?? flags), token: n.token ?? 'number' });
  start.push({ regex: /[\w$]+/, token: null });   // a word in none of the lists: type text (the editor's own text)
  return {
    start, ...states,
    meta: { lineComment: c.line, blockCommentStart: c.block?.[0], blockCommentEnd: c.block?.[1] },
  };
}

// Above this size the preview of a code file is not coloured (measured with SQL, two runs: 1 MB took 179 / 200
// ms, 4 MB 715 / 953 ms to colour; the editor colours only what is on screen and needs no limit).
const PREVIEW_COLOUR_LIMIT = 2 * 1024 * 1024;

// The preview of a code file: the editor's colouring (run mode), a block per line, so the outline, the
// scroll sync and long lines (executed/PLAN-long-lines.md) work as in markdown.
function codeHtml(text, mode) {
  const lines = [[]];
  CodeMirror.runMode(text, mode, (token, style) => {
    if (token === '\n') return lines.push([]);
    lines.at(-1).push(style ? `<span class="${style.replace(/\S+/g, 'cm-$&')}">${escapeHtml(token)}</span>` : escapeHtml(token));
  });
  return lines.map((parts, i) => `<div data-line="${i}">${parts.join('') || ' '}</div>`).join('');
}

// ---------- Token looks ----------
// One flow: every piece of text gets a token type (word list name, rule / comment / quote / number "token"; the
// rest is "text"), and every type gets its look from "tokens" and nowhere else. The plain text pack holds the
// looks of the usual types; a language adds types or changes looks. A look: theme (a theme colour), like
// (another type's look), color (a fixed colour), contrast (lightness points further from the background,
// negative: closer), bold, italic, underline, strikethrough; byTheme: { <theme name or base>: { changes } }.
// A type without a look looks like text. The look of "text" is the editor's own text.
const THEME_CODE_COLOURS = ['keyword', 'string', 'comment', 'number', 'title', 'attr'];
const themeVar = name => THEME_CODE_COLOURS.includes(name) ? `--hl-${name}` : '--' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const validColour = v => v != null && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,]+\))$/i.test(String(v).trim()) ? String(v).trim() : null;

// The looks of a language: plain text's, with the language's own on top, per type (a language that only adds
// italic to "keyword" keeps keyword's colour).
// In the order of the files (tokenOrder: the host's; the keys themselves arrive sorted): a token of two types gets
// the look of the type that comes later (a JSON key is string and property: property's look wins).
function tokenLooks(name) {
  const looks = {};
  const add = pack => {
    for (const type of new Set([...(pack?.tokenOrder ?? []), ...Object.keys(pack?.tokens ?? {})])) {
      const spec = pack.tokens?.[type];
      if (spec && typeof spec === 'object') looks[type] = { ...(looks[type] ?? {}), ...spec };
    }
  };
  add(packs.plaintext);
  if (name !== 'plaintext') add(packs[name]);
  return looks;
}

// The look of one type for one theme: { color, bold, italic, underline, strikethrough } (undefined: not set).
function resolveLook(looks, type, theme, seen = new Set()) {
  let spec = looks[type];
  if (!spec || typeof spec !== 'object' || seen.has(type)) return {};
  seen.add(type);
  // byTheme: the theme itself, then its bases (nearest first), then the mode (light / dark).
  const mode = typeof look !== 'undefined' ? look?.mode : undefined;
  const changes = spec.byTheme && theme && [...(theme.chain ?? [theme.id]), mode].map(k => spec.byTheme[k]).find(c => c);
  if (changes && typeof changes === 'object') spec = { ...spec, ...changes };
  const from = spec.like ? resolveLook(looks, String(spec.like), theme, seen) : {};
  let color = validColour(spec.color)
    ?? (typeof spec.theme === 'string' && /^[a-zA-Z]+$/.test(spec.theme) ? `var(${themeVar(spec.theme)})` : null) ?? from.color;
  const step = Math.max(-100, Math.min(100, Number(spec.contrast) || 0));
  if (color && step) color = `oklch(from ${color} calc(l + var(--contrast-dir) * ${step / 100}) c h)`;
  const pick = key => spec[key] ?? from[key];
  return { color, bold: pick('bold'), italic: pick('italic'), underline: pick('underline'), strikethrough: pick('strikethrough') };
}

function lookCss(l) {
  const css = [];
  if (l.color) css.push(`color: ${l.color}`);
  if (l.bold !== undefined) css.push(`font-weight: ${l.bold ? 700 : 400}`);
  if (l.italic !== undefined) css.push(`font-style: ${l.italic ? 'italic' : 'normal'}`);
  if (l.underline !== undefined || l.strikethrough !== undefined)
    css.push(`text-decoration: ${[l.underline && 'underline', l.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none'}`);
  return css.join('; ');
}

// The CSS of every code language's looks: in the editor for the app's theme, in the preview for the preview's.
// Markdown keeps its own editor colours (app.css).
function updatePackColours() {
  let style = document.getElementById('mm-pack-colours');
  if (!style) {
    style = document.createElement('style');
    style.id = 'mm-pack-colours';
    document.head.append(style);
  }
  const app = typeof look !== 'undefined' ? look?.app : null, preview = typeof look !== 'undefined' ? look?.preview ?? app : null;
  const rules = [], inner = [];
  for (const name of Object.keys(packs)) {
    if (name === 'markdown' || !/^[\w-]+$/.test(name)) continue;
    const looks = tokenLooks(name);
    // The same language inside another one (a block, a fence, lines you set): after the outer language's rules,
    // and more specific, so its own looks win.
    for (const [scope, theme] of [['.mm-editor-pane .CodeMirror', app], ['.mm-preview-pane', preview]])
      for (const type of Object.keys(looks)) {
        if (!/^[\w-]+$/.test(type)) continue;
        const css = lookCss(resolveLook(looks, type, theme));
        if (css) inner.push(type === 'text' ? `${scope} .cm-in-${name} { ${css} }` : `${scope} .cm-in-${name}.cm-${type} { ${css} }`);
      }
    for (const [scope, theme, textScope] of [
      [`.mm-editor-pane[data-lang="${name}"] .CodeMirror`, app, `.mm-editor-pane[data-lang="${name}"] .CodeMirror-lines`],
      [`.mm-code[data-lang="${name}"]`, preview, `.mm-code[data-lang="${name}"]`]]) {
      for (const type of Object.keys(looks)) {
        if (!/^[\w-]+$/.test(type)) continue;
        const css = lookCss(resolveLook(looks, type, theme));
        if (css) rules.push(type === 'text' ? `${textScope} { ${css} }` : `${scope} .cm-${type} { ${css} }`);
      }
    }
  }
  style.textContent = rules.concat(inner).join('\n');
}

// ---------- Outline ----------
// The entries of the outline: markdown's headings (built in), else the pack's patterns; null: no outline.
const hasOutline = doc => !!doc && (!doc.language || Array.isArray(packOf(doc)?.outline));

function outlineOf(doc) {
  if (!doc.language) return headingsOf(doc);
  const patterns = packOf(doc)?.outline;
  if (!Array.isArray(patterns)) return null;
  if (doc.outline && doc.outlineVersion === doc.version) return doc.outline;
  const compiled = patterns.map(p => { try { return { ...p, re: new RegExp(p.pattern, p.flags ?? '') }; } catch { return null; } }).filter(Boolean);
  const entries = [];
  docText(doc).split('\n').forEach((text, line) => {
    for (const p of compiled) {
      const m = p.re.exec(text);
      if (!m) continue;
      const level = typeof p.level === 'number' ? p.level : m[p.level]?.length ?? 1;
      entries.push({ level: Math.max(1, Math.min(6, level)), text: m[p.name ?? 1] ?? m[0].trim(), line });
      break;
    }
  });
  doc.outlineVersion = doc.version;
  return doc.outline = entries;
}

// ---------- How a file opens ----------
// Your setting for the language (settings window, General > Open in), else the pack's "open", else the editor.
function openMode(doc) {
  const name = languageOf(doc), mode = setting('openIn.' + name) || packs[name]?.open || 'edit';
  return ['edit', 'split', 'preview'].includes(mode) ? mode : 'edit';
}

// ---------- Choosing the language of a tab ----------
// From the bottom bar (the language) or F1. A choice for a file is kept by the host for that path; for a
// draft in the session.
async function setLanguage(doc, name) {
  const language = name === 'markdown' ? undefined : name;
  if (doc.language === language || !packs[name]) return;
  doc.language = language;
  doc.languageChosen = true;
  if (doc.path) host('setFileLanguage', { path: doc.path, language: name === languageFor(doc.path, docText(doc)) ? null : name });
  doc.outline = null;
  doc.headingsVersion = -1;
  for (const tab of tabsOf(doc)) tab.stale = true;
  await showAll();
  saveSession();
  updateStatus();
}

function showLanguageList() {
  const doc = activeDoc();
  if (!doc) return;
  const r = statusUi.lang.getBoundingClientRect();
  const fileItems = PACK_NAMES.map(name => ({
    label: packs[name].name, plain: true, key: name === languageOf(doc) ? 'current' : (packs[name].extensions ?? []).slice(0, 3).join(' '),
    run: () => setLanguage(doc, name),
  }));
  // With lines selected in the editor: a language for those lines (3.1.2), or the file's language again.
  const pane = panes[state.activePane], cm = pane.cm && pane.el.dataset.mode !== 'preview' ? pane.cm : null;
  const sel = cm?.somethingSelected() ? cm.listSelections()[0] : null;
  if (!sel) return openPopupMenu(fileItems, r.left, r.top);
  const start = sel.from(), end = sel.to();
  const from = start.line, to = end.ch === 0 && end.line > start.line ? end.line - 1 : end.line;   // a selection up to a line start ends before it
  const here = rangeLanguageAt(doc, from);
  openPopupMenu([
    { label: `For the selected lines (${from + 1}-${to + 1})`, plain: true, sub: [
      ...PACK_NAMES.map(name => ({ label: packs[name].name, plain: true, key: name === here ? 'current' : '', run: () => setLinesLanguage(doc, from, to, name) })),
      '-',
      { label: "The file's language again", plain: true, run: () => setLinesLanguage(doc, from, to, null) },
    ] },
    { label: 'For the whole file', plain: true, sub: fileItems },
  ], r.left, r.top);
}

// ---------- Action kinds of a pack (runLanguage in actions.js) ----------
// insert: a snippet, $0 where the cursor goes; following lines get the indentation of the cursor line.
function insertSnippet(cm, text) {
  const from = cm.getCursor('from'), indent = cm.getLine(from.line).match(/^\s*/)[0];
  const body = String(text).replace(/\n/g, '\n' + indent), at = body.indexOf('$0'), clean = body.replace('$0', '');
  cm.operation(() => {
    cm.replaceSelection(clean, 'start');
    cm.setCursor(cm.posFromIndex(cm.indexFromPos(from) + (at < 0 ? clean.length : at)));
  });
}

// wrap: before / after the selection (it stays selected), or the cursor between them.
function wrapSelection(cm, before = '', after = '') {
  cm.operation(() => {
    if (!cm.somethingSelected()) {
      const at = cm.getCursor();
      cm.replaceRange(before + after, at);
      return cm.setCursor(CodeMirror.Pos(at.line, at.ch + before.length));
    }
    const from = cm.getCursor('from'), text = cm.getSelection();
    cm.replaceSelection(before + text + after);
    const start = cm.indexFromPos(from) + before.length;
    cm.setSelection(cm.posFromIndex(start), cm.posFromIndex(start + text.length));
  });
}

// linePrefix: in front of every selected line, or taken away when they all have it.
function toggleLinePrefix(cm, prefix) {
  const from = cm.getCursor('from').line, to = cm.getCursor('to').line, lines = [];
  for (let l = from; l <= to; l++) lines.push(l);
  const all = lines.every(l => cm.getLine(l).startsWith(prefix));
  cm.operation(() => {
    for (const l of lines) {
      if (all) cm.replaceRange('', CodeMirror.Pos(l, 0), CodeMirror.Pos(l, prefix.length));
      else cm.replaceRange(prefix, CodeMirror.Pos(l, 0));
    }
  });
}
