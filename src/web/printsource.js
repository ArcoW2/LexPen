'use strict';
// Print (docs/plans/executed/PLAN-printing.md): what the Print window (print.js, PrintForm) prints, made here, where the
// text, its colouring, the markdown renderer and the highlights are. The window gets the views of the document (the
// text in lines, coloured; rendered markdown; a CSV as a table; a PDF by its path), each with its highlights marked and
// their notes after them, and the colours of every theme for its languages; how they are laid out, coloured and
// numbered is the window's. Loaded on the first print (File > Print..., the Folder pane's Print...).

// A highlight in a text to render: marks put into the text around it (characters of Unicode's private area, which a
// document does not use), found again in the rendered text's nodes and turned into its mark. Start: START, the note's
// number (0: no note), MID; end: END.
const PRINT_START = '\uE000', PRINT_MID = '\uE002', PRINT_END = '\uE001';

// File > Print... on the active document, its selection when it has one; the Folder pane's Print... on a file.
async function printDoc(doc, pane) {
  const cm = pane?.cm && pane.active?.doc === doc && pane.el.dataset.mode !== 'preview' ? pane.cm : null;
  const sel = cm && cm.somethingSelected() ? cm.listSelections()[0] : null;
  const lines = sel ? [Math.min(sel.anchor.line, sel.head.line), Math.max(sel.anchor.line, sel.head.line)] : null;
  // Printed from the editor: the text (coloured as there); from the preview: as rendered (split: the part with focus).
  const mode = pane?.active?.doc === doc ? pane.el.dataset.mode : null;
  const from = mode === 'edit' ? 'text' : mode === 'preview' ? 'rendered' : mode ? (pane.previewEl.contains(document.activeElement) ? 'rendered' : 'text') : null;
  await printOpen({ ...await printSource(doc, lines), from });
}

// The Print window (modal: the host answers when it closes), then the text's preview when it waits for that
// (printLater): the window shows the text meanwhile.
async function printOpen(source) {
  const later = printLater;
  printLater = null;
  const shown = host('print', { source });
  if (later) await host('printRendered', await later()).catch(() => null);
  await shown;
}
let printLater = null;

async function printPath(path) {
  const open = findDoc(path);
  if (open) return printDoc(open, panes.find(p => p.active?.doc === open));
  const got = await host('read', { path });
  const doc = got.kind ? { path, pdf: got.kind === 'pdf', text: '' } : { path, text: got.text, language: codeLang(path, got.text), ranges: [] };
  if (got.kind && got.kind !== 'pdf') return toast(`${nameOf(path)} cannot be printed.`, true);
  await printOpen(await printSource(doc, null));
}

