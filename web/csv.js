'use strict';
// CSV as columns (docs/plans/29-PLAN-csv-columns.md): reading a CSV by a definition, detecting a definition, a value
// shown in its column's format, and the definition as CSV on the Web (CSVW) metadata. No page here: the page, a
// worker and the tests (Jint, tests/LexPen.Tests/CsvTests.cs) load this file alike.
//
// A definition: { delimiter, quote, quoteEnd, escape ('double', 'char' or 'none'), escapeChar, skip (lines before the
// data, the header line included), header (which of those lines holds the names, 1-based; 0: none), trim,
// columns: [{ name, type ('text', 'integer', 'decimal', 'date', 'boolean', 'auto'), quote, quoteEnd, decimal, group,
// pattern (a date as written in the file), format (as shown), align ('left', 'right'), trim, hidden, width, order }] }.

const CSV_TYPES = ['text', 'integer', 'decimal', 'date', 'boolean', 'auto'];
const CSV_DELIMITERS = [',', ';', '\t', '|'];

function csvDefinition(over = {}) {
  return { delimiter: ',', quote: '"', quoteEnd: '"', escape: 'double', escapeChar: '\\', skip: 1, header: 1, trim: false, columns: [], ...over };
}

// ---------- Reading ----------
// The line breaks: CRLF, LF and CR.
function csvLineEnd(text, at) {
  const c = text.charCodeAt(at);
  return c === 13 ? (text.charCodeAt(at + 1) === 10 ? 2 : 1) : c === 10 ? 1 : 0;
}

// Where the line after the one `at` is in starts (the text's length at the end).
function csvNextLine(text, at) {
  for (let i = at; i < text.length; i++) { const n = csvLineEnd(text, i); if (n) return i + n; }
  return text.length;
}

// One row from `at`: { fields: [{ text, start, end, quoted }], next (where the next row starts), problem (an end quote
// that never came: the row ends at the line it started on) }. `quoteOf(i)`: the start and end quote of field i.
function csvRow(text, at, def, quoteOf) {
  const fields = [], dl = def.delimiter || ',', trim = i => def.trim || def.columns?.[i]?.trim;
  let pos = at, problem = false;
  for (;;) {
    const i = fields.length, [q, qe] = quoteOf(i), start = pos;
    let value = '', quoted = false;
    if (q && text.startsWith(q, pos)) {
      quoted = true;
      pos += q.length;
      let closed = false;
      while (pos < text.length) {
        if (def.escape === 'char' && def.escapeChar && text.startsWith(def.escapeChar + qe, pos)) { value += qe; pos += def.escapeChar.length + qe.length; continue; }
        if (text.startsWith(qe, pos)) {
          if (def.escape === 'double' && text.startsWith(qe, pos + qe.length)) { value += qe; pos += 2 * qe.length; continue; }
          pos += qe.length;
          closed = true;
          break;
        }
        value += text[pos++];
      }
      if (!closed) {   // picks up at the next line after the one the row started on
        problem = true;
        const next = csvNextLine(text, at);
        fields.push({ text: text.slice(start, next).replace(/[\r\n]+$/, ''), start, end: next, quoted: false });
        return { fields, next, problem };
      }
      // Anything between the end quote and the delimiter belongs to the field as it is.
      while (pos < text.length && !text.startsWith(dl, pos) && !csvLineEnd(text, pos)) value += text[pos++];
    } else {
      while (pos < text.length && !text.startsWith(dl, pos) && !csvLineEnd(text, pos)) value += text[pos++];
    }
    fields.push({ text: trim(i) ? value.trim() : value, start, end: pos, quoted });
    if (pos < text.length && text.startsWith(dl, pos)) { pos += dl.length; continue; }
    const n = csvLineEnd(text, pos);
    return { fields, next: pos + n, problem };
  }
}

