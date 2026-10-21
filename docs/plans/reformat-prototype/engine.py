# Prototype of the one formatter for every language (PLAN-reformat.md). The engine knows roles only; a language
# gives its words, signs and attribute values (a dict mirroring the pack's `format` key).
# It changes only whitespace and line breaks outside strings and comments; tokens are never altered.
import re

class Tok:
    __slots__ = ('k', 't', 'cont', 'oi')
    def __init__(s, k, t, cont=False): s.k, s.t, s.cont, s.oi = k, t, cont, 0
    def __repr__(s): return f'{s.k}:{s.t!r}'

def low(cfg, w): return w if cfg.get('case') else w.lower()
def flags(cfg): return 0 if cfg.get('case') else re.I

# ================================================================ tokenizer
def all_signs(cfg):
    signs = set(cfg.get('signs', []))
    for g in cfg.get('groups', []): signs.update(g['pair'])
    for key in ('operators', 'compare', 'align', 'ends', 'continue', 'separators'):
        for p in cfg.get(key, []):
            if p != '\n' and not re.match(r'^[A-Za-z_]', p): signs.add(p)
    return sorted(signs, key=len, reverse=True)

def tokenize(text, cfg):
    if cfg.get('markup'): return tokenize_markup(text, cfg)
    com = cfg.get('comments', {})
    keep = [(re.compile(k if isinstance(k, str) else k['re'], re.M | re.S), None if isinstance(k, str) else k.get('after'))
            for k in cfg.get('keep', [])]
    word_re = re.compile(cfg.get('word', r'[A-Za-z_][A-Za-z0-9_]*'))
    signs = all_signs(cfg)
    toks, i, n = [], 0, len(text)
    def at_word_start(i): return i == 0 or text[i - 1] in ' \t\n'
    while i < n:
        c = text[i]
        if c == '\n': toks.append(Tok('nl', '\n')); i += 1; continue
        if c in ' \t':
            j = i
            while j < n and text[j] in ' \t': j += 1
            toks.append(Tok('ws', text[i:j])); i = j; continue
        hit = None
        for k, after in keep:
            if after is not None:
                j = i - 1
                while j >= 0 and text[j] in ' \t': j -= 1
                if j >= 0 and text[j] != '\n' and text[j] not in after: continue
            m = k.match(text, i)
            if m and m.end() > i: hit = ('str', m.end()); break
        if not hit:
            for o, cl in com.get('block', []):
                if text.startswith(o, i):
                    j = text.find(cl, i + len(o)); hit = ('com', n if j < 0 else j + len(cl)); break
        if not hit:
            for o in com.get('line', []):
                spaced = o.startswith(' ')                  # ' ;' : only after a space or at a line start
                worded = o.endswith(' ')                    # 'rem ' : a word, then a space or the line end
                o2 = o.strip()
                if text.startswith(o2, i) and (not spaced or at_word_start(i)) and \
                   (not worded or i + len(o2) >= n or text[i + len(o2)] in ' \t\n'):
                    j = text.find('\n', i); hit = ('com', n if j < 0 else j); break
        if not hit:
            for q in cfg.get('strings', []):
                o = q['open']; cl = q.get('close', o)
                if text.startswith(o, i):
                    j = i + len(o)
                    while j < n:
                        if q.get('escape') and text[j] == q['escape']: j += 2; continue
                        if text.startswith(cl, j):
                            if q.get('double') and text.startswith(cl, j + len(cl)): j += 2 * len(cl); continue
                            j += len(cl); break
                        if text[j] == '\n' and not q.get('lines'): break
                        j += 1
                    hit = ('str', min(j, n)); break
        if hit:
            toks.append(Tok(hit[0], text[i:hit[1]])); i = hit[1]; continue
        m = word_re.match(text, i)
        if m and m.end() > i: toks.append(Tok('w', m.group())); i = m.end(); continue
        s = next((s for s in signs if text.startswith(s, i)), None)
        if s: toks.append(Tok('s', s)); i += len(s); continue
        toks.append(Tok('s', c)); i += 1
    return toks

def tokenize_markup(text, cfg):
    """XML / HTML: '<name' opens a start tag, then attribute words, '=', values, then '>' or '/>'; an end tag is
    one token '</name>'; text runs are 'text' tokens."""
    toks, i, n = [], 0, len(text)
    verb = cfg.get('verbatimElements', [])
    def ws(i):
        j = i
        while j < n and text[j] in ' \t': j += 1
        return j
    while i < n:
        c = text[i]
        if c == '\n': toks.append(Tok('nl', '\n')); i += 1; continue
        if c in ' \t': j = ws(i); toks.append(Tok('ws', text[i:j])); i = j; continue
        sp = next(((o, cl, k) for o, cl, k in (('<!--', '-->', 'com'), ('<![CDATA[', ']]>', 'str'), ('<?', '?>', 'str'), ('<!', '>', 'str'))
                   if text.startswith(o, i)), None)
        if sp:
            j = text.find(sp[1], i); j = n if j < 0 else j + len(sp[1])
            toks.append(Tok(sp[2], text[i:j])); i = j; continue
        m = re.compile(r'</\s*([\w:.-]+)\s*>').match(text, i)
        if m: toks.append(Tok('s', m.group())); i = m.end(); continue
        m = re.compile(r'<([\w:.-]+)').match(text, i)
        if m:
            name = m.group(1); toks.append(Tok('s', m.group())); i = m.end()
            while i < n:
                c = text[i]
                if c == '\n': toks.append(Tok('nl', '\n')); i += 1; continue
                if c in ' \t': j = ws(i); toks.append(Tok('ws', text[i:j])); i = j; continue
                if text.startswith('/>', i): toks.append(Tok('s', '/>')); i += 2; break
                if c == '>': toks.append(Tok('s', '>')); i += 1; break
                if c in '"\'':
                    j = text.find(c, i + 1); j = n if j < 0 else j + 1
                    toks.append(Tok('str', text[i:j])); i = j; continue
                if c == '=': toks.append(Tok('s', '=')); i += 1; continue
                m2 = re.compile(r'[^\s=>/"\']+').match(text, i)
                if m2: toks.append(Tok('w', m2.group())); i = m2.end()
                else: toks.append(Tok('s', c)); i += 1
            if low(cfg, name) in verb and toks[-1].t == '>':
                m3 = re.compile(r'</\s*' + re.escape(name) + r'\s*>', re.I).search(text, i)
                j = m3.start() if m3 else n
                if j > i: toks.append(Tok('str', text[i:j])); i = j
            continue
        j = i
        while j < n and text[j] not in '<\n': j += 1
        t = text[i:j].rstrip(' \t')
        toks.append(Tok('text', t)); i += len(t)
    return toks

def to_lines(toks):
    lines = [[]]
    for t in toks:
        if t.k == 'nl': lines.append([]); continue
        if '\n' in t.t:
            parts = t.t.split('\n')
            lines[-1].append(Tok(t.k, parts[0]))
            for p in parts[1:]: lines.append([Tok(t.k, p, cont=True)])
        else: lines[-1].append(t)
    for l in lines:
        if not (l and l[0].cont):
            oi = len(l[0].t.expandtabs(4)) if l and l[0].k == 'ws' else 0
            while l and l[0].k == 'ws': l.pop(0)
            if l: l[0].oi = oi
        while l and l[-1].k == 'ws': l.pop()
    return lines

