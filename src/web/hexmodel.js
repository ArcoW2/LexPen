'use strict';
// The Hex view's rules without a page (hexview.js draws it; the tests run this file under Jint,
// docs/plans/executed/PLAN-hex-view.md): one byte as one character, a line's cells, a byte's two digits edited.

// ---------- One byte, one character: extended ASCII as Windows-1252 ----------
// 80-9F where 1252 has a character there (the rest of that row is undefined).
const HEX_1252 = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161,
  0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
const HEX_1252_BYTE = Object.fromEntries(Object.entries(HEX_1252).map(([b, c]) => [c, +b]));
const HEX_DOT = '\u00B7';   // no character: a small centred dot (drawn dimmed)

// The character of a byte; null: none (a control byte, one 1252 leaves undefined).
function hexChar(b) {
  if (b < 0x20 || b === 0x7F) return null;
  if (b < 0x80 || b >= 0xA0) return String.fromCharCode(b);
  return HEX_1252[b] ? String.fromCharCode(HEX_1252[b]) : null;
}

// The byte of a character typed (or pasted) in the text part; null: it has none.
function hexByteOf(ch) {
  if ([...ch].length !== 1) return null;
  const c = ch.codePointAt(0);
  if (c >= 0x20 && c < 0x7F || c >= 0xA0 && c <= 0xFF) return c;
  return HEX_1252_BYTE[c] ?? null;
}

// ---------- A line ----------
// Hex digits of the offsets: as many as the file needs, at least 8.
const hexOffsetDigits = size => Math.max(8, Math.max(0, size - 1).toString(16).length);

const hex2 = b => b.toString(16).toUpperCase().padStart(2, '0');

// Where byte k of a line stands: its column in the hex part (two digits, a space between, one more space after every
// `group` bytes; group 0: none) and in the text part (one cell each, the same extra space).
const hexCol = (k, group) => k * 3 + (group > 0 ? Math.floor(k / group) : 0);
const textCol = (k, group) => k + (group > 0 ? Math.floor(k / group) : 0);

// A line as text (the tests; the view draws the same cells): offset, two spaces, the hex part padded to a full line,
// two spaces, the characters. bytes: indexable; from: the line's first byte; size: the file's.
function hexLineText(bytes, from, perLine, group, size) {
  const n = Math.max(0, Math.min(perLine, size - from));
  const hexWidth = hexCol(perLine - 1, group) + 2;
  let hex = '', text = '';
  for (let k = 0; k < n; k++) {
    const b = bytes[from + k];
    hex = hex.padEnd(hexCol(k, group)) + hex2(b);
    text = text.padEnd(textCol(k, group)) + (hexChar(b) ?? HEX_DOT);
  }
  return from.toString(16).toUpperCase().padStart(hexOffsetDigits(size), '0') + '  ' + hex.padEnd(hexWidth) + '  ' + text;
}

// ---------- A byte's two digits ----------
// While the cursor is on a byte its digits can be removed one at a time: [high, low], each a hex digit or null (gone).
// Its value meanwhile, and once the cursor leaves it: a digit gone counts as 0 (a left "A": A0, a right "7": 07).
const hexDigits = b => [...hex2(b)];
const hexValue = d => parseInt((d[0] ?? '0') + (d[1] ?? '0'), 16);
const isHexDigit = c => /^[0-9a-f]$/i.test(c);