// The file by the definition: { pre: [{ text, start }] (the lines before the data), names (from the header line, or
// null), rows: [{ start, fields, problem }], columns (the most fields of a row, the header's included) }.
function csvRead(text, def) {
  const quoteOf = i => {
    const c = def.columns?.[i];
    return [c?.quote ?? def.quote ?? '', c?.quoteEnd ?? c?.quote ?? def.quoteEnd ?? def.quote ?? ''];
  };
  const pre = [];
  let pos = 0;
  for (let n = 0; n < (def.skip || 0) && pos < text.length; n++) {
    const next = csvNextLine(text, pos);
    pre.push({ text: text.slice(pos, next).replace(/[\r\n]+$/, ''), start: pos });
    pos = next;
  }
  const headerLine = def.header > 0 ? pre[def.header - 1] : null;
  const names = headerLine ? csvRow(text, headerLine.start, def, quoteOf).fields.map(f => f.text) : null;
  const rows = [];
  while (pos < text.length) {
    const row = csvRow(text, pos, def, quoteOf);
    rows.push({ start: pos, fields: row.fields, problem: row.problem });
    if (row.next <= pos) break;
    pos = row.next;
  }
  let columns = names?.length ?? 0;
  for (const r of rows) if (r.fields.length > columns) columns = r.fields.length;
  return { pre, names, rows, columns };
}