# ================================================================ helpers
def phrase_at(cfg, line, i, phrases):
    """The longest of `phrases` at token i ('end if', 'left outer join', '<>'): (phrase, tokens used) or None."""
    best = None
    for p in phrases:
        parts = p.split(' ') if re.match(r'^[A-Za-z_#@$]', p) else [p]
        j, ok = i, True
        for k, part in enumerate(parts):
            if k:
                if j < len(line) and line[j].k == 'ws': j += 1
                else: ok = False; break
            if j >= len(line) or line[j].k not in ('w', 's') or low(cfg, line[j].t) != low(cfg, part): ok = False; break
            j += 1
        if ok and (best is None or j - i > best[1]): best = (p, j - i)
    return best

def code_idx(line): return [i for i, t in enumerate(line) if t.k != 'ws']
def text_of(toks): return ''.join(t.t for t in toks)
def is_code(t): return t.k in ('w', 's', 'str', 'text')

class Frame:
    _n = 0
    def __init__(s, kind, **kw):
        Frame._n += 1
        s.id, s.kind = Frame._n, kind
        s.name = None; s.col = s.indent = s.content = s.closecol = s.midcol = 0; s.opcol = None
        s.opener = s.opener_last = s.closer = None; s.until = None; s.ends_before = []; s.verbatim = False
        s.line = 0; s.group = None; s.block = None; s.item = None; s.body_line = None; s.clauses = []
        s.lastbase = None; s.ends_after = []; s.wait = None; s.end_tok = None; s.middles = []; s.untils = []; s.odef = {}; s.tag = None; s.children = []
        s.__dict__.update(kw)

def group_cfg(cfg, opener): return next((g for g in cfg.get('groups', []) if g['pair'][0] == opener), None)
def sty(cfg, key, g=None):
    if g and key in g: return g[key]
    return cfg['style'].get(key)

