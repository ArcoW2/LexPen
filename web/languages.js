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

// A file type a language pack knows (its extension is in a pack's extensions): the folder pane shows it as normal,
// others dimmed or hidden (Known file types only).
const knownFile = path => !!packExtensions[path?.match(/(\.[^.\\/]+)$/)?.[1].toLowerCase()];

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

// Above the setting previewColourMaxSize (MB; 0: no limit) the preview of a code file is not coloured (measured with
// SQL, two runs: 1 MB took 179 / 200 ms, 4 MB 715 / 953 ms to colour; the editor colours only what is on screen and
// needs no limit).
const previewColoured = text => { const mb = setting('previewColourMaxSize') ?? 2; return !mb || text.length <= mb * 1024 * 1024; };

// The preview of a code file: the editor's colouring (run mode), a block per line, so the outline, the
// scroll sync and long lines (executed/PLAN-long-lines.md) work as in markdown. The lines in blocks of CODE_CHUNK
// (mm-chunk, docs/plans/executed/PLAN-large-preview.md 3.3): the browser lays out only the blocks in view, so a large file
// shows at once and a tab switch does not lay out the whole file again.
const CODE_CHUNK = 500;
function codeHtml(text, mode) {
  const lines = [[]];
  CodeMirror.runMode(text, mode, (token, style) => {
    if (token === '\n') return lines.push([]);
    lines.at(-1).push(style ? `<span class="${style.replace(/\S+/g, 'cm-$&')}">${escapeHtml(token)}</span>` : escapeHtml(token));
  });
  const html = [];
  for (let i = 0; i < lines.length; i++) {
    if (i % CODE_CHUNK === 0) html.push(i ? '</div><div class="mm-chunk">' : '<div class="mm-chunk">');
    html.push(`<div data-line="${i}">${lines[i].join('') || ' '}</div>`);
  }
  return html.join('') + '</div>';
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
  // byTheme: the theme itself, then its bases (nearest first), then the mode (light / dark). A key may be the old
  // id of a renamed theme (look.renamed: old -> new).
  const mode = typeof look !== 'undefined' ? look?.mode : undefined;
  const renamed = (typeof look !== 'undefined' ? look?.renamed : null) ?? {};
  const byTheme = k => spec.byTheme[k] ?? Object.keys(renamed).filter(old => renamed[old] === k).map(old => spec.byTheme[old]).find(c => c);
  const changes = spec.byTheme && theme && [...(theme.chain ?? [theme.id]), mode].map(byTheme).find(c => c);
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

// The CSS of every code language's looks: in the editor for the editor's theme, in the preview for the preview's.
// Markdown keeps its own editor colours (app.css).
function updatePackColours() {
  let style = document.getElementById('mm-pack-colours');
  if (!style) {
    style = document.createElement('style');
    style.id = 'mm-pack-colours';
    document.head.append(style);
  }
  const app = typeof look !== 'undefined' ? look?.app : null, preview = typeof look !== 'undefined' ? look?.preview ?? app : null;
  const editor = typeof look !== 'undefined' ? look?.editor ?? app : null;
  const rules = [], inner = [];
  for (const name of Object.keys(packs)) {
    if (name === 'markdown' || !/^[\w-]+$/.test(name)) continue;
    const looks = tokenLooks(name);
    // The same language inside another one (a block, a fence, lines you set): after the outer language's rules,
    // and more specific, so its own looks win.
    for (const [scope, theme] of [['.mm-editor-pane .CodeMirror', editor], ['.mm-preview-pane', preview]])
      for (const type of Object.keys(looks)) {
        if (!/^[\w-]+$/.test(type)) continue;
        const css = lookCss(resolveLook(looks, type, theme));
        if (css) inner.push(type === 'text' ? `${scope} .cm-in-${name} { ${css} }` : `${scope} .cm-in-${name}.cm-${type} { ${css} }`);
      }
    for (const [scope, theme, textScope] of [
      [`.mm-editor-pane[data-lang="${name}"] .CodeMirror`, editor, `.mm-editor-pane[data-lang="${name}"] .CodeMirror-lines`],
      [`.mm-code[data-lang="${name}"]`, preview, `.mm-code[data-lang="${name}"]`],
      [`.mm-cmp-text[data-lang="${name}"]`, app, `.mm-cmp-text[data-lang="${name}"]`]]) {   // the compare's line strip
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
// A pack's outline is a list of patterns (one list in line order) or of groups (docs/plans/executed/PLAN-outline-groups.md):
// { group, colour, patterns }, as UltraEdit's tag groups. A group's patterns are matched against the whole text
// (`^` / `$` at line starts and ends, a pattern may span lines); an entry belongs to the line its match starts on.
const hasOutline = doc => !!doc && (!doc.language || Array.isArray(packOf(doc)?.outline));
// The bullet colours of groups without a colour of their own, by their place.
const OUTLINE_COLOURS = ['#e5534b', '#57ab5a', '#539bf5', '#c69026', '#b083f0', '#39c5cf', '#e0823d', '#d65e9b'];
// An entry's text without the dashes or equals signs a comment line draws around it (// ------ Tables ------: Tables);
// a text of nothing else (a line of dashes) is no entry. The depth comes from the group's indent, not from dashes.
const outlineText = s => s.replace(/^[\s=-]+|[\s=-]+$/g, '');
const isOutlineText = s => /[\p{L}\p{N}]/u.test(s);

function outlineOf(doc) {
  if (!doc.language) return headingsOf(doc);
  const list = packOf(doc)?.outline;
  if (!Array.isArray(list)) return null;
  if (doc.outline && doc.outlineVersion === doc.version) return doc.outline;
  const text = docText(doc), entries = [];
  const grouped = list.some(g => g && Array.isArray(g.patterns));
  if (!grouped) {
    const compiled = list.map(p => { try { return { ...p, re: new RegExp(p.pattern, p.flags ?? '') }; } catch { return null; } }).filter(Boolean);
    text.split('\n').forEach((t, line) => {
      for (const p of compiled) {
        const m = p.re.exec(t);
        if (!m) continue;
        const level = typeof p.level === 'number' ? p.level : m[p.level]?.length ?? 1;
        const shown = outlineText(m[p.name ?? 1] ?? m[0].trim());
        if (!isOutlineText(shown)) continue;
        const ch = Math.max(0, m.index + Math.max(0, m[0].indexOf(shown)));   // where its text starts (a double-click)
        entries.push({ level: Math.max(1, Math.min(6, level)), text: shown, line, ch });
        break;
      }
    });
  } else {
    const starts = [0];                                   // where every line starts: index -> line
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    const lineAt = index => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; } return lo; };
    const step = tabStops(doc).indent;
    const width = s => s.replace(/\t/g, ' '.repeat(step)).length;
    const groups = list.filter(g => g && Array.isArray(g.patterns));
    groups.forEach((g, gi) => {
      // The group's depth: indent (1 when not set; "auto": worked out in the merged list, below).
      const base = Number.isInteger(g.indent) && g.indent >= 1 ? g.indent : 1;
      const found = new Map();                            // line -> entry: within a group the first pattern of a line wins
      for (const p of g.patterns) {
        let re;
        try { re = new RegExp(p.pattern, 'gm' + (p.flags ?? (p.case ? '' : 'i'))); } catch { continue; }
        // Line by line, unless the pattern spans lines (`span: true`: a C function's { on the next line); a \s
        // would otherwise run on into the next line.
        const matches = p.span ? text.matchAll(re) : text.split('\n').flatMap((t, l) =>
          [...t.matchAll(re)].map(m => Object.assign(m, { index: starts[l] + m.index })));
        for (const m of matches) {
          if (!m[0].length) continue;
          const lead = m[0].match(/^\s*/)[0].length;       // the line where the match itself starts
          const line = lineAt(m.index + Math.min(lead, m[0].length - 1));
          if (found.has(line)) continue;
          // The shown text: the named capture(s), else every capture that matched, joined (as UltraEdit).
          const names = p.name === undefined ? null : [].concat(p.name);
          const parts = names ? names.map(n => m[n]) : m.slice(1);
          const shown = outlineText(parts.filter(x => x !== undefined && x.trim()).map(x => x.trim()).join(' ') || m[0].trim().split('\n')[0]);
          if (!isOutlineText(shown)) continue;
          let level = typeof p.level === 'number' ? p.level : base;
          if (p.indent === 'line') {
            const own = text.slice(starts[line], text.indexOf('\n', starts[line]) < 0 ? undefined : text.indexOf('\n', starts[line]));
            level = base + Math.floor(width(own.match(/^[ \t]*/)[0]) / step);
          } else if (Number.isInteger(p.indent)) level = base + Math.floor(width(m[p.indent] ?? '') / step);
          const first = outlineText(parts.find(x => x !== undefined && outlineText(x)) ?? '');   // where its text starts (a double-click)
          const at = m.index + Math.max(0, m[0].indexOf(first)) - starts[line];
          found.set(line, { level: Math.max(1, Math.min(6, level)), text: shown, line, group: gi, ch: Math.max(0, at), extra: level - base });
        }
      }
      entries.push(...[...found.values()].sort((a, b) => a.line - b.line));
    });
    entries.groups = groups.map((g, gi) => ({ name: String(g.group ?? ''), colour: outlineColour(g.colour, gi) }));
    // indent: auto, in the merged list (all groups in line order): one deeper than the nearest entry above it from
    // another group that may be a parent; not one of its own group, nor of a group with parent: false (a TODO inside a
    // procedure: the regions after it stay under the procedure). Nothing above: depth 1. A pattern's own indent (line,
    // a capture) adds to it. The grouped view has no line order across groups: there it is the group's depth, 1.
    const auto = groups.map(g => g.indent === 'auto'), parent = groups.map(g => g.parent !== false);
    if (auto.some(Boolean)) {
      const last = new Map();   // group -> its last entry so far that may be a parent, with its place in the list
      [...entries].sort((a, b) => a.line - b.line).forEach((e, at) => {   // stable: within a line the groups' order
        if (auto[e.group]) {
          let above = null;
          for (const [gi, p] of last) if (gi !== e.group && (!above || p.at > above.at)) above = p;
          e.mergedLevel = Math.max(1, Math.min(6, (above ? above.entry.mergedLevel ?? above.entry.level : 0) + 1 + e.extra));
        }
        if (parent[e.group]) last.set(e.group, { entry: e, at });
      });
    }
  }
  doc.outlineVersion = doc.version;
  return doc.outline = entries;
}

// A group's colour: `#rrggbb`, a theme colour's name (accent), else one by its place.
const outlineColour = (c, i) => typeof c === 'string' && c ? (c.startsWith('#') ? c : `var(--${c})`) : OUTLINE_COLOURS[i % OUTLINE_COLOURS.length];

// ---------- How a file opens ----------
// Your setting for the language (settings window, General > Open in), else the pack's "open", else the editor. A code
// file larger than the setting previewMaxSize (MB; 0: no limit) opens in the editor only: its preview is often not
// what it was opened for (docs/plans/executed/PLAN-large-preview.md 3.6a). View in LexPen asks for the preview itself.
function openMode(doc) {
  const name = languageOf(doc), mode = setting('openIn.' + name) || packs[name]?.open || 'edit';
  const limit = (setting('previewMaxSize') || 0) * 1024 * 1024;
  if (doc.language && limit > 0 && docText(doc).length > limit) return 'edit';
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