// ---------- Detecting ----------
// A first guess from the first lines: the delimiter that splits them into the same number of fields most often, the
// quote, the lines before the data (those above the first row with that many fields: a title, an empty line), a
// header when that row looks like names, and per column the type that fits all its values.
function csvDetect(text) {
  const sample = text.slice(0, 64 * 1024);
  const quote = (sample.match(/(^|[,;\t|])'/gm)?.length ?? 0) > (sample.match(/(^|[,;\t|])"/gm)?.length ?? 0) ? "'" : '"';
  let best = null;
  for (const delimiter of CSV_DELIMITERS) {
    const def = csvDefinition({ delimiter, quote, quoteEnd: quote, skip: 0, header: 0 });
    const counts = csvRead(sample, def).rows.slice(0, 50).map(r => r.fields.length);
    if (!counts.length) continue;
    const freq = new Map();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [fields, times] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (fields < 2) continue;
    const score = times / counts.length + fields / 1000;
    if (!best || score > best.score) best = { delimiter, score, fields };
  }
  const def = csvDefinition({ delimiter: best?.delimiter ?? ',', quote, quoteEnd: quote, skip: 0, header: 0 });
  let rows = csvRead(sample, def).rows.slice(0, 200);
  const lead = Math.max(0, rows.findIndex(r => r.fields.length >= (best?.fields ?? 0)));
  if (lead) {
    for (let i = 0; i < rows[lead].start; i++) if (csvLineEnd(sample, i)) { def.skip++; i += csvLineEnd(sample, i) - 1; }
    rows = rows.slice(lead);
  }
  // A header: the first row has no numbers and no name twice, and some later row has a number where it has a name.
  const first = rows[0]?.fields.map(f => f.text.trim()) ?? [];
  const numeric = s => /^[+-]?[\d.,' ]*\d[\d.,' ]*$/.test(s);
  const header = first.length > 1 && first.every(s => s && !numeric(s)) && new Set(first).size === first.length
    && rows.slice(1).some(r => r.fields.some((f, i) => numeric(f.text.trim()) && i < first.length));
  if (header) def.header = ++def.skip;
  const data = header ? rows.slice(1) : rows;
  def.columns = Array.from({ length: Math.max(0, ...rows.map(r => r.fields.length)) }, (_, i) =>
    csvDetectColumn(data.map(r => r.fields[i]?.text.trim() ?? ''), header ? first[i] : `Column ${i + 1}`));
  return def;
}

// The type that fits all of a column's values (the empty ones aside), with how they are written.
function csvDetectColumn(values, name) {
  const v = values.filter(s => s !== '');
  const col = { name: name || '', type: 'text', align: 'left' };
  if (!v.length) return col;
  if (v.every(s => /^[+-]?\d+$/.test(s))) return { ...col, type: 'integer', align: 'right' };
  if (v.every(s => /^(true|false|yes|no)$/i.test(s))) return { ...col, type: 'boolean' };
  const iso = /^\d{4}-\d{2}-\d{2}(?:[ T](\d{2}):(\d{2})(:\d{2})?)?$/, dmy = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/;
  if (v.every(s => iso.test(s))) {
    const time = v.find(s => s.length > 10);
    return { ...col, type: 'date', align: 'right', pattern: 'yyyy-MM-dd' + (time ? (time[10] === 'T' ? "'T'" : ' ') + (time.length > 16 ? 'HH:mm:ss' : 'HH:mm') : '') };
  }
  if (v.every(s => dmy.test(s))) {
    const sep = v[0].match(dmy)[2];
    return { ...col, type: 'date', align: 'right', pattern: `dd${sep}MM${sep}yyyy` };
  }
  // A decimal: the sign that ends a number with fewer than three digits after it, or after a single one.
  if (v.every(s => /^[+-]?\d[\d.,' ]*$/.test(s) && /\d$/.test(s))) {
    const comma = v.some(s => /,\d{1,2}$|,\d{4,}$/.test(s) || (/,\d+$/.test(s) && /\.\d{3}/.test(s)));
    const decimal = comma ? ',' : '.', group = (comma ? v.some(s => s.includes('.')) && '.' : v.some(s => s.includes(',')) && ',') || (v.some(s => s.includes("'")) ? "'" : '');
    return { ...col, type: 'decimal', align: 'right', decimal, group };
  }
  return col;
}

// A kept definition fitted to the file as it is now (3.4): its columns go to the columns that are still there by
// their name (else by their place), a column new in the file is detected; the file's own settings stay.
function csvFit(kept, text) {
  const sample = text.slice(0, 64 * 1024), read = csvRead(sample, kept), names = read.names;
  const columns = [], used = new Set();
  for (let i = 0; i < read.columns; i++) {
    let k = names ? kept.columns.findIndex((c, j) => !used.has(j) && c.name === names[i]) : -1;
    if (k < 0 && i < kept.columns.length && !used.has(i) && !(names && names.includes(kept.columns[i].name) && kept.columns[i].name !== names[i])) k = i;
    if (k >= 0) {
      used.add(k);
      columns.push({ ...kept.columns[k] });
    } else columns.push(csvDetectColumn(read.rows.slice(0, 200).map(r => r.fields[i]?.text.trim() ?? ''), names?.[i] || `Column ${i + 1}`));
  }
  return { ...kept, columns };
}

// ---------- A value in its column's format ----------
// A number as written in the file (its decimal and thousands signs), or null when it is not one.
function csvNumber(s, col) {
  let t = s.trim();
  if (!t) return null;
  const group = col.group ?? '', decimal = col.decimal || '.';
  if (group) t = t.split(group).join('');
  t = t.split(' ').join('');
  if (decimal !== '.') t = t.replace('.', '\u0000').replace(decimal, '.').replace('\u0000', 'x');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

// A date or time as written in the file, by a pattern (yyyy yy MM M dd d HH H mm ss, 'quoted text' as it is), into
// { y, M, d, H, m, s }; null when it does not fit.
function csvDate(s, pattern) {
  const parts = csvPatternParts(pattern || 'yyyy-MM-dd'), out = { y: 0, M: 1, d: 1, H: 0, m: 0, s: 0 };
  let re = '^';
  const keys = [];
  for (const p of parts) {
    if (p.text !== undefined) { re += p.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    re += p.token.length >= 2 || p.token === 'yyyy' ? `(\\d{${p.token === 'yyyy' ? 4 : 2}})` : '(\\d{1,2})';
    keys.push(p.token);
  }
  const m = new RegExp(re + '$').exec(s.trim());
  if (!m) return null;
  keys.forEach((k, i) => {
    const n = Number(m[i + 1]);
    if (k === 'yyyy') out.y = n; else if (k === 'yy') out.y = 2000 + n; else if (k[0] === 'M') out.M = n;
    else if (k[0] === 'd') out.d = n; else if (k[0] === 'H') out.H = n; else if (k === 'mm') out.m = n; else if (k === 'ss') out.s = n;
  });
  return out.M >= 1 && out.M <= 12 && out.d >= 1 && out.d <= 31 && out.H < 24 && out.m < 60 && out.s < 60 ? out : null;
}

function csvPatternParts(pattern) {
  const parts = [];
  for (let i = 0; i < pattern.length;) {
    if (pattern[i] === "'") {
      const end = pattern.indexOf("'", i + 1);
      parts.push({ text: pattern.slice(i + 1, end < 0 ? pattern.length : end) });
      i = end < 0 ? pattern.length : end + 1;
      continue;
    }
    const m = /^(yyyy|yy|MM|M|dd|d|HH|H|mm|ss)/.exec(pattern.slice(i));
    if (m) { parts.push({ token: m[1] }); i += m[1].length; continue; }
    parts.push({ text: pattern[i++] });
  }
  return parts;
}

function csvFormatDate(d, pattern) {
  const two = n => String(n).padStart(2, '0');
  return csvPatternParts(pattern).map(p => p.text !== undefined ? p.text : ({
    yyyy: String(d.y).padStart(4, '0'), yy: two(d.y % 100), MM: two(d.M), M: String(d.M), dd: two(d.d), d: String(d.d),
    HH: two(d.H), H: String(d.H), mm: two(d.m), ss: two(d.s) })[p.token]).join('');
}

// A number by a pattern as #,##0.00 (',' groups, digits after '.'), with the column's signs.
function csvFormatNumber(n, format, col) {
  const dot = format.indexOf('.'), digits = dot < 0 ? 0 : format.length - dot - 1 - (format.slice(dot + 1).match(/[^0#]/g)?.length ?? 0);
  const grouped = format.includes(',');
  const [whole, frac] = Math.abs(n).toFixed(Math.max(0, digits)).split('.');
  const group = col.group || (col.decimal === ',' ? '.' : ',');
  const w = grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole;
  return (n < 0 ? '-' : '') + w + (frac ? (col.decimal || '.') + frac : '');
}

// How a value shows: { text, ok } (ok false: it does not fit the column's type or Read as, shown as in the file).
function csvShow(raw, col) {
  const s = raw ?? '';
  if (!col || !s.trim() || col.type === 'text' || col.type === 'auto' || !col.type) return { text: s, ok: true };
  if (col.type === 'integer' || col.type === 'decimal') {
    const n = csvNumber(s, col);
    if (n === null || (col.type === 'integer' && !Number.isInteger(n))) return { text: s, ok: false };
    return { text: col.format ? csvFormatNumber(n, col.format, col) : s.trim(), ok: true };
  }
  if (col.type === 'date') {
    const d = csvDate(s, col.pattern);
    if (!d) return { text: s, ok: false };
    return { text: csvFormatDate(d, col.format || (/[Hms]/.test(col.pattern ?? '') ? 'yyyy-MM-dd HH:mm' + (/s/.test(col.pattern) ? ':ss' : '') : 'yyyy-MM-dd')), ok: true };
  }
  if (col.type === 'boolean') return { text: s.trim(), ok: /^(true|false|yes|no|0|1)$/i.test(s.trim()) };
  return { text: s, ok: true };
}

// ---------- CSV on the Web (CSVW) metadata ----------
// The definition as CSVW (https://www.w3.org/TR/tabular-metadata/): the dialect and per column a name, a datatype
// and its format; what CSVW has no place for in properties of LexPen's own (lexpen:...), which another reader skips.
const CSVW_BASE = { text: 'string', integer: 'integer', decimal: 'decimal', date: 'datetime', boolean: 'boolean', auto: 'string' };

function csvwWrite(def, fileName) {
  const dialect = { delimiter: def.delimiter, quoteChar: def.quote || null, doubleQuote: def.escape === 'double',
    headerRowCount: def.header > 0 ? 1 : 0, skipRows: def.header > 0 ? def.header - 1 : def.skip || 0, trim: !!def.trim };
  if (def.quote && (def.quote.length > 1 || (def.quoteEnd && def.quoteEnd !== def.quote))) Object.assign(dialect, { 'lexpen:quote': def.quote, 'lexpen:quoteEnd': def.quoteEnd });
  if (def.escape === 'none') dialect['lexpen:escape'] = 'none';
  if (def.escape === 'char' && def.escapeChar !== '\\') dialect['lexpen:escapeChar'] = def.escapeChar;
  if (def.header > 0 && def.skip > def.header) dialect['lexpen:linesAfterHeader'] = def.skip - def.header;
  const columns = (def.columns ?? []).map(c => {
    const out = { name: csvwName(c.name), titles: c.name || '' };
    const base = CSVW_BASE[c.type] ?? 'string';
    if (c.type === 'decimal' || c.type === 'integer') {
      const format = {};
      if (c.decimal && c.decimal !== '.') format.decimalChar = c.decimal;
      if (c.group) format.groupChar = c.group;
      out.datatype = Object.keys(format).length ? { base, format } : base;
    } else if (c.type === 'date') out.datatype = { base, format: c.pattern || 'yyyy-MM-dd' };
    else out.datatype = base;
    if (c.type === 'auto') out['lexpen:type'] = 'auto';
    if (c.hidden) out.suppressOutput = true;
    if (c.format) out['lexpen:format'] = c.format;
    if (c.align) out['lexpen:align'] = c.align;
    if (c.width) out['lexpen:width'] = c.width;
    if (c.order !== undefined) out['lexpen:order'] = c.order;
    if (c.trim) out['lexpen:trim'] = true;
    if (c.quote !== undefined) Object.assign(out, { 'lexpen:quote': c.quote, 'lexpen:quoteEnd': c.quoteEnd ?? c.quote });
    return out;
  });
  return JSON.stringify({ '@context': 'http://www.w3.org/ns/csvw', url: fileName, dialect, tableSchema: { columns } }, null, 2);
}

const csvwName = s => (s || 'column').replace(/[^\w.-]+/g, '_');

// A CSVW metadata text (ours or another's) into a definition; throws on JSON that is not one.
function csvwRead(json) {
  const meta = typeof json === 'string' ? JSON.parse(json) : json;
  const table = meta.tables?.[0] ?? meta, d = table.dialect ?? meta.dialect ?? {};
  const header = d.headerRowCount ?? (d.header === false ? 0 : 1), skipRows = d.skipRows ?? 0;
  const quote = d['lexpen:quote'] ?? (d.quoteChar === undefined ? '"' : d.quoteChar ?? '');
  const def = csvDefinition({
    delimiter: d.delimiter ?? ',', quote, quoteEnd: d['lexpen:quoteEnd'] ?? quote,
    escape: d['lexpen:escape'] ?? (d.doubleQuote === false ? 'char' : 'double'), escapeChar: d['lexpen:escapeChar'] ?? '\\',
    header: header > 0 ? skipRows + 1 : 0, skip: skipRows + (header > 0 ? 1 : 0) + (d['lexpen:linesAfterHeader'] ?? 0),
    trim: d.trim === true || d.trim === 'true',
  });
  const cols = (table.tableSchema ?? meta.tableSchema)?.columns ?? [];
  def.columns = cols.filter(c => !c.virtual).map(c => {
    const dt = typeof c.datatype === 'string' ? { base: c.datatype } : c.datatype ?? { base: 'string' };
    const base = dt.base ?? 'string', format = dt.format;
    const type = c['lexpen:type'] ?? (['integer', 'int', 'long', 'short', 'byte', 'nonNegativeInteger', 'positiveInteger'].includes(base) ? 'integer'
      : ['decimal', 'double', 'float', 'number'].includes(base) ? 'decimal'
      : ['date', 'datetime', 'dateTime', 'time', 'dateTimeStamp'].includes(base) ? 'date' : base === 'boolean' ? 'boolean' : 'text');
    const col = { name: Array.isArray(c.titles) ? c.titles[0] : c.titles ?? c.name ?? '', type };
    if (type === 'decimal' || type === 'integer') {
      col.decimal = (typeof format === 'object' && format?.decimalChar) || '.';
      col.group = (typeof format === 'object' && format?.groupChar) || '';
    }
    if (type === 'date') col.pattern = typeof format === 'string' ? format : format?.pattern ?? 'yyyy-MM-dd';
    col.align = c['lexpen:align'] ?? (type === 'text' || type === 'boolean' ? 'left' : 'right');
    if (c['lexpen:format']) col.format = c['lexpen:format'];
    if (c['lexpen:width']) col.width = c['lexpen:width'];
    if (c['lexpen:order'] !== undefined) col.order = c['lexpen:order'];
    if (c.suppressOutput) col.hidden = true;
    if (c['lexpen:trim']) col.trim = true;
    if (c['lexpen:quote'] !== undefined) Object.assign(col, { quote: c['lexpen:quote'], quoteEnd: c['lexpen:quoteEnd'] });
    return col;
  });
  return def;
}
