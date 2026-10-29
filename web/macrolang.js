'use strict';
// The macro language (docs/plans/executed/PLAN-macros.md): a macro's text read into a program, checked, and run. No editor
// and no page here: a run talks to LexPen through an environment (macros.js), so the language can be tested on its
// own. A value is text; a text that is a number also calculates, and a result keeps the formatting of the number it
// started from (3.2). Loaded with the page; macros.js uses it.

// ---------- Words ----------
const MACRO_STATEMENTS = new Set(['if', 'then', 'elseif', 'else', 'endif', 'switch', 'case', 'endswitch', 'goto', 'gosub',
  'return', 'stop', 'set', 'inc', 'dec', 'append', 'copy', 'paste', 'type', 'moveto', 'find', 'replace', 'new', 'show',
  'open', 'notfound', 'onerror', 'screen', 'procedure', 'endprocedure', 'function', 'endfunction', 'global', 'use']);
const MACRO_OPERATORS = new Set(['and', 'or', 'not', 'contains', 'starts', 'ends', 'matches', 'opened']);
const MACRO_BUILTINS = {
  len: [1, s => String(s.length)],
  upper: [1, s => s.toUpperCase()],
  lower: [1, s => s.toLowerCase()],
  trim: [1, s => s.trim()],
  left: [2, (s, n) => s.slice(0, Math.max(0, wholeNumber(n)))],
  right: [2, (s, n) => { const k = Math.max(0, wholeNumber(n)); return k ? s.slice(-k) : ''; }],
  mid: [3, (s, from, n) => s.substr(Math.max(1, wholeNumber(from)) - 1, Math.max(0, wholeNumber(n)))],
  pos: [2, (find, s) => String(s.indexOf(find) + 1)],
  replace: [3, (s, from, to) => from ? s.split(from).join(to) : s],
};
const MACRO_TYPES = new Set(['int', 'float', 'text']);
const MACRO_DEPTH = 1000;   // calls of procedures and functions within each other: past it, a runaway recursion

class MacroError extends Error {
  constructor(message, line, col) { super(message); this.line = line; this.col = col; }
}

function wholeNumber(text) {
  const n = parseMacroNumber(text);
  if (!n || n.decimals) throw new MacroError(`"${text}" is not a whole number`);
  return n.value;
}

// ---------- Numbers ----------
// A text as a number: { value, decimals, width (the digits before the point when it starts with a 0, else 0),
// thousands, decimal }, or null. `type`: a typed variable's { kind, thousands, decimal }.
function parseMacroNumber(text, type) {
  if (type?.kind === 'text') return null;
  const thousands = type?.thousands ?? null, decimal = type?.kind === 'int' ? null : type?.decimal ?? '.';
  const esc = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = thousands ? `\\d{1,3}(?:${esc(thousands)}\\d{3})*|\\d+` : '\\d+';
  const m = new RegExp(`^([+-]?)(${whole})${decimal ? `(?:${esc(decimal)}(\\d+))?` : ''}$`).exec(String(text).trim());
  if (!m) return null;
  const digits = thousands ? m[2].split(thousands).join('') : m[2], frac = m[3] ?? '';
  const value = Number((m[1] === '-' ? '-' : '') + digits + (frac ? '.' + frac : ''));
  return { value, decimals: frac.length, width: digits.length > 1 && digits[0] === '0' ? digits.length : 0, thousands, decimal: decimal ?? '.' };
}

// A number written as `like` was (its leading zeros, its separators), with `decimals` decimals.
function formatMacroNumber(value, decimals, like) {
  let [whole, frac = ''] = Math.abs(value).toFixed(decimals).split('.');
  if (like?.width) whole = whole.padStart(like.width, '0');
  if (like?.thousands) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, like.thousands);
  const negative = value < 0 && Number(Math.abs(value).toFixed(decimals)) !== 0;
  return (negative ? '-' : '') + whole + (frac ? (like?.decimal ?? '.') + frac : '');
}

// a op b, each { s, type }: the result keeps the formatting of a (the number it started from), as many decimals as
// the one with most; a division that does not come out keeps up to 6 decimals.
function macroArithmetic(op, a, b, line) {
  // An empty text (a variable nothing gave a value yet) counts as 0, so a counter can start from nothing.
  const num = v => v.s === '' ? { value: 0, decimals: 0, width: 0, thousands: v.type?.thousands ?? null, decimal: v.type?.decimal ?? '.' } : parseMacroNumber(v.s, v.type);
  const x = num(a), y = num(b);
  if (!x) throw new MacroError(`"${a.s}" is not a number`, line);
  if (!y) throw new MacroError(`"${b.s}" is not a number`, line);
  if (op === '/' && y.value === 0) throw new MacroError('a division by zero', line);
  let decimals = Math.max(x.decimals, y.decimals);
  const value = op === '+' ? x.value + y.value : op === '-' ? x.value - y.value : op === '*' ? x.value * y.value : x.value / y.value;
  if (op === '/' && Number(value.toFixed(decimals)) !== value) decimals = Math.max(decimals, Math.min(6, String(value).split('.')[1]?.length ?? 0));
  return { s: formatMacroNumber(value, decimals, x), type: a.type?.kind === 'text' ? null : a.type };
}