// { title, path, date, kind, views: { text, rendered?, table? }, selection: views or null, notes: [{ n, note }],
// themes, pdf? }. `lines`: the selection's first and last line (whole lines), or null.
async function printSource(doc, lines) {
  const title = docName(doc) ?? 'Untitled', source = { title, path: doc.path ?? null, date: new Date().toLocaleDateString(),
    hlColour: colourCss(setting('previewHighlightColour'), 'highlight'), editorFont: setting('editorFont') || 'Consolas',
    appFont: setting('appFont') || 'Segoe UI' };
  if (doc.pdf) {
    const hls = doc.pdfHls?.loaded ? doc.pdfHls.list : (await host('highlightsGet', { path: doc.path }).catch(() => null))?.list?.filter(h => h.page) ?? [];
    const sorted = [...hls].sort((a, b) => a.page - b.page || a.from - b.from);
    let n = 0;
    const list = sorted.map(h => ({ page: h.page, from: h.from, to: h.to, n: h.note ? ++n : 0, note: h.note ?? '' }));
    return { ...source, kind: 'pdf', pdf: { path: doc.path, highlights: list }, notes: list.filter(h => h.n).map(h => ({ n: h.n, note: h.note })),
      themes: await printThemes([]) };
  }
  if (!window.CodeMirror?.runMode) await loadEditor();
  const text = docText(doc).replace(/\r\n?/g, '\n'), lang = doc.language ?? 'markdown';
  const hls = await printHighlights(doc, text);
  const kind = doc.language === 'csv' ? 'csv' : !doc.language ? 'markdown' : 'text';   // as the preview shows it
  const piece = (from, to) => ({ part: text.slice(from, to), mine: hls.filter(h => h.b > from && h.a < to).map(h => ({ ...h, a: Math.max(h.a, from) - from, b: Math.min(h.b, to) - from })) });
  const rendered = async (from, to) => {
    const { part, mine } = piece(from, to);
    printNotes = new Map(mine.filter(h => h.n).map(h => [h.n, h.note]));
    return kind === 'markdown' ? printRenderedHtml(part, doc, mine) : printCodePreviewHtml(part, doc, mine);
  };
  const build = async (from, to, firstLine) => {
    const { part, mine } = piece(from, to);
    const views = { text: printTextHtml(part, doc, mine, firstLine) };
    if (kind === 'markdown') views.rendered = await rendered(from, to);
    if (kind === 'csv') views.table = printTableHtml(part, doc, mine);
    return { views, notes: mine.filter(h => h.n).map(h => ({ n: h.n, note: h.note })) };
  };
  const starts = lines && lineStartsOf(text);
  const sel = lines && [starts[lines[0]] ?? 0, lines[1] + 1 < starts.length ? starts[lines[1] + 1] - 1 : text.length];
  const all = await build(0, text.length, 1);
  const selection = sel ? await build(sel[0], sel[1], lines[0] + 1) : null;
  // Any other text as its preview too (coloured by its language, without line numbers): made after the window opened
  // (printOpen), so a large file does not wait for it.
  if (kind === 'text') printLater = async () => ({ rendered: await rendered(0, text.length), selection: sel ? await rendered(sel[0], sel[1]) : null });
  const used = new Set([lang]);
  for (const html of [all.views.text, all.views.rendered ?? '']) for (const m of html.matchAll(/cm-in-([\w-]+)/g)) used.add(m[1]);
  return { ...source, kind, lang, views: all.views, notes: all.notes, selection, renderLater: kind === 'text', themes: await printThemes([...used]) };
}

// The document's highlights as offsets in its text, in order, numbered: { a, b, note, n } (n: its number when it has
// a note, else 0). An open document: as placed now; a file not open: as stored, where their text still is.
async function printHighlights(doc, text) {
  let list;
  if (doc.hls?.loaded) list = placedHls(doc).map(h => ({ r: hlRange(doc, h), note: h.note })).filter(h => h.r)
    .map(h => ({ a: hlOffset(text, h.r.from), b: hlOffset(text, h.r.to), note: h.note }));
  else {
    const got = await host('highlightsGet', { path: doc.path, draft: doc.draft }).catch(() => null);
    list = (got?.list ?? []).filter(h => h.from && h.state !== 'detached').map(h => {
      let a = hlOffset(text, h.from), b = hlOffset(text, h.to);
      if (h.text && text.slice(a, b) !== h.text) { a = text.indexOf(h.text); b = a + h.text.length; }
      return { a, b, note: h.note };
    }).filter(h => h.a >= 0 && h.b > h.a);
  }
  list.sort((x, y) => x.a - y.a);
  let n = 0;
  return list.map(h => ({ ...h, note: h.note ?? '', n: h.note ? ++n : 0 }));
}

// A highlight's end: its number and its note (the window places, moves or drops the note).
const printNoteHtml = h => h.n ? `<sup class="pp-mk">${h.n}</sup><span class="pp-note" data-n="${h.n}">${escapeHtml(h.note)}</span>` : '';