# ================================================================ structure
def simulate(lines, cfg, override=None):
    override = override or {}
    step = cfg.get('indent', 2)
    B = cfg.get('blocks', {})
    openers, middles, closers = B.get('open', []), B.get('middle', []), B.get('close', {})
    open_ph = [o['w'] for o in openers]; mid_ph = [m['w'] for m in middles]; close_ph = list(closers.keys())
    stmts, ops, ends = cfg.get('statements', {}), cfg.get('operators', []), cfg.get('ends', [])
    items = cfg.get('items', {})
    item_start = [p for it in items.values() for p in it['start']]
    item_clause = [p for it in items.values() for p in it['clause']]
    keep_lines = [re.compile(r, flags(cfg)) for r in cfg.get('keepLines', [])]
    cont_tokens, single_body = cfg.get('continue', []), cfg.get('singleBody', [])
    stack, indents, at_start, first_role, frames, line_frames = [], [], [], [], [], []
    def nearest(pred, below=None):
        for k in range(len(stack) - 1 if below is None else below, -1, -1):
            if pred(stack[k]): return k
        return None
    def pop_to(k, tok=None):
        for f in stack[k:]:                                # an element closed by an implied end tag
            if f.kind == 'elem' and f.closer is None and tok is not None and f.end_tok is None: f.end_tok = tok
        del stack[k:]
    def top(): return stack[-1] if stack else None
    def active_stmt():
        for k in range(len(stack) - 1, -1, -1):
            if stack[k].kind == 'stmt': return k
            if stack[k].kind != 'clause': return None
        return None
    def odef(p): return next(o for o in openers if o['w'] == p)
    def mdef(p): return next(m for m in middles if m['w'] == p)
    def close_targets(p):
        c = closers[p]
        if isinstance(c, dict): c = c.get('of')
        if c is None: return None
        return [low(cfg, x) for x in ([c] if isinstance(c, str) else c)]

    cur = {'li': 0}; strays = {}; unclosed = []
    def free_closer(line, i):
        """A closer that needs no opener (Pascal's end., a shell pattern's )): `freeClosers`, tried on the rest of the
        line and on the whole line."""
        return any(re.match(x, text_of(line[i:]), flags(cfg)) or re.match(x, text_of(line), flags(cfg))
                   for x in cfg.get('freeClosers', []))
    def skipped(k):
        """Frames that a closer of an outer frame ends: they missed their own closer."""
        for f in stack[k + 1:]:
            if f.kind == 'group' or (f.kind == 'block' and f.closes is not False and not f.ends_before):
                unclosed.append(f)
    def classify(line, i, line_start):
        t = line[i]
        if t.k not in ('w', 's'): return None, 1
        if cfg.get('markup'):
            if t.t.startswith('</'): return ('eclose',), 1
            if t.t.startswith('<'): return ('topen',), 1
            if t.t in ('>', '/>') and nearest(lambda f: f.kind == 'tag') is not None: return ('tend',), 1
            return None, 1
        p = phrase_at(cfg, line, i, close_ph)
        if p:
            tg = close_targets(p[0])
            k = nearest(lambda f: f.kind in ('block', 'single') and f.closes and (tg is None or f.name in tg))
            strict = isinstance(closers[p[0]], dict) and closers[p[0]].get('strict')
            if k is not None and (not strict or k == len(stack) - 1): return ('bclose', p[0], k), p[1]
            if k is None and not strict:
                if not free_closer(line, i): strays[(cur['li'], i)] = p[0]
                return ('stray',), p[1]                      # its words are not read as openers
        p = phrase_at(cfg, line, i, mid_ph)
        if p:
            m = mdef(p[0])
            k = nearest(lambda f: f.kind == 'block' and (not m.get('of') or f.name in [low(cfg, x) for x in m['of']]))
            if k is not None and all(f.kind in ('cond', 'single', 'stmt', 'clause') for f in stack[k + 1:]) \
               and (not m.get('lineStart') or line_start):
                return ('bmid', p[0], k), p[1]
        f = top()
        if f and f.kind == 'cond':
            p = phrase_at(cfg, line, i, f.until)
            if p: return ('until', p[0]), p[1]
        if line_start:
            for o in openers:
                if 'line' in o and re.match(o['line'], text_of(line[i:]), flags(cfg)):
                    k = nearest(lambda f: f.kind in ('block', 'group'))
                    if 'inside' not in o or (k is not None and stack[k].name in [low(cfg, x) for x in o['inside']]):
                        return ('bopen', o['w']), 1
        p = phrase_at(cfg, line, i, open_ph)
        if p and 'line' in odef(p[0]): p = None
        if p:
            o = odef(p[0])
            before, after = text_of(line[:i]), text_of(line[i + p[1]:])
            k = cur['li']                                    # a line continued (VB's _): its next line counts too
            while cont_after and k + 1 < len(lines) and cont_after.search(text_of([t for t in lines[k] if t.k != 'com'])):
                k += 1; after = after + ' ' + text_of(lines[k])
            ok = ('before' not in o or re.search(o['before'], before, flags(cfg))) and \
                 ('when' not in o or re.search(o['when'], after, flags(cfg)))
            if ok and 'notInside' in o and any(f.kind == 'block' and f.name in [low(cfg, x) for x in o['notInside']] for f in stack):
                ok = False
            if ok and 'inside' in o:
                k = nearest(lambda f: f.kind in ('block', 'group'))
                ok = k is not None and stack[k].name in [low(cfg, x) for x in o['inside']]
            if ok: return ('bopen', p[0]), p[1]
        if t.k == 's':
            g = group_cfg(cfg, t.t)
            if g: return ('gopen', g), 1
            k = nearest(lambda f: f.kind == 'group' and f.group['pair'][1] == t.t)
            if k is not None: return ('gclose', k), 1
            if any(g['pair'][1] == t.t for g in cfg.get('groups', [])) and not free_closer(line, i):
                strays[(cur['li'], i)] = t.t
            if t.t in ends: return ('end',), 1
        if line_start:
            k = active_stmt()
            if k is not None:
                p = phrase_at(cfg, line, i, stack[k].clauses)
                if p: return ('clause', p[0], k), p[1]
            if stmts:
                p = phrase_at(cfg, line, i, list(stmts.keys()))
                if p: return ('stmt', p[0]), p[1]
            for key, ph in (('op', ops), ('item', item_start), ('iclause', item_clause), ('cont', cont_tokens)):
                p = phrase_at(cfg, line, i, ph)
                if p: return (key, p[0]), p[1]
        return None, 1

    item_owner = None
    cont_after = re.compile(cfg['continueAfter']) if cfg.get('continueAfter') else None
    prev_text = None; prev_base = 0
    for li, line in enumerate(lines):
        verbatim = bool(line and line[0].cont) or any(f.verbatim for f in stack)
        if '\n' in ends:                                     # a statement ends with its line
            while stack and stack[-1].kind == 'single' and stack[-1].body_line is not None and stack[-1].body_line < li:
                stack.pop()
        for f in stack:
            if f.kind == 'single' and f.body_line is None and f.line < li and line and not verbatim: f.body_line = li
        if not line or (verbatim and not any(t.k in ('w', 's') for t in line)):
            indents.append(None); at_start.append(top()); first_role.append(None); line_frames.append(list(stack))
            continue
        ci = code_idx(line); fi = ci[0]
        if verbatim:
            fi = next(i for i, t in enumerate(line) if t.k in ('w', 's'))
        changed = True
        while changed and stack:
            changed = False
            f = stack[-1]
            if f.ends_before and phrase_at(cfg, line, fi, f.ends_before):
                stack.pop(); changed = True
            elif f.kind == 'single' and phrase_at(cfg, line, fi, single_body):
                stack.pop(); changed = True
            elif cfg.get('markup') and f.kind == 'elem' and line[fi].k == 's' and line[fi].t.startswith('<')                     and not line[fi].t.startswith('</') and                     low(cfg, f.name) in cfg.get('autoClose', {}).get(low(cfg, line[fi].t[1:]), []):
                pop_to(len(stack) - 1, line[fi]); changed = True
        cur['li'] = li
        role, used0 = classify(line, fi, True)
        f = top()
        col = f.content if f else 0
        if f and f.kind == 'stmt' and f.line < li: col = f.content
        # a ( that starts a line of a statement (declare x ROW, then ( on the next line): at the statement's column
        if f and f.kind == 'stmt' and f.line < li and role and role[0] == 'gopen': col = f.col
        r = role[0] if role else None
        if r == 'gclose': col = stack[role[1]].closecol
        elif r == 'eclose':
            k = nearest(lambda x: x.kind == 'elem' and low(cfg, x.name) == low(cfg, line[fi].t[2:-1].strip()))
            if k is not None: col = stack[k].closecol
        elif r == 'bclose': col = stack[role[2]].closecol
        elif r == 'bmid': col = stack[role[2]].midcol
        elif r == 'until': col = f.block.midcol
        elif r == 'clause': col = stack[role[2]].col
        elif r == 'stmt':
            k = active_stmt()
            if k is not None: pop_to(k); f = top(); col = f.content if f else 0
        elif r == 'iclause':
            it = f.item if f else None
            if it and it.get('closed_line') == li - 1: col = it['col'] + len(it['kind']) - len(role[1])
            elif it: col = it['col']
        elif r in ('cont', 'op') and f and f.lastbase is not None and (f.kind not in ('group', 'cond', 'clause') or
                                                                      (f.kind == 'group' and f.group.get('block'))):
            col = f.lastbase + step; r = 'cont'
        elif r in ('cont', 'op') and f is None:
            col = prev_base + step; r = 'cont'
        if r is None and f is not None and f.kind == 'group' and any(re.match(x, text_of(line[fi:]), flags(cfg)) for x in cfg.get('labels', [])):
            col = f.closecol                                 # public: at the column of the class's braces
        if r != 'cont' and cont_after and prev_text is not None and cont_after.search(prev_text) and f and f.lastbase is not None:
            col = f.lastbase + step; r = 'cont'
        elif r != 'cont' and cont_after and prev_text is not None and cont_after.search(prev_text) and f is None:
            col = (prev_base or 0) + step; r = 'cont'
        if cfg.get('keepIndent') and (f is None or f.kind != 'group'): col = line[fi].oi
        if any(k.search(text_of(line)) for k in keep_lines): col = 0
        if li in override: col = override[li]
        if verbatim: col = None
        if f and r != 'cont': f.lastbase = col
        if r != 'cont': prev_base = col
        prev_text = text_of([t for t in line if t.k != 'com'])
        indents.append(col); at_start.append(top()); first_role.append(role); line_frames.append(list(stack))
        cols, x = [], col or 0
        for t in line: cols.append(x); x += len(t.t)
        i = 0
        while i < len(line):
            t = line[i]
            if t.k == 'com' and cfg.get('markup'):
                pe = nearest(lambda x: x.kind == 'elem')
                if pe is not None: stack[pe].children.append(t)
            if t.k not in ('w', 's'): i += 1; continue
            role, used = (role, used0) if i == fi else classify(line, i, False)
            if i == fi: role0 = role
            if not role:
                if stack and stack[-1].ends_after and low(cfg, t.t) in stack[-1].ends_after: stack.pop()
                i += used; continue
            r = role[0]; here = cols[i]
            nxt = next((j for j in range(i + used, len(line)) if line[j].k != 'ws'), None)
            nxt_code = nxt is not None and line[nxt].k != 'com'
            if r == 'gopen':
                g = role[1]; base = sty(cfg, 'base', g)
                fr = Frame('group', name=t.t, group=g, col=here, indent=col, line=li, opener=t)
                if base == 'word':
                    alone = i == fi
                    fr.content = cols[nxt] if nxt_code else here + (step if alone else 1)
                    fr.closecol = here
                else:
                    fr.content = col + step; fr.closecol = col
                fr.opcol = here + 1 if base == 'word' else col + step
                stack.append(fr); frames.append(fr)
            elif r == 'gclose':
                k = role[1]; fr = stack[k]; fr.closer = t; skipped(k); pop_to(k)
                w = stack[-1] if stack else None
                if w is not None and w.kind == 'single' and getattr(w, 'wait', None) is fr.opener:
                    w.wait = None
                    after = next((line[j] for j in range(i + 1, len(line)) if line[j].k not in ('ws', 'com')), None)
                    if after is not None and phrase_at(cfg, [after], 0, single_body): stack.pop()
                    elif after is not None: w.body_line = li
                if stack and stack[-1].item and stack[-1].item.get('source') is fr: stack[-1].item['closed_line'] = li
            elif r == 'topen':
                name = low(cfg, t.t[1:])
                closes = cfg.get('autoClose', {}).get(name, [])
                k2 = nearest(lambda x: x.kind == 'elem')
                if k2 is not None and low(cfg, stack[k2].name) in closes: pop_to(k2, t)
                fr = Frame('tag', name=t.t[1:], col=here, indent=col, line=li, opener=t)
                fr.content = cols[nxt] if nxt_code else here + len(t.t) + 1
                fr.closecol = here
                stack.append(fr); frames.append(fr)
                pe = nearest(lambda x: x.kind == 'elem')
                if pe is not None: stack[pe].children.append(t)
            elif r == 'tend':
                k = nearest(lambda x: x.kind == 'tag'); tag = stack[k]; tag.closer = t; pop_to(k)
                name = low(cfg, tag.name)
                if t.t == '>' and name not in cfg.get('void', []):
                    el = Frame('elem', name=tag.name, col=tag.col, indent=col, line=li, opener=t, tag=tag)
                    el.content = tag_indent(indents, tag) + step; el.closecol = tag_indent(indents, tag)
                    stack.append(el); frames.append(el)
            elif r == 'eclose':
                name = t.t[2:-1].strip()
                k = nearest(lambda x: x.kind == 'elem' and low(cfg, x.name) == low(cfg, name))
                if k is not None: stack[k].closer = t; pop_to(k, t)
            elif r == 'bopen':
                o = odef(role[1]); base = sty(cfg, 'base')
                fr = Frame(o.get('kind', 'block'), name=low(cfg, role[1]), col=here, indent=col, line=li, opener=t,
                           opener_last=line[i + used - 1], odef=o, closes=o.get('closes', True))
                if base == 'word': fr.content = here + step; fr.midcol = fr.closecol = here
                else: fr.content = col + step; fr.midcol = fr.closecol = col
                fr.ends_before = o.get('endsBefore', []); fr.ends_after = o.get('endsAfter', [])
                if o.get('afterGroup'):                      # if (...): the body is decided when the ( ) closes
                    fr.wait = line[nxt] if nxt is not None else None
                stack.append(fr); frames.append(fr)
                if o.get('until'):
                    c = Frame('cond', block=fr, col=here, line=li, until=o['until'], opener=line[i + used - 1], odef=o)
                    c.content = cols[nxt] if nxt_code else here + len(t.t) + 1
                    c.opcol = here + step if base == 'word' else col + step
                    stack.append(c); frames.append(c)
            elif r == 'bmid':
                k = role[2]; bl = stack[k]; pop_to(k + 1); bl.middles.append(t)
                m = mdef(role[1])
                if m.get('until'):
                    c = Frame('cond', block=bl, col=here, line=li, until=m['until'], opener=line[i + used - 1], odef=m)
                    c.content = cols[nxt] if nxt_code else here + len(t.t) + 1
                    c.opcol = here + step if sty(cfg, 'base') == 'word' else col + step
                    stack.append(c); frames.append(c)
                elif m.get('single') and not nxt_code:
                    s1 = Frame('single', name='', col=here, line=li, content=col + step, opener=t, closes=False)
                    s1.closecol = col; stack.append(s1); frames.append(s1)
            elif r == 'bclose':
                k = role[2]; stack[k].closer = t; skipped(k); pop_to(k)
            elif r == 'until':
                c = stack.pop(); c.closer = t; c.block.untils.append(t)
                body = c.odef.get('body')
                if body == 'single':                          # Pascal: if ... then <one statement>
                    stack.pop() if c.block.kind == 'single' and False else None
                    if not nxt_code:
                        c.block.content = col + step
                    else:
                        c.block.body_line = li
            elif r == 'end':
                while stack and stack[-1].kind in ('clause', 'stmt'): stack.pop()
                while stack and stack[-1].kind == 'single' and (stack[-1].body_line is not None or stack[-1].line == li):
                    stack.pop()
                    while stack and stack[-1].kind in ('clause', 'stmt'): stack.pop()
            elif r == 'stmt':
                s0 = Frame('stmt', name=role[1], col=here, line=li, content=here + step, clauses=stmts[role[1]], opener=t)
                stack.append(s0); frames.append(s0)
            elif r == 'clause':
                k = active_stmt(); pop_to(k + 1)
                c = Frame('clause', name=role[1], col=here, line=li, content=here + step, opener=t)
                stack.append(c); frames.append(c)
            elif r == 'item':
                if stack:                                    # the item belongs to the list it is in
                    j = i + used
                    while j < len(line) and line[j].k == 'ws': j += 1
                    item_owner = stack[-1]
                    stack[-1].item = {'col': here, 'kind': role[1], 'line': li, 'source': None, 'src_tok': line[j] if j < len(line) else None}
            i += used
            if stack and stack[-1].ends_after and low(cfg, t.t) in stack[-1].ends_after and stack[-1].opener is not t:
                stack.pop()
        if item_owner is not None and item_owner.item['line'] == li and item_owner.item['source'] is None:
            st0 = item_owner.item['src_tok']
            item_owner.item['source'] = next((fr for fr in frames if fr.kind == 'group' and fr.opener is st0), None)
        item_owner = None
    return dict(indents=indents, at_start=at_start, first_role=first_role, frames=frames, open=list(stack) + unclosed, strays=strays,
                line_frames=line_frames)