// ---------- Reading: a line into tokens ----------
// Tokens: { t: 'str' | 'num' | 'var' | 'sys' | 'label' | 'word' | 'op', v, col, type? (a var's :type) }.
function macroTokens(text, line) {
  const out = [];
  let i = 0;
  const fail = (message, col) => { throw new MacroError(message, line, col); };
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') break;   // a comment to the end of the line
    const col = i;
    if (c === '"') {
      let s = '';
      i++;
      for (;;) {
        if (i >= text.length) fail('this text has no end quote', col);
        const d = text[i];
        if (d === '"') { i++; break; }
        if (d === '\\') {
          const e = text[i + 1];
          if (e === '"' || e === '\\') s += e;
          else if (e === 'n') s += '\n';
          else if (e === 't') s += '\t';
          else fail(e === undefined ? 'this text has no end quote' : `unknown escape \\${e} (\\" \\\\ \\n \\t)`, i);
          i += 2;
          continue;
        }
        s += d;
        i++;
      }
      out.push({ t: 'str', v: s, col });
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(text.slice(i));
      out.push({ t: 'num', v: m[0], col });
      i += m[0].length;
      continue;
    }
    if (c === '$') {
      const sys = text[i + 1] === '$', m = /^[A-Za-z_]\w*/.exec(text.slice(i + (sys ? 2 : 1)));
      if (!m) fail(sys ? 'a system variable needs a name after $$' : 'a variable needs a name after $', col);
      i += (sys ? 2 : 1) + m[0].length;
      const tok = { t: sys ? 'sys' : 'var', v: m[0], col };
      // A type: $n:int, $n:float(",") or $n:float(".", ",")
      const tm = !sys && /^:([A-Za-z]+)/.exec(text.slice(i));
      if (tm) {
        i += tm[0].length;
        const seps = [];
        if (text[i] === '(') {
          // Its separators, each between quotes (a comma between quotes is a separator, not the list's comma).
          i++;
          for (;;) {
            while (text[i] === ' ') i++;
            if (text[i] === ')' && !seps.length) { i++; break; }
            const sm = /^"((?:[^"\\]|\\.)*)"/.exec(text.slice(i));
            if (!sm) fail('a separator is a character between quotes, as ","', i);
            seps.push(sm[1].replace(/\\(.)/g, '$1'));
            i += sm[0].length;
            while (text[i] === ' ') i++;
            if (text[i] === ',') { i++; continue; }
            if (text[i] === ')') { i++; break; }
            fail('this type has no closing bracket', i);
          }
        }
        tok.type = { name: tm[1], seps, col: col };
      }
      out.push(tok);
      continue;
    }
    if (c === ':' && /[A-Za-z_]/.test(text[i + 1] ?? '')) {
      const m = /^:[A-Za-z_]\w*/.exec(text.slice(i));
      out.push({ t: 'label', v: m[0].slice(1), col });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
      out.push({ t: 'word', v: m[0], col });
      i += m[0].length;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) { out.push({ t: 'op', v: two, col }); i += 2; continue; }
    if ('=<>+-*/&(),'.includes(c)) { out.push({ t: 'op', v: c, col }); i++; continue; }
    fail(`"${c}" is not part of the macro language`, col);
  }
  return out;
}

// ---------- Reading: expressions ----------
// Over a line's tokens from `at`; returns the expression and moves `p.at` past it.
function macroExpression(tokens, p, line) {
  const peek = () => tokens[p.at], next = () => tokens[p.at++];
  const isWord = (tok, w) => tok?.t === 'word' && tok.v.toLowerCase() === w;
  const isOp = (tok, o) => tok?.t === 'op' && tok.v === o;
  const fail = (message, tok) => { throw new MacroError(message, line, tok?.col); };
  const or = () => { let a = and(); while (isWord(peek(), 'or')) { next(); a = { k: 'or', a, b: and() }; } return a; };
  const and = () => { let a = not(); while (isWord(peek(), 'and')) { next(); a = { k: 'and', a, b: not() }; } return a; };
  const not = () => isWord(peek(), 'not') ? (next(), { k: 'not', a: not() }) : compare();
  const compare = () => {
    const a = concat(), tok = peek();
    if (tok?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(tok.v)) { next(); return { k: 'cmp', op: tok.v, a, b: concat() }; }
    for (const w of ['contains', 'starts', 'ends', 'matches']) if (isWord(tok, w)) { next(); return { k: 'cmp', op: w, a, b: concat() }; }
    return a;
  };
  const concat = () => { let a = add(); while (isOp(peek(), '&')) { next(); a = { k: 'cat', a, b: add() }; } return a; };
  const add = () => { let a = mul(); while (isOp(peek(), '+') || isOp(peek(), '-')) { const o = next().v; a = { k: 'arith', op: o, a, b: mul() }; } return a; };
  const mul = () => { let a = unary(); while (isOp(peek(), '*') || isOp(peek(), '/')) { const o = next().v; a = { k: 'arith', op: o, a, b: unary() }; } return a; };
  const unary = () => isOp(peek(), '-') ? (next(), { k: 'arith', op: '-', a: { k: 'lit', s: '0' }, b: unary() }) : primary();
  const primary = () => macroPrimary(tokens, p, line, or);
  return or();
}

// A term: text, a number, a variable, a call of a function (built-in or your own), `opened <term>`, or (expression).
function macroPrimary(tokens, p, line, full) {
  const tok = tokens[p.at], fail = message => { throw new MacroError(message, line, tok?.col); };
  if (!tok) fail('a value is missing here');
  p.at++;
  if (tok.t === 'str' || tok.t === 'num') return { k: 'lit', s: tok.v };
  if (tok.t === 'var') return { k: 'var', name: tok.v, type: tok.type, col: tok.col };
  if (tok.t === 'sys') return { k: 'sys', name: tok.v, col: tok.col };
  if (tok.t === 'op' && tok.v === '(') {
    const e = (full ?? (() => macroExpression(tokens, p, line)))();
    if (tokens[p.at]?.v !== ')') fail('this bracket is not closed');
    p.at++;
    return e;
  }
  if (tok.t === 'word') {
    const w = tok.v.toLowerCase();
    if (w === 'true' || w === 'false') return { k: 'lit', s: w };
    if (w === 'opened') return { k: 'opened', a: macroPrimary(tokens, p, line, full) };
    if (tokens[p.at]?.v === '(' && tokens[p.at].t === 'op') {
      p.at++;
      const args = [];
      if (tokens[p.at]?.v !== ')') for (;;) {
        args.push(macroExpression(tokens, p, line));
        if (tokens[p.at]?.v === ',') { p.at++; continue; }
        break;
      }
      if (tokens[p.at]?.v !== ')') fail(`the call of ${tok.v} is not closed`);
      p.at++;
      return { k: 'call', name: tok.v, args, col: tok.col };
    }
    fail(`"${tok.v}" is not a value here (text is between quotes)`);
  }
  fail(`"${tok.v}" is not a value here`);
}

