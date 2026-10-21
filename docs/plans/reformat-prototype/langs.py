# The `format` parameters per language, as they would go into each language.yaml.
ASA = {
    'case': False, 
    'word': r'[A-Za-z_@#$][A-Za-z0-9_@#$]*(?:\.[A-Za-z_@#$][A-Za-z0-9_@#$]*)*',
    'comments': {'line': ['//', '--'], 'block': [['/*', '*/']]},
    'strings': [{'open': "'", 'double': True}, {'open': '"', 'double': True}],
    'groups': [{'pair': ['(', ')'], 'tight': True}],
    'blocks': {
        'open': [{'w': 'begin', 'breakAfter': True},
                 {'w': 'if', 'until': ['then']},
                 {'w': 'case'},
                 # loops start a statement (a label may come first): the for of exception for sqlstate is none
                 {'w': 'loop', 'breakAfter': True, 'before': r'^\s*(\w+:\s*)?$'},
                 {'w': 'while', 'until': ['loop'], 'before': r'^\s*(\w+:\s*)?$'},
                 {'w': 'for', 'until': ['do'], 'before': r'^\s*(\w+:\s*)?$'},
                 # the branches of a case (and of an exception part): one step inside, until the next one
                 {'w': 'when', 'inside': ['case', 'exception'], 'until': ['then'], 'closes': False,
                  'endsBefore': ['when', 'else', 'end case', 'end']},
                 # the exception part of a begin: one step inside it (only at a line start: declare x exception ...)
                 {'w': 'exception', 'inside': ['begin'], 'before': r'^\s*$', 'closes': False, 'endsBefore': ['end']},
                 {'w': 'else', 'inside': ['case'], 'closes': False, 'endsBefore': ['when', 'end case', 'end']}],
        'middle': [{'w': 'else', 'of': ['if'], 'breakAfter': True},
                   {'w': 'elseif', 'of': ['if'], 'until': ['then']}],
        'close': {'end if': 'if', 'endif': 'if', 'end case': 'case', 'end loop': ['loop', 'while'], 'end for': 'for',
                  'end': ['begin', 'case']},
    },
    'ends': [';'],
    'statements': {'select': ['into', 'from', 'where', 'group by', 'having', 'order by', 'union', 'union all'],
                   'update': ['set', 'from', 'where'], 'insert': ['values', 'select'], 'delete': ['from', 'where'],
                   'set': [], 'call': [], 'return': [], 'declare': [], 'message': []},
    'items': {'join': {'start': ['left outer join', 'right outer join', 'full outer join', 'inner join', 'cross join',
                                 'left join', 'right join', 'join'], 'clause': ['on']}},
    'operators': ['and not', 'or not', 'and', 'or', 'xor'],
    'compare': ['is not distinct from', 'is distinct from', 'is not', 'not like', 'like', 'not in', 'in', 'between',
                '<>', '!=', '<=', '>=', '=', '<', '>', 'is'],
    'align': ['default'],
    'separators': [','],
    'longLimit': 2, 'clauseGap': 4,
    'style': {'open': 'same', 'close': 'own', 'base': 'word', 'align': 'on', 'alignClause': 'off',
              'afterClose': 'next', 'operator': 'start', 'longClause': 'next', 'oneLine': 'keep', 'parenSpace': 'off'},
}

BS = chr(92)   # a backslash