def tag_indent(indents, tag):
    return indents[tag.line] if tag.line < len(indents) and indents[tag.line] is not None else tag.col

# ================================================================ line breaks
def positions(lines): return {id(t): (li, i) for li, l in enumerate(lines) for i, t in enumerate(l)}

def code_before(lines, li, i): return any(is_code(t) or t.k == 'com' for t in lines[li][:i])
def code_after(lines, li, i): return any(is_code(t) for t in lines[li][i + 1:])
def last_is_com(line): return bool(line) and line[-1].k == 'com'

def break_before(lines, li, i):
    rest = lines[li][i:]; head = lines[li][:i]
    while head and head[-1].k == 'ws': head.pop()
    lines[li] = head; lines.insert(li + 1, rest)

def join_next(lines, li, sep):
    a = lines[li]; b = lines[li + 1]
    while a and a[-1].k == 'ws': a.pop()
    while b and b[0].k == 'ws': b.pop(0)
    lines[li] = a + ([Tok('ws', sep)] if sep and a and b else []) + b
    del lines[li + 1]

def set_ws_after(lines, li, i, width):
    """The whitespace after token i on line li becomes `width` spaces (0: none)."""
    line = lines[li]
    if i + 1 < len(line) and line[i + 1].k == 'ws':
        if width: line[i + 1] = Tok('ws', ' ' * width)
        else: del line[i + 1]
    elif width and i + 1 < len(line): line.insert(i + 1, Tok('ws', ' ' * width))