// ---------- Reading: lines into statements ----------
// One statement per line: { k, line, ... }. Block statements (if, switch, procedure, function) are matched later.
function macroStatement(text, line) {
  const tokens = macroTokens(text, line);
  if (!tokens.length) return null;
  const p = { at: 1 }, first = tokens[0], word = first.t === 'word' ? first.v.toLowerCase() : null;
  const fail = (message, tok = tokens[p.at]) => { throw new MacroError(message, line, tok?.col); };
  const expr = () => macroExpression(tokens, p, line);
  const end = () => { if (p.at < tokens.length) fail(`"${tokens[p.at].v}" is not expected here`); };
  const variable = () => {
    const tok = tokens[p.at++];
    if (tok?.t === 'sys') throw new MacroError(`$$${tok.v} is a system variable: it cannot be set`, line, tok.col);
    if (tok?.t !== 'var') fail('a variable ($name) is needed here', tok);
    return { name: tok.v, type: tok.type ? macroType(tok.type, line) : null };
  };
  const label = () => {
    const tok = tokens[p.at++];
    if (tok?.t === 'label') return tok.v;
    if (tok?.t === 'word') throw new MacroError(`a label needs its colon (goto :${tok.v}); to move the cursor: moveto ${tok.v}`, line, tok.col);
    fail('a label (:name) is needed here', tok);
  };
  if (first.t === 'label') { end(); return { k: 'label', name: first.v, line }; }
  if (!word) fail('a line starts with a statement or an action', first);
  switch (word) {
    case 'if': {
      const cond = expr();
      if (tokens[p.at]?.t !== 'word' || tokens[p.at].v.toLowerCase() !== 'then') fail('this if has no then');
      p.at++;
      if (p.at >= tokens.length) return { k: 'if', cond, line };
      const rest = text.slice(tokens[p.at].col);
      const inner = macroStatement(rest, line);
      if (['if', 'elseif', 'else', 'endif', 'switch', 'case', 'endswitch', 'procedure', 'function', 'endprocedure', 'endfunction', 'label'].includes(inner?.k))
        throw new MacroError('after then on the same line: one step (a block if has nothing after then)', line, tokens[p.at].col);
      return { k: 'ifline', cond, step: inner, line };
    }
    case 'elseif': {
      const cond = expr();
      if (tokens[p.at]?.t !== 'word' || tokens[p.at].v.toLowerCase() !== 'then') fail('this elseif has no then');
      p.at++;
      end();
      return { k: 'elseif', cond, line };
    }
    case 'else': end(); return { k: 'else', line };
    case 'endif': end(); return { k: 'endif', line };
    case 'switch': { const value = expr(); end(); return { k: 'switch', value, line }; }
    case 'case': {
      const tok = tokens[p.at];
      if (tok?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(tok.v)) { p.at++; const value = expr(); end(); return { k: 'case', op: tok.v, values: [value], line }; }
      const values = [expr()];
      while (tokens[p.at]?.v === ',') { p.at++; values.push(expr()); }
      end();
      return { k: 'case', op: '=', values, line };
    }
    case 'endswitch': end(); return { k: 'endswitch', line };
    case 'goto': case 'gosub': { const name = label(); end(); return { k: word, name, line, col: first.col }; }
    case 'return': { if (p.at >= tokens.length) return { k: 'return', line }; const value = expr(); end(); return { k: 'return', value, line }; }
    case 'stop': end(); return { k: 'stop', line };
    case 'set': {
      const v = variable();
      if (tokens[p.at]?.v !== '=') fail('set needs = between the variable and its value');
      p.at++;
      const value = expr();
      end();
      return { k: 'set', ...v, value, line };
    }
    case 'inc': case 'dec': { const v = variable(); end(); return { k: word, ...v, line }; }
    case 'append': {
      const v = variable(), item = macroPrimary(tokens, p, line);
      const sep = p.at < tokens.length ? macroPrimary(tokens, p, line) : null;
      end();
      return { k: 'append', ...v, item, sep, line };
    }
    case 'copy': { const v = variable(); end(); return { k: 'copy', ...v, line }; }
    case 'paste': case 'type': { const value = expr(); end(); return { k: word, value, line }; }
    case 'moveto': return macroMoveto(tokens, p, line);
    case 'find': case 'replace': {
      // A text, or texts joined with & (find "TODO " & $$clipboard); then the switches.
      const joined = () => {
        let a = macroPrimary(tokens, p, line);
        while (tokens[p.at]?.t === 'op' && tokens[p.at].v === '&') { p.at++; a = { k: 'cat', a, b: macroPrimary(tokens, p, line) }; }
        return a;
      };
      const args = [joined()];
      if (word === 'replace') args.push(joined());
      const flags = new Set();
      while (p.at < tokens.length) {
        const tok = tokens[p.at++], f = tok.v?.toLowerCase();
        if (tok.t !== 'word' || !['case', 'word', 'regex', 'all', 'back'].includes(f)) throw new MacroError(`"${tok.v}" is not a switch of ${word} (case, word, regex${word === 'replace' ? ', all' : ', back'})`, line, tok.col);
        flags.add(f);
      }
      return { k: word, args, flags: [...flags], line };
    }
    case 'new': case 'open': {
      if (p.at >= tokens.length) fail(`${word} needs a name`);
      const value = expr();
      end();
      return { k: word, value, line };
    }
    case 'show': {
      if (p.at >= tokens.length) fail('show needs a name, or recent');
      if (tokens[p.at].t === 'word' && tokens[p.at].v.toLowerCase() === 'recent') { p.at++; end(); return { k: 'show', recent: true, line }; }
      const value = expr();
      end();
      return { k: 'show', value, line };
    }
    case 'notfound': case 'onerror': {
      const tok = tokens[p.at++], v = tok?.v?.toLowerCase();
      if (v !== 'stop' && v !== 'continue') fail(`${word} is followed by stop or continue`, tok);
      end();
      return { k: word, value: v, line };
    }
    case 'screen': {
      const tok = tokens[p.at++], v = tok?.v?.toLowerCase();
      if (v === 'on' || v === 'off') { end(); return { k: 'screen', mode: v, line }; }
      if (v === 'every') {
        const n = tokens[p.at++];
        if (n?.t !== 'num') fail('screen every needs a number of seconds', n);
        end();
        return { k: 'screen', mode: 'every', seconds: Number(n.v), line };
      }
      fail('screen is followed by on, off or every <seconds>', tok);
    }
    case 'procedure': case 'function': {
      const name = tokens[p.at++];
      if (name?.t !== 'word') fail(`a ${word} needs a name`, name);
      const params = [];
      if (tokens[p.at]?.v === '(') {
        p.at++;
        if (tokens[p.at]?.v !== ')') for (;;) {
          let ref = false;
          if (tokens[p.at]?.t === 'word' && tokens[p.at].v.toLowerCase() === 'ref') { ref = true; p.at++; }
          const v = variable();
          params.push({ ...v, ref });
          if (tokens[p.at]?.v === ',') { p.at++; continue; }
          break;
        }
        if (tokens[p.at]?.v !== ')') fail('the parameters are not closed with )');
        p.at++;
      }
      end();
      return { k: word, name: name.v, params, line };
    }
    case 'endprocedure': case 'endfunction': end(); return { k: word, line };
    case 'global': {
      const names = [];
      for (;;) {
        const tok = tokens[p.at++];
        if (tok?.t !== 'var') fail('global needs variables ($name)', tok);
        names.push(tok.v);
        if (tokens[p.at]?.v === ',') { p.at++; continue; }
        break;
      }
      end();
      return { k: 'global', names, line };
    }
    case 'use': {
      const tok = tokens[p.at++];
      if (tok?.t !== 'str') fail('use needs the name of a macro between quotes', tok);
      end();
      return { k: 'use', name: tok.v, line };
    }
  }
  // An action, or a procedure of the macro: its name and its arguments, each a term.
  const args = [];
  while (p.at < tokens.length) args.push(macroPrimary(tokens, p, line));
  return { k: 'do', name: first.v, args, line, col: first.col };
}