// The text in lines, each with its number, coloured as the editor colours it (whatever its size), the
// highlights marked per line and a note after its highlight's last piece.
function printTextHtml(text, doc, hls, firstLine) {
  const mode = editorMode(doc);   // coloured whatever its size (the preview's previewColourMaxSize is not for paper)
  const lines = [[]];
  let at = 0;
  CodeMirror.runMode(text, mode, (token, style) => {
    if (token === '\n') { lines.push([]); at++; return; }
    lines.at(-1).push({ a: at, b: at + token.length, s: token, cls: style ? style.replace(/\S+/g, 'cm-$&') : '' });
    at += token.length;
  });
  const out = [];
  let hi = 0;
  for (const [i, toks] of lines.entries()) {
    let html = '';
    for (const t of toks) {
      // The token in pieces at the highlights' edges: in a highlight or not.
      let p = t.a;
      while (p < t.b) {
        while (hi < hls.length && hls[hi].b <= p) hi++;
        const h = hls[hi] && hls[hi].a <= p ? hls[hi] : null;
        const end = Math.min(t.b, h ? h.b : hls[hi] ? Math.max(p + 1, Math.min(hls[hi].a, t.b)) : t.b);
        const piece = escapeHtml(t.s.slice(p - t.a, end - t.a));
        const span = t.cls ? `<span class="${t.cls}">${piece}</span>` : piece;
        html += h ? `<mark class="pp-hl">${span}</mark>` + (end === h.b ? printNoteHtml(h) : '') : span;
        p = end;
      }
    }
    out.push(`<div class="pp-line"><span class="pp-ln">${firstLine + i}</span><span class="pp-lt">${html || ' '}</span></div>`);
  }
  // A pre: paged.js keeps whitespace-only text (the indents) only there.
  return `<pre class="pp-text" data-lang="${escapeHtml(doc.language ?? 'markdown')}">${out.join('')}</pre>`;
}

// The text with the marks of its highlights in it (from its end, so the offsets stay right).
function printMarked(text, hls) {
  let out = text;
  for (const h of [...hls].sort((x, y) => y.a - x.a)) out = out.slice(0, h.a) + PRINT_START + h.n + PRINT_MID + out.slice(h.a, h.b) + PRINT_END + out.slice(h.b);
  return out;
}

// Markdown (or HTML) rendered as the preview renders it, with its formulas and diagrams, and the highlights marked.
async function printRenderedHtml(text, doc, hls) {
  const marked = printMarked(text, hls);
  const box = Object.assign(document.createElement('div'), { className: 'mm-preview' });
  box.style.cssText = 'position: fixed; left: -10000px; top: 0; width: 800px; visibility: hidden;';   // diagrams measure themselves
  const tpl = document.createElement('template');
  tpl.innerHTML = doc.ranges?.length ? renderMarkdownWithRanges(marked, doc) : md.render(withFrontMatter(marked));
  fixPreviewContent(tpl.content, doc);
  box.append(tpl.content);
  document.body.append(box);
  try {
    await renderMathAndDiagrams(box);
    printWrapMarks(box);
    return box.innerHTML;
  } finally { box.remove(); }
}

// A code or text file as the preview shows it: its text coloured by its language in one block, no line numbers, the
// highlights marked.
function printCodePreviewHtml(text, doc, hls) {
  const box = document.createElement('div');
  box.innerHTML = `<pre class="mm-code pp-codefile" data-lang="${escapeHtml(doc.language)}">${codeHtml(printMarked(text, hls), editorMode(doc))}</pre>`;
  printWrapMarks(box);
  return box.innerHTML;
}

// A CSV as its table: the header (when the definition has one) and the rows, the highlights marked in their cells.
function printTableHtml(text, doc, hls) {
  const def = doc.csvDef ?? csvDetect(text);
  const data = csvRead(printMarked(text, hls), def);
  const box = document.createElement('div');
  const cells = (fields, tag) => fields.map(f => `<${tag}>${escapeHtml(f.text)}</${tag}>`).join('');
  box.innerHTML = '<table class="pp-table">' + (data.names ? `<thead><tr>${cells(data.names.map(text => ({ text })), 'th')}</tr></thead>` : '') +
    `<tbody>${data.rows.map(r => `<tr>${cells(r.fields, 'td')}</tr>`).join('')}</tbody></table>`;
  printWrapMarks(box);
  return box.innerHTML;
}