def depth1_tokens(lines, fr, pos, pred):
    """Tokens inside group/element fr at its own depth that satisfy pred, with their positions."""
    out = []
    lo, io = pos[id(fr.opener)]; lc, ic = pos[id(fr.closer)]
    depth = 0
    for li in range(lo, lc + 1):
        line = lines[li]
        for i in range(io + 1 if li == lo else 0, ic if li == lc else len(line)):
            t = line[i]
            if t.k == 's' and any(t.t == g['pair'][0] for g in fr.cfg_groups): depth += 1
            elif t.k == 's' and any(t.t == g['pair'][1] for g in fr.cfg_groups): depth -= 1
            elif depth == 0 and pred(t): out.append((li, i, t))
    return out

def find_break(lines, cfg):
    sim = simulate(lines, cfg)
    pos = positions(lines)
    st = cfg['style']
    fixes = []
    def add(kind, tok, *a):
        if id(tok) in pos: fixes.append((pos[id(tok)], kind, tok) + a)
    groups = cfg.get('groups', [])
    for fr in sim['frames']:
        if fr.kind == 'group' and fr.closer is not None and id(fr.closer) in pos:
            g = fr.group
            (lo, io), (lc, ic) = pos[id(fr.opener)], pos[id(fr.closer)]
            spans = lc > lo
            oa = open_at(cfg, g, lines, lo, io)
            if oa == 'next' and code_before(lines, lo, io): add('before', fr.opener)
            if oa == 'same' and not code_before(lines, lo, io) and lo > 0 and lines[lo - 1] \
               and is_code(lines[lo - 1][-1]) and lines[lo - 1][-1].t not in (';', '{', '}') \
               and not (lines[lo - 1] and lines[lo - 1][0].cont):
                add('joinprev', fr.opener, ' ')
            one = sty(cfg, 'oneLine', g)
            if not spans and one == 'split' and code_after(lines, lo, io) and ic > io + 1:
                add('after', fr.opener); continue
            if spans:
                o, c = sty(cfg, 'open', g), sty(cfg, 'close', g)
                if o == 'same' and not code_after(lines, lo, io) and code_before(lines, lo, io) and lo + 1 < len(lines) \
                   and lines[lo + 1] and lines[lo + 1][0].k != 'com' and not lines[lo + 1][0].cont \
                   and not (lines[lo] and last_is_com(lines[lo])):
                    add('joinnext', fr.opener, ' ' if sty(cfg, 'parenSpace', g) == 'on' else '')
                if o == 'next' and any(is_code(t) for t in lines[lo][io + 1:]) and not lines[lo][-1].k == 'com' or \
                   (o == 'next' and code_after(lines, lo, io)):
                    if code_after(lines, lo, io): add('after', fr.opener)
                if c == 'own' and any(is_code(t) for t in lines[lc][:ic]): add('before', fr.closer)
                if c == 'same' and not code_before(lines, lc, ic) and lc > 0 and not last_is_com(lines[lc - 1]):
                    add('joinprev', fr.closer, '')
                ac = sty(cfg, 'afterClose', g)
                if ac == 'next':
                    j = next((j for j in range(ic + 1, len(lines[lc])) if lines[lc][j].k != 'ws'), None)
                    if j is not None and is_code(lines[lc][j]) and lines[lc][j].t not in cfg.get('trail', [';', ',', ')', ']', '}', '.']):
                        add('before', lines[lc][j])
                if ac == 'same' and lc + 1 < len(lines) and lines[lc + 1] and not code_after(lines, lc, ic) \
                   and phrase_at(cfg, lines[lc + 1], 0, cfg.get('joinAfterClose', [])):
                    add('joinnext', fr.closer, ' ')
                if g.get('list'):
                    for li, i, t in sep_tokens(lines, fr, pos, cfg):
                        if code_after(lines, li, i): add('after', t)
            if sty(cfg, 'parenSpace', g) == 'off' and g.get('tight'):
                if io + 1 < len(lines[lo]) and lines[lo][io + 1].k == 'ws' and io + 2 < len(lines[lo]): add('nows_after', fr.opener)
                if ic > 0 and lines[lc][ic - 1].k == 'ws' and code_before(lines, lc, ic - 1): add('nows_before', fr.closer)
        if fr.kind == 'tag' and fr.closer is not None and id(fr.closer) in pos:
            (lo, io), (lc, ic) = pos[id(fr.opener)], pos[id(fr.closer)]
            if lc > lo:                                     # attributes over lines: one per line
                seen = 0
                for li in range(lo, lc + 1):
                    for i, t in enumerate(lines[li]):
                        if li == lo and i <= io: continue
                        if li == lc and i >= ic: break
                        if t.k == 'w':
                            seen += 1
                            if seen > 1 and code_before(lines, li, i): add('before', t)
                if code_before(lines, lc, ic) is False: add('joinprev', fr.closer, '')
        end = fr.closer if fr.kind == 'elem' and fr.closer is not None else getattr(fr, 'end_tok', None)
        if fr.kind == 'elem' and end is not None and id(end) in pos and id(fr.opener) in pos:
            (lo, io), (lc, ic) = pos[id(fr.opener)], pos[id(end)]
            inner = [t for li in range(lo, lc + 1) for i, t in enumerate(lines[li])
                     if (li > lo or i > io) and (li < lc or i < ic)]
            has_text = any(t.k == 'text' for t in direct_children_tokens(inner))
            has_elems = any(t.k == 's' and t.t.startswith('<') and not t.t.startswith('</') for t in inner)
            if has_text or not has_elems: continue          # mixed content or text only: as written
            if (lc > lo or sty(cfg, 'oneLine') == 'split'):
                if code_after(lines, lo, io): add('after', fr.opener)
                if fr.closer is not None and any(is_code(t) for t in lines[lc][:ic]): add('before', fr.closer)
                for t in fr.children:
                    if id(t) in pos:
                        l2, i2 = pos[id(t)]
                        if code_before(lines, l2, i2): add('before', t)
        if fr.kind in ('block',) and fr.closer is not None and id(fr.closer) in pos and id(fr.opener) in pos:
            (lo, io), (lc, ic) = pos[id(fr.opener)], pos[id(fr.closer)]
            if lc > lo:
                o = fr.odef
                if o.get('breakAfter'):
                    l2, i2 = pos[id(fr.opener_last)]
                    if code_after(lines, l2, i2): add('after', fr.opener_last)
                for t in fr.untils:
                    l2, i2 = pos[id(t)]
                    if code_after(lines, l2, i2) and not (lines[l2] and last_is_com(lines[l2]) and not any(is_code(x) for x in lines[l2][i2+1:])):
                        add('after', t)
                for t in fr.middles:
                    l2, i2 = pos[id(t)]
                    m = next((m for m in cfg['blocks']['middle'] if phrase_at(cfg, lines[l2], i2, [m['w']])), {})
                    if m.get('breakBefore', True) and code_before(lines, l2, i2): add('before', t)
                    pm = phrase_at(cfg, lines[l2], i2, [m['w']]) if m else None
                    if m.get('breakAfter') and pm and code_after(lines, l2, i2 + pm[1] - 1): add('after', lines[l2][i2 + pm[1] - 1])
                if code_before(lines, lc, ic): add('before', fr.closer)
    fixes += item_breaks(lines, cfg, sim, pos)
    fixes.sort(key=lambda f: (f[0][0], f[0][1]))
    return fixes[0] if fixes else None