function macroType(t, line) {
  const name = t.name.toLowerCase();
  if (!MACRO_TYPES.has(name)) throw new MacroError(`"${t.name}" is not a type (int, float, text)`, line, t.col);
  for (const s of t.seps) if ([...s].length !== 1) throw new MacroError(`a separator is one character, not "${s}"`, line, t.col);
  if (name === 'text' && t.seps.length) throw new MacroError('text has no separators', line, t.col);
  if (name === 'int' && t.seps.length > 1) throw new MacroError('a whole number has one separator: the thousands', line, t.col);
  if (t.seps.length > 2) throw new MacroError('a number has at most two separators: thousands and decimal', line, t.col);
  if (t.seps.length === 2 && t.seps[0] === t.seps[1]) throw new MacroError('the thousands and the decimal separator are not the same character', line, t.col);
  if (name === 'int') return { kind: 'int', thousands: t.seps[0] ?? null, decimal: null };
  if (name === 'float') return t.seps.length === 2 ? { kind: 'float', thousands: t.seps[0], decimal: t.seps[1] } : { kind: 'float', thousands: null, decimal: t.seps[0] ?? '.' };
  return { kind: 'text' };
}

function macroMoveto(tokens, p, line) {
  const fail = message => { throw new MacroError(message, line, tokens[p.at]?.col); };
  const word = w => tokens[p.at]?.t === 'word' && tokens[p.at].v.toLowerCase() === w;
  const amount = () => {
    let sign = null;
    if (tokens[p.at]?.t === 'op' && (tokens[p.at].v === '+' || tokens[p.at].v === '-')) sign = tokens[p.at++].v;
    if (!sign && word('end')) { p.at++; return { end: true }; }
    const value = macroPrimary(tokens, p, line);
    return { value, sign };
  };
  if (p.at >= tokens.length) fail('moveto needs a place: line, column; column n; start; end');
  if (word('start') || word('end')) { const where = tokens[p.at++].v.toLowerCase(); if (p.at < tokens.length) fail('nothing comes after ' + where); return { k: 'moveto', where, line }; }
  if (word('column')) { p.at++; const col = amount(); if (p.at < tokens.length) fail('nothing comes after the column'); return { k: 'moveto', col, line }; }
  const ln = amount();
  if (tokens[p.at]?.v !== ',') fail('moveto line, column: a comma between them (or moveto column n)');
  p.at++;
  const col = amount();
  if (p.at < tokens.length) fail('nothing comes after the column');
  return { k: 'moveto', ln, col, line };
}