# ---------------------------------------------------------------- C family
def clike(**over):
    """C#, Java, JavaScript, C++, PHP, ...: braces are groups; if / for / while without braces take one statement."""
    cfg = {
        'case': True, 
        'word': r'[A-Za-z_@$][A-Za-z0-9_$]*',
        'comments': {'line': ['//'], 'block': [['/*', '*/']]},
        'strings': [{'open': '@"', 'close': '"', 'double': True, 'lines': True}, {'open': '$"', 'close': '"', 'escape': BS},
                    {'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}],
        'groups': [{'pair': ['{', '}'], 'open': 'next', 'close': 'own', 'base': 'line', 'openAt': 'next', 'afterClose': 'next',
                    'block': True},
                   {'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word', 'afterClose': 'same', 'tight': True},
                   {'pair': ['[', ']'], 'open': 'same', 'close': 'same', 'base': 'word', 'afterClose': 'same', 'tight': True}],
        'blocks': {
            'open': [{'w': w, 'kind': 'single', 'closes': False, 'afterGroup': True} for w in
                     ('if', 'for', 'foreach', 'while', 'using', 'lock', 'fixed')] +
                    [{'w': 'else', 'kind': 'single', 'closes': False, 'when': r'^\s*(//.*)?$'},
                     {'w': 'do', 'kind': 'single', 'closes': False, 'when': r'^\s*(//.*)?$'},
                     {'w': 'case', 'before': r'^\s*$', 'inside': ['{'], 'closes': False, 'endsBefore': ['case', 'default', '}']},
                     {'w': 'default', 'before': r'^\s*$', 'when': r'^\s*:', 'inside': ['{'], 'closes': False,
                      'endsBefore': ['case', 'default', '}']}],
            'middle': [], 'close': {},
        },
        'singleBody': ['{'],
        'ends': [';'],
        'operators': ['&&', '||'],
        'continue': ['.', '?.', '?', ':', '??', '+', '=>'],
        'compare': ['==', '!=', '<=', '>=', '<', '>'],
        'align': ['='],
        'keepLines': [r'^\s*#\s*(if|else|elif|endif|define|undef|pragma|nullable|line|error|warning)\b'],
        'style': {'open': 'same', 'close': 'own', 'base': 'line', 'align': 'off', 'afterClose': 'next', 'operator': 'start',
                  'oneLine': 'keep', 'parenSpace': 'off'},
        'trail': [';', ',', ')', ']', '}', '.'],
    }
    for k, v in over.items(): cfg[k] = v
    return cfg

CSHARP = clike()

def kr(**over):
    """Braces at the end of the line (K&R): Java, JavaScript, PHP's control structures, PowerShell."""
    cfg = clike(**over)
    cfg['groups'][0] = dict(cfg['groups'][0], openAt='same', afterClose='same')
    cfg['joinAfterClose'] = ['else', 'catch', 'finally', 'while']
    return cfg

JAVA = kr(word=r'[A-Za-z_@$][A-Za-z0-9_$]*', keepLines=[],
          strings=[{'open': '"""', 'close': '"""', 'lines': True}, {'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}])
JAVA['blocks']['open'] = [o for o in JAVA['blocks']['open'] if o['w'] not in ('foreach', 'using', 'lock', 'fixed')] + \
    [{'w': 'synchronized', 'kind': 'single', 'closes': False, 'afterGroup': True}]

JAVASCRIPT = kr(word=r'[A-Za-z_$][A-Za-z0-9_$]*', keepLines=[], 
                strings=[{'open': '`', 'escape': BS, 'lines': True}, {'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}],
                keep=[{'re': r'/(?![*/])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+/[dgimsuy]*', 'after': '(,=:[!&|?{};'}],
                compare=['===', '!==', '==', '!=', '<=', '>=', '<', '>'], ends=[';', '\n'])
JAVASCRIPT['blocks']['open'] = [o for o in JAVASCRIPT['blocks']['open'] if o['w'] not in ('foreach', 'using', 'lock', 'fixed')]

CPP = clike(word=r'[A-Za-z_][A-Za-z0-9_]*', keepLines=[r'^\s*#'],
            strings=[{'open': 'R"(', 'close': ')"', 'lines': True}, {'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}])
CPP['groups'][0] = dict(CPP['groups'][0], openAt='keep')
CPP['blocks']['open'] = [o for o in CPP['blocks']['open'] if o['w'] not in ('foreach', 'using', 'lock', 'fixed')]
CPP['labels'] = [r'^(public|private|protected)\s*:']     # at the column of the class's braces

# ---------------------------------------------------------------- data and markup
JSON = {
    'case': True, 
    'word': r'[A-Za-z0-9_.+-]+',                         # true, false, null, numbers
    'comments': {'line': ['//'], 'block': [['/*', '*/']]},
    'strings': [{'open': '"', 'escape': BS}],
    'groups': [{'pair': ['{', '}'], 'list': True, 'block': True}, {'pair': ['[', ']'], 'list': True, 'block': True}],
    'separators': [','],
    'align': [':'],
    'space': [{'after': ':'}, {'after': ','}],
    'style': {'open': 'next', 'close': 'own', 'base': 'line', 'align': 'off', 'oneLine': 'split', 'afterClose': 'same',
              'parenSpace': 'off'},
}

XML = {
    'markup': True, 'case': True, 
    'align': ['='],
    'style': {'open': 'next', 'close': 'own', 'base': 'line', 'align': 'off', 'oneLine': 'split'},
}

HTML = {
    'markup': True, 'case': False, 
    'void': ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'],
    'verbatimElements': ['pre', 'textarea', 'script', 'style'],  # script and style: by their own language (embedded)
    # implied end tags: a start tag closes the open element of these names
    'autoClose': dict({'li': ['li'], 'td': ['td', 'th'], 'th': ['td', 'th'], 'tr': ['tr', 'td', 'th'], 'option': ['option'],
                       'dt': ['dt', 'dd'], 'dd': ['dt', 'dd']},
                      **{b: ['p'] for b in ('p', 'div', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre',
                                             'form', 'blockquote', 'hr', 'section', 'article', 'header', 'footer', 'nav')}),
    'align': ['='],
    # end tags that may be left out: not reported by the check (they close by the next one or the parent)
    'optionalEnd': ['html', 'head', 'body', 'p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'colgroup'],
    'style': {'open': 'next', 'close': 'own', 'base': 'line', 'align': 'off', 'oneLine': 'split'},
}

CSS = {
    'case': False, 
    'word': r'[A-Za-z0-9_#.%-]+',
    'comments': {'block': [['/*', '*/']]},
    'strings': [{'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}],
    'groups': [{'pair': ['{', '}'], 'list': True, 'block': True, 'openAt': 'same'},
               {'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word', 'tight': True, 'oneLine': 'keep'}],
    'separators': [';'],
    'ends': [';'],
    'align': [':'],
    'space': [{'after': ':', 'inside': '{'}, {'after': ',', 'inside': '{'}, {'before': '{'}],
    'trail': [';', ',', ')', '}'],
    'style': {'open': 'next', 'close': 'own', 'base': 'line', 'align': 'off', 'oneLine': 'split', 'afterClose': 'next',
              'parenSpace': 'off'},
}

from langs_more import *   # noqa: the other languages