def open_at(cfg, g, lines, lo, io):
    """Where the `{` goes: `openAt` is same / next / keep, or {default, next: pattern of the head}."""
    oa = g.get('openAt')
    if not isinstance(oa, dict): return oa
    head = text_of(lines[lo][:io]).strip()
    if not head and lo > 0: head = text_of(lines[lo - 1]).strip()
    return 'next' if re.search(oa['next'], head, flags(cfg)) else oa.get('default')

def direct_children_tokens(inner):
    out, depth = [], 0
    for t in inner:
        if t.k == 's' and t.t.startswith('</'): depth -= 1; continue
        if t.k == 's' and t.t.startswith('<'): depth += 1; out.append(t); continue
        if t.k == 's' and t.t == '/>': depth -= 1; continue
        if depth == 0: out.append(t)
    return out

def sep_tokens(lines, fr, pos, cfg):
    seps = cfg.get('separators', [','])
    out, depth = [], 0
    (lo, io), (lc, ic) = pos[id(fr.opener)], pos[id(fr.closer)]
    opens = [g['pair'][0] for g in cfg.get('groups', [])]; closes = [g['pair'][1] for g in cfg.get('groups', [])]
    for li in range(lo, lc + 1):
        for i, t in enumerate(lines[li]):
            if (li == lo and i <= io) or (li == lc and i >= ic): continue
            if t.k != 's': continue
            if t.t in opens: depth += 1
            elif t.t in closes: depth -= 1
            elif depth == 0 and t.t in seps: out.append((li, i, t))
    return out

def item_breaks(lines, cfg, sim, pos):
    """A long clause of an item (a join's `on` with more comparisons than `longLimit`): over lines."""
    out = []
    items = cfg.get('items', {})
    if not items: return out
    limit = cfg.get('longLimit', 2)
    ops = cfg.get('operators', [])
    for fr in sim['frames']:
        if fr.kind != 'group' or fr.closer is None or id(fr.opener) not in pos: continue
        lo, io = pos[id(fr.opener)]
        line = lines[lo]
        prev = [t for t in line[:io] if t.k != 'ws']
        clause = [p for it in items.values() for p in it['clause']]
        if not prev or not phrase_at(cfg, [prev[-1]], 0, clause): continue
        opsin = []
        lc, ic = pos[id(fr.closer)]
        depth = 0
        for li in range(lo, lc + 1):
            for i, t in enumerate(lines[li]):
                if (li == lo and i <= io) or (li == lc and i >= ic): continue
                if t.k == 's' and group_cfg(cfg, t.t): depth += 1
                elif t.k == 's' and any(g['pair'][1] == t.t for g in cfg['groups']): depth -= 1
                elif depth == 0 and phrase_at(cfg, lines[li], i, ops): opsin.append((li, i, t))
        if len(opsin) + 1 <= limit: continue
        on_tok = prev[-1]
        ol, oi = pos[id(on_tok)]
        if cfg['style'].get('longClause') == 'next' and code_before(lines, ol, oi):
            first = next(t for t in lines[ol] if t.k != 'ws')
            if phrase_at(cfg, [first], 0, [p for it in items.values() for p in it['start']]) or True:
                out.append(((ol, oi), 'before', on_tok))
        for li, i, t in opsin:
            if code_before(lines, li, i): out.append(((li, i), 'before', t))
        if any(is_code(t) for t in lines[lc][:ic]): out.append(((lc, ic), 'before', fr.closer))
    return out

def apply_fix(lines, fix):
    (li, i), kind, tok = fix[0], fix[1], fix[2]
    pos = positions(lines); li, i = pos[id(tok)]
    if kind == 'before': break_before(lines, li, i)
    elif kind == 'after':
        j = i + 1
        while j < len(lines[li]) and lines[li][j].k == 'ws': j += 1
        break_before(lines, li, j)
    elif kind == 'joinnext': join_next(lines, li, fix[3])
    elif kind == 'joinprev': join_next(lines, li - 1, fix[3]) if i == 0 or not code_before(lines, li, i) else None
    elif kind == 'nows_after': del lines[li][i + 1]
    elif kind == 'nows_before': del lines[li][i - 1]

def do_breaks(lines, cfg):
    for n in range(3000):
        fix = find_break(lines, cfg)
        if not fix: return n
        apply_fix(lines, fix)
    raise RuntimeError('line breaks do not settle')

def spaces(lines, cfg):
    """Exactly one space after the signs listed (`space: [{after: ':', inside: '{'}]`), none before them."""
    for rule in cfg.get('space', []):
        if 'before' in rule:
            for li, line in enumerate(lines):
                for i in range(len(line) - 1, 0, -1):
                    if line[i].k == 's' and line[i].t == rule['before'] and is_code(line[i - 1]):
                        line.insert(i, Tok('ws', ' '))
            continue
        for li, line in enumerate(lines):
            for i, t in enumerate(line):
                if t.k == 's' and t.t == rule['after'] and i + 1 < len(line):
                    if rule.get('inside') and not inside_group(lines, li, i, rule['inside'], cfg): continue
                    if line[i + 1].k == 'ws': line[i + 1] = Tok('ws', ' ')
                    elif is_code(line[i + 1]): line.insert(i + 1, Tok('ws', ' '))
                    if i > 0 and line[i - 1].k == 'ws' and rule.get('noneBefore', True): del line[i - 1]

def inside_group(lines, li, i, opener, cfg):
    depth = 0; closer = group_cfg(cfg, opener)['pair'][1]
    for l2 in range(li, -1, -1):
        rng = range(i - 1 if l2 == li else len(lines[l2]) - 1, -1, -1)
        for k in rng:
            t = lines[l2][k]
            if t.k != 's': continue
            if t.t == closer: depth += 1
            elif t.t == opener:
                if depth == 0: return True
                depth -= 1
    return False

# ================================================================ operators and alignment
def layout(lines, cfg):
    override = {}
    for rnd in range(6):
        sim = simulate(lines, cfg, override)
        new = operators(lines, cfg, sim)
        sim = simulate(lines, cfg, new)
        align(lines, cfg, sim)
        if new == override and rnd > 1: break
        override = new
    return simulate(lines, cfg, override)

def col_of(lines, sim, li, i):
    return (sim['indents'][li] or 0) + sum(len(t.t) for t in lines[li][:i])