// ---------- The program ----------
// A macro's text into { main, procs, uses, problems }: main and each procedure / function a scope { code, labels },
// code a flat list of steps with jumps (an if, a switch: tests that jump); problems { line, col, severity, message }.
// `ctx`: { isAction(name), arities(name) (the argument counts an action takes, or null), systemVars (a Set),
// macros (the macro names a use may name, a Set; null: not checked) }.
function macroProgram(text, ctx = {}) {
  const problems = [], lines = String(text).split(/\r?\n/);
  const problem = (severity, message, line, col = 0) => problems.push({ severity, message, line, col });
  const statements = [];
  lines.forEach((t, i) => {
    try { const s = macroStatement(t, i + 1); if (s) statements.push(s); }
    catch (e) { if (e instanceof MacroError) problem('error', e.message, e.line ?? i + 1, e.col ?? 0); else throw e; }
  });
  const program = { main: macroScope('main'), procs: new Map(), uses: [], problems };
  let scope = program.main, current = null;
  const blocks = [];   // open if / switch blocks of the current scope
  const add = step => scope.code.push(step);
  const closeBlocks = (endLine, what) => {
    for (const b of blocks.splice(0)) problem('error', b.kind === 'if' ? `this if has no endif${what}` : `this switch has no endswitch${what}`, b.line);
  };
  for (const s of statements) {
    switch (s.k) {
      case 'procedure': case 'function':
        if (current) { problem('error', `a ${s.k} cannot be defined inside another (${current.name}, line ${current.line})`, s.line); break; }
        closeBlocks(s.line, '');
        if (program.procs.has(s.name.toLowerCase()) || MACRO_BUILTINS[s.name.toLowerCase()]) problem('error', `${s.name} is defined twice`, s.line);
        else if (MACRO_STATEMENTS.has(s.name.toLowerCase()) || MACRO_OPERATORS.has(s.name.toLowerCase())) problem('error', `${s.name} is a word of the macro language`, s.line);
        else if (ctx.isAction?.(s.name)) problem('error', `${s.name} is the name of an action`, s.line);
        current = { kind: s.k, name: s.name, params: s.params, line: s.line, ...macroScope(s.name), globals: new Set() };
        program.procs.set(s.name.toLowerCase(), current);
        scope = current;
        break;
      case 'endprocedure': case 'endfunction': {
        const kind = s.k.slice(3);
        if (!current || current.kind !== kind) { problem('error', `${s.k} without its ${kind}`, s.line); break; }
        closeBlocks(s.line, ` before ${s.k}`);
        add({ op: 'return', line: s.line, implicit: true });
        current.end = s.line;
        current = null;
        scope = program.main;
        break;
      }
      case 'global':
        if (!current) problem('error', 'global is for a procedure or function: the macro itself sees its variables', s.line);
        else for (const n of s.names) current.globals.add(n);
        break;
      case 'use':
        if (current) problem('error', 'use stands outside procedures and functions', s.line);
        else program.uses.push(s);
        break;
      case 'label':
        if (scope.labels.has(s.name)) problem('error', `the label :${s.name} is defined twice (line ${scope.labels.get(s.name).line})`, s.line);
        else scope.labels.set(s.name, { at: scope.code.length, line: s.line });
        add({ op: 'label', name: s.name, line: s.line });
        break;
      case 'if': {
        const b = { kind: 'if', line: s.line, ends: [], test: null };
        b.test = { op: 'test', cond: s.cond, to: null, line: s.line };
        add(b.test);
        blocks.push(b);
        break;
      }
      case 'elseif': case 'else': {
        const b = blocks.at(-1);
        if (b?.kind === 'switch' && s.k === 'else') {
          if (b.elsed) { problem('error', 'this switch has an else already', s.line); break; }
          if (b.test) { const j = { op: 'jump', to: null, line: s.line }; add(j); b.ends.push(j); b.test.to = scope.code.length; b.test = null; }
          else if (b.cases) { const j = { op: 'jump', to: null, line: s.line }; add(j); b.ends.push(j); }
          b.elsed = true;
          break;
        }
        if (b?.kind !== 'if') { problem('error', `${s.k} without its if`, s.line); break; }
        if (b.elsed) { problem('error', `${s.k} after the else of this if`, s.line); break; }
        const j = { op: 'jump', to: null, line: s.line };
        add(j);
        b.ends.push(j);
        b.test.to = scope.code.length;
        if (s.k === 'elseif') { b.test = { op: 'test', cond: s.cond, to: null, line: s.line }; add(b.test); }
        else { b.test = null; b.elsed = true; }
        break;
      }
      case 'endif': {
        const b = blocks.at(-1);
        if (b?.kind !== 'if') { problem('error', b ? `endif inside the switch of line ${b.line} (endswitch first)` : 'endif without its if', s.line); break; }
        blocks.pop();
        if (b.test) b.test.to = scope.code.length;
        for (const j of b.ends) j.to = scope.code.length;
        break;
      }
      case 'ifline': {
        const test = { op: 'test', cond: s.cond, to: null, line: s.line };
        add(test);
        add(macroStep(s.step));
        test.to = scope.code.length;
        break;
      }
      case 'switch': {
        const slot = `#switch${scope.code.length}`;
        add({ op: 'set', name: slot, value: s.value, line: s.line, hidden: true });
        blocks.push({ kind: 'switch', line: s.line, slot, ends: [], test: null, cases: 0 });
        break;
      }
      case 'case': {
        const b = blocks.at(-1);
        if (b?.kind !== 'switch') { problem('error', 'case outside a switch', s.line); break; }
        if (b.elsed) { problem('error', 'case after the else of this switch', s.line); break; }
        if (b.cases) { const j = { op: 'jump', to: null, line: s.line }; add(j); b.ends.push(j); }
        if (b.test) b.test.to = scope.code.length;
        const slot = { k: 'var', name: b.slot, hidden: true };
        const cond = s.values.map(v => ({ k: 'cmp', op: s.op, a: slot, b: v })).reduce((a, c) => a ? { k: 'or', a, b: c } : c, null);
        b.test = { op: 'test', cond, to: null, line: s.line };
        add(b.test);
        b.cases++;
        break;
      }
      case 'endswitch': {
        const b = blocks.at(-1);
        if (b?.kind !== 'switch') { problem('error', b ? `endswitch inside the if of line ${b.line} (endif first)` : 'endswitch without its switch', s.line); break; }
        blocks.pop();
        if (b.test) b.test.to = scope.code.length;
        for (const j of b.ends) j.to = scope.code.length;
        break;
      }
      default:
        add(macroStep(s));
    }
  }
  closeBlocks(null, '');
  if (current) problem('error', `this ${current.kind} has no end${current.kind}`, current.line);
  macroCheck(program, ctx);
  problems.sort((a, b) => a.line - b.line || (a.severity === 'error' ? -1 : 1));
  return program;
}

const macroScope = name => ({ name, code: [], labels: new Map() });
const macroStep = s => ({ op: s.k, ...s });

