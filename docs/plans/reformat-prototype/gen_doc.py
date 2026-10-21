# Writes the per-language parameter sets (YAML, as they would go under `format:` in language.yaml) and the
# before / after examples, from the prototype's own parameters and output.
import sys, os, re
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from engine import format_text, problems
import langs

def q(s):
    """A YAML scalar: plain when safe, else single-quoted ('' for a quote)."""
    if isinstance(s, bool): return 'true' if s else 'false'
    if isinstance(s, (int, float)): return str(s)
    if s is None: return 'null'
    if '\n' in s or '\t' in s:                       # a line break or tab: double quotes, escaped
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\t', '\\t') + '"'
    if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_ ]*', s) and s.lower() not in ('yes', 'no', 'on', 'off', 'true', 'false', 'null') \
       and not s.endswith(' ') and not s.startswith(' '):
        return s
    return "'" + s.replace("'", "''") + "'"

def flow(v):
    if isinstance(v, dict): return '{' + ', '.join(f'{q(k)}: {flow(x)}' for k, x in v.items()) + '}'
    if isinstance(v, (list, tuple)): return '[' + ', '.join(flow(x) for x in v) + ']'
    return q(v)

def dump(cfg, indent='  '):
    out = []
    for k, v in cfg.items():
        if k == 'blocks':
            out.append(f'{indent}blocks:')
            for part in ('open', 'middle', 'close'):
                val = v.get(part)
                if not val: continue
                if isinstance(val, dict):
                    out.append(f'{indent}  {part}: {flow(val)}')
                else:
                    out.append(f'{indent}  {part}:')
                    for o in val: out.append(f'{indent}    - {flow(o)}')
        elif k in ('groups', 'keep', 'strings') and isinstance(v, list) and v:
            out.append(f'{indent}{k}:')
            for o in v: out.append(f'{indent}  - {flow(o)}')
        elif k in ('statements', 'items', 'autoClose') and isinstance(v, dict):
            out.append(f'{indent}{k}:')
            for kk, vv in v.items(): out.append(f'{indent}  {q(kk)}: {flow(vv)}')
        else:
            out.append(f'{indent}{k}: {flow(v)}')
    return '\n'.join(out)

order = ['asa', 'sql', 'csharp', 'java', 'javascript', 'cpp', 'php', 'perl', 'powershell', 'ahk', 'pascal', 'vb',
         'vbscript', 'ruby', 'shell', 'batch', 'json', 'xml', 'html', 'css', 'python', 'markdown']
mode = sys.argv[1]
for name in order:
    cfg = getattr(langs, name.upper())
    if mode == 'yaml':
        print(f'=== {name}')
        print('format:'); print(dump(cfg))
    else:
        if name == 'asa': continue
        text = open(os.path.join(here, 'samples', name + '.txt'), encoding='utf-8').read().rstrip()
        out, _ = format_text(text, cfg)
        again, _ = format_text(out, cfg)
        print(f'=== {name}')
        print('--- in'); print(text); print('--- out'); print(out)
        print('--- stable' if again == out else '--- NOT STABLE')
        print('--- problems', problems(text, cfg))
