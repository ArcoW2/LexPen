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
  languagesVersion++;
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
  // Word lists: a word ending in * stands for every word starting with it ('@@*'); those come first, the
  // longest first, so '@@*' wins over '@*'.
  const prefixes = [], lists = [];
  for (const [token, words] of Object.entries(pack.words ?? {})) {
    if (!Array.isArray(words) || !/^[\w-]+$/.test(token)) continue;
    const exact = words.map(String).filter(w => !w.endsWith('*'));
    for (const w of words.map(String).filter(w => w.endsWith('*') && w.length > 1)) prefixes.push({ prefix: w.slice(0, -1), token });
    if (exact.length) lists.push({ regex: re('(?:' + exact.map(escapeRegex).join('|') + ')(?![\\w$])'), token });
  }
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, token } of prefixes) start.push({ regex: re(escapeRegex(prefix) + '[\\w$]*'), token });
  start.push(...lists);
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
function tokenLooks(name) {
  const looks = { ...(packs.plaintext?.tokens ?? {}) };
  if (name !== 'plaintext')
    for (const [type, spec] of Object.entries(packs[name]?.tokens ?? {}))
      if (spec && typeof spec === 'object') looks[type] = { ...(looks[type] ?? {}), ...spec };
  return looks;
}

// The look of one type for one theme: { color, bold, italic, underline, strikethrough } (undefined: not set).
function resolveLook(looks, type, theme, seen = new Set()) {
  let spec = looks[type];
  if (!spec || typeof spec !== 'object' || seen.has(type)) return {};
  seen.add(type);
  const changes = spec.byTheme && theme && (spec.byTheme[theme.id] ?? spec.byTheme[theme.base]);
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
  const rules = [];
  for (const name of Object.keys(packs)) {
    if (name === 'markdown' || !/^[\w-]+$/.test(name)) continue;
    const looks = tokenLooks(name);
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
  style.textContent = rules.join('\n');
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
  openPopupMenu(PACK_NAMES.map(name => ({
    label: packs[name].name, plain: true, key: name === languageOf(doc) ? 'current' : (packs[name].extensions ?? []).slice(0, 3).join(' '),
    run: () => setLanguage(doc, name),
  })), r.left, r.top);
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