// ---------- Checking ----------
// After reading: names and jumps that do not exist, what never runs, what is never used (3.10).
function macroCheck(program, ctx) {
  const problems = program.problems, problem = (severity, message, line, col = 0) => problems.push({ severity, message, line, col });
  const scopes = [program.main, ...program.procs.values()];
  const called = new Set();
  const sysVars = ctx.systemVars;
  // The values in an expression: variables read, system variables, calls.
  const walk = (e, fn) => { if (!e) return; fn(e); for (const k of ['a', 'b', 'value', 'item', 'sep']) walk(e[k], fn); for (const a of e.args ?? []) walk(a, fn); };
  for (const scope of scopes) {
    const proc = scope === program.main ? null : scope;
    const written = new Set(proc ? proc.params.map(p => p.name) : []), read = [];
    const jumps = [];
    let gosubs = 0;
    for (const step of scope.code) {
      const exprs = [step.cond, step.value, step.item, step.sep, ...(step.args ?? []), step.ln?.value, step.col?.value].filter(Boolean);
      for (const e of exprs) walk(e, x => {
        if (x.k === 'var' && !x.hidden) read.push({ name: x.name, line: step.line });
        if (x.k === 'sys' && sysVars && !sysVars.has(x.name.toLowerCase())) problem('error', `$$${x.name} is not a system variable`, step.line, x.col ?? 0);
        if (x.k === 'call') {
          const name = x.name.toLowerCase(), b = MACRO_BUILTINS[name], f = program.procs.get(name);
          if (b) { if (x.args.length !== b[0]) problem('error', `${x.name} takes ${b[0]} value${b[0] === 1 ? '' : 's'}, not ${x.args.length}`, step.line, x.col); }
          else if (f) {
            called.add(name);
            if (f.kind !== 'function') problem('error', `${f.name} is a procedure: it gives no value (use it as a step)`, step.line, x.col);
            else macroArgs(f, x.args, step.line, problem);
          } else if (!program.uses.length) problem('error', `there is no function ${x.name}`, step.line, x.col);
        }
      });
      if (['set', 'inc', 'dec', 'append', 'copy'].includes(step.op) && !step.hidden) written.add(step.name);
      if (step.op === 'inc' || step.op === 'dec' || step.op === 'append') read.push({ name: step.name, line: step.line, self: true });
      if (step.op === 'goto' || step.op === 'gosub') jumps.push(step);
      if (step.op === 'gosub') gosubs++;
      if (step.op === 'return' && !step.implicit) {
        if (proc?.kind === 'procedure' && step.value) problem('error', 'a procedure returns no value (a function does)', step.line);
        if (proc?.kind === 'function' && !step.value) problem('error', 'a function returns a value: return <value>', step.line);
      }
      if (step.op === 'do') {
        const name = step.name.toLowerCase(), f = program.procs.get(name);
        if (f) {
          called.add(name);
          if (f.kind === 'function') problem('error', `${f.name} is a function: use its value (set $x = ${f.name}(...))`, step.line, step.col);
          else macroArgs(f, step.args, step.line, problem);
        } else if (ctx.isAction && !ctx.isAction(step.name) && !program.uses.length) problem('error', `there is no action or procedure "${step.name}"`, step.line, step.col);
        else if (ctx.arities) {
          const counts = ctx.arities(step.name);
          if (counts && !counts.includes(step.args.length)) problem('error', `${step.name} takes ${counts.join(' or ')} value${counts.length === 1 && counts[0] === 1 ? '' : 's'}, not ${step.args.length}`, step.line, step.col);
        }
      }
    }
    for (const j of jumps) if (!scope.labels.has(j.name)) {
      const elsewhere = scopes.find(s => s !== scope && s.labels.has(j.name));
      problem('error', elsewhere ? `:${j.name} is in ${elsewhere === program.main ? 'the macro' : elsewhere.name}: a jump stays inside its procedure or function` : `there is no label :${j.name}`, j.line);
    }
    // Warnings
    for (const r of read) if (!written.has(r.name) && !(proc?.globals.has(r.name))) problem('warning', `$${r.name} is read before anything gives it a value`, r.line);
    const targets = new Set(jumps.map(j => j.name));
    for (const [name, l] of scope.labels) if (!targets.has(name)) problem('warning', `nothing jumps to :${name}`, l.line);
    if (!proc && !gosubs) for (const step of scope.code) if (step.op === 'return') problem('warning', 'a return that no gosub reaches', step.line);
    for (let i = 0; i < scope.code.length - 1; i++) {
      const step = scope.code[i], nextStep = scope.code[i + 1];
      if (['stop', 'goto'].includes(step.op) && !['label', 'return'].includes(nextStep.op) && !scope.code.some(s => s.to === i + 1))
        { problem('warning', 'this line never runs (it follows a ' + step.op + ')', nextStep.line); }
    }
    if (proc?.kind === 'function') {
      const last = [...scope.code].reverse().find(s => !s.implicit);
      if (!last || last.op !== 'return') problem('warning', `${proc.name} can reach its end without a return (it then gives "")`, proc.end ?? proc.line);
    }
    if (proc) for (const r of new Set([...written].filter(n => !proc.params.some(p => p.name === n))))
      if (program.main.code.some(s => s.name === r && ['set', 'copy', 'append', 'inc', 'dec'].includes(s.op)) && !proc.globals.has(r))
        problem('warning', `$${r} is the procedure's own; the macro's $${r} is not changed (global $${r} to change it)`, proc.line);
  }
  for (const [name, p] of program.procs) if (!called.has(name) && !program.uses.length) problem('warning', `nothing calls ${p.name}`, p.line);
  if (ctx.macros) for (const u of program.uses) if (!ctx.macros.has(u.name.toLowerCase())) problem('error', `there is no macro "${u.name}" to use`, u.line);
}

function macroArgs(f, args, line, problem) {
  if (args.length !== f.params.length) problem('error', `${f.name} takes ${f.params.length} value${f.params.length === 1 ? '' : 's'}, not ${args.length}`, line);
  f.params.forEach((p, i) => { if (p.ref && args[i] && args[i].k !== 'var') problem('error', `${f.name}: $${p.name} is a ref: give a variable`, line); });
}