// The marks found again in the rendered text: each run of text inside one becomes a <mark>, and its end gets the
// note's number and note. Marks that went into an attribute (a link's address) are taken out of it.
function printWrapMarks(root) {
  const marks = /[\uE000-\uE002]/;
  for (const el of root.querySelectorAll('*'))
    for (const a of [...el.attributes]) if (marks.test(a.value)) el.setAttribute(a.name, a.value.replace(/\uE000\d*\uE002|\uE001/g, ''));
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
  // A mark's start, number and middle may be in different text nodes (coloured code puts the number in a span of its
  // own): the number is read on until the middle, across nodes.
  let open = null, num = null;
  for (const node of nodes) {
    const s = node.data;
    if (!open && num === null && !marks.test(s)) continue;
    const frag = document.createDocumentFragment();
    let buf = '';
    const flush = () => {
      if (!buf) return;
      if (open) frag.append(Object.assign(document.createElement('mark'), { className: 'pp-hl', textContent: buf }));
      else frag.append(buf);
      buf = '';
    };
    for (let i = 0; i < s.length; i++) {
      if (num !== null) {
        if (s[i] === PRINT_MID) { open = { n: +num }; num = null; } else num += s[i];
      } else if (s[i] === PRINT_START) {
        flush();
        num = '';
      } else if (s[i] === PRINT_END) {
        flush();
        if (open?.n) {
          const t = document.createElement('template');
          t.innerHTML = printNoteHtml({ n: open.n, note: printNotes.get(open.n) ?? '' });
          frag.append(t.content);
        }
        open = null;
      } else buf += s[i];
    }
    flush();
    node.replaceWith(frag);
  }
}
// The notes by number while marks are turned into notes (printRenderedHtml, printTableHtml set it).
let printNotes = new Map();

// The colours to print with: the current editor's and preview's (as on screen), and every theme's own language
// colours for the languages used; the window asks the host for a theme's own colours (themeVars).
async function printThemes(langs) {
  const current = { text: look.editor ?? look.app, rendered: look.preview ?? look.app };
  const chainOf = id => { const chain = []; for (let t = look.themes.find(x => x.id === id); t && !chain.includes(t.id); t = look.themes.find(x => x.id === t.base)) chain.push(t.id); return chain; };
  const css = {};
  for (const t of look.themes) css[t.id] = printPackCss(langs, { id: t.id, chain: chainOf(t.id) });
  return {
    current: { text: { id: current.text.id, vars: current.text.vars, css: printPackCss(langs, current.text) },
      rendered: { id: current.rendered.id, vars: current.rendered.vars, css: printPackCss(langs, current.rendered) } },
    list: look.themes.map(t => ({ id: t.id, name: t.name })), css,
  };
}

// The looks of the languages used, for one theme, scoped to the print page's text (.pp-text) and its rendered code
// (.pp-rendered), as updatePackColours makes them for the editor and the preview.
function printPackCss(langs, theme) {
  const rules = [];
  for (const name of langs) {
    if (!packs[name] || name === 'markdown' || !/^[\w-]+$/.test(name)) continue;
    const looks = tokenLooks(name);
    for (const type of Object.keys(looks)) {
      if (!/^[\w-]+$/.test(type)) continue;
      const css = lookCss(resolveLook(looks, type, theme));
      if (!css) continue;
      rules.push(type === 'text' ? `.pp-text[data-lang="${name}"] .pp-lt { ${css} }` : `.pp-text[data-lang="${name}"] .cm-${type} { ${css} }`);
      rules.push(type === 'text' ? `.pp-rendered .cm-in-${name} { ${css} }` : `.pp-rendered .cm-in-${name}.cm-${type} { ${css} }`);
      rules.push(type === 'text' ? `.pp-rendered .mm-code[data-lang="${name}"] { ${css} }` : `.pp-rendered .mm-code[data-lang="${name}"] .cm-${type} { ${css} }`);
    }
  }
  return rules.join('\n');
}