def operators(lines, cfg, sim):
    """operator: start: the operators of a condition over lines in one column, every operand after them."""
    over = {}
    if cfg['style'].get('operator') != 'start' or not cfg.get('operators'): return over
    ops = cfg['operators']
    pos = positions(lines)
    by_frame = {}
    for li, f in enumerate(sim['at_start']):
        if f is not None and sim['indents'][li] is not None: by_frame.setdefault(f.id, (f, []))[1].append(li)
    for fid, (f, lis) in by_frame.items():
        if f.kind not in ('group', 'cond', 'clause'): continue
        oplines = [(li, phrase_at(cfg, lines[li], code_idx(lines[li])[0], ops)) for li in lis]
        oplines = [(li, p) for li, p in oplines if p and sim['first_role'][li] and sim['first_role'][li][0] == 'op']
        if not oplines: continue
        oplen = max(len(p[0]) for li, p in oplines)
        opcol = f.opcol if f.opcol is not None else f.content
        operand = opcol + oplen + 1
        for li in lis:
            r = sim['first_role'][li]
            if r and r[0] in ('gclose', 'bclose', 'bmid', 'until', 'clause', 'eclose'): continue
            p = next((p for l2, p in oplines if l2 == li), None)
            if p:
                over[li] = opcol
                fi = code_idx(lines[li])[0]
                set_ws_after(lines, li, fi + p[1] - 1, operand - opcol - len(p[0]))
            elif lines[li][0].k != 'com':
                over[li] = operand
        if f.kind in ('group', 'cond') and id(f.opener) in pos:
            lo, io = pos[id(f.opener)]
            j = next((j for j in range(io + 1, len(lines[lo])) if lines[lo][j].k != 'ws'), None)
            if j is not None and is_code(lines[lo][j]):
                ind = over.get(lo, sim['indents'][lo] or 0)
                c_end = ind + sum(len(t.t) for t in lines[lo][:io + 1])
                set_ws_after(lines, lo, io, max(1 if f.kind == 'cond' else 0, operand - c_end))
    return over

def anchors_of(cfg):
    return cfg.get('compare', []) + cfg.get('align', [])

def first_anchor(cfg, line, start=0):
    """The first anchor at depth 0 of the line (from token `start`): its index, or None."""
    ph = anchors_of(cfg); depth = 0
    opens = [g['pair'][0] for g in cfg.get('groups', [])]; closes = [g['pair'][1] for g in cfg.get('groups', [])]
    i = start
    while i < len(line):
        t = line[i]
        if t.k == 's' and t.t in opens: depth += 1
        elif t.k == 's' and t.t in closes: depth -= 1
        elif depth == 0 and t.k in ('w', 's'):
            p = phrase_at(cfg, line, i, ph)
            if p and i > start: return i
        i += 1
    return None

def pad_before(lines, li, i, width):
    line = lines[li]
    if i > 0 and line[i - 1].k == 'ws': line[i - 1] = Tok('ws', ' ' * width)
    else: line.insert(i, Tok('ws', ' ' * width))
    return 0 if (i > 0 and line[i - 1].t == ' ' * width and False) else (1 if not (i > 0 and lines[li][i - 1].k == 'ws' and lines[li][i - 1] is not None) else 0)

def align(lines, cfg, sim):
    if cfg['style'].get('align') != 'on': return
    ind = sim['indents']
    # runs: lines in a row with the same frame at their start and the same indentation; comment lines skipped
    runs, cur, key = [], [], None
    for li, line in enumerate(lines):
        if not line: continue                            # a blank line does not end a run (a list's columns go on)
        if ind[li] is None:
            if cur: runs.append(cur)
            cur, key = [], None; continue
        if line[0].k == 'com' and len(code_idx(line)) == 1: continue
        k = sim['at_start'][li].id if sim['at_start'][li] else 0
        r = sim['first_role'][li]
        if r and r[0] in ('gclose', 'bclose', 'bmid', 'until', 'eclose', 'clause'): k = (k, li)
        if k != key:
            if cur: runs.append(cur)
            cur, key = [], k
        cur.append(li)
    if cur: runs.append(cur)
    # segments of operator containers: the operands after the opener on its line belong to the run below it
    pos = positions(lines)
    for run in runs:
        f = sim['at_start'][run[0]]
        if f is None or f.kind not in ('group', 'clause', 'cond', 'tag'): continue   # only inside lists and conditions
        segs = [(li, 0) for li in run]
        if f is not None and f.kind in ('group', 'cond') and id(f.opener) in pos:
            lo, io = pos[id(f.opener)]
            if lo == run[0] - 1:
                j = next((j for j in range(io + 1, len(lines[lo])) if lines[lo][j].k != 'ws'), None)
                if j is not None: segs.insert(0, (lo, j))
        columns(lines, cfg, sim, run, segs)
        found = [(li, first_anchor(cfg, lines[li], s)) for li, s in segs]
        found = [(li, a) for li, a in found if a is not None]
        if len(found) >= 2:
            ends = []
            for li, a in found:
                j = a - 1
                while j >= 0 and lines[li][j].k == 'ws': j -= 1
                ends.append(col_of(lines, sim, li, j + 1))
            target = max(ends) + 1
            for (li, a), e in zip(found, ends):
                if a > 0 and lines[li][a - 1].k == 'ws': lines[li][a - 1] = Tok('ws', ' ' * (target - e))
                else: lines[li].insert(a, Tok('ws', ' ' * (target - e)))
        # operators at the line end in one column
        ops = cfg.get('operators', [])
        trail = []
        for li, s in segs:
            ci = [i for i in code_idx(lines[li]) if lines[li][i].k != 'com']
            if not ci: continue
            last = ci[-1]
            p = None
            for k in range(last, -1, -1):
                p = phrase_at(cfg, lines[li], k, ops)
                if p and k + p[1] - 1 == last: trail.append((li, k)); break
        if len(trail) >= 2:
            ends = []
            for li, a in trail:
                j = a - 1
                while j >= 0 and lines[li][j].k == 'ws': j -= 1
                ends.append(col_of(lines, sim, li, j + 1))
            target = max(ends) + 1
            for (li, a), e in zip(trail, ends):
                if lines[li][a - 1].k == 'ws': lines[li][a - 1] = Tok('ws', ' ' * (target - e))
    item_columns(lines, cfg, sim)