// ---------- Running ----------
// Runs a program (without errors) against `env`. Resolves to { ok, stopped, reason, error: { line, message } }.
// env: action(name, args), type(text), moveto(place), find(text, flags) (true when found), replace(from, to, flags),
// selection(), newDoc(name), show(name), showRecent(), open(path), isOpen(name), sys(name), loadMacro(name),
// screen(mode, seconds), step(line) (after each step: screen updates, Esc; true to stop). Each may return a promise.
// options.pause(info), step by step (3.6): before each line of this macro (not of a macro it uses); true stops.
// info: line, level (the calls and gosubs it is in), vars() (the frame's and the macro's), found, error, errorText.
async function runMacro(program, env, options = {}) {
  const errorsOf = p => p.problems.filter(x => x.severity === 'error');
  if (errorsOf(program).length) return { ok: false, error: errorsOf(program)[0], reason: 'invalid' };
  const procs = new Map(program.procs);
  for (const u of program.uses) {
    const text = await env.loadMacro(u.name);
    if (text == null) return { ok: false, error: { line: u.line, message: `there is no macro "${u.name}" to use` } };
    const used = macroProgram(text, { systemVars: null });
    if (errorsOf(used).length) return { ok: false, error: { line: u.line, message: `"${u.name}", line ${errorsOf(used)[0].line}: ${errorsOf(used)[0].message}` } };
    for (const [name, p] of used.procs) if (!procs.has(name)) procs.set(name, Object.assign(p, { foreign: true }));
  }
  const state = { notfound: options.notfound ?? 'stop', onerror: options.onerror ?? 'stop', found: true, error: false, errorText: '', depth: 0, steps: 0, level: 0 };
  const main = { vars: new Map(), scope: program.main, globals: new Set(), refs: new Map() };
  const sys = async name => {
    const n = name.toLowerCase();
    if (n === 'found') return state.found ? 'true' : 'false';
    if (n === 'error') return state.error ? 'true' : 'false';
    if (n === 'errortext') return state.errorText;
    const v = await env.sys(n);
    if (v === undefined) throw new MacroError(`$$${name} is not a system variable`);
    return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '');
  };
  // A variable of a frame: its own, a global (the macro's), or a ref (the caller's variable).
  const slot = (frame, name) => {
    if (frame.refs.has(name)) { const r = frame.refs.get(name); return slot(r.frame, r.name); }
    if (frame !== main && frame.globals.has(name)) return { frame: main, name };
    return { frame, name };
  };
  // A variable nothing gave a value yet reads as empty text (the check warns about it).
  const getVar = (frame, name) => {
    const s = slot(frame, name);
    return s.frame.vars.get(s.name) ?? { s: '', type: null };
  };
  const setVar = (frame, name, s, type, line) => {
    const at = slot(frame, name), had = at.frame.vars.get(at.name);
    if (type && had?.type && JSON.stringify(type) !== JSON.stringify(had.type)) throw new MacroError(`$${name} has a type already`, line);
    const t = type ?? had?.type ?? null;
    at.frame.vars.set(at.name, { s: macroFit(s, t, name, line), type: t });
  };
  const truth = v => !(v.s === 'false' || v.s === '' || v.s === '0');
  const value = async (e, frame, line) => {
    switch (e.k) {
      case 'lit': return { s: e.s, type: null };
      case 'var': { const v = getVar(frame, e.name, line); return { s: v.s, type: v.type }; }
      case 'sys': return { s: await sys(e.name), type: null };
      case 'cat': return { s: (await value(e.a, frame, line)).s + (await value(e.b, frame, line)).s, type: null };
      case 'arith': return macroArithmetic(e.op, await value(e.a, frame, line), await value(e.b, frame, line), line);
      case 'not': return { s: truth(await value(e.a, frame, line)) ? 'false' : 'true' };
      case 'and': return { s: truth(await value(e.a, frame, line)) && truth(await value(e.b, frame, line)) ? 'true' : 'false' };
      case 'or': return { s: truth(await value(e.a, frame, line)) || truth(await value(e.b, frame, line)) ? 'true' : 'false' };
      case 'cmp': return { s: macroCompare(e.op, await value(e.a, frame, line), await value(e.b, frame, line), line) ? 'true' : 'false' };
      case 'opened': return { s: (await env.isOpen((await value(e.a, frame, line)).s)) ? 'true' : 'false' };
      case 'call': {
        const name = e.name.toLowerCase(), b = MACRO_BUILTINS[name];
        const args = [];
        for (const a of e.args) args.push((await value(a, frame, line)).s);
        if (b) {
          if (args.length !== b[0]) throw new MacroError(`${e.name} takes ${b[0]} values`, line);
          try { return { s: b[1](...args), type: null }; } catch (err) { if (err instanceof MacroError) err.line ??= line; throw err; }
        }
        const f = procs.get(name);
        if (!f || f.kind !== 'function') throw new MacroError(`there is no function ${e.name}`, line);
        return { s: await call(f, e.args, frame, line), type: null };
      }
    }
    throw new MacroError('a value that cannot be worked out', line);
  };
  // A call of a procedure or function: a frame of its own (its parameters; a ref names the caller's variable).
  const call = async (f, argExprs, frame, line) => {
    if (++state.depth > MACRO_DEPTH) throw new MacroError(`more than ${MACRO_DEPTH} calls within each other (a recursion that does not end?)`, line);
    const own = { vars: new Map(), scope: f, globals: f.globals ?? new Set(), refs: new Map() };
    if (argExprs.length !== f.params.length) throw new MacroError(`${f.name} takes ${f.params.length} values, not ${argExprs.length}`, line);
    for (let i = 0; i < f.params.length; i++) {
      const p = f.params[i], a = argExprs[i];
      if (p.ref) {
        if (a.k !== 'var') throw new MacroError(`${f.name}: $${p.name} is a ref: give a variable`, line);
        own.refs.set(p.name, slot(frame, a.name));
      } else {
        const v = await value(a, frame, line);
        own.vars.set(p.name, { s: macroFit(v.s, p.type, p.name, line), type: p.type });
      }
    }
    state.level++;
    try { return await run(own); } finally { state.depth--; state.level--; }
  };
  // What step by step shows: the frame's variables (a ref with the value it names) and the macro's.
  const snapshot = frame => {
    const list = [];
    const add = (f, where) => {
      for (const [name, v] of f.vars) list.push({ name, value: v.s, type: v.type?.kind ?? null, where });
      for (const name of f.refs.keys()) list.push({ name, value: getVar(f, name).s, type: null, where, ref: true });
    };
    if (frame !== main) add(frame, 'local');
    add(main, 'macro');
    return list;
  };
  // Runs a frame's scope from its first step; resolves to a function's value (or '').
  const run = async frame => {
    const code = frame.scope.code, back = [];
    let pc = 0;
    while (pc < code.length) {
      const step = code[pc];
      if (++state.steps % 64 === 0 || options.everyStep) { const r = env.step?.(step.line); if (r?.then ? await r : r) throw new MacroStop('stopped'); }
      if (options.pause && !frame.scope.foreign && step.op !== 'label' && step.op !== 'jump' && !step.implicit
        && await options.pause({ line: step.line, level: state.level, vars: () => snapshot(frame), found: state.found, error: state.error, errorText: state.errorText }))
        throw new MacroStop('stopped');
      try {
        const jumped = await exec(step, frame, back, pc);
        if (jumped?.ret !== undefined) return jumped.ret;
        if (jumped?.to !== undefined) { pc = jumped.to; continue; }
        if (['do', 'type', 'paste', 'moveto', 'find', 'replace', 'new', 'show', 'open', 'copy'].includes(step.op)) { state.error = false; state.errorText = ''; }
      } catch (e) {
        if (!(e instanceof MacroError) || state.onerror === 'stop') throw e;
        e.line ??= step.line;
        state.error = true;
        state.errorText = e.message;
      }
      pc++;
    }
    return '';
  };
  const label = (frame, name) => frame.scope.labels.get(name)?.at;
  const exec = async (step, frame, back, pc) => {
    const v = e => value(e, frame, step.line);
    switch (step.op) {
      case 'label': return;
      case 'test': return truth(await v(step.cond)) ? undefined : { to: step.to };
      case 'jump': return { to: step.to };
      case 'goto': { const at = label(frame, step.name); if (at === undefined) throw new MacroError(`there is no label :${step.name}`, step.line); return { to: at }; }
      case 'gosub': { const at = label(frame, step.name); if (at === undefined) throw new MacroError(`there is no label :${step.name}`, step.line); back.push(pc + 1); state.level++; return { to: at }; }
      case 'return':
        if (frame.scope === program.main) {
          if (!back.length) throw new MacroStop('return');
          state.level--;
          return { to: back.pop() };
        }
        if (!step.implicit && back.length) { state.level--; return { to: back.pop() }; }   // a gosub inside a procedure
        return { ret: step.value ? (await v(step.value)).s : '' };
      case 'stop': throw new MacroStop('stop');
      case 'set': return setVar(frame, step.name, (await v(step.value)).s, step.type, step.line);
      case 'inc': case 'dec': {
        const cur = getVar(frame, step.name, step.line);
        return setVar(frame, step.name, macroArithmetic(step.op === 'inc' ? '+' : '-', cur, { s: '1' }, step.line).s, null, step.line);
      }
      case 'append': {
        const at = slot(frame, step.name), had = at.frame.vars.get(at.name), item = (await v(step.item)).s;
        const sep = step.sep ? (await v(step.sep)).s : ', ';
        return setVar(frame, step.name, had?.s ? had.s + sep + item : item, null, step.line);
      }
      case 'copy': return setVar(frame, step.name, String(await env.selection() ?? ''), step.type, step.line);
      case 'paste': case 'type': return void await env.type((await v(step.value)).s);
      case 'moveto': {
        const amount = async a => a?.end ? { end: true } : a && { n: wholeNumber((await v(a.value)).s), relative: a.sign ? (a.sign === '-' ? -1 : 1) : 0 };
        return void await env.moveto({ where: step.where, line: await amount(step.ln), col: await amount(step.col) });
      }
      case 'find': {
        state.found = !!(await env.find((await v(step.args[0])).s, step.flags));
        if (!state.found && state.notfound === 'stop') throw new MacroStop('notfound', (await v(step.args[0])).s);
        return;
      }
      case 'replace': {
        const n = await env.replace((await v(step.args[0])).s, (await v(step.args[1])).s, step.flags);
        state.found = n > 0;
        if (!state.found && state.notfound === 'stop') throw new MacroStop('notfound', (await v(step.args[0])).s);
        return;
      }
      case 'new': return void await env.newDoc((await v(step.value)).s);
      case 'open': return void await env.open((await v(step.value)).s);
      case 'show': return void await (step.recent ? env.showRecent() : env.show((await v(step.value)).s));
      case 'notfound': state.notfound = step.value; return;
      case 'onerror': state.onerror = step.value; return;
      case 'screen': return void await env.screen?.(step.mode, step.seconds);
      case 'do': {
        const f = procs.get(step.name.toLowerCase());
        if (f) {
          if (f.kind === 'function') throw new MacroError(`${f.name} is a function: use its value`, step.line);
          await call(f, step.args, frame, step.line);
          return;
        }
        const args = [];
        for (const a of step.args) args.push((await v(a)).s);
        return void await env.action(step.name, args);
      }
    }
    throw new MacroError(`cannot run "${step.op}"`, step.line);
  };
  try {
    await run(main);
    return { ok: true, reason: 'end', vars: main.vars };
  } catch (e) {
    if (e instanceof MacroStop) return { ok: true, stopped: true, reason: e.reason, detail: e.detail, vars: main.vars };
    if (e instanceof MacroError) return { ok: false, reason: 'error', error: { line: e.line, message: e.message }, vars: main.vars };
    return { ok: false, reason: 'error', error: { line: null, message: String(e?.message ?? e) }, vars: main.vars };
  }
}

