// The Print window (print.html; PrintForm hosts it, modal to its window), docs/plans/executed/PLAN-printing.md. At the left
// the pages as they will come out, laid out by paged.js from the document's view the window made (printsource.js) and
// a stylesheet made here from the options; at the right the options (Print) and the stored settings. What shows is
// what prints: Save as PDF prints this page to a file, Print to the printer (as page images with the printer's own
// settings when the set has them, PrintForm). Esc closes it, Ctrl+Enter prints.

const $ = s => document.querySelector(s);
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssString = s => '"' + String(s ?? '').replace(/["\\]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"';
const FILE_URL = 'https://file.lexpen.example/';

// ---------- Host bridge (as replace.js) ----------
const pending = new Map();
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  // A text's preview, made by the main window after this one opened (PrintForm.Rendered).
  if (e.data.event === 'rendered') {
    if (!pp.source) return;   // init has it
    pp.source.views.rendered = e.data.rendered;
    if (pp.source.selection) pp.source.selection.views.rendered = e.data.selection;
    if (viewOf() === 'rendered') schedule();
    return;
  }
  if (e.data.event) return;
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

// ---------- The options ----------
// A set of print settings, as stored (PrintStore). What to print (all, the selection, pages) is not part of it.
const DEFAULTS = {
  printer: null, devmode: null, paper: 'A4', paperW: 210, paperH: 297, landscape: false, copies: 1, duplex: 'one', colourPrint: true,
  view: null, margins: [15, 15, 15, 15], marginsEach: false, frame: false, frameWidth: 0.5, frameIntensity: 60,
  zoom: 'auto', zoomPercent: 100, textFont: '', textSize: 9, lineNumbers: 'all',
  bodyFont: '', bodySize: 11, codeFont: '', codeSize: 9,
  colours: 'current', syntax: true, highlights: 'shaded', hlColour: '', hlIntensity: 100, notes: 'end', notesWidth: 45, notesSize: 8,
  headLeft: '$F', headCenter: '', headRight: '', footLeft: '', footCenter: 'Page $P of $T', footRight: '', dateFormat: '', headEdge: 6, footEdge: 6,
};
const PAPERS = [{ name: 'A3', w: 297, h: 420 }, { name: 'A4', w: 210, h: 297 }, { name: 'A5', w: 148, h: 210 },
  { name: 'Letter', w: 215.9, h: 279.4 }, { name: 'Legal', w: 215.9, h: 355.6 }];

const pp = {
  source: null, values: {}, look: null, printers: { list: [], default: null }, info: null, opt: { ...DEFAULTS },
  what: 'all', ranges: '', stored: { list: [], last: null }, name: null, origin: null, changed: false,
  themeVars: new Map(), layoutId: 0, running: null, again: false, pages: 0, pdf: null, pdfPages: null, pdfLook: null, pdfImages: new Map(), lastTimer: 0,
};

// The view a document prints as: rendered markdown or its text, a CSV's table or its text; a PDF its pages.
// Today in a date format as Windows writes them (d M y: day, month, year; dd MM: two digits; ddd dddd MMM MMMM:
// the names, short and long; yy yyyy; text in quotes or a character after \ as it is, '' an apostrophe). Empty: the
// Windows short date.
const DATE_HELP = "d, dd: day; ddd, dddd: day name; M, MM: month; MMM, MMMM: month name; yy, yyyy: year; text in single quotes, or one character after a backslash, as it is; two single quotes: an apostrophe. Empty: as Windows writes the date";
function dateText(format, now = new Date()) {
  const name = opts => new Intl.DateTimeFormat(pp.culture || undefined, opts).format(now);
  const two = n => String(n).padStart(2, '0');
  const parts = { dddd: () => name({ weekday: 'long' }), ddd: () => name({ weekday: 'short' }), dd: () => two(now.getDate()), d: () => String(now.getDate()),
    MMMM: () => name({ month: 'long' }), MMM: () => name({ month: 'short' }), MM: () => two(now.getMonth() + 1), M: () => String(now.getMonth() + 1),
    yyyy: () => String(now.getFullYear()), yy: () => two(now.getFullYear() % 100) };
  // As Windows reads them: \x one character as it is, '' an apostrophe, 'text' as it is.
  return (format || pp.datePattern || 'd-M-yyyy').replace(/\\.|''|'[^']*'|dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy/g,
    t => t[0] === '\\' ? t[1] : t === "''" ? "'" : t[0] === "'" ? t.slice(1, -1) : parts[t]());
}

// The header's and footer's texts (left, middle, right): text as it is with codes in it, upper or lower case alike.
const HF_CODES = {
  f: 'the file name', a: 'the file with its path', p: 'the page', t: 'the number of pages (every page is laid out before printing)',
  d: 'the print date', m: 'the file date', $: 'a $',
};
const HF_HELP = Object.entries(HF_CODES).map(([c, what]) => `$${c.toUpperCase()} ${what}`).join(', ') + '; **bold**, *italic*, \\* an asterisk';
const HF_KEYS = ['headLeft', 'headCenter', 'headRight', 'footLeft', 'footCenter', 'footRight'];
const HF_BOXES = HF_KEYS.map((key, i) => [key, (i < 3 ? 'top' : 'bottom') + '-' + ['left', 'center', 'right'][i % 3]]);
// A text in its pieces: { text } as it is, { code } for a code ($ and a letter of HF_CODES; another $ is text).
function hfParts(text) {
  const parts = [];
  for (const m of String(text ?? '').matchAll(/\$(.?)|[^$]+/gs)) {
    const code = m[0][0] === '$' && m[1]?.toLowerCase();
    if (code && code in HF_CODES && code !== '$') parts.push({ code });
    else parts.push({ text: code === '$' ? '$' : m[0] });
  }
  return parts;
}
// What a code stands for (the page and the total are the page's own: sheetHtml, pageCss).
function hfValue(code) {
  const s = pp.source;
  return code === 'f' ? s.title : code === 'a' ? s.path ?? s.title : code === 'd' ? dateText(pp.opt.dateFormat)
    : code === 'm' ? (pp.fileDate ? dateText(pp.opt.dateFormat, pp.fileDate) : '') : '';
}
// A text as HTML: the codes filled in (page `n`; null: the page and the total as paged.js counts them, .pp-pg and
// .pp-pgs), then markdown's **bold** and *italic*; \* is an asterisk.
function hfHtml(key, n) {
  const star = t => escapeHtml(t).replace(/\*/g, '&#42;');
  const html = hfParts(pp.opt[key]).map(p => p.text != null ? escapeHtml(p.text).replace(/\\\*/g, '&#42;')
    : p.code === 'p' ? (n == null ? '<span class="pp-pg"></span>' : n)
    : p.code === 't' ? (n == null ? '<span class="pp-pgs"></span>' : '<span class="pp-total"></span>') : star(hfValue(p.code))).join('');
  return html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
}
// The total is in a header or footer: every page is laid out before any is printed.
const usesTotal = () => HF_KEYS.some(k => hfParts(pp.opt[k]).some(p => p.code === 't'));

// Settings stored before the header and footer had texts: their ticks as texts ("Page x of y", headPages, was the
// footer's; then the file name at the left, the page in the middle, the date at the right of each).
function upgraded(o) {
  if ('headPages' in o) { o.footPage = o.footTotal = o.headPages; delete o.headPages; }
  if (!('headName' in o) && !('footPage' in o)) return o;
  for (const w of ['head', 'foot']) {
    o[w + 'Left'] = o[w + 'Name'] ? '$F' : '';
    o[w + 'Center'] = o[w + 'Page'] ? 'Page $P' + (o[w + 'Total'] ? ' of $T' : '') : '';
    o[w + 'Right'] = o[w + 'Date'] ? '$D' : '';
    o.dateFormat ||= o[w + 'DateFormat'] ?? '';
    for (const k of ['Name', 'Page', 'Total', 'Date', 'DateFormat']) delete o[w + k];
  }
  return o;
}
// Line numbers: every line, every 10 lines, or off (a stored set from before: true or false).
const lineNumbers = () => pp.opt.lineNumbers === true ? 'all' : pp.opt.lineNumbers === false ? 'off' : pp.opt.lineNumbers;
// What is printed: as the editor shows it, or as the preview does (markdown rendered, a CSV as its table, other text
// coloured by its language without line numbers).
const views = () => pp.source.kind === 'markdown' ? [['rendered', 'Preview'], ['text', 'Editor']]
  : pp.source.kind === 'csv' ? [['table', 'Preview'], ['text', 'Editor']]
  : pp.source.renderLater || pp.source.views?.rendered != null ? [['text', 'Editor'], ['rendered', 'Preview']] : [];
const viewOf = () => pp.source.kind === 'pdf' ? 'pdf' : views().some(([v]) => v === pp.opt.view) ? pp.opt.view : views()[0]?.[0] ?? 'text';

// ---------- The Print tab ----------
const panel = $('.pp-print-panel');
const opt = (key, value) => pp.opt[key] === value ? ' selected' : '';
const num = (key, min, max, step = 1) => `<input type="number" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${pp.opt[key]}">`;
const check = (key, label, title = '') => `<label class="pp-check" title="${escapeHtml(title)}"><input type="checkbox" data-k="${key}"${pp.opt[key] ? ' checked' : ''}>${label}</label>`;
const text = (key, placeholder) => `<input type="text" class="pp-wide" data-k="${key}" value="${escapeHtml(pp.opt[key])}" placeholder="${escapeHtml(placeholder)}" spellcheck="false">`;
// A font, as the settings window's: the default (the app's font of that kind) first, then the installed fonts, the
// monospaced ones first for text and code; a sample beside it in the chosen font. A font that is not installed (in
// a stored set from another machine) is shown as it is.
function fontList(key, standard, monoFirst) {
  const now = pp.opt[key] ?? '', fonts = pp.fonts ?? [];
  const option = name => `<option value="${escapeHtml(name)}"${now === name ? ' selected' : ''}>${escapeHtml(name)}</option>`;
  const groups = (monoFirst ? [true, false] : [false, true]).map(mono =>
    `<optgroup label="${mono ? 'Monospaced' : 'Not monospaced'}">${fonts.filter(f => f.mono === mono).map(f => option(f.name)).join('')}</optgroup>`).join('');
  const missing = now && !fonts.some(f => f.name === now) ? option(now) : '';
  return `<span class="pp-sample" style="font-family: ${escapeHtml(cssString(now || standard))}, ${monoFirst ? 'monospace' : 'sans-serif'}">AaBb 0O 1lI</span>` +
    `<select data-k="${key}" title="${escapeHtml(now || `Default (${standard})`)}"><option value=""${now ? '' : ' selected'}>Default (${escapeHtml(standard)})</option>${missing}${groups}</select>`;
}
// The installed fonts, without those the page cannot use by name (as fontlist.js: some weight variants, as "Cascadia
// Code SemiLight", would fall back to another font).
function fontUsable(name) {
  const ctx = (fontUsable.canvas ??= document.createElement('canvas')).getContext('2d');
  const width = font => { ctx.font = font; return ctx.measureText('mmmmmmmmmmlli 0O1W').width; };
  const quoted = `"${name.replace(/["\\]/g, '')}"`;
  return ['monospace', 'serif'].some(base => width(`20px ${quoted}, ${base}`) !== width(`20px ${base}`));
}

function drawPanel() {
  const s = pp.source, o = pp.opt, info = pp.info, papers = info?.papers?.length ? info.papers : PAPERS;
  const printers = pp.printers.list.map(n => `<option value="${escapeHtml(n)}"${opt('printer', n)}>${escapeHtml(n)}</option>`).join('');
  const themes = (s.themes?.list ?? []).map(t => `<option value="theme:${escapeHtml(t.id)}"${opt('colours', 'theme:' + t.id)}>${escapeHtml(t.name)}</option>`).join('');
  const kind = viewOf();
  let html = '<h3>Printer &amp; paper</h3>' + (pp.printers.list.length
    ? `<div class="pp-row"><label>Printer</label><select data-k="printer">${printers}</select></div>
       <div class="pp-row"><span class="pp-label"></span><button type="button" data-do="printerDialog" title="The printer's own settings: paper bin, intensity, quality, ...; kept with these settings">Printer settings...</button></div>`
    : '<div class="pp-hint">No printer is installed: Save as PDF only.</div>');
  html += `<div class="pp-row"><label>Paper</label><select data-k="paper">${papers.map(p => `<option value="${escapeHtml(p.name)}"${opt('paper', p.name)}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
    <div class="pp-row"><label>Orientation</label><select data-k="landscape"><option value="false"${o.landscape ? '' : ' selected'}>Portrait</option><option value="true"${o.landscape ? ' selected' : ''}>Landscape</option></select></div>
    <div class="pp-row"><label>Copies</label>${num('copies', 1, 999)}</div>`;
  if (info?.duplex) html += `<div class="pp-row"><label>Two-sided</label><select data-k="duplex"><option value="one"${opt('duplex', 'one')}>One-sided</option>
    <option value="long"${opt('duplex', 'long')}>Two-sided, long edge</option><option value="short"${opt('duplex', 'short')}>Two-sided, short edge</option></select></div>`;
  if (info?.colour) html += `<div class="pp-row"><label>Printer colour</label><select data-k="colourPrint"><option value="true"${o.colourPrint ? ' selected' : ''}>Colour</option><option value="false"${o.colourPrint ? '' : ' selected'}>Monochrome (grey)</option></select></div>`;

  html += '<h3>What to print</h3>';
  if (views().length) html += `<div class="pp-row"><label>Source</label><select data-k="view">${views().map(([v, l]) => `<option value="${v}"${kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
  html += `<div class="pp-row"><label>Print</label><select data-w="what"><option value="all"${pp.what === 'all' ? ' selected' : ''}>The whole document</option>` +
    (s.selection ? `<option value="selection"${pp.what === 'selection' ? ' selected' : ''}>The selected lines</option>` : '') +
    `<option value="pages"${pp.what === 'pages' ? ' selected' : ''}>Pages</option></select></div>`;
  if (pp.what === 'pages') html += `<div class="pp-row"><label>Pages</label><input type="text" class="pp-wide" data-w="ranges" value="${escapeHtml(pp.ranges)}" placeholder="1-3, 5" spellcheck="false"></div>
    <div class="pp-hint">Or click the pages in the preview.</div>`;

  html += '<h3>Layout</h3>';
  const margin = i => `<input type="number" data-m="${i}" min="0" max="100" step="0.5" value="${o.margins[i]}">`;
  html += `<div class="pp-row"><label>Margins (mm)</label>${o.marginsEach ? '' : margin(0)}${check('marginsEach', 'Each side its own')}</div>`;
  if (o.marginsEach) html += `<div class="pp-sides">${['Top', 'Left', 'Right', 'Bottom'].map(l => `<span>${l}</span>`).join('')}${[0, 3, 1, 2].map(margin).join('')}</div>`;
  html += `<div class="pp-row"><label>Frame</label>${check('frame', 'A line around the text')}</div>`;
  if (o.frame) html += `<div class="pp-row"><label>Frame width (pt)</label>${num('frameWidth', 0.1, 5, 0.1)}</div>
    <div class="pp-row"><label>Intensity (%)</label>${num('frameIntensity', 5, 100, 5)}</div>`;
  // What the header and footer say, at the left, in the middle and at the right: text with codes (HF_CODES). The total
  // is known only when every page is laid out: printing some pages waits for that.
  const hf = key => `<input type="text" class="pp-hf" data-k="${key}" value="${escapeHtml(o[key])}" spellcheck="false" title="${escapeHtml(HF_HELP)}">`;
  for (const [w, label] of [['head', 'Header'], ['foot', 'Footer']]) html += `<div class="pp-row"><label>${label}</label>${hf(w + 'Left')}${hf(w + 'Center')}${hf(w + 'Right')}</div>`;
  html += `<div class="pp-row"><label>Date format</label><input type="text" class="pp-wide" data-k="dateFormat" value="${escapeHtml(o.dateFormat)}"` +
    ` placeholder="${escapeHtml(pp.datePattern)}" spellcheck="false" title="${DATE_HELP}"></div>
    <div class="pp-hint">${Object.entries(HF_CODES).map(([c, what]) => `<b>$${c.toUpperCase()}</b> ${escapeHtml(what.replace(/ \(.*\)/, ''))}`).join(', ')}.
    **<b>bold</b>**, *<i>italic</i>*.<br>With $T all pages are laid out before printing.</div>
    <div class="pp-row" title="The header's distance from the top of the paper, the footer's from the bottom (in the margins)"><label>From the edge (mm)</label>
    <span class="pp-hint">Header</span>${num('headEdge', 0, 50, 0.5)}<span class="pp-hint">Footer</span>${num('footEdge', 0, 50, 0.5)}</div>`;

  if (kind === 'text' || kind === 'table') html += `<h3>Text</h3><div class="pp-row"><label>Font</label>${fontList('textFont', s.editorFont, true)}</div>
    <div class="pp-row"><label>Size (pt)</label>${num('textSize', 4, 40, 0.5)}</div>` + (kind === 'text' ? `<div class="pp-row"><label>Line numbers</label><select data-k="lineNumbers">
    <option value="all"${lineNumbers() === 'all' ? ' selected' : ''}>Every line</option><option value="ten"${lineNumbers() === 'ten' ? ' selected' : ''}>Every 10 lines</option>
    <option value="off"${lineNumbers() === 'off' ? ' selected' : ''}>Off</option></select></div>` : '');
  // The preview of a code file is all code: only the code font and size.
  if (kind === 'rendered' && s.kind !== 'markdown') html += `<h3>Text</h3><div class="pp-row"><label>Font</label>${fontList('codeFont', s.editorFont, true)}</div>
    <div class="pp-row"><label>Size (pt)</label>${num('codeSize', 4, 40, 0.5)}</div>`;
  else if (kind === 'rendered') html += `<h3>Text</h3><div class="pp-row"><label>Font</label>${fontList('bodyFont', s.appFont, false)}</div>
    <div class="pp-row"><label>Size (pt)</label>${num('bodySize', 4, 40, 0.5)}</div>
    <div class="pp-row"><label>Code font</label>${fontList('codeFont', s.editorFont, true)}</div>
    <div class="pp-row"><label>Code size (pt)</label>${num('codeSize', 4, 40, 0.5)}</div>`;
  if (kind === 'pdf' || (kind === 'rendered' && s.kind === 'markdown')) html += `<div class="pp-row"><label>${kind === 'pdf' ? 'Pages' : 'Images'} at</label><select data-k="zoom">
    <option value="auto"${opt('zoom', 'auto')}>Auto (own size, smaller when needed)</option><option value="width"${opt('zoom', 'width')}>Fit to width</option>
    <option value="height"${opt('zoom', 'height')}>Fit to height</option><option value="page"${opt('zoom', 'page')}>Fit to page</option>
    <option value="percent"${opt('zoom', 'percent')}>Percentage</option></select>${o.zoom === 'percent' ? num('zoomPercent', 5, 400, 5) + '%' : ''}</div>`;

  html += `<h3>Colours</h3><div class="pp-row"><label>Colours</label><select data-k="colours"><option value="current"${opt('colours', 'current')}>The theme as on screen</option>
    ${themes}<option value="bw"${opt('colours', 'bw')}>Black and white</option><option value="grey"${opt('colours', 'grey')}>Greyscale</option></select></div>`;
  if (kind !== 'pdf' && kind !== 'table') html += `<div class="pp-row"><label>Text colour</label><select data-k="syntax">
    <option value="true"${o.syntax ? ' selected' : ''}>Language colouring</option><option value="false"${o.syntax ? '' : ' selected'}>Mono text colour</option></select></div>`;

  html += `<h3>Highlights and notes</h3><div class="pp-row"><label>Highlights</label><select data-k="highlights">
    <option value="off"${opt('highlights', 'off')}>Off</option><option value="shaded"${opt('highlights', 'shaded')}>Shaded</option>
    <option value="underline"${opt('highlights', 'underline')}>Underlined</option><option value="dotted"${opt('highlights', 'dotted')}>Dotted underline</option><option value="wavy"${opt('highlights', 'wavy')}>Wavy underline</option>
    <option value="box"${opt('highlights', 'box')}>In a box</option><option value="bold"${opt('highlights', 'bold')}>Bold</option></select></div>`;
  // Their colour: the highlight's of the colours chosen above, another theme colour, or a picked one; and its
  // intensity (as the app's highlightIntensity): 100 the colour, less towards the paper, more towards the text.
  if (o.highlights !== 'off' && o.highlights !== 'bold' && o.colours !== 'bw') html += `<div class="pp-row"><label>Colour</label><select data-k="hlColour">
    <option value=""${opt('hlColour', '')}>Highlight</option><option value="accent"${opt('hlColour', 'accent')}>Accent</option>
    <option value="find-current"${opt('hlColour', 'find-current')}>Found</option><option value="fg"${opt('hlColour', 'fg')}>Text</option>
    ${o.hlColour.startsWith('#') ? `<option value="${escapeHtml(o.hlColour)}" selected>Picked colour</option>` : ''}</select>
    <input type="color" data-k="hlColour" value="${resolvedHex(hlBase())}" title="Pick a colour"></div>
    <div class="pp-row"><label>Intensity (%)</label>${num('hlIntensity', 10, 200, 10)}</div>`;
  html += `<div class="pp-row"><label>Notes</label><select data-k="notes"><option value="off"${opt('notes', 'off')}>Off</option>
    <option value="left"${opt('notes', 'left')}>In the left margin</option><option value="right"${opt('notes', 'right')}>In the right margin</option>
    <option value="foot"${opt('notes', 'foot')}>At the bottom of the page</option><option value="end"${opt('notes', 'end')}>At the end</option></select></div>`;
  if (o.notes !== 'off') html += `<div class="pp-row"><label>Size (pt)</label>${num('notesSize', 5, 20, 0.5)}</div>`;
  if (o.notes === 'left' || o.notes === 'right') html += `<div class="pp-row"><label>Margin width (mm)</label>${num('notesWidth', 15, 120)}</div>`;
  if (!(s.notes?.length)) html += '<div class="pp-hint">This document has no notes.</div>';
  panel.innerHTML = html;
}

// An option changed: kept, the pages laid out again (a moment later while typing).
panel.addEventListener('change', e => setFrom(e.target));
panel.addEventListener('input', e => { if (e.target.matches('input[type=number], input[type=text]')) setFrom(e.target, true); });
async function setFrom(el, typing) {
  const o = pp.opt;
  if (el.dataset.w === 'what') { pp.what = el.value; drawPanel(); pickedPages(); return schedule(); }
  if (el.dataset.w === 'ranges') { pp.ranges = el.value; return pickedPages(); }
  if (el.dataset.m !== undefined) {
    const v = Math.max(0, Math.min(100, Number(el.value) || 0));
    if (o.marginsEach) o.margins[+el.dataset.m] = v; else o.margins = [v, v, v, v];
  } else {
    const k = el.dataset.k;
    if (!k) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (el.type === 'number' && !Number.isFinite(v)) return;
    if (v === 'true' || v === 'false') v = v === 'true';
    o[k] = v;
    if (k === 'printer') { o.devmode = null; await loadPrinter(); }   // printer settings belong to their printer
    if (k === 'paper') { const p = (pp.info?.papers?.length ? pp.info.papers : PAPERS).find(q => q.name === v); if (p) { o.paperW = p.w; o.paperH = p.h; } }
    if (k === 'marginsEach' && !v) o.margins = [o.margins[0], o.margins[0], o.margins[0], o.margins[0]];
  }
  changed();
  if (!typing && el.matches('select, input[type=checkbox], input[type=color]')) drawPanel();
  schedule(typing ? 400 : 0);
}

// The printer chosen: its papers and what it can; a paper it does not have becomes its own.
async function loadPrinter() {
  pp.info = pp.opt.printer ? await host('printerInfo', { name: pp.opt.printer }).catch(() => null) : null;
  const papers = pp.info?.papers?.length ? pp.info.papers : PAPERS;
  if (!papers.some(p => p.name === pp.opt.paper)) {
    const p = papers.find(q => q.name === pp.info?.paper) ?? papers.find(q => q.name === 'A4') ?? papers[0];
    Object.assign(pp.opt, { paper: p.name, paperW: p.w, paperH: p.h });
  }
}

// ---------- Stored settings (as the Sort panel's) ----------
function changed(on = true) {
  pp.changed = on;
  drawName();
  clearTimeout(pp.lastTimer);
  pp.lastTimer = setTimeout(() => host('printLast', { last: { settings: pp.opt, name: pp.name, origin: pp.origin, changed: pp.changed } }), 300);
}
function drawName() {
  const el = $('.pp-name');
  el.textContent = pp.name ? `Stored settings: ${pp.name}` : pp.origin ? `New from template ${pp.origin}` : 'Not stored';
  el.classList.toggle('pp-changed', !!(pp.changed && (pp.name || pp.origin)));
  $('[data-do=save]').disabled = !(pp.name && pp.changed);
  $('[data-do=revert]').disabled = !((pp.name || pp.origin) && pp.changed);
}
const storedNamed = name => pp.stored.list.find(s => s.name.toLowerCase() === name.toLowerCase());

// The list again; `keep`: the set of that name stays selected (where it went: a template comes first).
async function refreshStored(keep) {
  pp.stored = await host('printList');
  if (keep != null) pp.storedAt = Math.max(0, pp.stored.list.findIndex(x => x.name === keep));
  drawStored();
}
// As the Sort panel's stored sorts: a list (a click selects, a double-click or Enter uses it), each with a line of
// what it is, and Select (a template: Use as new) and Delete... under it.
function drawStored() {
  const list = pp.stored.list, box = $('.pp-stored');
  if (pp.storedAt == null || pp.storedAt >= list.length) pp.storedAt = Math.max(0, list.findIndex(s => s.name === (pp.name ?? pp.origin)));
  const templates = list.filter(s => s.template).length;
  const item = (s, i) => `<div class="pp-item${i === pp.storedAt ? ' pp-sel' : ''}" data-i="${i}" title="Right-click for more">` +
    `<b>${escapeHtml(s.name)}${s.template ? ' <span class="pp-dim">(template)</span>' : ''}</b><span class="pp-dim">${escapeHtml(storedDescription(s.settings))}</span></div>`;
  const items = list.map((s, i) => (i === templates && templates ? '<div class="pp-divider"></div>' : '') + item(s, i)).join('')
    || '<div class="pp-empty">No stored settings yet: Save as... stores these.</div>';
  const sel = list[pp.storedAt];
  box.innerHTML = `<div class="pp-list" tabindex="0">${items}</div>` +
    `<div class="pp-bar"><button type="button" data-do="selectStored"${sel ? '' : ' disabled'}>${sel?.template ? 'Use as new' : 'Select'}</button>` +
    `<button type="button" data-do="deleteStored"${sel ? '' : ' disabled'}>Delete...</button></div>`;
}
// A short line of what a stored set is: the paper, the printer, the colours.
function storedDescription(o) {
  const colours = o.colours === 'bw' ? 'black and white' : o.colours === 'grey' ? 'greyscale'
    : o.colours?.startsWith('theme:') ? (pp.source.themes.list.find(t => 'theme:' + t.id === o.colours)?.name ?? o.colours.slice(6)) : 'colours as on screen';
  return `${o.paper ?? DEFAULTS.paper} ${o.landscape ? 'landscape' : 'portrait'}, ${o.printer || 'the default printer'}, ${colours}`;
}
function storedAt(i) {
  pp.storedAt = Math.max(0, Math.min(pp.stored.list.length - 1, i));
  drawStored();
  $('.pp-list').focus();
}
async function useStored(s, edit) {
  pp.opt = upgraded({ ...DEFAULTS, ...s.settings, margins: [...(s.settings.margins ?? DEFAULTS.margins)] });
  if (s.template && !edit) { pp.name = null; pp.origin = s.name; } else { pp.name = s.name; pp.origin = null; }
  await checkPrinter();
  drawPanel();
  drawStored();
  changed(false);
  schedule();
  showTab('print');   // chosen: its settings shown
}
const selectedStored = () => pp.stored.list[pp.storedAt];
$('.pp-stored').addEventListener('click', e => { const i = e.target.closest('.pp-item')?.dataset.i; if (i != null) storedAt(+i); });
$('.pp-stored').addEventListener('dblclick', e => { const i = e.target.closest('.pp-item')?.dataset.i; if (i != null) useStored(pp.stored.list[i]); });
// Its right-click menu (also the menu key, Shift+F10), as a stored sort's.
function storedMenu(i, x, y) {
  storedAt(i);
  const s = pp.stored.list[i];
  menu(x, y, s.template
    ? [['Use as new', () => useStored(s)], '-', ['Rename...', () => renameStored(s)], ['Edit', () => useStored(s, true)], ['Unpin as template', () => pinStored(s, false)]]
    : [['Select', () => useStored(s)], '-', ['Rename...', () => renameStored(s)], ['Pin as template', () => pinStored(s, true)]]);
}
$('.pp-stored').addEventListener('contextmenu', e => {
  const el = e.target.closest('.pp-item');
  e.preventDefault();
  if (el) storedMenu(+el.dataset.i, e.clientX, e.clientY);
});
$('.pp-stored').addEventListener('keydown', e => {
  if (!e.target.closest('.pp-list') || !pp.stored.list.length) return;
  if (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey) {
    e.preventDefault();
    const r = $(`.pp-item[data-i="${pp.storedAt}"]`)?.getBoundingClientRect();
    return r && storedMenu(pp.storedAt, r.left + 16, r.bottom);
  }
  if (!['ArrowUp', 'ArrowDown', 'Enter', 'Delete'].includes(e.key) || e.ctrlKey) return;
  e.preventDefault();
  if (e.key === 'Enter') return useStored(selectedStored());
  if (e.key === 'Delete') return deleteStored(selectedStored());
  storedAt(pp.storedAt + (e.key === 'ArrowUp' ? -1 : 1));
});
async function renameStored(s) {
  const to = await ask('New name', s.name);
  if (!to || to === s.name) return;
  if (storedNamed(to) && storedNamed(to) !== s) return host('confirm', { text: `There are stored settings named "${to}" already.`, ok: 'OK' });
  await host('printRename', { from: s.name, to });
  if (pp.name === s.name) pp.name = to;
  if (pp.origin === s.name) pp.origin = to;
  await refreshStored(to);
  drawName();
}
async function pinStored(s, on) { await host('printTemplate', { name: s.name, on }); await refreshStored(s.name); }
async function deleteStored(s) {
  if (!await host('confirm', { text: `Delete the stored settings "${s.name}"?`, ok: 'Delete' })) return;
  await host('printDelete', { name: s.name });
  if (pp.name === s.name) pp.name = null;
  if (pp.origin === s.name) pp.origin = null;
  await refreshStored();
  changed(pp.changed);
}
async function save() {
  if (!pp.name) return saveAs();
  await host('printSave', { name: pp.name, settings: pp.opt });
  await refreshStored();
  changed(false);
}
async function saveAs() {
  const name = await ask('Store these settings as', pp.name ?? '');
  if (!name) return;
  const there = storedNamed(name);
  if (there?.template) return host('confirm', { text: `"${there.name}" is a template: change it with Edit (right-click it in Stored settings).`, ok: 'OK' });
  if (there && !await host('confirm', { text: `Stored settings "${there.name}" exist already. Overwrite them?`, ok: 'Overwrite' })) return;
  await host('printSave', { name, settings: pp.opt });
  pp.name = name;
  pp.origin = null;
  await refreshStored();
  changed(false);
}
async function revert() {
  const s = storedNamed(pp.name ?? pp.origin ?? '');
  if (s) await useStored(s, !!pp.name);
}
async function fresh() {
  pp.opt = { ...DEFAULTS, margins: [...DEFAULTS.margins] };
  pp.name = pp.origin = null;
  await checkPrinter();
  drawPanel();
  drawStored();
  changed(false);
  schedule();
}

// The set's printer when it is installed, else the default one (said so).
async function checkPrinter() {
  const list = pp.printers.list, want = pp.opt.printer;
  const warn = $('.pp-warn');
  if (want && !list.includes(want)) {
    pp.opt.printer = pp.printers.default ?? list[0] ?? null;
    pp.opt.devmode = null;
    showWarn(`The printer "${want}" is not installed: ${pp.opt.printer ? `"${pp.opt.printer}" is used.` : 'Save as PDF only.'}`);
  } else if (!want) pp.opt.printer = pp.printers.default ?? list[0] ?? null;
  else if (warn.dataset.kind === 'printer') showWarn('');
  await loadPrinter();
}

// ---------- Small menus and the name question ----------
function menu(x, y, items) {
  document.querySelector('.pp-menu')?.remove();
  const m = Object.assign(document.createElement('div'), { className: 'pp-menu' });
  for (const it of items) {
    if (it === '-') { m.append(document.createElement('hr')); continue; }
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: it[0] });
    b.onclick = () => { m.remove(); it[1](); };
    m.append(b);
  }
  document.body.append(m);
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 4) + 'px';
  m.style.top = Math.min(y, innerHeight - m.offsetHeight - 4) + 'px';
  m.querySelector('button')?.focus();
  const away = ev => { if (!m.contains(ev.target)) { m.remove(); removeEventListener('pointerdown', away, true); } };
  addEventListener('pointerdown', away, true);
  m.addEventListener('keydown', ev => {
    const list = [...m.querySelectorAll('button')], at = list.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); m.remove(); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); list[(at + 1) % list.length].focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); list[(at - 1 + list.length) % list.length].focus(); }
  });
}
function ask(label, value) {
  const d = $('.pp-ask'), input = $('.pp-ask-input');
  $('.pp-ask-label').textContent = label;
  input.value = value;
  d.showModal();
  input.select();
  return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? input.value.trim() : null), { once: true }));
}
function showWarn(textOf, kind = 'printer', button) {
  const warn = $('.pp-warn');
  warn.hidden = !textOf;
  warn.dataset.kind = kind;
  warn.textContent = textOf;
  if (button) warn.append(button);
}

// ---------- The pages ----------
const pagesEl = $('.pp-pages'), zoomEl = $('.pp-zoom'), scrollEl = $('.pp-scroll');
const paper = () => pp.opt.landscape ? [pp.opt.paperH, pp.opt.paperW] : [pp.opt.paperW, pp.opt.paperH];

// Laid out again with the options as they are then: a layout running now is stopped first (a long document takes
// minutes; its pages so far are dropped).
let scheduleTimer = 0;
function schedule(delay = 0) {
  clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    // A layout running is stopped at its next page (layout: paged.js's own stop() only pauses it) and starts again.
    if (pp.running) { pp.again = true; pp.layoutId++; return; }
    pp.running = layout().catch(e => { if (!pp.again && !pp.cut) $('.pp-count').textContent = 'The pages could not be laid out: ' + e.message; })
      .finally(() => { pp.running = null; if (pp.again) { pp.again = false; schedule(); } });
  }, delay);
}
// Laid out up to page `n` (it is done when the next one is begun, or the layout is): a layout still running is stopped
// there. True when it was cut short.
async function laidUpTo(n) {
  while (pp.running && sheets().length <= n && !pp.again) await new Promise(r => setTimeout(r, 50));
  if (!pp.running || pp.again) { await laidOut(); return false; }
  pp.cut = true;
  pp.layoutId++;
  await pp.running;
  pp.cut = false;
  $('.pp-count').textContent = `${sheets().length} pages so far`;
  return true;
}
const laidOut = async () => { while (pp.running || pp.again) await (pp.running ?? new Promise(r => setTimeout(r, 50))); };

let previewer = null;
const sheets = () => [...pagesEl.querySelectorAll('.pagedjs_page, .pp-sheet')];
async function layout() {
  $('.pp-count').textContent = 'Laying out pages...';
  await applyColours();
  if (viewOf() === 'pdf') return layoutPdf();
  if (viewOf() === 'text') return layoutText();
  if (viewOf() === 'rendered' && pp.source.views.rendered == null) { $('.pp-count').textContent = 'Making the preview...'; return; }   // laid out when it comes
  sheetStyle(null, null);   // the sheets' page rules are not paged.js's
  const html = await contentHtml();
  previewer?.polisher?.destroy?.();
  previewer?.chunker?.destroy?.();
  pagesEl.replaceChildren();
  // At its own size while paged.js measures: a zoom meanwhile (fit, on a scroll bar appearing) would break the pages.
  pp.laying = true;
  setScale(1);
  previewer = new PagedModule.Previewer();
  const id = ++pp.layoutId;
  previewer.chunker.hooks.afterPageLayout.register(() => { if (pp.layoutId !== id) throw new Error('stopped for a newer layout'); });
  // A table going on onto the next page gets its header row there too, before the page is filled (paged.js copies
  // only the table around the rows it continues with).
  previewer.chunker.hooks.renderNode.register((node, source) => {
    const table = node.nodeType === 1 && node.closest('table[data-split-from]');
    const whole = table && !table.querySelector(':scope > colgroup, :scope > thead') && source?.closest?.('table');
    if (!whole) return;
    // Its columns and its header row, as the table has them (the copies without paged.js's references).
    for (const part of [whole.querySelector(':scope > thead'), whole.querySelector(':scope > colgroup')].filter(Boolean)) {
      const copy = part.cloneNode(true);
      for (const el of [copy, ...copy.querySelectorAll('[data-ref]')]) el.removeAttribute('data-ref');
      table.prepend(copy);
    }
    table.classList.add('pp-continued');   // the ^ above it: it goes on from the page before
  });
  // A table that goes on onto the next page: the V under it.
  previewer.chunker.hooks.afterPageLayout.register((page, _, breakToken) => {
    const at = breakToken?.node, from = at && (at.nodeType === 1 ? at : at.parentElement)?.closest('table');
    const ref = from?.dataset.ref;
    if (!ref) return;
    const here = [...page.querySelectorAll('table')].find(t => t.dataset.ref === ref || t.dataset.splitFrom === ref);
    here?.classList.add('pp-continues');
  });
  // Their marks: a page's once the next one is begun (paged.js may still move rows off a page after it is laid out,
  // as when a note at its foot needs room), the last one's at the end.
  previewer.chunker.hooks.beforePageLayout.register(page => { if (page.element?.previousElementSibling) placeTableMarks(page.element.previousElementSibling); });
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let flow;
  const progress = setInterval(() => { $('.pp-count').textContent = `Laying out page ${pagesEl.querySelectorAll('.pagedjs_page').length + 1}...`; pickedPages(); }, 500);
  try { flow = await previewer.preview(tpl.content, [{ [new URL('print-pages.css', location.href).href]: pageCss() }], pagesEl); }
  finally { pp.laying = false; clearInterval(progress); }
  if (pp.again) return;   // stopped for a newer layout
  pp.pages = flow.total;
  // Once more now every page is final (a row split over two pages still changed after the next one was begun).
  for (const el of pagesEl.querySelectorAll('.pagedjs_page .pp-mark')) el.remove();
  for (const page of pagesEl.querySelectorAll('.pagedjs_page')) { delete page.dataset.marked; placeTableMarks(page); }
  placeSideNotes();
  laidOutNow();
}
function laidOutNow() {
  $('.pp-count').textContent = `${pp.pages} page${pp.pages === 1 ? '' : 's'}`;
  fit();
  pickedPages();
}

// A PDF: a sheet per page, laid out here (it is pages already; paged.js would take minutes for a long one): the
// paper, the margins, the header and footer and the frame as paged.js makes them for a text, the page in its room;
// then the notes at the end, on as many sheets as they need.
async function layoutPdf() {
  const o = pp.opt, s = pp.source;
  const boxes = await pdfHtml();
  sheetStyle(o.margins, pdfCss());
  previewer?.polisher?.destroy?.();
  previewer?.chunker?.destroy?.();
  previewer = null;
  setScale(1);
  pagesEl.innerHTML = `<div class="pp-sheets pp-doc pp-hl-${o.highlights}${o.colours === 'bw' ? ' pp-bw' : ''}">${boxes.map((b, i) => sheetHtml(b, i + 1)).join('')}</div>`;
  if (o.notes === 'end') addEndNotes(pagesEl.querySelector('.pp-sheets'), s.notes ?? []);
  pp.pages = sheets().length;
  for (const t of pagesEl.querySelectorAll('.pp-total')) t.textContent = pp.pages;
  placeSideNotes();
  watchPdfPages();
  laidOutNow();
}

// The sheets' own stylesheet (a PDF's, a text's): the paper, the margins `m` (top, right, bottom, left), the header
// and footer, the frame; `more` after it. Laid out by paged.js the document does without it.
function sheetStyle(m, more) {
  const o = pp.opt, s = pp.source, [w, h] = paper();
  let style = document.getElementById('pp-sheet-css');
  if (!style) { style = Object.assign(document.createElement('style'), { id: 'pp-sheet-css' }); document.head.append(style); }
  const font = `8pt ${cssString(s.appFont)}, sans-serif`;
  style.textContent = more == null ? '' : `
@page { size: ${w}mm ${h}mm; margin: 0; }
.pp-sheets { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.pp-sheet { position: relative; width: ${w}mm; height: ${h}mm; background: var(--bg, #fff); color: var(--fg, #000); overflow: hidden; break-after: page; }
.pp-sheet:last-child { break-after: auto; }
.pp-sheet-area { position: absolute; top: ${m[0]}mm; right: ${m[1]}mm; bottom: ${m[2]}mm; left: ${m[3]}mm; --pp-ch: ${h - m[0] - m[2]}mm;
  ${o.frame ? `outline: ${o.frameWidth}pt solid color-mix(in srgb, var(--fg, #000) ${o.frameIntensity}%, transparent); outline-offset: 1.5mm;` : ''} }
.pp-sheet-head, .pp-sheet-foot { position: absolute; left: ${m[3]}mm; right: ${m[1]}mm; display: flex; gap: 3mm; font: ${font}; color: var(--fg-dim, #666); }
.pp-sheet-head > span, .pp-sheet-foot > span { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.pp-sheet-head > span:empty, .pp-sheet-foot > span:empty { flex: 1 1 0; }
.pp-sheet-head > :first-child, .pp-sheet-foot > :first-child { text-align: left; }
.pp-sheet-head > :last-child, .pp-sheet-foot > :last-child { text-align: right; }
.pp-sheet-head { top: ${o.headEdge}mm; }
.pp-sheet-foot { bottom: ${o.footEdge}mm; }
.pp-sheet.pp-skip { display: none; }
.pp-sheet .pp-pdfpage { height: 100%; }
.pp-sheet-notes { font: ${o.notesSize}pt/1.4 ${cssString(s.appFont)}, sans-serif; }
.pp-sheet-notes ol { margin: 0; }
.pp-sheet-notes li::marker { color: var(--accent, #c00); font-weight: 700; }
${more}`;
}
// A sheet: its header, `body` in the area, its footer with page `n` of the total (filled in when it is known).
function sheetHtml(body, n) {
  const line = w => `<span>${hfHtml(w + 'Left', n)}</span><span>${hfHtml(w + 'Center', n)}</span><span>${hfHtml(w + 'Right', n)}</span>`;
  return `<div class="pp-sheet"><div class="pp-sheet-head">${line('head')}</div><div class="pp-sheet-area">${body}</div><div class="pp-sheet-foot">${line('foot')}</div></div>`;
}
// The notes at the end, after the sheets in `list`, on as many sheets as they need.
function addEndNotes(list, notes) {
  if (!notes.length) return;
  const newSheet = first => {
    list.insertAdjacentHTML('beforeend', sheetHtml(`<div class="pp-sheet-notes">${first ? '<h4>Notes</h4>' : ''}<ol></ol></div>`, list.children.length + 1));
    const area = list.lastElementChild.querySelector('.pp-sheet-area');
    return { area, ol: area.querySelector('ol') };
  };
  let at = newSheet(true);
  for (const n of notes) {
    const li = Object.assign(document.createElement('li'), { value: n.n, textContent: n.note });
    at.ol.append(li);
    if (at.area.scrollHeight > at.area.clientHeight && at.ol.children.length > 1) { at = newSheet(false); at.ol.append(li); }
  }
}

// A text in lines: its sheets laid out here, a sheet at a time, so the first shows at once and the rest follow
// (paged.js reads the whole document before its first page: seconds for a large file, again on every change). Each
// sheet takes the lines that fit, with their notes at its foot or beside them; a newer layout stops this one between
// sheets. A line taller than a sheet stays on its own (cut off at the bottom).
async function layoutText() {
  const o = pp.opt, s = pp.source, part = pp.what === 'selection' && s.selection ? s.selection : s, id = pp.layoutId;
  const m = [...o.margins], side = o.notes === 'left' || o.notes === 'right';
  if (side) m[o.notes === 'left' ? 3 : 1] += o.notesWidth + 4;
  sheetStyle(m, `${contentCss()}
.pp-sheet { contain: strict; }
.pp-sheet-area { display: flex; flex-direction: column; }
.pp-sheet-area > .pp-text { flex: none; }
.pp-sheet-fn { margin-top: auto; padding-top: 1.5mm; border-top: 0.5pt solid color-mix(in srgb, currentColor 40%, transparent); }
.pp-sheet-fn:empty { display: none; }
.pp-sheet-fn .pp-note { display: block; }`);
  previewer?.polisher?.destroy?.();
  previewer?.chunker?.destroy?.();
  previewer = null;
  // The lines' HTML, cut at the line starts: parsed a batch at a time as the sheets need them.
  const html = part.views.text, open = html.slice(0, html.indexOf('>') + 1), cut = html.slice(open.length, -'</pre>'.length).split('<div class="pp-line">');
  const lines = cut.filter(Boolean).map(l => '<div class="pp-line">' + l);
  pagesEl.innerHTML = `<div class="pp-sheets pp-doc pp-hl-${o.highlights} pp-notes-${o.notes}${lineNumbers() === 'off' ? ' pp-no-ln' : ''}${o.colours === 'bw' ? ' pp-bw' : ''}"></div>`;
  const list = pagesEl.firstElementChild;
  let next = 0, batch = [];
  const take = () => {
    if (!batch.length && next < lines.length) {
      const tpl = document.createElement('template');
      tpl.innerHTML = lines.slice(next, next += 400).join('');
      dressContent(tpl.content);
      batch = [...tpl.content.children];
    }
    return batch.shift();
  };
  let sheet = null, pre = null, fn = null, area = null, shown = false, yielded = performance.now();
  const picked = pp.what === 'pages' ? new Set(rangeNumbers(pp.ranges)) : new Set();
  const newSheet = () => {
    list.insertAdjacentHTML('beforeend', sheetHtml(`${open}</pre><div class="pp-sheet-fn"></div>`, list.children.length + 1));
    sheet = list.lastElementChild;
    sheet.classList.toggle('pp-picked', picked.has(list.children.length));   // the pages picked, marked as they come
    area = sheet.querySelector('.pp-sheet-area');
    pre = area.firstElementChild;
    fn = area.lastElementChild;
  };
  // A line on the sheet; its notes at the sheet's foot (they go along when the line goes to the next sheet).
  const put = line => {
    pre.append(line);
    if (o.notes === 'foot') fn.append(...(line.footNotes ??= [...line.querySelectorAll('.pp-note.pp-foot')]));
  };
  newSheet();
  for (let line = take(); line; line = take()) {
    put(line);
    if (area.scrollHeight > area.clientHeight + 1 && pre.children.length > 1) {
      line.remove();
      newSheet();
      put(line);
      if (!shown) { shown = true; fit(); }
      $('.pp-count').textContent = `Laying out page ${list.children.length}...`;
      if (performance.now() - yielded > 30) {
        await new Promise(r => setTimeout(r));
        if (pp.layoutId !== id) return;
        yielded = performance.now();
      }
    }
  }
  const notes = part.notes ?? s.notes ?? [];
  if (o.notes === 'end' && notes.length) {
    // Under the text when they fit there, else on sheets of their own.
    const end = Object.assign(document.createElement('div'), { className: 'pp-sheet-notes pp-endnotes' });
    end.innerHTML = `<h4>Notes</h4><ol>${notes.map(n => `<li value="${n.n}">${escapeHtml(n.note)}</li>`).join('')}</ol>`;
    pre.after(end);
    if (area.scrollHeight > area.clientHeight + 1) { end.remove(); addEndNotes(list, notes); }
  }
  pp.pages = sheets().length;
  for (const t of pagesEl.querySelectorAll('.pp-total')) t.textContent = pp.pages;
  placeSideNotes();
  laidOutNow();
}

// The document's view as HTML: its notes placed (or not), its highlights' look by class.
async function contentHtml() {
  const s = pp.source, o = pp.opt, kind = viewOf();
  const part = pp.what === 'selection' && s.selection ? s.selection : s;
  const notes = (part.notes ?? s.notes ?? []);
  let body;
  if (kind === 'pdf') body = await pdfHtml();
  else if (kind === 'rendered') body = `<article class="mm-preview pp-rendered">${part.views.rendered}</article>`;
  else if (kind === 'table') body = `<div class="pp-tablebox">${part.views.table}</div>`;
  else body = part.views.text;
  const tpl = document.createElement('template');
  tpl.innerHTML = `<div class="pp-doc pp-hl-${o.highlights} pp-notes-${o.notes}${lineNumbers() === 'off' ? ' pp-no-ln' : ''}${o.colours === 'bw' ? ' pp-bw' : ''}">${body}</div>`;
  const root = tpl.content.firstElementChild;
  if (kind !== 'pdf') dressContent(root);
  if (kind === 'rendered' || kind === 'table') { fitTables(root, kind === 'rendered' ? o.bodySize : o.textSize); tpl.content.append(root); }
  // The header's and footer's texts, first: paged.js takes them into each page's margin boxes (pageCss).
  root.insertAdjacentHTML('afterbegin', HF_BOXES.filter(([key]) => o[key]).map(([key, at]) => `<div class="pp-run-${at}">${hfHtml(key, null)}</div>`).join(''));
  if (o.notes === 'end' && notes.length)
    root.insertAdjacentHTML('beforeend', `<section class="pp-endnotes"><h4>Notes</h4><ol>${notes.map(n => `<li value="${n.n}">${escapeHtml(n.note)}</li>`).join('')}</ol></section>`);
  return tpl.innerHTML;
}

// Tables wider than the page's text: their text smaller, to half the font's size (`size`, pt) at the least; still too
// wide, the columns that do not fit are left out, and a line under the table says how many. Measured here at the
// text's width with the pages' stylesheet (`root` is moved into the page for it: the caller puts it back).
function fitTables(root, size) {
  const tables = [...root.querySelectorAll('table')];
  if (!tables.length) return;
  const o = pp.opt, [w] = paper(), m = [...o.margins];
  if (o.notes === 'left' || o.notes === 'right') m[o.notes === 'left' ? 3 : 1] += o.notesWidth + 4;
  const style = Object.assign(document.createElement('style'), { textContent: contentCss() });
  const box = Object.assign(document.createElement('div'), { className: 'pp-measure' });
  box.style.cssText = `position: fixed; left: -100000px; top: 0; width: ${w - m[1] - m[3]}mm; visibility: hidden;`;
  document.head.append(style);
  box.append(root);
  document.body.append(box);
  try {
    const room = box.getBoundingClientRect().width - 4;   // the collapsed borders' outer halves
    // A table's narrowest (its cells at their longest word): what it takes on a page, where it cannot wrap further.
    // On paged.js's pages a cell comes out up to a pixel wider than here: one per column more.
    const narrowest = table => { table.style.width = 'min-content'; const w = table.getBoundingClientRect().width; table.style.width = ''; return w + (table.rows[0]?.cells.length ?? 0); };
    const shrink = table => {
      for (let f = 0.95; f >= 0.5 - 1e-9 && narrowest(table) > room; f -= 0.05) table.style.fontSize = `${(size * Math.max(f, 0.5)).toFixed(2)}pt`;
      if (narrowest(table) <= room) return;
      // Still too wide at half the size: the columns from the first that does not fit are left out.
      const cells = [...(table.rows[0]?.cells ?? [])];
      table.style.width = 'min-content';
      const left = table.getBoundingClientRect().left;
      let fit = Math.max(1, cells.filter(c => c.getBoundingClientRect().right - left <= room).length);
      table.style.width = '';
      for (const row of table.rows) while (row.cells.length > fit) row.cells[fit].remove();
      // The rest lay out a little differently without them: one less while it is still too wide.
      while (fit > 1 && narrowest(table) > room) { fit--; for (const row of table.rows) row.cells[fit]?.remove(); }
      table.insertAdjacentHTML('afterend', `<p class="pp-cut">Table is too wide to fully render; the last ${cells.length - fit} of ${cells.length} columns are missing.</p>`);
    };
    // Its columns as wide as the whole table lays them out, fixed: a table over several pages has the same columns on
    // each (paged.js lays each page's part out on its own; the hook in layout() gives a part the columns).
    const fixColumns = table => {
      const row = [...table.rows].reduce((a, b) => (b.cells.length > (a?.cells.length ?? 0) ? b : a), null);
      if (!row) return;
      const widths = [...row.cells].map(c => Math.ceil(c.getBoundingClientRect().width));
      table.querySelector(':scope > colgroup')?.remove();
      table.insertAdjacentHTML('afterbegin', `<colgroup>${widths.map(w => `<col style="width: ${w}px">`).join('')}</colgroup>`);
      table.style.tableLayout = 'fixed';
      table.style.width = widths.reduce((a, b) => a + b, 0) + 'px';
    };
    for (const table of tables) {
      if (narrowest(table) > room) shrink(table);
      fixColumns(table);
    }
  } finally {
    box.remove();
    style.remove();
  }
}

// The view's HTML as the options say: the line numbers shown, the highlights marked or not, the notes beside the
// text, at the foot or left out (the end's are added after it), the markers with them.
function dressContent(root) {
  const o = pp.opt;
  // Every 10 lines, as the gutter: the number on every tenth line, a dash halfway, a small dot on the others.
  if (lineNumbers() === 'ten') for (const n of root.querySelectorAll('.pp-ln')) { const v = +n.textContent; if (v % 10) n.textContent = v % 5 ? '·' : '-'; }
  if (o.highlights === 'off') for (const m of root.querySelectorAll('mark.pp-hl')) m.replaceWith(...m.childNodes);
  for (const n of root.querySelectorAll('.pp-note')) {
    if (o.notes === 'off' || o.notes === 'end') { n.remove(); continue; }
    n.classList.add(o.notes === 'foot' ? 'pp-foot' : 'pp-sidenote');
    n.prepend(Object.assign(document.createElement('b'), { textContent: n.dataset.n + ' ' }));
  }
  if (o.notes === 'off') for (const m of root.querySelectorAll('.pp-mk')) m.remove();
}

// The stylesheet paged.js lays out with: the paper, its margins (and the notes' margin), the header and footer, the
// frame; then the content's (contentCss).
function pageCss() {
  const o = pp.opt, s = pp.source, [w, h] = paper(), m = [...o.margins], side = o.notesWidth + 4;
  const sideNotes = (o.notes === 'left' || o.notes === 'right') && viewOf() !== 'pdf';
  if (sideNotes) m[o.notes === 'left' ? 3 : 1] += side;
  const box = (where, content) => `@${where} { content: ${content}; font: 8pt ${cssString(s.appFont)}, sans-serif; color: var(--fg-dim, #666); }`;
  // A text in a margin box: its HTML (bold, italic) as a running element at the start of the content (contentHtml).
  const boxes = HF_BOXES.filter(([key]) => o[key]).map(([key, at]) => box(at, `element(pp-${at})`));
  return `
@page {
  size: ${w}mm ${h}mm; margin: ${m.map(v => v + 'mm').join(' ')};
  ${boxes.join(' ')}
  @footnote { border-top: 0.5pt solid color-mix(in srgb, currentColor 40%, transparent); padding-top: 1.5mm; margin-top: 2mm; }
}
.pagedjs_page { background: var(--bg, #fff); color: var(--fg, #000); --pp-ch: ${h - m[0] - m[2]}mm; }
/* The header and footer at their distance from the edge (paged.js centres them in the margin). */
.pagedjs_margin-top > div { align-items: flex-start !important; padding-top: ${o.headEdge}mm !important; box-sizing: border-box; }
.pagedjs_margin-bottom > div { align-items: flex-end !important; padding-bottom: ${o.footEdge}mm !important; box-sizing: border-box; }
${HF_BOXES.map(([, at]) => `.pp-run-${at} { position: running(pp-${at}); }`).join('\n')}
.pp-pg::after { content: counter(page); }
.pp-pgs::after { content: counter(pages); }
${o.frame ? `.pagedjs_area { outline: ${o.frameWidth}pt solid color-mix(in srgb, var(--fg, #000) ${o.frameIntensity}%, transparent); outline-offset: 1.5mm; }` : ''}
${contentCss()}`;
}
// The content's look on the pages (paged.js's and the sheets'): the fonts, the line numbers, the highlights, the notes,
// the colours.
function contentCss() {
  const o = pp.opt, s = pp.source, side = o.notesWidth + 4;
  const font = (f, rest = 'sans-serif') => `${cssString(f)}, ${rest}`;
  const hl = hlCss();
  const hlLook = {
    shaded: `background: color-mix(in srgb, ${hl} 55%, transparent);`,
    underline: `background: none; text-decoration: underline 1.5px ${hl}; text-underline-offset: 2px;`,
    dotted: `background: none; text-decoration: underline dotted 2px ${hl}; text-decoration-skip-ink: none; text-underline-offset: 2px;`,
    wavy: `background: none; text-decoration: underline wavy 1px ${hl}; text-decoration-skip-ink: none; text-underline-offset: 2px;`,
    box: `background: none; outline: 1px solid ${hl}; outline-offset: 0;`,
    bold: 'background: none; font-weight: 700;',
    off: 'background: none;',
  }[o.highlights] ?? '';
  const zoom = {
    auto: 'max-width: 100%; max-height: var(--pp-ch); width: auto; height: auto;',
    width: 'width: 100%; height: auto; max-height: var(--pp-ch); object-fit: contain;',
    height: 'height: calc(var(--pp-ch) - 4mm); width: auto; max-width: 100%; object-fit: contain;',
    page: 'width: 100%; height: calc(var(--pp-ch) - 4mm); object-fit: contain;',
    percent: `zoom: ${o.zoomPercent / 100}; max-width: 100%; max-height: var(--pp-ch);`,
  }[o.zoom];
  return `
.pp-doc { position: relative; }
.pp-text { position: relative; margin: 0; font: ${o.textSize}pt/1.3 ${font(o.textFont || s.editorFont, 'monospace')}; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: ${pp.values.tabSize || 4}; }
.pp-line { display: flex; }
.pp-ln { flex: none; min-width: ${String(9999).length}ch; padding-right: 1.5ch; text-align: right; color: var(--fg-dim, #888); }
.pp-no-ln .pp-ln { display: none; }.pp-lt { flex: 1; min-width: 0; }
.pp-rendered { position: relative; padding: 0 !important; zoom: 1 !important; font: ${o.bodySize}pt/1.5 ${font(o.bodyFont || s.appFont)}; color: var(--fg, #000); }
.pp-rendered pre, .pp-rendered code, .pp-rendered pre code, .pp-rendered pre.mm-code { font-family: ${font(o.codeFont || s.editorFont, 'monospace')}; font-size: ${o.codeSize}pt; }
.pp-rendered pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.pp-rendered img { ${zoom} }
/* A table as wide as its columns (the preview's scrolls inside a box: on paper that cuts it off); its cells' room
   grows and shrinks with its text (fitTables makes a wide one smaller). */
.pp-rendered table { display: table; width: auto; max-width: none; overflow: visible; }
.pp-rendered th, .pp-rendered td { padding: 0.4em 0.9em; overflow-wrap: normal; }   /* words whole: a table too wide is made smaller */
.pp-cut { font-style: italic; color: var(--fg-dim, #666); margin-top: 0.3em; }
/* A table over pages: a wide V under the part that goes on, a wide ^ above the part that continues it (placed by
   layout(): a table's own ::before / ::after are not drawn). */
.pp-mark { position: absolute; z-index: 1; width: 48px !important; height: 6px !important;   /* paged.js makes its page content's divs full height */
   background: var(--fg-dim, #888); -webkit-mask: center / 48px 6px no-repeat; mask: center / 48px 6px no-repeat; }
table.pp-continues { margin-bottom: 0 !important; }
table.pp-continued { margin-top: 0 !important; }
.pp-mark-down { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 6'%3E%3Cpath d='M1 1 24 5 47 1' fill='none' stroke='black' stroke-width='1.3'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 6'%3E%3Cpath d='M1 1 24 5 47 1' fill='none' stroke='black' stroke-width='1.3'/%3E%3C/svg%3E"); }
.pp-mark-up { -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 6'%3E%3Cpath d='M1 5 24 1 47 5' fill='none' stroke='black' stroke-width='1.3'/%3E%3C/svg%3E"); mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 6'%3E%3Cpath d='M1 5 24 1 47 5' fill='none' stroke='black' stroke-width='1.3'/%3E%3C/svg%3E"); }
.pp-tablebox table { border-collapse: collapse; font: ${o.textSize}pt/1.3 ${font(o.textFont || s.editorFont, 'monospace')}; }
.pp-tablebox th, .pp-tablebox td { border: 0.5pt solid color-mix(in srgb, currentColor 35%, transparent); padding: 0.5mm 1.5mm; text-align: left; vertical-align: top; }
mark.pp-hl { color: inherit; padding: 0; ${hlLook} }
${o.syntax ? '' : '.pp-text .pp-lt, .pp-text [class*="cm-"], .pp-rendered pre [class*="cm-"], .pp-rendered pre [class*="hljs-"] { color: inherit !important; }'}
.pp-mk { font-size: 65%; line-height: 0; vertical-align: super; font-weight: 700; color: var(--accent, #c00); padding-left: 1px; }
.pp-note { font: ${o.notesSize}pt/1.3 ${font(s.appFont)}; color: var(--fg, #000); white-space: normal; font-weight: normal; font-style: normal; text-decoration: none; }
.pp-note > b { color: var(--accent, #c00); }
.pp-note.pp-sidenote { position: absolute; width: ${o.notesWidth}mm; ${o.notes === 'left' ? `left: -${side}mm;` : `right: -${side}mm;`} text-align: left; }
.pp-note.pp-foot { float: footnote; footnote-display: block; border: 0 !important; padding: 0 !important; }   /* the area has the line */
.pp-note.pp-foot::footnote-call { content: none; }
.pp-note.pp-foot::footnote-marker { content: none; }
.pp-endnotes { margin-top: 6mm; border-top: 0.5pt solid color-mix(in srgb, currentColor 40%, transparent); font: ${o.notesSize}pt/1.4 ${font(s.appFont)}; }
.pp-endnotes h4 { margin: 2mm 0; }
.pp-endnotes li::marker { color: var(--accent, #c00); font-weight: 700; }
.pp-bw, .pp-bw * { color: #000 !important; border-color: #000 !important; }
.pp-bw :not(mark) { background: transparent !important; }
${pp.themeCss ?? ''}
${MARKDOWN_TEXT_CSS}`;
}

// A PDF's pages in their room (layoutPdf): the page as large as the zoom says, its notes beside or under it.
function pdfCss() {
  const o = pp.opt, s = pp.source, font = `${cssString(s.appFont)}, sans-serif`;
  // Its page in its box (the page's room less its notes): --pp-w is its own width.
  const pdfZoom = {
    auto: 'width: var(--pp-w); max-width: 100%; max-height: 100%; object-fit: contain;',
    width: 'width: 100%; max-height: 100%; object-fit: contain;',
    height: 'height: 100%; max-width: 100%; object-fit: contain;',
    page: 'width: 100%; height: 100%; object-fit: contain; object-position: top;',
    percent: `width: calc(var(--pp-w) * ${o.zoomPercent / 100}); max-width: 100%; max-height: 100%; object-fit: contain;`,
  }[o.zoom];
  return `.pp-pdfpage { height: calc(var(--pp-ch) - 1mm); display: flex; gap: 3mm; break-after: page; overflow: hidden; }
.pp-pdfpage:last-of-type { break-after: auto; }
.pp-pdfpage.pp-notes-left { flex-direction: row-reverse; }
.pp-pdfpage.pp-notes-foot { flex-direction: column; }
.pp-pdfimg { flex: 1; min-width: 0; min-height: 0; display: flex; justify-content: center; align-items: flex-start; }
.pp-pdfimg img { display: block; ${pdfZoom} }
.pp-bw .pp-pdfimg img { filter: grayscale(1); }
.pp-pdfnotes { flex: none; font: ${o.notesSize}pt/1.3 ${font}; position: relative; }
.pp-pdfpage:not(.pp-notes-foot) .pp-pdfnotes p { position: absolute; left: 0; right: 0; }
.pp-pdfpage:not(.pp-notes-foot) .pp-pdfnotes { width: ${o.notesWidth}mm; }
.pp-pdfnotes p { margin: 0 0 1.5mm; }
.pp-pdfnotes b { color: var(--accent, #c00); }`;
}

// Markdown printed as text: the editor's own colours (app.css, scoped to the editor there).
const MARKDOWN_TEXT_CSS = `
.pp-text[data-lang="markdown"] .cm-header { color: var(--accent); font-weight: 700; }
.pp-text[data-lang="markdown"] .cm-strong { font-weight: 700; }
.pp-text[data-lang="markdown"] .cm-em { font-style: italic; }
.pp-text[data-lang="markdown"] .cm-strikethrough { text-decoration: line-through; }
.pp-text[data-lang="markdown"] .cm-link { color: var(--hl-title); }
.pp-text[data-lang="markdown"] .cm-url { color: var(--hl-string); }
.pp-text[data-lang="markdown"] .cm-comment { color: var(--hl-attr); }
.pp-text[data-lang="markdown"] .cm-quote { color: var(--hl-comment); font-style: italic; }
.pp-text[data-lang="markdown"] .cm-hr { color: var(--fg-dim); }
.pp-text[data-lang="markdown"] .cm-tag, .pp-text[data-lang="markdown"] .cm-bracket { color: var(--hl-keyword); }
.pp-text[data-lang="markdown"] .cm-attribute { color: var(--hl-attr); }
.pp-text[data-lang="markdown"] .cm-string { color: var(--hl-string); }`;

// The marks of a page's tables that go on over pages, at their middle: a V under a part that goes on, a ^ above a part
// that continues one. In the page's box, not in its content: that is laid out in columns, and a mark below its bottom
// would go into a next column off the page. The table's margin on that side is none (CSS): its edge is where its rows
// end.
function placeTableMarks(page) {
  if (page.dataset.marked != null) return;
  page.dataset.marked = '';
  const box = page.querySelector('.pagedjs_pagebox');
  if (!box) return;
  for (const t of page.querySelectorAll('table.pp-continues, table.pp-continued')) {
    let left = t.offsetWidth / 2 - 24, top = 0;
    for (let el = t; el && el !== box; el = el.offsetParent) { left += el.offsetLeft; top += el.offsetTop; }
    const mark = (cls, y) => box.insertAdjacentHTML('beforeend', `<div class="pp-mark ${cls}" style="left: ${left}px; top: ${y}px"></div>`);
    if (t.classList.contains('pp-continued')) mark('pp-mark-up', top - 9);
    if (t.classList.contains('pp-continues')) mark('pp-mark-down', top + t.offsetHeight + 3);
  }
}

// Notes in a margin: each at the height of its line (a PDF's: of its highlight's last line on the page image); one that
// would cover the one above goes below it.
function placeSideNotes() {
  for (const box of pagesEl.querySelectorAll('.pp-pdfpage:not(.pp-notes-foot)')) {
    const img = box.querySelector('img'), notes = box.querySelector('.pp-pdfnotes');
    if (!img || !notes) continue;
    let below = 0;
    for (const p of notes.querySelectorAll('p')) {
      const top = Math.max(below, img.offsetTop + img.offsetHeight * Number(p.dataset.y) - notes.offsetTop);
      p.style.top = top + 'px';
      below = top + p.offsetHeight + 2;
    }
  }
  for (const page of pagesEl.querySelectorAll('.pagedjs_page, .pp-sheet')) {
    let bottom = -Infinity;
    for (const n of [...page.querySelectorAll('.pp-note.pp-sidenote')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
      const r = n.getBoundingClientRect();
      if (r.top < bottom + 2) n.style.transform = `translateY(${bottom + 2 - r.top}px)`;
      bottom = Math.max(bottom, r.top + r.height + Math.max(0, bottom + 2 - r.top));
    }
  }
}

// ---------- Colours ----------
// The document's colours on the pages: the theme as on screen (the editor's for text, the preview's for rendered),
// another theme, black and white, or greyscale; a dark page is said, with a way out.
async function applyColours() {
  const o = pp.opt, s = pp.source, kind = viewOf(), current = kind === 'rendered' ? s.themes.current.rendered : s.themes.current.text;
  let vars = current.vars, css = current.css;
  if (o.colours.startsWith('theme:')) {
    const id = o.colours.slice(6);
    if (!pp.themeVars.has(id)) pp.themeVars.set(id, await host('themeVars', { theme: id }).catch(() => null));
    vars = pp.themeVars.get(id) ?? vars;
    css = s.themes.css[id] ?? css;
  }
  if (o.colours === 'bw') vars = { ...vars, '--bg': '#ffffff', '--fg': '#000000', '--fg-dim': '#555555', '--accent': '#000000' };
  pp.themeCss = css;
  const style = pagesEl.style;
  for (const name of [...style].filter(n => n.startsWith('--'))) style.removeProperty(name);
  for (const [n, v] of Object.entries(vars ?? {})) style.setProperty(n, v);
  // Greyscale, or a printer printing in monochrome: the pages as they will come out.
  pagesEl.style.filter = o.colours === 'grey' || (pp.info?.colour && !o.colourPrint) ? 'grayscale(1)' : '';
  const pick = panel.querySelector('input[type=color][data-k=hlColour]');   // drawn before these colours were set
  if (pick) pick.value = resolvedHex(hlBase());
  const dark = o.colours !== 'bw' && luminance(vars?.['--bg']) < 0.35;
  if (dark) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Black and white' });
    b.onclick = () => { pp.opt.colours = 'bw'; changed(); drawPanel(); schedule(); };
    showWarn('A dark theme prints a dark page: a lot of ink.', 'dark', b);
  } else if ($('.pp-warn').dataset.kind === 'dark') showWarn('');
}
function luminance(colour) {
  const probe = document.createElement('span');
  probe.style.color = colour ?? '#fff';
  document.body.append(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
  probe.remove();
  const [r, g, b] = m.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------- A PDF ----------
// Each page an image, drawn with its highlights in the chosen look (a number at the end of each one with a note); its
// notes beside it, under it, or at the end. The boxes are laid out first (each page's size is known without drawing
// it); a page is drawn when it comes in view, at the preview's resolution, and all of them at the printer's before
// printing (printReady), so a long PDF opens at once.
const PREVIEW_SCALE = 150 / 72, PRINT_SCALE = 300 / 72;   // 150 and 300 dpi
let pdfjs = null;
async function loadPdfjs() {
  pdfjs ??= await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
  return pdfjs;
}
async function pdfHtml() {
  const s = pp.source, o = pp.opt;
  await loadPdfjs();
  const asset = p => new URL(p, location.href).href;
  pp.pdf ??= await pdfjs.getDocument({ url: FILE_URL + encodeURIComponent(s.pdf.path), isEvalSupported: false,
    cMapUrl: asset('vendor/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: asset('vendor/pdfjs/standard_fonts/'),
    wasmUrl: asset('vendor/pdfjs/wasm/'), iccUrl: asset('vendor/pdfjs/iccs/') }).promise;
  // The pages' sizes (the first page's for all: reading every page takes long in a long PDF; a page drawn gets its
  // own), and where each highlight's last line is (for its number and its note in a margin): once.
  if (!pp.pdfPages) {
    pp.pdfPages = [];
    const first = (await pp.pdf.getPage(1)).getViewport({ scale: 1 });
    for (let n = 1; n <= pp.pdf.numPages; n++) {
      const mine = (s.pdf.highlights ?? []).filter(h => h.page === n).map(h => ({ ...h, rects: [] }));
      if (!mine.length) { pp.pdfPages.push({ w: first.width * 96 / 72, ratio: first.height / first.width, hls: mine }); continue; }
      const page = await pp.pdf.getPage(n), base = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let at = 0;
      for (const it of content.items) {
        if (it.str === undefined) continue;
        const t = pdfjs.Util.transform(base.transform, it.transform), height = Math.hypot(t[2], t[3]);
        for (const h of mine) {
          const a = Math.max(h.from, at), b = Math.min(h.to, at + it.str.length);
          if (b > a && it.str.length) h.rects.push({ x: (t[4] + it.width * (a - at) / it.str.length) / base.width, y: (t[5] - height) / base.height,
            w: it.width * (b - a) / it.str.length / base.width, h: height * 1.15 / base.height });
        }
        at += it.str.length + (it.hasEOL ? 1 : 0);
      }
      pp.pdfPages.push({ w: base.width * 96 / 72, ratio: base.height / base.width, hls: mine });
    }
  }
  const look = o.highlights + '|' + resolvedColour(hlCss()) + '|' + o.colours + '|' + o.notes;
  if (pp.pdfLook !== look) {
    for (const p of pp.pdfImages.values()) URL.revokeObjectURL(p.url);
    pp.pdfImages.clear();
    pp.pdfLook = look;
  }
  const notesHere = o.notes === 'left' || o.notes === 'right' || o.notes === 'foot';
  return pp.pdfPages.map((p, i) => {
    const notes = p.hls.filter(h => h.n), drawn = pp.pdfImages.get(i + 1);
    const side = notesHere && notes.length ? `<div class="pp-pdfnotes">${notes.map(h => `<p data-y="${h.rects.at(-1)?.y ?? 0}"><b>${h.n}</b> ${escapeHtml(h.note)}</p>`).join('')}</div>` : '';
    return `<div class="pp-pdfpage pp-notes-${o.notes}" style="--pp-w: ${p.w}px"><div class="pp-pdfimg"><img data-page="${i + 1}" style="aspect-ratio: 1 / ${p.ratio}"${drawn ? ` src="${drawn.url}"` : ''} alt=""></div>${side}</div>`;
  });
}

// One page drawn at a scale, with its highlights; kept (a finer one replaces a coarser one).
async function pdfDraw(n, scale) {
  const had = pp.pdfImages.get(n);
  if (had && had.scale >= scale) return had.url;
  const o = pp.opt, page = await pp.pdf.getPage(n), viewport = page.getViewport({ scale }), info = pp.pdfPages[n - 1];
  if (Math.abs(info.ratio - viewport.height / viewport.width) > 0.001) {
    info.ratio = viewport.height / viewport.width;
    info.w = viewport.width / scale * 96 / 72;
    for (const img of pagesEl.querySelectorAll(`img[data-page="${n}"]`)) { img.style.aspectRatio = `1 / ${info.ratio}`; img.closest('.pp-pdfpage').style.setProperty('--pp-w', info.w + 'px'); }
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const colour = resolvedColour(hlCss());
  for (const h of pp.pdfPages[n - 1].hls) {
    const rects = h.rects.map(r => ({ x: r.x * canvas.width, y: r.y * canvas.height, w: r.w * canvas.width, h: r.h * canvas.height }));
    if (o.highlights !== 'off') drawPdfHighlight(ctx, rects, colour, o.highlights, scale);
    const last = rects.at(-1);
    if (h.n && last && o.notes !== 'off') {
      ctx.fillStyle = '#c00000';
      ctx.font = `bold ${Math.round(last.h * 0.55)}px sans-serif`;
      ctx.fillText(String(h.n), last.x + last.w + scale, last.y + last.h * 0.45);
    }
  }
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (had) URL.revokeObjectURL(had.url);
  const url = URL.createObjectURL(blob);
  pp.pdfImages.set(n, { url, scale });
  for (const img of pagesEl.querySelectorAll(`img[data-page="${n}"]`)) img.src = url;
  return url;
}

// The pages in view (and near it) drawn as they come, one at a time.
let pdfQueue = Promise.resolve(), pdfWatch = null;
function watchPdfPages() {
  pdfWatch?.disconnect();
  pdfWatch = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      const n = +e.target.dataset.page, look = pp.pdfLook;
      pdfQueue = pdfQueue.then(() => look === pp.pdfLook && !pp.pdfImages.has(n) ? pdfDraw(n, PREVIEW_SCALE) : null).catch(() => null);
    }
  }, { root: scrollEl, rootMargin: '100% 0px' });
  for (const img of pagesEl.querySelectorAll('img[data-page]')) pdfWatch.observe(img);
}

// Before printing: every page (or every page printed) at the printer's resolution, its image ready.
async function printReady() {
  if (viewOf() !== 'pdf') return;
  const imgs = [...pagesEl.querySelectorAll('.pp-sheet:not(.pp-skip) img[data-page]')];   // the pages printed
  for (const [i, img] of imgs.entries()) {
    $('.pp-count').textContent = `Drawing page ${i + 1} of ${imgs.length} for print...`;
    await pdfDraw(+img.dataset.page, PRINT_SCALE);
    await img.decode().catch(() => null);
  }
}

function drawPdfHighlight(ctx, rects, colour, look, scale) {
  ctx.save();
  for (const r of rects) {
    if (look === 'shaded' || look === 'bold') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = colour;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else if (look === 'underline') {
      ctx.fillStyle = colour;
      ctx.fillRect(r.x, r.y + r.h - scale, r.w, scale);
    } else if (look === 'dotted') {
      ctx.fillStyle = colour;
      for (let x = 0; x < r.w; x += scale * 2.5) ctx.fillRect(r.x + x, r.y + r.h - scale * 1.2, scale * 1.2, scale * 1.2);
    } else if (look === 'wavy') {
      ctx.strokeStyle = colour;
      ctx.lineWidth = scale * 0.7;
      ctx.beginPath();
      for (let x = 0; x <= r.w; x += scale) ctx.lineTo(r.x + x, r.y + r.h - scale + Math.sin(x / (1.5 * scale)) * scale);
      ctx.stroke();
    } else if (look === 'box') {
      ctx.strokeStyle = colour;
      ctx.lineWidth = scale * 0.7;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }
  ctx.restore();
}

// The highlights' colour: black and white a grey; else the one chosen (none: the app's preview highlight colour) in
// the colours chosen, at its intensity (towards the paper below 100, towards the text above).
function hlBase() {
  const c = pp.opt.hlColour;
  return pp.opt.colours === 'bw' ? '#9a9a9a' : c.startsWith('#') ? c : c ? `var(--${c})` : pp.source.hlColour || 'var(--highlight)';
}
function hlCss() {
  const base = hlBase(), p = Math.max(10, Math.min(200, pp.opt.hlIntensity || 100));
  return p === 100 ? base : p < 100 ? `color-mix(in srgb, ${base} ${p}%, var(--bg, #fff))` : `color-mix(in srgb, ${base} ${200 - p}%, var(--fg, #000))`;
}
// A colour as #rrggbb (for the colour picker).
function resolvedHex(css) {
  const m = resolvedColour(css).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const rgb = /^color\(srgb/.test(resolvedColour(css)) ? m.slice(0, 3).map(x => x * 255) : m.slice(0, 3);
  return '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
// A CSS colour (a var() of the theme too) as the browser resolves it on the pages.
function resolvedColour(css) {
  const probe = document.createElement('span');
  probe.style.color = css || 'var(--highlight)';
  pagesEl.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

// ---------- The preview's size, pages picked ----------
function fit() {
  const page = sheets()[0];
  if (!page || pp.laying) return;
  const how = $('.pp-fit').value, w = page.offsetWidth, h = page.offsetHeight;
  const room = { w: scrollEl.clientWidth - 40, h: scrollEl.clientHeight - 40 };
  setScale(how === '100' ? 1 : how === 'width' ? room.w / w : Math.min(room.w / w, room.h / h));
}
// The pages at a size: scaled (a transform: their text wraps as on paper; a CSS zoom would wrap it a little
// differently, rows would grow and the last one move off its page), in a box as large as they show for the scroll bars.
let scale = 1;
function setScale(s) {
  scale = s;
  pagesEl.style.transform = s === 1 ? '' : `scale(${s})`;
  sizeZoom();
}
function sizeZoom() {
  const scaled = scale !== 1;
  pagesEl.style.margin = scaled ? '0' : '0 auto';
  Object.assign(zoomEl.style, { minWidth: scaled ? '0' : '', margin: scaled ? '0 auto' : '',
    width: scaled ? pagesEl.offsetWidth * scale + 'px' : '', height: scaled ? pagesEl.offsetHeight * scale + 'px' : '' });
}
new ResizeObserver(sizeZoom).observe(pagesEl);
$('.pp-fit').addEventListener('change', fit);
new ResizeObserver(() => fit()).observe(scrollEl);

// The page range as numbers ("1-3, 5"); the pages in it marked in the preview.
function rangeNumbers(ranges) {
  const out = new Set();
  for (const part of ranges.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    for (let i = +m[1]; i <= +(m[2] ?? m[1]) && i <= 9999; i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}
function rangeText(numbers) {
  const parts = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    parts.push(j > i ? `${numbers[i]}-${numbers[j]}` : String(numbers[i]));
    i = j;
  }
  return parts.join(', ');
}
function pickedPages() {
  const picked = pp.what === 'pages' ? new Set(rangeNumbers(pp.ranges)) : new Set();
  sheets().forEach((p, i) => p.classList.toggle('pp-picked', picked.has(i + 1)));
}
pagesEl.addEventListener('click', e => {
  const page = e.target.closest('.pagedjs_page, .pp-sheet');
  if (!page || pp.what !== 'pages') return;
  const n = sheets().indexOf(page) + 1, set = new Set(rangeNumbers(pp.ranges));
  if (set.has(n)) set.delete(n); else set.add(n);
  pp.ranges = rangeText([...set].sort((a, b) => a - b));
  const input = panel.querySelector('[data-w=ranges]');
  if (input) input.value = pp.ranges;
  pickedPages();
});

// ---------- Print, Save as PDF ----------
const printOptions = () => ({ paper: pp.opt.paper, landscape: pp.opt.landscape, copies: pp.opt.copies, duplex: pp.opt.duplex, colour: pp.opt.colourPrint });
const pageArgs = () => { const [width, height] = paper(); return { width, height, ranges: pp.printing ?? (pp.what === 'pages' ? rangeNumbers(pp.ranges).join(',') : '') }; };
let busy = false;
async function act(what) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('.pp-foot button')];
  buttons.forEach(b => b.dataset.was = b.disabled);
  buttons.forEach(b => b.disabled = true);
  const wanted = pp.what === 'pages' ? rangeNumbers(pp.ranges) : null;
  let cut = false;
  try {
    if (wanted && !wanted.length) throw new Error('No pages chosen: type them (1-3, 5) or click them in the preview.');
    // Some pages, without the total in the header or footer: the layout stops after the last of them.
    if (wanted && !usesTotal()) cut = await laidUpTo(Math.max(...wanted));
    else await laidOut();
    // The sheets made here (text, PDF) not wanted are left out: printing does not go through them all.
    const own = wanted && !pagesEl.querySelector('.pagedjs_page');
    if (own) sheets().forEach((p, i) => p.classList.toggle('pp-skip', !wanted.includes(i + 1)));
    pp.printing = own ? '' : null;   // pageArgs: no ranges, the others are not there
    await printReady();
    if (what === 'pdf') {
      const name = pp.source.title.replace(/\.[^.]*$/, '') + '.pdf';
      if (!await host('savePdf', { name, ...pageArgs() })) return;
    } else if (pp.opt.devmode) {
      // The printer's own settings: the pages as images, printed with them.
      $('.pp-count').textContent = 'Preparing the pages...';
      const url = await host('tempPdf', pageArgs());
      const doc = await (await loadPdfjs()).getDocument({ url, isEvalSupported: false }).promise;
      for (let n = 1; n <= doc.numPages; n++) {
        $('.pp-count').textContent = `Preparing page ${n} of ${doc.numPages}...`;
        const page = await doc.getPage(n), viewport = page.getViewport({ scale: PRINT_SCALE });
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const data = canvas.toDataURL('image/png').split(',')[1];
        await host('pageImage', { n, data });
      }
      $('.pp-count').textContent = 'Printing...';
      await host('printImages', { printer: pp.opt.printer, devmode: pp.opt.devmode, options: printOptions() });
    } else {
      if (!pp.opt.printer) throw new Error('No printer is installed.');
      $('.pp-count').textContent = 'Printing...';
      await host('print', { ...pageArgs(), printer: pp.opt.printer, options: printOptions() });
    }
    await host('close');
  } catch (e) {
    $('.pp-count').textContent = `${pp.pages} page${pp.pages === 1 ? '' : 's'}`;
    await host('confirm', { text: e.message, ok: 'OK' });
  } finally {
    // Not printed after all (cancelled, failed): every page back, and a layout cut short laid out again.
    pp.printing = null;
    for (const p of pagesEl.querySelectorAll('.pp-skip')) p.classList.remove('pp-skip');
    if (cut) schedule();
    busy = false;
    buttons.forEach(b => b.disabled = b.dataset.was === 'true');
    drawName();
  }
}

// The printer's own dialog: what is set there comes back into the options; its DEVMODE is kept with them.
async function printerDialog() {
  if (!pp.opt.printer) return;
  const got = await host('printerDialog', { printer: pp.opt.printer, devmode: pp.opt.devmode, options: printOptions() });
  if (!got) return;
  const o = pp.opt, b = got.options;
  o.devmode = got.devmode;
  o.landscape = b.landscape;
  o.copies = b.copies;
  o.duplex = b.duplex;
  o.colourPrint = b.colour;
  const p = (pp.info?.papers ?? []).find(q => q.name === b.paper);
  if (p) Object.assign(o, { paper: p.name, paperW: p.w, paperH: p.h });
  changed();
  drawPanel();
  schedule();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-do]');
  if (b && !b.disabled) ({ print: () => act('print'), pdf: () => act('pdf'), cancel: () => host('close'), save, saveAs, revert, new: fresh, printerDialog,
    selectStored: () => useStored(selectedStored()), deleteStored: () => deleteStored(selectedStored()) })[b.dataset.do]?.();
  const tab = e.target.closest('[data-tab]');
  if (tab) showTab(tab.dataset.tab);
});
function showTab(name) {
  for (const t of document.querySelectorAll('[data-tab]')) t.classList.toggle('pp-on', t.dataset.tab === name);
  $('.pp-print-panel').hidden = name !== 'print';
  $('.pp-stored-panel').hidden = name !== 'stored';
  $('.pp-manage').hidden = name !== 'print';   // Save, Save as..., Revert, New: the Print tab's
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('.pp-ask').open && !document.querySelector('.pp-menu')) { e.preventDefault(); host('close'); }
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); act('print'); }
});

// ---------- Start ----------
function applyLook(look, values) {
  const root = document.documentElement;
  root.dataset.theme = look.mode;
  for (const [name, value] of Object.entries(look.app.vars)) root.style.setProperty(name, value);
  root.style.setProperty('--app-font', values.appFont ? `"${values.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.style.setProperty('--ui-scale', values.appSize ? values.appSize * 96 / 72 / 13 : 1);
}

const init = await host('init');
pp.source = init.source;
pp.values = init.settings ?? {};
pp.look = init.look;
pp.printers = init.printers;
pp.stored = init.stored;
pp.datePattern = init.datePattern;
pp.fileDate = init.fileDate ? new Date(init.fileDate) : null;
pp.culture = init.culture;
applyLook(init.look, pp.values);
document.title = `Print ${pp.source.title} - LexPen`;
const last = init.stored.last;
if (last?.settings) {
  pp.opt = upgraded({ ...DEFAULTS, ...last.settings, margins: [...(last.settings.margins ?? DEFAULTS.margins)] });
  pp.name = last.name && storedNamed(last.name) ? last.name : null;
  pp.origin = last.origin && storedNamed(last.origin) ? last.origin : null;
  pp.changed = !!last.changed;
}
if (pp.source.selection) pp.what = 'selection';
// As the document showed where Print was chosen: the editor's text, or the preview's rendering (a CSV: its table).
if (pp.source.from && views().length) pp.opt.view = pp.source.from === 'text' ? 'text' : views()[0][0];
await checkPrinter();
drawPanel();
drawStored();
drawName();
schedule();
$('.pp-scroll').focus();
// The font lists after the rest: checking which fonts the page can use takes a moment.
// The host builds them meanwhile (null until then): asked again a little later, the pages are not kept waiting.
(async () => {
  let fonts;
  while (!(fonts = await host('fonts').catch(() => []))) await new Promise(r => setTimeout(r, 500));
  pp.fonts = fonts.filter(f => fontUsable(f.name));
  drawPanel();
})();