def columns(lines, cfg, sim, run, segs):
    """The items of a list over lines (each line ends with a separator): their words before the first anchor
    become columns."""
    f = sim['at_start'][run[0]]
    if f is None or f.kind != 'group' or len(run) < 2: return
    seps = cfg.get('separators', [','])
    def last_code(line):
        ci = [i for i, t in enumerate(line) if is_code(t)]
        return line[ci[-1]] if ci else None
    if not all((last_code(lines[li]) is not None and last_code(lines[li]).t in seps) for li in run[:-1]): return
    cells = {}
    for li in run:
        line = lines[li]
        a = first_anchor(cfg, line)
        stop = a if a is not None else len(line)
        com = next((i for i, t in enumerate(line) if t.k == 'com'), None)
        if com is not None: stop = min(stop, com)
        ws = [i for i in range(stop) if line[i].k == 'ws']
        if stop == com and ws and ws[-1] == com - 1: ws.pop()   # the gap before a line-end comment is no column
        cells[li] = ws
    # only the gaps every row has are columns; the rest of a row is one cell (long nvarchar), lined up by its anchor
    ncol = min((len(w) for w in cells.values()), default=0)
    for c in range(ncol):
        rows = [li for li in run if len(cells[li]) > c]
        if len(rows) < 2: continue
        widths = {}
        for li in rows:
            w = cells[li][c]; start = cells[li][c - 1] + 1 if c else 0
            widths[li] = sum(len(t.t) for t in lines[li][start:w])
        wmax = max(widths.values())
        for li in rows:
            lines[li][cells[li][c]] = Tok('ws', ' ' * (wmax - widths[li] + 1))

def item_columns(lines, cfg, sim):
    """Joins in a list: join words, source and alias in columns over the whole list; a short `on` in a column
    `gap` after the widest alias."""
    items = cfg.get('items', {})
    if not items: return
    starts = [p for it in items.values() for p in it['start']]
    clause_w = [p for it in items.values() for p in it['clause']]
    gap = cfg.get('clauseGap', 4)
    pos = positions(lines)
    by = {}
    for li, f in enumerate(sim['at_start']):
        if f is not None and f.kind in ('clause', 'group') and lines[li] and sim['indents'][li] is not None:
            p = phrase_at(cfg, lines[li], code_idx(lines[li])[0], starts)
            if p: by.setdefault(f.id, []).append((li, p))
    for fid, rows in by.items():
        cells = []
        for li, p in rows:
            line = lines[li]
            k = code_idx(line)[0] + p[1]                   # the token after the join words
            idx = [i for i in range(k, len(line)) if line[i].k != 'ws']
            if len(idx) < 2 or line[idx[0]].k == 's': continue   # a group as the source: not in the columns
            src, alias = idx[0], idx[1]
            on = idx[2] if len(idx) > 2 and phrase_at(cfg, line, idx[2], clause_w) else None
            cells.append((li, k, src, alias, on, len(p[0])))
        if len(cells) < 2: continue
        kw = max(c[5] for c in cells)
        sw = max(len(lines[c[0]][c[2]].t) for c in cells)
        aw = max(len(lines[c[0]][c[3]].t) for c in cells if c[4] is not None) if any(c[4] is not None for c in cells) else 0
        for li, k, src, alias, on, klen in cells:
            line = lines[li]
            if on is not None: line[on - 1] = Tok('ws', ' ' * (aw - len(line[alias].t) + gap))
            line[alias - 1] = Tok('ws', ' ' * (sw - len(line[src].t) + 1))
            line[src - 1] = Tok('ws', ' ' * (kw - klen + 1))

# ================================================================ the whole
def render(lines, sim, cfg):
    out = []
    for li, line in enumerate(lines):
        ind = sim['indents'][li]
        if not line: out.append(''); continue
        if ind is None: out.append(text_of(line)); continue
        out.append(' ' * ind + text_of(line))
    return '\n'.join(out)

def tables(lines, cfg):
    """Tables (markdown): a run of rows around a delimiter row; every row stays one line, its `sep` signs in
    columns, one space inside each cell, the delimiter row filled with `fill`, a cell's text placed as its
    column's markers say (`:--` left, `:-:` centre, `--:` right)."""
    tb = cfg.get('tables')
    if not tb: return
    sep, fill = tb['sep'], tb.get('fill', '-')
    delim = re.compile(tb['delimiter'])
    def cells(line):
        """The cells of a row: the text between the separators (escaped ones and those in code are not)."""
        out, cur, lead = [], [], False
        for k, t in enumerate(line):
            if t.k == 's' and t.t == sep:
                if k == 0 or all(x.k == 'ws' for x in line[:k]): lead = True
                else: out.append(text_of(cur).strip())
                cur = []
            else: cur.append(t)
        trail = not text_of(cur).strip()
        if not trail: out.append(text_of(cur).strip())
        return out, lead, trail
    li = 0
    while li < len(lines):
        kept = lambda r: bool(lines[r]) and lines[r][0].cont      # inside a kept region (a fenced code block)
        if not (li > 0 and lines[li] and not kept(li) and not kept(li - 1) and delim.match(text_of(lines[li]))
                and sep in text_of(lines[li - 1])):
            li += 1; continue
        top = li - 1; end = li + 1
        while end < len(lines) and lines[end] and not kept(end) and any(t.k == 's' and t.t == sep for t in lines[end]): end += 1
        rows = {r: cells(lines[r]) for r in range(top, end)}
        n = max(len(c[0]) for c in rows.values())
        marks = rows[li][0]
        align = ['r' if m.endswith(':') and not m.startswith(':') else 'c' if m.startswith(':') and m.endswith(':') and len(m) > 1
                 else 'l' for m in marks] + ['l'] * n
        width = [max([len(rows[r][0][c]) for r in rows if r != li and c < len(rows[r][0])] + [3]) for c in range(n)]
        for r, (cs, lead, trail) in rows.items():
            parts = []
            for c, text in enumerate(cs):
                w = width[c]
                if r == li:
                    m = text.strip()
                    left, right = m.startswith(':'), m.endswith(':') and len(m) > 1
                    text = (':' if left else '') + fill * (w - left - right) + (':' if right else '')
                elif align[c] == 'r': text = text.rjust(w)
                elif align[c] == 'c': text = text.center(w)
                else: text = text.ljust(w)
                parts.append(text)
            if not trail and parts: parts[-1] = parts[-1].rstrip()   # no spaces at the end of the line
            body = (' ' + sep + ' ').join(parts)
            row = (sep + ' ' if lead else '') + body + (' ' + sep if trail else '')
            ind = lines[r][0].oi if lines[r] else 0
            lines[r] = [Tok('text', row)]; lines[r][0].oi = ind
        li = end

def format_text(text, cfg, indent=2):
    """`indent`: the language's indent size from the settings (or its pack's indentSize)."""
    cfg = dict(cfg, indent=indent)
    lines = to_lines(tokenize(text, cfg))
    spaces(lines, cfg)
    do_breaks(lines, cfg)
    spaces(lines, cfg)
    tables(lines, cfg)
    sim = layout(lines, cfg)
    return render(lines, sim, cfg), sim

def problems(text, cfg):
    """What validation would report: openers without their closer, closers without their opener."""
    lines = to_lines(tokenize(text, cfg))
    sim = simulate(lines, cfg)
    pos = positions(lines)
    out = []
    for f in sim['open']:
        if f.kind in ('group', 'block', 'elem', 'tag') and f.odef.get('closes', True) is not False and id(f.opener) in pos:
            out.append((pos[id(f.opener)][0] + 1, f'"{f.opener.t}" is not closed'))
    for (li, i), w in sorted(sim['strays'].items()):
        out.append((li + 1, f'"{w}" closes nothing'))
    return sorted(out)