class MacroStop extends Error {
  constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail; }
}

// A value for a typed variable: it must fit (an int a whole number, a float a number; with the type's separators);
// it is written with them (a number made elsewhere, with "." as decimal point, written with the type's).
function macroFit(s, type, name, line) {
  if (!type || type.kind === 'text') return s;
  let n = parseMacroNumber(s, type);
  if (!n) {
    const plain = parseMacroNumber(s);
    if (!plain) throw new MacroError(`"${s}" does not fit $${name}:${type.kind}`, line);
    n = plain;
  }
  if (type.kind === 'int' && n.decimals) throw new MacroError(`"${s}" is not a whole number ($${name}:int)`, line);
  return formatMacroNumber(n.value, n.decimals, { width: n.width, thousands: type.thousands, decimal: type.decimal ?? '.' });
}

// Two values compared: as numbers when both are, else as text (case sensitive).
function macroCompare(op, a, b, line) {
  const x = parseMacroNumber(a.s, a.type), y = parseMacroNumber(b.s, b.type);
  if (['contains', 'starts', 'ends', 'matches'].includes(op)) {
    if (op === 'contains') return a.s.includes(b.s);
    if (op === 'starts') return a.s.startsWith(b.s);
    if (op === 'ends') return a.s.endsWith(b.s);
    try { return new RegExp(b.s).test(a.s); } catch { throw new MacroError(`"${b.s}" is not a valid regular expression`, line); }
  }
  const [l, r] = x && y ? [x.value, y.value] : [a.s, b.s];
  return op === '=' ? l === r : op === '<>' ? l !== r : op === '<' ? l < r : op === '>' ? l > r : op === '<=' ? l <= r : l >= r;
}
